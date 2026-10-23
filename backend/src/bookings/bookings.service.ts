import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformsService } from '../platforms/platforms.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateBookingDto } from './dto/create-booking.dto';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function omitTokenHash<T extends { cancelTokenHash: string }>(booking: T) {
  const { cancelTokenHash, ...rest } = booking;
  return rest;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platforms: PlatformsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(platformId: string, slotId: string, dto: CreateBookingDto) {
    const slot = await this.prisma.slot.findFirst({ where: { id: slotId, platformId } });
    if (!slot) throw new NotFoundException('No such slot on this platform.');

    // the cancel/lookup credential — shown exactly once, in this response.
    // not customerEmail: an email is often guessable or even public
    // (a business card, a mailing list), so it was never a real secret to
    // gate a destructive action on. see docs/API.md.
    const cancelToken = randomBytes(16).toString('base64url');

    // the actual conflict guard is the partial unique index on
    // (slotId) WHERE status = 'CONFIRMED' — see migration sql and
    // docs/CONCURRENCY.md. this insert either succeeds outright or fails
    // with P2002, there's no read-then-write gap for two concurrent
    // requests to both slip through.
    let booking;
    try {
      booking = await this.prisma.booking.create({
        data: {
          slotId,
          platformId,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          cancelTokenHash: hashToken(cancelToken),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // two partial unique indexes can fire P2002 here - disambiguate which
        // one. confirmed against real postgres, not assumed from docs: for
        // these raw-sql-created indexes, err.meta.target carries
        // the violated column list (["slotId"] vs
        // ["platformId","customerEmail"]), not the index's own name - so
        // checking for customerEmail in that list is the real signal.
        // DATA-MODEL-V2.md's named fallback (the raw driver error text,
        // which does contain the index name) covers the case that list is
        // ever absent.
        const target = err.meta?.target;
        // exact membership, not substring matching - a future third index
        // whose column list merely contains "customerEmail" as a substring
        // of a different field name must never misfire this check.
        const hitsCustomerConstraint = Array.isArray(target)
          ? target.includes('customerEmail')
          : String(target ?? '').includes('one_active_booking_per_customer') ||
            err.message.includes('one_active_booking_per_customer');

        if (hitsCustomerConstraint) {
          throw new ConflictException(
            'You already have an active booking at this platform. Cancel it before booking another.',
          );
        }
        throw new ConflictException('This slot was just booked by someone else.');
      }
      throw err;
    }

    // only reachable once the insert actually committed — never emit for
    // an attempt that lost the race above.
    this.realtime.emitSlotBooked(platformId, slotId);
    return { ...omitTokenHash(booking), cancelToken };
  }

  // the ONE enforcement point for customer-initiated cancellation - both
  // real callers (the manual DELETE endpoint behind bookings.controller.ts,
  // and the chat's tool-executor.ts, resolving by cancelToken alone) end
  // up here. No owner-dashboard cancel action exists yet, so gating here
  // unconditionally is correct for now - if one's ever added, it needs
  // its own call path, not this one, since this flag only ever means
  // "can a customer cancel themselves."
  async cancel(bookingId: string, cancelToken: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { slot: { include: { platform: { select: { customerCancellationEnabled: true } } } } },
    });
    // same response whether the id doesn't exist or the token just
    // doesn't match — don't confirm a booking's existence to a wrong
    // guess.
    if (!booking || !cancelToken || booking.cancelTokenHash !== hashToken(cancelToken)) {
      throw new NotFoundException('No such booking.');
    }

    if (booking.status === 'CANCELLED') {
      return omitTokenHash(booking); // already cancelled, nothing more to do — idempotent
    }

    if (!booking.slot.platform.customerCancellationEnabled) {
      // a distinct, honest message - not NotFoundException's "no such
      // booking" (that would be actively misleading: the booking is
      // real, cancellation is just switched off), and not a silent
      // no-op either.
      throw new ConflictException(
        'This business has not enabled self-service cancellation. Contact them directly to cancel.',
      );
    }

    const cancelled = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    this.realtime.emitSlotCancelled(booking.slot.platformId, booking.slotId);
    return omitTokenHash(cancelled);
  }

  // the AI chat path's only way to cancel: a customer's chat message can
  // carry a cancelToken but never a bookingId - nothing in the chat flow
  // ever shows them that internal id (the human web-form flow gets it
  // for free, embedded in the confirmation page's own URL; chat has no
  // equivalent). cancelTokenHash is already the real, sufficiently random
  // secret this whole flow is built on (16 random bytes, same security
  // property bookingId+token together had), so resolving by hash alone
  // costs nothing extra in security - same NotFoundException on no match,
  // never distinguishing "wrong token" from "no such booking" either.
  async findIdByCancelToken(cancelToken: string): Promise<string> {
    const booking = await this.prisma.booking.findFirst({
      where: { cancelTokenHash: hashToken(cancelToken) },
      select: { id: true },
    });
    if (!booking) throw new NotFoundException('No such booking.');
    return booking.id;
  }

  async getForCustomer(bookingId: string, cancelToken: string) {
    // slot+service included - a standalone "manage my booking" page needs
    // the actual appointment time and service name to be useful, not just
    // the bare booking row (same gap listForPlatform's own include
    // already solved for the owner-dashboard view). platform's
    // customerCancellationEnabled included too, so that page knows
    // whether to even show a cancel button before the customer tries it
    // and hits cancel()'s own gate.
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        slot: {
          include: {
            service: true,
            platform: { select: { customerCancellationEnabled: true } },
          },
        },
      },
    });
    if (!booking || !cancelToken || booking.cancelTokenHash !== hashToken(cancelToken)) {
      throw new NotFoundException('No such booking.');
    }
    return omitTokenHash(booking);
  }

  async listForPlatform(
    ownerId: string,
    platformId: string,
    status?: 'CONFIRMED' | 'CANCELLED',
    callerPlatformId?: string,
  ) {
    await this.platforms.getOwned(ownerId, platformId, callerPlatformId);
    const bookings = await this.prisma.booking.findMany({
      where: { slot: { platformId }, ...(status ? { status } : {}) },
      include: { slot: { select: { id: true, startsAt: true, endsAt: true, serviceId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return bookings.map(omitTokenHash);
  }
}
