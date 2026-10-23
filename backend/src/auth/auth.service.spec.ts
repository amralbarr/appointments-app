import { AuthService } from './auth.service';

// jwt signing itself isn't the point here - the payload shape is. the
// real signing/verifying round-trip is exercised by every e2e test that
// logs in; this is just the narrow contract: does platformId make it
// into the payload, and only when it's actually set.
describe('AuthService.issueScopedAccessToken', () => {
  let jwt: any;
  let service: AuthService;

  beforeEach(() => {
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    service = new AuthService({} as any, jwt);
  });

  it('includes the platformId claim when the key was platform-scoped', async () => {
    await service.issueScopedAccessToken('user-1', ['bookings:read'], 'platform-1');

    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'user-1', scopes: ['bookings:read'], platformId: 'platform-1' },
      expect.objectContaining({ secret: process.env.JWT_ACCESS_SECRET }),
    );
  });

  it('omits the platformId claim entirely for an unscoped key', async () => {
    await service.issueScopedAccessToken('user-1', ['bookings:read']);

    const [payload] = jwt.signAsync.mock.calls[0];
    expect(payload).toEqual({ sub: 'user-1', scopes: ['bookings:read'] });
    expect(payload).not.toHaveProperty('platformId');
  });
});
