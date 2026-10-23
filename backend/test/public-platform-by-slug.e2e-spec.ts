import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { buildTestApp } from './helpers';

// GET /platforms/public/:slug - the one backend addition needed once the
// frontend's tenant page required a slug-based lookup rather than the
// id-based one the original listing endpoint provided.
describe('GET /platforms/public/:slug', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;

  let clinic: any;
  let suspended: any;

  beforeAll(async () => {
    app = await buildTestApp();
    prisma = new PrismaClient();
    http = app.getHttpServer();

    const suffix = randomBytes(4).toString('hex');
    const makeOwner = (email: string) =>
      prisma.user.create({ data: { email, passwordHash: 'unused-in-these-tests' } });

    const clinicOwner = await makeOwner(`slug-clinic-owner-${suffix}@example.com`);
    clinic = await prisma.platform.create({
      data: {
        ownerId: clinicOwner.id,
        name: `Slug Test Clinic ${suffix}`,
        nameAr: `عيادة اختبار الرابط ${suffix}`,
        slug: `slug-test-clinic-${suffix}`,
        timezone: 'Asia/Riyadh',
        isActive: true,
        description: 'A full-service family clinic, reachable by slug.',
        descriptionAr: 'عيادة عائلية متكاملة الخدمات، يمكن الوصول إليها عبر الرابط.',
        logoUrl: 'https://example.com/logo.png',
        address: '1 Slug Street',
        phone: '+966 11 111 1111',
        businessHoursText: 'Sun-Thu 9-5',
        businessHoursTextAr: 'الأحد - الخميس: 9 - 5',
        workingDays: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
        openTime: '09:00',
        closeTime: '17:00',
      },
    });

    const suspendedOwner = await makeOwner(`slug-suspended-owner-${suffix}@example.com`);
    suspended = await prisma.platform.create({
      data: {
        ownerId: suspendedOwner.id,
        name: `Slug Test Suspended ${suffix}`,
        slug: `slug-test-suspended-${suffix}`,
        isActive: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('200s with the real public profile fields for an active platform', async () => {
    const res = await request(http).get(`/api/v1/platforms/public/${clinic.slug}`).expect(200);
    expect(res.body).toMatchObject({
      id: clinic.id,
      name: clinic.name,
      nameAr: clinic.nameAr,
      slug: clinic.slug,
      description: 'A full-service family clinic, reachable by slug.',
      descriptionAr: 'عيادة عائلية متكاملة الخدمات، يمكن الوصول إليها عبر الرابط.',
      logoUrl: 'https://example.com/logo.png',
      address: '1 Slug Street',
      phone: '+966 11 111 1111',
      businessHoursText: 'Sun-Thu 9-5',
      businessHoursTextAr: 'الأحد - الخميس: 9 - 5',
      workingDays: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
      openTime: '09:00',
      closeTime: '17:00',
    });
    expect(res.body).not.toHaveProperty('ownerId');
  });

  it('404s for a suspended platform - not a distinguishing error', async () => {
    const res = await request(http).get(`/api/v1/platforms/public/${suspended.slug}`).expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, error: 'NOT_FOUND' });
  });

  it('404s for a nonexistent slug, with the identical body shape as a suspended one', async () => {
    const res = await request(http).get('/api/v1/platforms/public/no-such-slug-at-all').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, error: 'NOT_FOUND' });
  });
});
