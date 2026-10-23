const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function gatewayResponse(json: unknown) {
  return { ok: true, status: 200, json: async () => ({ text: JSON.stringify(json), json }) };
}

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { buildTestApp } from './helpers';
import { ToolExecutor } from '../src/chat/tool-executor';
import { ChatService } from '../src/chat/chat.service';

// No gateway round-trip left to verify under the in-process design, so
// the real risk this proves instead: does the in-process tool executor
// actually perform its real action correctly against real postgres, and
// does a thrown domain exception actually get translated instead of
// crashing - driven directly, not against mocked Prisma.
describe('chat tool executor - real-execution verification against a real test db', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let toolExecutor: ToolExecutor;
  let chatService: ChatService;

  beforeAll(async () => {
    app = await buildTestApp();
    prisma = new PrismaClient();
    toolExecutor = app.get(ToolExecutor);
    chatService = app.get(ChatService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('list_services returns the platform\'s actual current services from the real database', async () => {
    const suffix = randomBytes(4).toString('hex');
    const owner = await prisma.user.create({ data: { email: `exec-test-owner-${suffix}@example.com`, passwordHash: 'unused' } });
    const platform = await prisma.platform.create({
      data: { ownerId: owner.id, name: `Exec Test Clinic ${suffix}`, slug: `exec-test-clinic-${suffix}` },
    });
    await prisma.service.create({ data: { platformId: platform.id, name: 'Consultation', durationMinutes: 30 } });
    await prisma.service.create({ data: { platformId: platform.id, name: 'Follow-up', durationMinutes: 15 } });

    const result = await toolExecutor.execute('list_services', platform.id, {}, 'unused@example.com');

    expect(result.map((s: any) => s.name).sort()).toEqual(['Consultation', 'Follow-up']);
  });

  it('list_slots returns actual open slots from the real database', async () => {
    const suffix = randomBytes(4).toString('hex');
    const owner = await prisma.user.create({ data: { email: `exec-test-owner-${suffix}@example.com`, passwordHash: 'unused' } });
    const platform = await prisma.platform.create({
      // enabled by default for this file's fixtures, same as
      // test/helpers.ts's shared ones - not what either of these two
      // specific tests is targeting.
      data: {
        ownerId: owner.id,
        name: `Exec Test Clinic ${suffix}`,
        slug: `exec-test-clinic-${suffix}`,
        customerCancellationEnabled: true,
      },
    });
    const service = await prisma.service.create({ data: { platformId: platform.id, name: 'Consultation', durationMinutes: 30 } });
    const slot = await prisma.slot.create({
      data: {
        platformId: platform.id,
        serviceId: service.id,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000 + 1_800_000),
      },
    });

    const result = await toolExecutor.execute('list_slots', platform.id, {}, 'unused@example.com');

    expect(result.map((s: any) => s.id)).toEqual([slot.id]);
  });

  it('create_booking produces a real Booking row with the correct platformId and a real cancelToken; cancel_booking actually flips it to CANCELLED', async () => {
    const suffix = randomBytes(4).toString('hex');
    const owner = await prisma.user.create({ data: { email: `exec-test-owner-${suffix}@example.com`, passwordHash: 'unused' } });
    const platform = await prisma.platform.create({
      // enabled by default for this file's fixtures, same as
      // test/helpers.ts's shared ones - not what either of these two
      // specific tests is targeting.
      data: {
        ownerId: owner.id,
        name: `Exec Test Clinic ${suffix}`,
        slug: `exec-test-clinic-${suffix}`,
        customerCancellationEnabled: true,
      },
    });
    const service = await prisma.service.create({ data: { platformId: platform.id, name: 'Consultation', durationMinutes: 30 } });
    const slot = await prisma.slot.create({
      data: {
        platformId: platform.id,
        serviceId: service.id,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000 + 1_800_000),
      },
    });

    const customerEmail = `real-customer-${suffix}@example.com`;
    const created = await toolExecutor.execute(
      'create_booking',
      platform.id,
      { slotId: slot.id, customerName: 'Real Customer' },
      customerEmail,
    );

    expect(typeof created.cancelToken).toBe('string');
    expect(created.cancelToken.length).toBeGreaterThan(10);

    const dbRowAfterCreate = await prisma.booking.findUnique({ where: { id: created.id } });
    expect(dbRowAfterCreate?.platformId).toBe(platform.id);
    expect(dbRowAfterCreate?.status).toBe('CONFIRMED');
    // the session's own customerEmail wins - never whatever a caller
    // might otherwise put in the tool input (see tool-executor.ts).
    expect(dbRowAfterCreate?.customerEmail).toBe(customerEmail);

    await toolExecutor.execute(
      'cancel_booking',
      platform.id,
      { bookingId: created.id, cancelToken: created.cancelToken },
      customerEmail,
    );

    const dbRowAfterCancel = await prisma.booking.findUnique({ where: { id: created.id } });
    expect(dbRowAfterCancel?.status).toBe('CANCELLED');
  });

  // Proven against a REAL database-produced conflict (not mocked Prisma)
  // - a second create_booking for the same customer at the same platform
  // must hit the real one_active_booking_per_customer index, and
  // ChatService.handleMessage must translate that into a normal
  // { reply } response, never let it crash the request.
  it('a real customer-conflict from the database is translated into a tool_result, not a crash, end to end through ChatService', async () => {
    const suffix = randomBytes(4).toString('hex');
    const owner = await prisma.user.create({ data: { email: `exec-test-owner-${suffix}@example.com`, passwordHash: 'unused' } });
    const platform = await prisma.platform.create({
      data: { ownerId: owner.id, name: `Exec Test Conflict Clinic ${suffix}`, slug: `exec-test-conflict-${suffix}` },
    });
    const service = await prisma.service.create({ data: { platformId: platform.id, name: 'Consultation', durationMinutes: 30 } });
    const slotA = await prisma.slot.create({
      data: { platformId: platform.id, serviceId: service.id, startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 86_400_000 + 1_800_000) },
    });
    const slotB = await prisma.slot.create({
      data: { platformId: platform.id, serviceId: service.id, startsAt: new Date(Date.now() + 90_000_000), endsAt: new Date(Date.now() + 90_000_000 + 1_800_000) },
    });
    const customerEmail = `exec-test-conflict-customer-${suffix}@example.com`;

    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce(
        gatewayResponse({ action: 'call_tool', tool: 'create_booking', args: { slotId: slotA.id, customerName: 'Cust', customerEmail } }),
      )
      .mockResolvedValueOnce(gatewayResponse({ action: 'reply', message: 'Booked for your first slot.' }));
    const first = await chatService.handleMessage(platform.id, { customerEmail, message: 'book the first slot' });
    expect(first.reply).toBe('Booked for your first slot.');

    mockFetch
      .mockResolvedValueOnce(
        gatewayResponse({ action: 'call_tool', tool: 'create_booking', args: { slotId: slotB.id, customerName: 'Cust', customerEmail } }),
      )
      .mockResolvedValueOnce(gatewayResponse({ action: 'reply', message: 'You already have an upcoming appointment with us.' }));
    const second = await chatService.handleMessage(platform.id, { customerEmail, message: 'book the second slot too' });

    expect(second).toEqual({ reply: 'You already have an upcoming appointment with us.' });

    // the real database state: exactly one CONFIRMED booking for this
    // customer at this platform, not two.
    const confirmedCount = await prisma.booking.count({
      where: { platformId: platform.id, customerEmail, status: 'CONFIRMED' },
    });
    expect(confirmedCount).toBe(1);

    // the prompt the gateway actually received for the second attempt's
    // final-reply call really does carry the real database-produced
    // conflict message. calls[0]/[1] belong to the FIRST handleMessage
    // invocation above (call_tool round, then the final-reply round that
    // already saw that tool result) - calls[2]/[3] are the second
    // invocation's own two rounds, so [3] is where this attempt's own
    // tool result landed.
    const secondCallBody = JSON.parse(mockFetch.mock.calls[3][1].body);
    expect(secondCallBody.prompt).toContain('create_booking failed');
    expect(secondCallBody.prompt).toContain('already have an active booking');
  });
});
