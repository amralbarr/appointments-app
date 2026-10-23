import { SlotsService } from './slots.service';

// ensureFutureSlots runs on every list() call — mock the prisma calls it
// needs so it exits immediately (no workingDays = no-op), leaving the
// rest of the mock surface clean for each test to set up its own slots.
function noop() {
  return Promise.resolve(null);
}

function makePrisma(slots: any[] = []) {
  return {
    platform: { findUnique: jest.fn().mockResolvedValue({ workingDays: [], openTime: null, closeTime: null, seats: 1 }) },
    service: { findMany: jest.fn().mockResolvedValue([]) },
    slot: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(slots),
      createMany: jest.fn().mockResolvedValue({}),
    },
  };
}

function makeSlot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'slot-1',
    platformId: 'plat-1',
    serviceId: 'svc-1',
    startsAt: new Date('2026-11-01T09:00:00Z'),
    endsAt: new Date('2026-11-01T09:30:00Z'),
    service: { id: 'svc-1', name: 'Consultation', nameAr: 'استشارة', durationMinutes: 30 },
    ...overrides,
  };
}

describe('SlotsService.list()', () => {
  let platforms: any;
  let service: SlotsService;

  beforeEach(() => {
    platforms = { getOwned: jest.fn() };
  });

  it('passes where.bookings = none:CONFIRMED when onlyOpen is true', async () => {
    const prisma = makePrisma([makeSlot()]);
    service = new SlotsService(prisma as any, platforms);

    await service.list('plat-1', { onlyOpen: true });

    const [call] = prisma.slot.findMany.mock.calls;
    expect(call[0].where.bookings).toEqual({ none: { status: 'CONFIRMED' } });
  });

  it('does NOT set where.bookings when onlyOpen is false', async () => {
    const prisma = makePrisma([makeSlot()]);
    service = new SlotsService(prisma as any, platforms);

    await service.list('plat-1', { onlyOpen: false });

    const [call] = prisma.slot.findMany.mock.calls;
    expect(call[0].where.bookings).toBeUndefined();
  });

  it('defaults onlyOpen to true when the field is absent', async () => {
    const prisma = makePrisma([makeSlot()]);
    service = new SlotsService(prisma as any, platforms);

    await service.list('plat-1', {});

    const [call] = prisma.slot.findMany.mock.calls;
    expect(call[0].where.bookings).toEqual({ none: { status: 'CONFIRMED' } });
  });

  it('returns all rows when dedupe is false (default)', async () => {
    const slot1 = makeSlot({ id: 'slot-1' });
    const slot2 = makeSlot({ id: 'slot-2' }); // same service + time = two seats
    const prisma = makePrisma([slot1, slot2]);
    service = new SlotsService(prisma as any, platforms);

    const result = await service.list('plat-1', { dedupe: false });

    expect(result).toHaveLength(2);
  });

  it('collapses two seats at the same time+service to one row when dedupe is true', async () => {
    const slot1 = makeSlot({ id: 'slot-1' });
    const slot2 = makeSlot({ id: 'slot-2' }); // identical startsAt + serviceId
    const prisma = makePrisma([slot1, slot2]);
    service = new SlotsService(prisma as any, platforms);

    const result = await service.list('plat-1', { dedupe: true });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('slot-1'); // first open seat is the representative
  });

  it('multi-seat: with onlyOpen, only the still-open seat shows after one is booked', async () => {
    // onlyOpen filtering already happened inside prisma — findMany returns
    // only the one slot that has no confirmed booking. The dedupe then sees
    // a single row and returns it as-is.
    const openSeat = makeSlot({ id: 'slot-2' });
    const prisma = makePrisma([openSeat]); // slot-1 was filtered by the DB (onlyOpen)
    service = new SlotsService(prisma as any, platforms);

    const result = await service.list('plat-1', { onlyOpen: true, dedupe: true });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('slot-2');
  });

  it('all seats booked: zero rows returned when every seat has a confirmed booking', async () => {
    // onlyOpen=true + all seats booked → findMany returns empty array
    const prisma = makePrisma([]);
    service = new SlotsService(prisma as any, platforms);

    const result = await service.list('plat-1', { onlyOpen: true, dedupe: true });

    expect(result).toHaveLength(0);
  });

  it('different services at the same time are kept as separate entries by dedupe', async () => {
    const haircut = makeSlot({ id: 's1', serviceId: 'svc-haircut' });
    const color = makeSlot({ id: 's2', serviceId: 'svc-color' });
    const prisma = makePrisma([haircut, color]);
    service = new SlotsService(prisma as any, platforms);

    const result = await service.list('plat-1', { dedupe: true });

    expect(result).toHaveLength(2);
  });

  it('passes serviceId filter through to findMany where clause', async () => {
    const prisma = makePrisma([makeSlot()]);
    service = new SlotsService(prisma as any, platforms);

    await service.list('plat-1', { serviceId: 'svc-abc' });

    const [call] = prisma.slot.findMany.mock.calls;
    expect(call[0].where.serviceId).toBe('svc-abc');
  });

  it('passes from/to date range to findMany where.startsAt', async () => {
    const prisma = makePrisma([makeSlot()]);
    service = new SlotsService(prisma as any, platforms);

    await service.list('plat-1', { from: '2026-11-01', to: '2026-11-07' });

    const [call] = prisma.slot.findMany.mock.calls;
    expect(call[0].where.startsAt).toMatchObject({
      gte: new Date('2026-11-01'),
      lt: new Date('2026-11-07'),
    });
  });

  it('omits startsAt filter when neither from nor to is given', async () => {
    const prisma = makePrisma([makeSlot()]);
    service = new SlotsService(prisma as any, platforms);

    await service.list('plat-1', {});

    const [call] = prisma.slot.findMany.mock.calls;
    expect(call[0].where.startsAt).toBeUndefined();
  });

  it('preserves ordering: results come back in startsAt asc order as requested', async () => {
    const prisma = makePrisma([makeSlot()]);
    service = new SlotsService(prisma as any, platforms);

    await service.list('plat-1', {});

    const [call] = prisma.slot.findMany.mock.calls;
    expect(call[0].orderBy).toEqual({ startsAt: 'asc' });
  });
});
