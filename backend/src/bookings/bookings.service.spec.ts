import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { BookingsService } from './bookings.service';

// prisma mocked out entirely here - the point of this test is the error
// mapping and the "only emit after a real commit" rule, not the database
// itself. the database-level guarantee (the partial unique index actually
// holding under concurrency) is what test/booking-concurrency.e2e-spec.ts
// proves against real postgres instead.
function makeP2002(meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.x',
    meta,
  });
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

describe('BookingsService', () => {
  let prisma: any;
  let platforms: any;
  let realtime: any;
  let service: BookingsService;

  beforeEach(() => {
    prisma = {
      slot: { findFirst: jest.fn() },
      booking: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    platforms = { getOwned: jest.fn() };
    realtime = { emitSlotBooked: jest.fn(), emitSlotCancelled: jest.fn() };
    service = new BookingsService(prisma, platforms, realtime);
  });

  describe('create', () => {
    it('throws 404 when the slot does not belong to the platform', async () => {
      prisma.slot.findFirst.mockResolvedValue(null);

      await expect(
        service.create('platform-1', 'slot-1', { customerName: 'Sara', customerEmail: 's@x.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('maps a unique-constraint violation to a 409, not a 500', async () => {
      prisma.slot.findFirst.mockResolvedValue({ id: 'slot-1', platformId: 'platform-1' });
      prisma.booking.create.mockRejectedValue(makeP2002());

      await expect(
        service.create('platform-1', 'slot-1', { customerName: 'Sara', customerEmail: 's@x.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(realtime.emitSlotBooked).not.toHaveBeenCalled();
    });

    // Two distinct raw-sql partial unique indexes can fire P2002 here -
    // disambiguated by err.meta.target's column list, shape confirmed
    // against real postgres (not assumed), see bookings.service.ts.
    it('maps the slot-level P2002 (target: ["slotId"]) to the original slot-conflict message', async () => {
      prisma.slot.findFirst.mockResolvedValue({ id: 'slot-1', platformId: 'platform-1' });
      prisma.booking.create.mockRejectedValue(makeP2002({ target: ['slotId'] }));

      await expect(
        service.create('platform-1', 'slot-1', { customerName: 'Sara', customerEmail: 's@x.com' }),
      ).rejects.toMatchObject({
        message: 'This slot was just booked by someone else.',
      });
    });

    it('maps the customer-level P2002 (target: ["platformId","customerEmail"]) to the new distinct message', async () => {
      prisma.slot.findFirst.mockResolvedValue({ id: 'slot-1', platformId: 'platform-1' });
      prisma.booking.create.mockRejectedValue(makeP2002({ target: ['platformId', 'customerEmail'] }));

      await expect(
        service.create('platform-1', 'slot-1', { customerName: 'Sara', customerEmail: 's@x.com' }),
      ).rejects.toMatchObject({
        message: 'You already have an active booking at this platform. Cancel it before booking another.',
      });
    });

    it('emits slot.booked only after the insert actually succeeds, and returns a one-time cancelToken', async () => {
      prisma.slot.findFirst.mockResolvedValue({ id: 'slot-1', platformId: 'platform-1' });
      prisma.booking.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'booking-1',
          platformId: data.platformId,
          status: 'CONFIRMED',
          cancelTokenHash: data.cancelTokenHash,
        }),
      );

      const result = await service.create('platform-1', 'slot-1', {
        customerName: 'Sara',
        customerEmail: 's@x.com',
      });

      expect(result).toMatchObject({ id: 'booking-1', status: 'CONFIRMED' });
      expect(typeof result.cancelToken).toBe('string');
      expect(result.cancelToken.length).toBeGreaterThan(10);
      expect(result).not.toHaveProperty('cancelTokenHash'); // never leak the hash itself
      expect(realtime.emitSlotBooked).toHaveBeenCalledWith('platform-1', 'slot-1');
    });
  });

  describe('cancel', () => {
    const realToken = 'the-real-token';
    const mockBooking = {
      id: 'b1',
      platformId: 'p1',
      customerEmail: 's@x.com',
      cancelTokenHash: hashToken(realToken),
      status: 'CONFIRMED',
      slot: { platformId: 'p1', platform: { customerCancellationEnabled: true } },
      slotId: 's1',
    };

    it("404s on a wrong token - doesn't confirm the booking exists", async () => {
      prisma.booking.findUnique.mockResolvedValue(mockBooking);

      await expect(service.cancel('b1', 'guessed-wrong-token')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it('404s on an empty/missing token rather than treating it as a match', async () => {
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
      await expect(service.cancel('b1', '')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is idempotent on an already-cancelled booking - no second emit', async () => {
      prisma.booking.findUnique.mockResolvedValue({ ...mockBooking, status: 'CANCELLED' });

      await service.cancel('b1', realToken);
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(realtime.emitSlotCancelled).not.toHaveBeenCalled();
    });

    it('cancels and emits slot.cancelled on a real confirmed booking with the right token', async () => {
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
      prisma.booking.update.mockResolvedValue({
        id: 'b1',
        platformId: 'p1',
        status: 'CANCELLED',
        cancelTokenHash: mockBooking.cancelTokenHash,
      });

      const result = await service.cancel('b1', realToken);
      expect(realtime.emitSlotCancelled).toHaveBeenCalledWith('p1', 's1');
      expect(result).not.toHaveProperty('cancelTokenHash');
    });

    // the actual default this whole feature exists for - a platform that
    // never opted in must refuse, with a real token and a real booking
    // (never confused with the 404-on-wrong-token case above).
    it('refuses with ConflictException when the platform has not enabled customer cancellation', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...mockBooking,
        slot: { platformId: 'p1', platform: { customerCancellationEnabled: false } },
      });

      await expect(service.cancel('b1', realToken)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(realtime.emitSlotCancelled).not.toHaveBeenCalled();
    });
  });
});
