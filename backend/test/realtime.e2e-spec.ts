import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { buildTestApp, seedOpenSlot } from './helpers';

describe('realtime booking events', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let baseUrl: string;

  beforeAll(async () => {
    app = await buildTestApp(); // already listening - see helpers.ts
    prisma = new PrismaClient();
    const address = app.getHttpServer().address();
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  function connectAndJoin(platformId: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/realtime`, { transports: ['websocket'], forceNew: true });
      socket.on('connect', () => {
        socket.emit('join', { platformId });
        resolve(socket);
      });
      socket.on('connect_error', reject);
    });
  }

  it('emits slot.booked to a client in the right room, after the http call resolves', async () => {
    const { platform, slot } = await seedOpenSlot(prisma);
    const socket = await connectAndJoin(platform.id);

    const received = new Promise<any>((resolve) => socket.on('slot.booked', resolve));

    await request(baseUrl)
      .post(`/api/v1/platforms/${platform.id}/slots/${slot.id}/bookings`)
      .send({ customerName: 'Sara', customerEmail: 'sara@example.com' })
      .expect(201);

    const event = await received;
    expect(event.slotId).toBe(slot.id);
    expect(event.platformId).toBe(platform.id);

    socket.disconnect();
  });

  it('never emits for an attempt that lost the booking race', async () => {
    const { platform, slot } = await seedOpenSlot(prisma);
    const socket = await connectAndJoin(platform.id);

    const bookedEvents: any[] = [];
    socket.on('slot.booked', (e) => bookedEvents.push(e));

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(baseUrl)
          .post(`/api/v1/platforms/${platform.id}/slots/${slot.id}/bookings`)
          .send({ customerName: `R${i}`, customerEmail: `r${i}@example.com` }),
      ),
    );

    await new Promise((r) => setTimeout(r, 300)); // let any pending emits land
    expect(bookedEvents).toHaveLength(1); // one winner, no event for the four losers

    socket.disconnect();
  });
});
