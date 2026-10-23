import { NotFoundException } from '@nestjs/common';
import { PlatformsService } from './platforms.service';

// getOwned()'s callerPlatformId constraint, isolated from the full HTTP
// stack (test/platform-scoped-keys.e2e-spec.ts covers the same behavior
// end-to-end).
describe('PlatformsService.getOwned', () => {
  let prisma: any;
  let service: PlatformsService;
  const platform = { id: 'platform-a', ownerId: 'owner-1', name: 'A' };

  beforeEach(() => {
    prisma = { platform: { findFirst: jest.fn().mockResolvedValue(platform) } };
    service = new PlatformsService(prisma);
  });

  it('behaves identically to today when callerPlatformId is absent', async () => {
    const result = await service.getOwned('owner-1', 'platform-a');
    expect(result).toBe(platform);
  });

  it('behaves identically to today when callerPlatformId matches the requested platform', async () => {
    const result = await service.getOwned('owner-1', 'platform-a', 'platform-a');
    expect(result).toBe(platform);
  });

  it('404s - same exception a non-owner gets - when callerPlatformId is a different platform', async () => {
    await expect(service.getOwned('owner-1', 'platform-a', 'platform-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // never even queries the db for the mismatched case - the scoped key
    // restriction is checked before anything else.
    expect(prisma.platform.findFirst).not.toHaveBeenCalled();
  });
});
