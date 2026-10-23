import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { buildTestApp, seedAdminUser, createApiKeyFixture } from './helpers';

const FIXTURE_PASSWORD = ['fixture', 'only', randomBytes(3).toString('hex')].join('-');

describe('admin routes', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;

  beforeAll(async () => {
    app = await buildTestApp();
    prisma = new PrismaClient();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('a non-admin (OWNER) credential', () => {
    it('gets 403 on every /admin/* route - JWT and the same user\'s own unscoped API key alike', async () => {
      const suffix = randomBytes(4).toString('hex');
      const register = await request(http)
        .post('/api/v1/auth/register')
        .send({ email: `owner-admin-test-${suffix}@example.com`, password: FIXTURE_PASSWORD })
        .expect(201);
      const ownerToken = register.body.accessToken;
      const owner = await prisma.user.findUniqueOrThrow({
        where: { email: `owner-admin-test-${suffix}@example.com` },
      });
      const { rawKey: ownerApiKey } = await createApiKeyFixture(prisma, {
        userId: owner.id,
        scopes: ['*'],
        platformId: null,
      });

      for (const token of [ownerToken, ownerApiKey]) {
        await request(http)
          .get('/api/v1/admin/platforms')
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(http)
          .post('/api/v1/admin/platforms')
          .set('Authorization', `Bearer ${token}`)
          .send({ ownerEmail: 'whoever@example.com', platformName: 'Whoever Clinic' })
          .expect(403);
        await request(http)
          .patch('/api/v1/admin/platforms/nonexistent-id/status')
          .set('Authorization', `Bearer ${token}`)
          .send({ isActive: false })
          .expect(403);
      }
    });
  });

  describe('GET /admin/platforms', () => {
    it('lists every platform regardless of owner, including suspended ones the admin does not own', async () => {
      const { accessToken } = await seedAdminUser(prisma);
      const suffix = randomBytes(4).toString('hex');

      const ownerA = await prisma.user.create({
        data: { email: `tenant-a-${suffix}@example.com`, passwordHash: 'unused' },
      });
      const ownerB = await prisma.user.create({
        data: { email: `tenant-b-${suffix}@example.com`, passwordHash: 'unused' },
      });
      const platformA = await prisma.platform.create({
        data: { ownerId: ownerA.id, name: `Platform A ${suffix}`, slug: `platform-a-${suffix}` },
      });
      const platformBSuspended = await prisma.platform.create({
        data: {
          ownerId: ownerB.id,
          name: `Platform B ${suffix}`,
          slug: `platform-b-${suffix}`,
          isActive: false,
        },
      });

      const res = await request(http)
        .get('/api/v1/admin/platforms')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ids = res.body.map((p: any) => p.id);
      expect(ids).toContain(platformA.id);
      expect(ids).toContain(platformBSuspended.id);
    });
  });

  describe('POST /admin/platforms', () => {
    it('creates a brand-new owner + platform, returns a working one-time password', async () => {
      const { accessToken } = await seedAdminUser(prisma);
      const suffix = randomBytes(4).toString('hex');
      const newOwnerEmail = `brand-new-tenant-${suffix}@example.com`;

      const res = await request(http)
        .post('/api/v1/admin/platforms')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ownerEmail: newOwnerEmail, platformName: `New Tenant Clinic ${suffix}` })
        .expect(201);

      expect(res.body.owner.email).toBe(newOwnerEmail);
      expect(typeof res.body.initialPassword).toBe('string');
      expect(res.body.initialPassword.length).toBeGreaterThan(8);

      // the real proof: that password actually works.
      await request(http)
        .post('/api/v1/auth/login')
        .send({ email: newOwnerEmail, password: res.body.initialPassword })
        .expect(201);

      const userCount = await prisma.user.count({ where: { email: newOwnerEmail } });
      expect(userCount).toBe(1);
    });

    it('attaches a new platform to an existing owner without duplicating the user or regenerating a password', async () => {
      const { accessToken } = await seedAdminUser(prisma);
      const suffix = randomBytes(4).toString('hex');
      const existingEmail = `existing-tenant-${suffix}@example.com`;
      const existingOwner = await prisma.user.create({
        data: { email: existingEmail, passwordHash: 'already-has-one' },
      });

      const res = await request(http)
        .post('/api/v1/admin/platforms')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ownerEmail: existingEmail, platformName: `Second Platform ${suffix}` })
        .expect(201);

      expect(res.body.owner.id).toBe(existingOwner.id);
      expect(res.body.initialPassword).toBeUndefined();

      const userCount = await prisma.user.count({ where: { email: existingEmail } });
      expect(userCount).toBe(1);

      const platform = await prisma.platform.findUnique({ where: { id: res.body.platform.id } });
      expect(platform?.ownerId).toBe(existingOwner.id);
    });
  });

  // Combined with the owner-still-sees-it proof since they're the same scenario.
  describe('PATCH /admin/platforms/:id/status', () => {
    it("suspends/reactivates a platform the admin doesn't own; owner still sees it, public listing doesn't, data untouched", async () => {
      const { accessToken: adminToken } = await seedAdminUser(prisma);
      const suffix = randomBytes(4).toString('hex');

      const owner = await prisma.user.create({
        data: { email: `suspend-target-owner-${suffix}@example.com`, passwordHash: 'unused' },
      });
      const platform = await prisma.platform.create({
        data: { ownerId: owner.id, name: `Suspend Target ${suffix}`, slug: `suspend-target-${suffix}` },
      });
      const service = await prisma.service.create({
        data: { platformId: platform.id, name: 'Consult', durationMinutes: 30 },
      });
      const slot = await prisma.slot.create({
        data: {
          platformId: platform.id,
          serviceId: service.id,
          startsAt: new Date(Date.now() + 86_400_000),
          endsAt: new Date(Date.now() + 86_400_000 + 1_800_000),
        },
      });
      await request(http)
        .post(`/api/v1/platforms/${platform.id}/slots/${slot.id}/bookings`)
        .send({ customerName: 'Cust', customerEmail: `cust-${suffix}@example.com` })
        .expect(201);

      const countsBefore = {
        services: await prisma.service.count({ where: { platformId: platform.id } }),
        slots: await prisma.slot.count({ where: { platformId: platform.id } }),
        bookings: await prisma.booking.count({ where: { platformId: platform.id } }),
      };

      // suspend
      await request(http)
        .patch(`/api/v1/admin/platforms/${platform.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      const publicAfterSuspend = await request(http).get('/api/v1/platforms/public').expect(200);
      expect(publicAfterSuspend.body.map((p: any) => p.id)).not.toContain(platform.id);

      // the owner still sees their own suspended platform via the normal
      // owner-scoped GET route - 200, not 404. getOwned() only ever cares
      // about ownerId, never isActive.
      const ownerToken = jwt.sign(
        { sub: owner.id, scopes: ['*'] },
        process.env.JWT_ACCESS_SECRET as string,
        { expiresIn: '15m' },
      );
      const ownerGet = await request(http)
        .get(`/api/v1/platforms/${platform.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(ownerGet.body.isActive).toBe(false);

      const countsAfterSuspend = {
        services: await prisma.service.count({ where: { platformId: platform.id } }),
        slots: await prisma.slot.count({ where: { platformId: platform.id } }),
        bookings: await prisma.booking.count({ where: { platformId: platform.id } }),
      };
      expect(countsAfterSuspend).toEqual(countsBefore);

      // reactivate
      await request(http)
        .patch(`/api/v1/admin/platforms/${platform.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true })
        .expect(200);

      const publicAfterReactivate = await request(http).get('/api/v1/platforms/public').expect(200);
      expect(publicAfterReactivate.body.map((p: any) => p.id)).toContain(platform.id);
    });
  });
});
