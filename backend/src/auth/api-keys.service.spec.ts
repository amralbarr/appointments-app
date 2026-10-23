import { UnauthorizedException } from '@nestjs/common';
import { ApiKeysService, API_KEY_PREFIX } from './api-keys.service';

describe('ApiKeysService', () => {
  let prisma: any;
  let service: ApiKeysService;
  let stored: any; // the one row create() wrote, for verify() to find again

  beforeEach(() => {
    prisma = {
      apiKey: {
        create: jest.fn((args) => {
          stored = { id: 'key-1', userId: args.data.userId, ...args.data };
          return Promise.resolve(stored);
        }),
        findMany: jest.fn(({ where }) => {
          if (!stored) return Promise.resolve([]);
          const prefixOk = stored.prefix === where.prefix;
          const revokedOk = where.revokedAt === null ? !stored.revokedAt : true;
          return Promise.resolve(prefixOk && revokedOk ? [stored] : []);
        }),
        update: jest.fn(() => Promise.resolve()),
        findFirst: jest.fn(() => Promise.resolve(stored)),
      },
    };
    service = new ApiKeysService(prisma);
  });

  it('never stores the raw key - only its hash', async () => {
    const { rawKey } = await service.create('user-1', { scopes: ['bookings:read'] });

    expect(rawKey.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(stored.hashedKey).not.toBe(rawKey);
    expect(JSON.stringify(stored)).not.toContain(rawKey);
  });

  it('verifies the exact raw key it just issued', async () => {
    const { rawKey } = await service.create('user-1', { scopes: ['bookings:read', 'bookings:write'] });

    const result = await service.verify(rawKey);
    expect(result).toEqual({
      userId: 'user-1',
      scopes: ['bookings:read', 'bookings:write'],
      platformId: undefined,
    });
  });

  // A key's own platformId column travels through verify() unchanged, so
  // AuthGuard can later enforce it.
  it('returns platformId: undefined for a key with no platform restriction', async () => {
    const { rawKey } = await service.create('user-1', { scopes: [] });

    const result = await service.verify(rawKey);
    expect(result.platformId).toBeUndefined();
  });

  it('returns the real platformId for a key scoped to one platform', async () => {
    const { rawKey } = await service.create('user-1', { scopes: [] });
    stored.platformId = 'platform-1';

    const result = await service.verify(rawKey);
    expect(result.platformId).toBe('platform-1');
  });

  it('rejects a key that merely shares the right prefix', async () => {
    const { rawKey } = await service.create('user-1', { scopes: [] });
    const tampered = rawKey.slice(0, -1) + (rawKey.endsWith('a') ? 'b' : 'a');

    await expect(service.verify(tampered)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a revoked key even with the correct raw value', async () => {
    const { rawKey } = await service.create('user-1', { scopes: [] });
    stored.revokedAt = new Date();

    await expect(service.verify(rawKey)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects anything not carrying the sk_live_ prefix outright', async () => {
    await expect(service.verify('not-even-the-right-shape')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
