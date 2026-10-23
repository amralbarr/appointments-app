import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { buildTestApp } from './helpers';

// Found live: the original seed only ever generated 7 days of slots
// once, so every platform's bookable future silently ran dry a week
// after it was seeded - no ongoing mechanism existed to keep extending
// it. SlotsService.list() now lazily tops up a rolling window on every
// real read; this proves that end to end against a real test db, not
// mocked Prisma, since the actual date-range/working-day math is exactly
// the kind of thing a mock would hide a real bug in.
describe('GET /platforms/:id/slots - rolling auto-generation', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeAll(async () => {
    app = await buildTestApp();
    prisma = new PrismaClient();
    http = app.getHttpServer();
  });

  async function makePlatform(overrides: Record<string, unknown>) {
    const suffix = randomBytes(4).toString('hex');
    const owner = await prisma.user.create({
      data: { email: `slotgen-owner-${suffix}@example.com`, passwordHash: 'unused' },
    });
    return prisma.platform.create({
      data: {
        ownerId: owner.id,
        name: `Slot Gen Test ${suffix}`,
        slug: `slot-gen-test-${suffix}`,
        ...overrides,
      },
    });
  }

  it('generates slots well beyond a week out, respecting workingDays/openTime/closeTime', async () => {
    const platform = await makePlatform({
      workingDays: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
      openTime: '09:00',
      closeTime: '10:00',
    });
    await prisma.service.create({
      data: { platformId: platform.id, name: 'Consultation', durationMinutes: 30 },
    });

    const res = await request(http)
      .get(`/api/v1/platforms/${platform.id}/slots`)
      .query({ onlyOpen: 'true' })
      .expect(200);

    expect(res.body.length).toBeGreaterThan(0);

    const starts: Date[] = res.body.map((s: any) => new Date(s.startsAt));
    const last = starts[starts.length - 1];
    const daysOut = (last.getTime() - Date.now()) / 86_400_000;
    // well past the old fixed 7-day seed window - proves this is the new
    // rolling generation, not a coincidental leftover from somewhere else.
    expect(daysOut).toBeGreaterThan(20);

    // every generated slot falls within the 09:00-10:00 local window and
    // on one of the 5 configured working days - never a day/time the
    // platform never actually opened.
    const workingDayNumbers = new Set([0, 1, 2, 3, 4]); // SUN..THU
    for (const s of starts) {
      expect(workingDayNumbers.has(s.getDay())).toBe(true);
      const hour = s.getHours();
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(10);
    }
  });

  it('never auto-generates for a platform with no workingDays/openTime/closeTime set (by-appointment-only)', async () => {
    const platform = await makePlatform({}); // no schedule fields at all
    await prisma.service.create({
      data: { platformId: platform.id, name: 'Consultation', durationMinutes: 30 },
    });

    const res = await request(http)
      .get(`/api/v1/platforms/${platform.id}/slots`)
      .query({ onlyOpen: 'true' })
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('is idempotent - calling list() twice in a row does not duplicate slots', async () => {
    const platform = await makePlatform({
      workingDays: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
      openTime: '09:00',
      closeTime: '10:00',
    });
    await prisma.service.create({
      data: { platformId: platform.id, name: 'Consultation', durationMinutes: 30 },
    });

    const first = await request(http).get(`/api/v1/platforms/${platform.id}/slots`).expect(200);
    const second = await request(http).get(`/api/v1/platforms/${platform.id}/slots`).expect(200);

    expect(second.body.length).toBe(first.body.length);
  });

  // multi-seat platforms (Platform.seats > 1, e.g. a barbershop with
  // several chairs) generate `seats` parallel Slot rows per time period -
  // each one still independently capped at a single CONFIRMED booking by
  // the same one_active_booking_per_slot index, so N rows really is N
  // concurrent bookable seats, not a capacity counter.
  it('generates `seats` parallel rows per time period, and dedupe=true collapses them back to one', async () => {
    const platform = await makePlatform({
      workingDays: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
      openTime: '09:00',
      closeTime: '10:00',
      seats: 3,
    });
    await prisma.service.create({
      data: { platformId: platform.id, name: 'Haircut', durationMinutes: 30 },
    });

    const raw = await request(http)
      .get(`/api/v1/platforms/${platform.id}/slots`)
      .query({ onlyOpen: 'true' })
      .expect(200);
    const deduped = await request(http)
      .get(`/api/v1/platforms/${platform.id}/slots`)
      .query({ onlyOpen: 'true', dedupe: 'true' })
      .expect(200);

    expect(raw.body.length).toBe(deduped.body.length * 3);

    const dedupedKeys = deduped.body.map((s: any) => `${s.serviceId}|${s.startsAt}`);
    expect(new Set(dedupedKeys).size).toBe(dedupedKeys.length);
  });
});
