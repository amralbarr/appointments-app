import { ToolExecutor } from './tool-executor';

describe('ToolExecutor', () => {
  let prisma: any;
  let services: any;
  let slots: any;
  let bookings: any;
  let executor: ToolExecutor;

  beforeEach(() => {
    prisma = { platform: { findUniqueOrThrow: jest.fn().mockResolvedValue({ ownerId: 'owner-1' }) } };
    services = { list: jest.fn().mockResolvedValue([]) };
    slots = { list: jest.fn().mockResolvedValue([]) };
    bookings = {
      create: jest.fn().mockResolvedValue({}),
      cancel: jest.fn().mockResolvedValue({}),
      findIdByCancelToken: jest.fn().mockResolvedValue('resolved-booking-id'),
    };
    executor = new ToolExecutor(prisma, services, slots, bookings);
  });

  it('list_services resolves the real ownerId and calls ServicesService.list as the owner would', async () => {
    await executor.execute('list_services', 'platform-1', {}, 'c@x.com');
    expect(services.list).toHaveBeenCalledWith('owner-1', 'platform-1');
  });

  it('list_slots passes platformId from context, args from the tool input, and always forces dedupe', async () => {
    await executor.execute('list_slots', 'platform-1', { serviceId: 'svc-1', onlyOpen: true }, 'c@x.com');
    expect(slots.list).toHaveBeenCalledWith('platform-1', {
      serviceId: 'svc-1',
      from: undefined,
      to: undefined,
      onlyOpen: true,
      dedupe: true,
    });
  });

  // Never trust the model's own customerEmail - always the session's
  // real opening identity.
  it("create_booking always uses the session's own customerEmail, ignoring whatever the model's input claims", async () => {
    await executor.execute(
      'create_booking',
      'platform-1',
      { slotId: 'slot-1', customerName: 'A', customerEmail: 'victim@example.com' },
      'the-real-customer@example.com',
    );

    expect(bookings.create).toHaveBeenCalledWith('platform-1', 'slot-1', {
      customerName: 'A',
      customerEmail: 'the-real-customer@example.com',
    });
  });

  // the real chat flow never has a bookingId to give the model (see
  // tool-executor.ts's own comment) - any bookingId in the tool input
  // (an older gateway-tool-shape artifact, or a model guessing) must
  // never be trusted; resolution is always by cancelToken alone.
  it('cancel_booking resolves the real bookingId from cancelToken alone, ignoring any bookingId in the input', async () => {
    await executor.execute('cancel_booking', 'platform-1', { bookingId: 'wrong-id', cancelToken: 'tok-1' }, 'c@x.com');
    expect(bookings.findIdByCancelToken).toHaveBeenCalledWith('tok-1');
    expect(bookings.cancel).toHaveBeenCalledWith('resolved-booking-id', 'tok-1');
  });

  // code-level guard, not just prompt wording - a smaller model doesn't
  // always obey "ask first" reliably (observed for real against the live
  // gateway), so an empty/missing token must never even reach a lookup.
  it('cancel_booking rejects with a clear, distinct error when no cancelToken is given', async () => {
    await expect(
      executor.execute('cancel_booking', 'platform-1', {}, 'c@x.com'),
    ).rejects.toThrow('No cancelToken was given');
    expect(bookings.findIdByCancelToken).not.toHaveBeenCalled();
  });

  it('throws on an unrecognized tool name', async () => {
    await expect(executor.execute('delete_everything', 'platform-1', {}, 'c@x.com')).rejects.toThrow(
      'Unknown tool: delete_everything',
    );
  });
});
