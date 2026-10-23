import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { buildTestApp, seedOpenSlot } from './helpers';

// this is the test the whole architecture decision in
// docs/CONCURRENCY.md is actually answering to. against real postgres,
// not a mock - the partial unique index is a database-level guarantee and
// only means something if it's exercised against the database.
describe('booking a slot under real concurrency', () => {
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

  it('lets exactly one of 20 simultaneous bookings for the same slot through', async () => {
    const { platform, slot } = await seedOpenSlot(prisma);
    const http = app.getHttpServer();

    const attempts = Array.from({ length: 20 }, (_, i) =>
      request(http)
        .post(`/api/v1/platforms/${platform.id}/slots/${slot.id}/bookings`)
        .send({ customerName: `Racer ${i}`, customerEmail: `racer${i}@example.com` }),
    );

    const results = await Promise.all(attempts);
    const succeeded = results.filter((r: request.Response) => r.status === 201);
    const conflicted = results.filter((r: request.Response) => r.status === 409);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(19);

    const confirmedCount = await prisma.booking.count({
      where: { slotId: slot.id, status: 'CONFIRMED' },
    });
    expect(confirmedCount).toBe(1);
  });

  it('reopens for a fresh race once the winning booking is cancelled', async () => {
    const { platform, slot } = await seedOpenSlot(prisma);
    const http = app.getHttpServer();

    const firstBooking = await request(http)
      .post(`/api/v1/platforms/${platform.id}/slots/${slot.id}/bookings`)
      .send({ customerName: 'First', customerEmail: 'first@example.com' })
      .expect(201);

    await request(http)
      .delete(`/api/v1/bookings/${firstBooking.body.id}`)
      .query({ cancelToken: firstBooking.body.cancelToken })
      .expect(200);

    const secondAttempts = Array.from({ length: 20 }, (_, i) =>
      request(http)
        .post(`/api/v1/platforms/${platform.id}/slots/${slot.id}/bookings`)
        .send({ customerName: `Second racer ${i}`, customerEmail: `second${i}@example.com` }),
    );
    const results = await Promise.all(secondAttempts);

    expect(results.filter((r: request.Response) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r: request.Response) => r.status === 409)).toHaveLength(19);

    const confirmedCount = await prisma.booking.count({
      where: { slotId: slot.id, status: 'CONFIRMED' },
    });
    expect(confirmedCount).toBe(1);
  });

  it('a cancelled booking stays cancelled, not resurrected by the next winner', async () => {
    const { platform, slot } = await seedOpenSlot(prisma);
    const http = app.getHttpServer();

    const first = await request(http)
      .post(`/api/v1/platforms/${platform.id}/slots/${slot.id}/bookings`)
      .send({ customerName: 'First', customerEmail: 'first@example.com' })
      .expect(201);

    await request(http)
      .delete(`/api/v1/bookings/${first.body.id}`)
      .query({ cancelToken: first.body.cancelToken })
      .expect(200);

    await request(http)
      .post(`/api/v1/platforms/${platform.id}/slots/${slot.id}/bookings`)
      .send({ customerName: 'Second', customerEmail: 'second@example.com' })
      .expect(201);

    const total = await prisma.booking.count({ where: { slotId: slot.id } });
    const confirmed = await prisma.booking.count({ where: { slotId: slot.id, status: 'CONFIRMED' } });
    expect(total).toBe(2); // the cancelled row and the new confirmed one, both kept
    expect(confirmed).toBe(1);
  });
});
