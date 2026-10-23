import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { buildTestApp, seedOpenSlots, seedOpenSlot } from './helpers';

// The second conflict case - a customer who already has an active
// booking at this platform, attempted against a *different* open slot,
// same mirrored rigor as test/booking-concurrency.e2e-spec.ts applies to
// the first (slot-level) conflict case - real postgres, real concurrency,
// no mocking.
describe('booking the second conflict case: same customer, different slots', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await buildTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('lets exactly one of 20 simultaneous bookings by the same customer, across 20 different slots, through', async () => {
    const { platform, slots } = await seedOpenSlots(prisma, 20);
    const http = app.getHttpServer();
    const customerEmail = 'repeat-customer@example.com';

    const attempts = slots.map((slot) =>
      request(http)
        .post(`/api/v1/platforms/${platform.id}/slots/${slot.id}/bookings`)
        .send({ customerName: 'Repeat Customer', customerEmail }),
    );

    const results = await Promise.all(attempts);
    const succeeded = results.filter((r: request.Response) => r.status === 201);
    const conflicted = results.filter((r: request.Response) => r.status === 409);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(19);
    // these are 20 different slots - a slot-level conflict should never
    // fire here, only the customer-level one.
    for (const r of conflicted) {
      expect(r.body.message).toMatch(/already have an active booking/i);
      expect(r.body.message).not.toMatch(/slot was just booked/i);
    }

    const confirmedCount = await prisma.booking.count({
      where: { platformId: platform.id, customerEmail, status: 'CONFIRMED' },
    });
    expect(confirmedCount).toBe(1);
  });

  // The ORIGINAL slot-conflict case still produces its own distinct
  // message, not silently reclassified by the new disambiguation logic -
  // test/booking-concurrency.e2e-spec.ts itself stays unmodified; this is
  // the one new message-content assertion added here.
  it('the original slot-conflict message is untouched and distinct from the new customer-conflict one', async () => {
    const { platform, slot } = await seedOpenSlot(prisma);
    const http = app.getHttpServer();

    const attempts = Array.from({ length: 5 }, (_, i) =>
      request(http)
        .post(`/api/v1/platforms/${platform.id}/slots/${slot.id}/bookings`)
        .send({ customerName: `Racer ${i}`, customerEmail: `racer${i}@example.com` }),
    );
    const results = await Promise.all(attempts);
    const conflicted = results.filter((r: request.Response) => r.status === 409);

    expect(conflicted).toHaveLength(4);
    for (const r of conflicted) {
      expect(r.body.message).toBe('This slot was just booked by someone else.');
    }
  });
});
