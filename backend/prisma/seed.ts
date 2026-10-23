import { PrismaClient, WeekDay } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// same real generation this app's own BookingsService.create() uses - a
// seed booking goes through the identical hash-only storage model as a
// real one, never a shortcut that stores the raw token.
function newCancelToken() {
  const token = randomBytes(16).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
}

const prisma = new PrismaClient();

const WEEKDAY_ORDER: WeekDay[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// a real week-and-a-bit of slots respecting the platform's own
// workingDays/openTime/closeTime/seats, starting tomorrow so nothing's
// already in the past. Deliberately only a bootstrap - the real,
// ongoing generation is SlotsService.ensureFutureSlots' 60-day rolling
// window, which tops this up to the full horizon the moment anyone
// actually calls GET .../slots for the first time. A platform with no
// fixed schedule (empty workingDays, or missing openTime/closeTime -
// suspended, or genuinely by-appointment-only) gets none here either,
// same as ensureFutureSlots' own behavior.
function buildSlots(
  serviceId: string,
  platformId: string,
  durationMinutes: number,
  workingDays: WeekDay[],
  openTime: string | null,
  closeTime: string | null,
  seats: number,
) {
  const slots: { platformId: string; serviceId: string; startsAt: Date; endsAt: Date }[] = [];
  if (workingDays.length === 0 || !openTime || !closeTime) return slots;
  const workingDaySet = new Set(workingDays);
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);

  const now = new Date();
  for (let day = 1; day <= 10; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);
    if (!workingDaySet.has(WEEKDAY_ORDER[date.getDay()])) continue;

    const dayOpen = new Date(date);
    dayOpen.setHours(openH, openM, 0, 0);
    const dayClose = new Date(date);
    dayClose.setHours(closeH, closeM, 0, 0);

    for (
      let startsAt = dayOpen;
      new Date(startsAt.getTime() + durationMinutes * 60_000) <= dayClose;
      startsAt = new Date(startsAt.getTime() + durationMinutes * 60_000)
    ) {
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      for (let seat = 0; seat < seats; seat++) {
        slots.push({ platformId, serviceId, startsAt: new Date(startsAt), endsAt });
      }
    }
  }
  return slots;
}

interface TenantProfile {
  description: string;
  address: string;
  phone: string;
  businessHoursText: string;
  // Arabic counterparts — Arabic is the platform's default locale going
  // forward (DATA-MODEL-V2.md's bilingual-content update). address/phone
  // stay single-language: factual/contact fields, not translatable
  // content.
  descriptionAr: string;
  businessHoursTextAr: string;
  // structured working-time data, hand-derived from businessHoursText
  // above so the two stay consistent — see schema.prisma's comment on
  // Platform for why these are kept as hand-authored display strings
  // rather than generated from the structured fields (the suspended and
  // by-appointment-only cases below both carry nuance a mechanical
  // generator would need to special-case anyway). workingDays: [] +
  // null openTime/closeTime is the explicit "no fixed/known schedule"
  // case (suspended, or no fixed daily window).
  workingDays: WeekDay[];
  openTime: string | null;
  closeTime: string | null;
}

interface TenantSeed {
  ownerEmail: string;
  ownerName: string;
  platformName: string;
  platformNameAr: string;
  slug: string;
  isActive?: boolean; // default true
  seats?: number; // default 1 - how many customers can hold the same time+service at once
  profile: TenantProfile;
  services: { name: string; nameAr: string; durationMinutes: number }[];
}

// repo-root data/seeds/*.json, not hardcoded here - one file per tenant,
// so adding/editing a seeded tenant is a data-file edit, same convention
// as prompts/ai-prompt.json for the chat assistant's persona/rules.
// Resolved from process.cwd() (reliably "backend/" whether this runs via
// ts-node in dev or the compiled dist/ build - see mcp-tool-schema.ts's
// own YAML_PATH comment for the same reasoning), one "../" up to the
// repo root, then into data/seeds/.
const SEEDS_DIR = path.resolve(process.cwd(), '../data/seeds');

// several tenants spanning different kinds of businesses - the point is
// variety (DATA-MODEL-V2.md's "Seed data"), not any specific list - see
// data/seeds/README.md for the file shape. One shared creation routine
// below loops through all of them, rather than hand-repeating the
// clinic's bespoke code for each.
function loadTenants(): TenantSeed[] {
  const files = fs
    .readdirSync(SEEDS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort(); // stable, predictable seed order across runs

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(SEEDS_DIR, file), 'utf-8');
    try {
      return JSON.parse(raw) as TenantSeed;
    } catch (err) {
      throw new Error(`data/seeds/${file} is not valid JSON: ${(err as Error).message}`);
    }
  });
}

const TENANTS: TenantSeed[] = loadTenants();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  for (const tenant of TENANTS) {
    const isActive = tenant.isActive ?? true;
    const seats = tenant.seats ?? 1;

    const owner = await prisma.user.upsert({
      where: { email: tenant.ownerEmail },
      update: {},
      create: { email: tenant.ownerEmail, name: tenant.ownerName, passwordHash },
    });

    // update: {} would do nothing on a re-run, same problem phase 1 had
    // - this backfills the new profile fields (including nameAr, added
    // alongside the bilingual-content update) on an already-seeded row
    // too, not only on first creation.
    const platform = await prisma.platform.upsert({
      where: { slug: tenant.slug },
      update: { ...tenant.profile, isActive, seats, nameAr: tenant.platformNameAr },
      create: {
        ownerId: owner.id,
        name: tenant.platformName,
        nameAr: tenant.platformNameAr,
        slug: tenant.slug,
        timezone: 'Asia/Riyadh',
        isActive,
        seats,
        ...tenant.profile,
      },
    });

    const existingServices = await prisma.service.findMany({ where: { platformId: platform.id } });
    const services = [];
    for (const def of tenant.services) {
      const existing = existingServices.find((s) => s.name === def.name);
      services.push(
        existing
          ? // backfill nameAr on an already-seeded service too, same
            // reasoning as the platform-level upsert above.
            await prisma.service.update({ where: { id: existing.id }, data: { nameAr: def.nameAr } })
          : await prisma.service.create({
              data: {
                platformId: platform.id,
                name: def.name,
                nameAr: def.nameAr,
                durationMinutes: def.durationMinutes,
              },
            }),
      );
    }

    const alreadyHasSlots = await prisma.slot.count({ where: { platformId: platform.id } });
    if (alreadyHasSlots === 0 && services.length > 0) {
      await prisma.slot.createMany({
        data: services.flatMap((s) =>
          buildSlots(
            s.id,
            platform.id,
            s.durationMinutes,
            platform.workingDays,
            platform.openTime,
            platform.closeTime,
            seats,
          ),
        ),
      });
    }

    // a couple of real sample bookings so a fresh server shows actual
    // booking history/dashboard data, not just empty open slots - same
    // one_active_booking_per_customer constraint as a real booking, so
    // each sample customer below gets at most one.
    const alreadyHasBookings = await prisma.booking.count({ where: { platformId: platform.id } });
    if (alreadyHasBookings === 0 && services.length > 0) {
      const openSlots = await prisma.slot.findMany({
        where: { platformId: platform.id },
        orderBy: { startsAt: 'asc' },
        take: 2,
      });
      const sampleCustomers = [
        { name: 'Sample Customer One', email: 'customer1@example.com' },
        { name: 'Sample Customer Two', email: 'customer2@example.com' },
      ];
      for (const [i, slot] of openSlots.entries()) {
        const customer = sampleCustomers[i];
        if (!customer) break;
        const { token, hash } = newCancelToken();
        await prisma.booking.create({
          data: {
            slotId: slot.id,
            platformId: platform.id,
            customerName: customer.name,
            customerEmail: customer.email,
            cancelTokenHash: hash,
          },
        });
        console.log(`  sample booking for ${platform.slug}: ${customer.email}, cancelToken ${token}`);
      }
    }

    console.log('seeded:', {
      owner: owner.email,
      platform: platform.slug,
      isActive: platform.isActive,
      services: services.map((s) => s.name),
      slots: await prisma.slot.count({ where: { platformId: platform.id } }),
      bookings: await prisma.booking.count({ where: { platformId: platform.id } }),
    });
  }

  console.log('log in with dana@example.com / password123 (same password for every seeded tenant)');

  // the one admin account — created here by hand, same "no self-service
  // path to this role" posture ROLES-AND-DASHBOARDS.md calls for. no
  // platform of their own; an admin manages other people's.
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', name: 'Admin', passwordHash, role: 'ADMIN' },
  });
  console.log('admin login: admin@example.com / password123', { role: admin.role });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
