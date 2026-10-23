import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WeekDay } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformsService } from '../platforms/platforms.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { ListSlotsQuery } from './dto/list-slots.query';

// how far out a rolling window stays topped up - a customer (or the AI
// chat) asking "what about next month" should find real slots there,
// not just whatever a one-time seed happened to generate. Found live:
// the original seed only ever created 7 days of slots once, so every
// platform's bookable future silently ran out a week after it was
// seeded - there was no ongoing generation at all.
const ROLLING_HORIZON_DAYS = 60;

const WEEKDAY_ORDER: WeekDay[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function withTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platforms: PlatformsService,
  ) {}

  // Lazily tops up this platform's rolling slot window on every real read
  // - deliberately not a scheduled cron job (no extra infra, works
  // identically in dev/test/prod, self-heals if a deploy window was ever
  // missed) and deliberately not a full "derive slots on the fly"
  // rearchitecture (Slot stays a real materialized row Booking.slotId
  // can keep referencing by FK, same as every other write path already
  // assumes). A platform with no workingDays/openTime/closeTime set
  // (suspended, or genuinely by-appointment-only - see
  // data/seeds/layla-hanafi-consulting.json) is never auto-extended;
  // that owner manages their own slots manually via the dashboard, same
  // as before this existed.
  //
  // Server-local wall-clock time for openTime/closeTime, same
  // convention the original seed.ts buildSlots() already used (it never
  // actually did real platform.timezone-aware math either, despite the
  // field existing) - not changing that existing, pre-established
  // behavior here, just making it ongoing instead of one-time.
  // Note: raising `seats` only affects newly-generated future days from
  // that point on - it never retroactively adds more parallel rows to
  // days already generated at the old, lower count. A real, explicit
  // scope boundary (same spirit as this project's other documented
  // limitations) rather than the meaningfully harder problem of
  // reconciling density on already-covered days.
  private async ensureFutureSlots(platformId: string): Promise<void> {
    const platform = await this.prisma.platform.findUnique({
      where: { id: platformId },
      select: { workingDays: true, openTime: true, closeTime: true, seats: true },
    });
    if (!platform || platform.workingDays.length === 0 || !platform.openTime || !platform.closeTime) {
      return;
    }
    const workingDaySet = new Set(platform.workingDays);
    const { openTime, closeTime, seats } = platform;

    const services = await this.prisma.service.findMany({
      where: { platformId },
      select: { id: true, durationMinutes: true },
    });
    if (services.length === 0) return;

    const today = startOfDay(new Date());
    const horizon = startOfDay(new Date());
    horizon.setDate(horizon.getDate() + ROLLING_HORIZON_DAYS);

    for (const service of services) {
      const lastSlot = await this.prisma.slot.findFirst({
        where: { platformId, serviceId: service.id },
        orderBy: { startsAt: 'desc' },
        select: { startsAt: true },
      });

      const startFrom = lastSlot ? startOfDay(lastSlot.startsAt) : today;
      if (startFrom >= horizon) continue; // already topped up through the horizon

      const newSlots: { platformId: string; serviceId: string; startsAt: Date; endsAt: Date }[] = [];
      // never earlier than today - if this platform's last generated
      // day is somehow in the past (the app was down a while, or this is
      // the very first call after a long-dormant deploy), resume from
      // today rather than backfilling already-past, unbookable days.
      const dayAfterLast = lastSlot ? new Date(startFrom.getTime() + 86_400_000) : startFrom;
      const cursorDay = dayAfterLast < today ? today : dayAfterLast;

      for (let day = new Date(cursorDay); day < horizon; day.setDate(day.getDate() + 1)) {
        if (!workingDaySet.has(WEEKDAY_ORDER[day.getDay()])) continue;

        const dayOpen = withTime(day, openTime);
        const dayClose = withTime(day, closeTime);
        for (
          let startsAt = dayOpen;
          new Date(startsAt.getTime() + service.durationMinutes * 60_000) <= dayClose;
          startsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)
        ) {
          const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
          // `seats` parallel rows for the exact same time+service - each
          // is still its own real Slot row, so the existing
          // one_active_booking_per_slot partial unique index still caps
          // each one at a single CONFIRMED booking; "3 seats at 10:00"
          // is simply 3 of these rows sharing a startsAt/endsAt/serviceId.
          for (let seat = 0; seat < seats; seat++) {
            newSlots.push({ platformId, serviceId: service.id, startsAt: new Date(startsAt), endsAt });
          }
        }
      }

      if (newSlots.length > 0) {
        await this.prisma.slot.createMany({ data: newSlots, skipDuplicates: true });
      }
    }
  }

  // public read, no ownership check — availability is meant to be visible
  // to anyone before they've booked anything. see docs/API.md.
  async list(platformId: string, query: ListSlotsQuery) {
    await this.ensureFutureSlots(platformId);

    const where: Prisma.SlotWhereInput = { platformId };
    if (query.serviceId) where.serviceId = query.serviceId;
    if (query.from || query.to) {
      where.startsAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }
    // "open" is derived from the booking table, never a stored flag — see
    // docs/DATA-MODEL.md, "Availability".
    if (query.onlyOpen ?? true) {
      where.bookings = { none: { status: 'CONFIRMED' } };
    }

    const slots = await this.prisma.slot.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: { service: { select: { id: true, name: true, nameAr: true, durationMinutes: true } } },
    });

    if (!query.dedupe) return slots;

    // one representative row per (serviceId, startsAt) - whichever one
    // happens to still be open (findMany above already filtered to open-
    // only when onlyOpen is set). The customer books THAT row's real id,
    // same create_booking/POST .../bookings contract as always - no API
    // change needed on the booking side. If this row gets taken, the
    // next open seat for the same time simply becomes the new
    // representative on the customer's next fetch, invisible to them as
    // "still available" the whole time all seats aren't full.
    const seen = new Set<string>();
    const deduped: typeof slots = [];
    for (const slot of slots) {
      const key = `${slot.serviceId}|${slot.startsAt.toISOString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(slot);
    }
    return deduped;
  }

  async getPublic(platformId: string, slotId: string) {
    const slot = await this.prisma.slot.findFirst({
      where: { id: slotId, platformId },
      include: {
        service: { select: { id: true, name: true, nameAr: true, durationMinutes: true } },
        bookings: { where: { status: 'CONFIRMED' }, select: { id: true } },
      },
    });
    if (!slot) throw new NotFoundException('No such slot.');
    const { bookings, ...rest } = slot;
    return { ...rest, isOpen: bookings.length === 0 };
  }

  async create(ownerId: string, platformId: string, dto: CreateSlotDto, callerPlatformId?: string) {
    await this.platforms.getOwned(ownerId, platformId, callerPlatformId);

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, platformId },
    });
    if (!service) throw new NotFoundException('No such service on this platform.');

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt.');
    }

    return this.prisma.slot.create({
      data: { platformId, serviceId: dto.serviceId, startsAt, endsAt },
    });
  }

  async remove(ownerId: string, platformId: string, slotId: string, callerPlatformId?: string) {
    await this.platforms.getOwned(ownerId, platformId, callerPlatformId);

    const slot = await this.prisma.slot.findFirst({
      where: { id: slotId, platformId },
      include: { bookings: { where: { status: 'CONFIRMED' } } },
    });
    if (!slot) throw new NotFoundException('No such slot.');
    if (slot.bookings.length > 0) {
      throw new BadRequestException('Cannot delete a slot with a confirmed booking — cancel it first.');
    }

    await this.prisma.slot.delete({ where: { id: slotId } });
  }
}
