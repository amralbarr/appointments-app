import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { API_KEY_PREFIX } from '../src/auth/api-keys.service';

export async function buildTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  // bind to a real ephemeral port up front, before any test fires requests.
  // without this, supertest sees an unlistening server and calls .listen()
  // itself on the FIRST request - fine for one request at a time, but 20
  // concurrent ones each race to bind the same server, which intermittently
  // drops connections (ECONNRESET) instead of cleanly erroring. binding
  // once here removes the race entirely.
  await app.listen(0);
  return app;
}

// direct-to-db fixtures, skipping the http layer entirely - these tests
// are about booking behavior, not re-proving platform/service creation
// works (that's covered elsewhere).
export async function seedOpenSlot(prisma: PrismaClient) {
  const suffix = randomBytes(4).toString('hex');
  const owner = await prisma.user.create({
    data: { email: `owner-${suffix}@example.com`, passwordHash: 'unused-in-these-tests' },
  });
  const platform = await prisma.platform.create({
    // enabled by default for test fixtures - these tests are about
    // booking/cancellation behavior, not re-proving the opt-in toggle
    // itself works (that has its own dedicated test).
    data: {
      ownerId: owner.id,
      name: `Test Clinic ${suffix}`,
      slug: `test-clinic-${suffix}`,
      customerCancellationEnabled: true,
    },
  });
  const service = await prisma.service.create({
    data: { platformId: platform.id, name: 'Consultation', durationMinutes: 30 },
  });
  const slot = await prisma.slot.create({
    data: {
      platformId: platform.id,
      serviceId: service.id,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000 + 30 * 60_000),
    },
  });
  return { owner, platform, service, slot };
}

// same shape as seedOpenSlot, but N distinct open slots on one platform -
// booking-customer-conflict.e2e-spec.ts needs several different slots to
// prove the per-customer constraint fires across slots, not just within one.
export async function seedOpenSlots(prisma: PrismaClient, count: number) {
  const suffix = randomBytes(4).toString('hex');
  const owner = await prisma.user.create({
    data: { email: `owner-${suffix}@example.com`, passwordHash: 'unused-in-these-tests' },
  });
  const platform = await prisma.platform.create({
    // enabled by default for test fixtures - these tests are about
    // booking/cancellation behavior, not re-proving the opt-in toggle
    // itself works (that has its own dedicated test).
    data: {
      ownerId: owner.id,
      name: `Test Clinic ${suffix}`,
      slug: `test-clinic-${suffix}`,
      customerCancellationEnabled: true,
    },
  });
  const service = await prisma.service.create({
    data: { platformId: platform.id, name: 'Consultation', durationMinutes: 30 },
  });
  const slots = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      prisma.slot.create({
        data: {
          platformId: platform.id,
          serviceId: service.id,
          startsAt: new Date(Date.now() + 86_400_000 + i * 30 * 60_000),
          endsAt: new Date(Date.now() + 86_400_000 + (i + 1) * 30 * 60_000),
        },
      }),
    ),
  );
  return { owner, platform, service, slots };
}

// a role: 'ADMIN' user plus a real access token for them, same claim
// shape AuthService.issueTokenPair signs (sub/scopes/role) - a direct
// sign rather than a real POST /auth/login round-trip, matching this
// file's own direct-to-db fixture convention. shared across admin.e2e-spec
// rather than each admin test re-deriving this fixture independently.
export async function seedAdminUser(prisma: PrismaClient) {
  const suffix = randomBytes(4).toString('hex');
  const admin = await prisma.user.create({
    data: {
      email: `admin-${suffix}@example.com`,
      passwordHash: 'unused-in-these-tests',
      role: 'ADMIN',
    },
  });
  const accessToken = jwt.sign(
    { sub: admin.id, scopes: ['*'], role: admin.role },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: '15m' },
  );
  return { admin, accessToken };
}

// matches ApiKeysService's own generation algorithm exactly (same prefix
// length, same sha256-of-raw-key hash) - direct-to-db, same bypasses-http
// convention as seedOpenSlot above. platform-scoped-keys.e2e-spec needs a
// raw key value in hand to send as a real bearer token, which
// ApiKeysService.create() alone can't give a test without also going
// through HTTP registration first.
export async function createApiKeyFixture(
  prisma: PrismaClient,
  opts: { userId: string; scopes: string[]; platformId?: string | null },
) {
  const random = randomBytes(32).toString('base64url');
  const rawKey = `${API_KEY_PREFIX}${random}`;
  const prefix = random.slice(0, 8);
  const hashedKey = createHash('sha256').update(rawKey).digest('hex');

  const record = await prisma.apiKey.create({
    data: {
      userId: opts.userId,
      prefix,
      hashedKey,
      scopes: opts.scopes,
      platformId: opts.platformId ?? null,
    },
  });
  return { rawKey, record };
}
