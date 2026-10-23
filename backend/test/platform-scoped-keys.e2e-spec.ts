import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { buildTestApp, createApiKeyFixture } from './helpers';

// not a real credential - matches test/app.e2e-spec.ts's own convention.
const FIXTURE_PASSWORD = ['fixture', 'only', randomBytes(3).toString('hex')].join('-');

// A platform-scoped key must 404 on every owner-scoped route for any
// platform other than its own - same "No such platform." shape a real
// non-owner gets, never a 403 that would confirm the platform exists at
// all. See backend/docs/decisions/ADR-001-platform-scoped-key-enforcement.md.
describe('platform-scoped API keys', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;

  let accessToken: string;
  let ownerId: string;
  let platformA: { id: string };
  let platformB: { id: string };
  let serviceOnA: { id: string };
  let serviceOnB: { id: string };

  beforeAll(async () => {
    app = await buildTestApp();
    prisma = new PrismaClient();
    http = app.getHttpServer();

    const suffix = randomBytes(4).toString('hex');
    const ownerEmail = `scoped-key-owner-${suffix}@example.com`;
    const register = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: ownerEmail, password: FIXTURE_PASSWORD })
      .expect(201);
    accessToken = register.body.accessToken;
    ownerId = (await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } })).id;

    const createPlatform = (name: string) =>
      request(http)
        .post('/api/v1/platforms')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name })
        .expect(201)
        .then((r) => r.body);

    platformA = await createPlatform(`Platform A ${suffix}`);
    platformB = await createPlatform(`Platform B ${suffix}`);

    const createService = (platformId: string) =>
      request(http)
        .post(`/api/v1/platforms/${platformId}/services`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Consultation', durationMinutes: 30 })
        .expect(201)
        .then((r) => r.body);

    serviceOnA = await createService(platformA.id);
    serviceOnB = await createService(platformB.id);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // Every owner-scoped route that needs this guarantee, as a
  // (method, path-against-B, body) tuple - reused by both describe blocks
  // below so the regression test genuinely exercises the same surface.
  function routesAgainstPlatform(platformId: string, serviceId: string) {
    return [
      { method: 'get' as const, path: `/api/v1/platforms/${platformId}` },
      { method: 'patch' as const, path: `/api/v1/platforms/${platformId}`, body: { name: 'Renamed' } },
      { method: 'get' as const, path: `/api/v1/platforms/${platformId}/services` },
      {
        method: 'post' as const,
        path: `/api/v1/platforms/${platformId}/services`,
        body: { name: 'Follow-up', durationMinutes: 15 },
      },
      {
        method: 'post' as const,
        path: `/api/v1/platforms/${platformId}/slots`,
        body: {
          serviceId,
          // no uniqueness constraint on a slot's time range, so the same
          // fixed window is fine to reuse across every call this file makes.
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          endsAt: new Date(Date.now() + 86_400_000 + 30 * 60_000).toISOString(),
        },
      },
      { method: 'get' as const, path: `/api/v1/platforms/${platformId}/bookings` },
    ];
  }

  describe('a key scoped to platform A', () => {
    let scopedKey: string;

    beforeAll(async () => {
      const { rawKey } = await createApiKeyFixture(prisma, {
        userId: ownerId,
        scopes: ['platforms:read', 'platforms:write', 'bookings:read'],
        platformId: platformA.id,
      });
      scopedKey = rawKey;
    });

    it('404s on every owner-scoped route for platform B', async () => {
      for (const route of routesAgainstPlatform(platformB.id, serviceOnB.id)) {
        const req = request(http)[route.method](route.path).set('Authorization', `Bearer ${scopedKey}`);
        const res = await (route.body ? req.send(route.body) : req);
        expect([route.method, route.path, res.status]).toEqual([route.method, route.path, 404]);
      }
    });

    it("succeeds normally against the key's own platform (A) - not a blanket rejection", async () => {
      const res = await request(http)
        .get(`/api/v1/platforms/${platformA.id}`)
        .set('Authorization', `Bearer ${scopedKey}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(platformA.id);
    });

    it('"list my platforms" returns only the one platform it is scoped to', async () => {
      const res = await request(http).get('/api/v1/platforms').set('Authorization', `Bearer ${scopedKey}`);
      expect(res.status).toBe(200);
      expect(res.body.map((p: any) => p.id)).toEqual([platformA.id]);
    });
  });

  describe('regression: an unscoped key and a normal login JWT are unaffected', () => {
    let unscopedKey: string;

    beforeAll(async () => {
      const { rawKey } = await createApiKeyFixture(prisma, {
        userId: ownerId,
        scopes: ['platforms:read', 'platforms:write', 'bookings:read'],
        platformId: null,
      });
      unscopedKey = rawKey;
    });

    it.each([
      ['unscoped key', () => unscopedKey],
      ['login JWT', () => accessToken],
    ])('%s: every route still succeeds against both platform A and B, exactly as before', async (_label, getToken) => {
      for (const [platformId, serviceId] of [
        [platformA.id, serviceOnA.id],
        [platformB.id, serviceOnB.id],
      ]) {
        for (const route of routesAgainstPlatform(platformId, serviceId)) {
          const req = request(http)[route.method](route.path).set('Authorization', `Bearer ${getToken()}`);
          const res = await (route.body ? req.send(route.body) : req);
          expect(res.status).toBeLessThan(400);
        }
      }
    });
  });
});
