import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { buildTestApp } from './helpers';

// GET /platforms/public is the one unauthenticated way a customer
// discovers a business. direct-to-db fixtures below mirror
// DATA-MODEL-V2.md's seed-variety shape (a clinic-like tenant, a
// salon-like one, and one suspended) rather than running the real seed
// script against the test db.
describe('GET /platforms/public', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;

  let clinic: any;
  let salon: any;
  let suspended: any;

  beforeAll(async () => {
    app = await buildTestApp();
    prisma = new PrismaClient();
    http = app.getHttpServer();

    const suffix = randomBytes(4).toString('hex');
    const makeOwner = (email: string) =>
      prisma.user.create({ data: { email, passwordHash: 'unused-in-these-tests' } });

    const clinicOwner = await makeOwner(`clinic-owner-${suffix}@example.com`);
    clinic = await prisma.platform.create({
      data: {
        ownerId: clinicOwner.id,
        name: `Test Clinic ${suffix}`,
        nameAr: `عيادة تجريبية ${suffix}`,
        slug: `test-clinic-${suffix}`,
        timezone: 'Asia/Riyadh',
        isActive: true,
        description: 'A full-service family clinic.',
        descriptionAr: 'عيادة عائلية متكاملة الخدمات.',
        logoUrl: 'https://example.com/logo.png',
        coverImageUrl: 'https://example.com/cover.png',
        address: '1 Test Street',
        phone: '+966 11 000 0000',
        businessHoursText: 'Sun-Thu 9-5',
        businessHoursTextAr: 'الأحد - الخميس: 9 - 5',
        workingDays: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
        openTime: '09:00',
        closeTime: '17:00',
      },
    });

    const salonOwner = await makeOwner(`salon-owner-${suffix}@example.com`);
    salon = await prisma.platform.create({
      data: {
        ownerId: salonOwner.id,
        name: `Test Salon ${suffix}`,
        slug: `test-salon-${suffix}`,
        isActive: true,
        description: 'A barbershop.',
        address: '2 Test Street',
        phone: '+966 12 000 0000',
        businessHoursText: 'Sat-Thu 10-8',
      },
    });

    const suspendedOwner = await makeOwner(`suspended-owner-${suffix}@example.com`);
    suspended = await prisma.platform.create({
      data: {
        ownerId: suspendedOwner.id,
        name: `Test Suspended ${suffix}`,
        slug: `test-suspended-${suffix}`,
        isActive: false,
        description: 'Should never appear publicly.',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('returns every active platform with full public profile content, and no ownerId anywhere', async () => {
    const res = await request(http).get('/api/v1/platforms/public').expect(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('ownerId');

    const returnedClinic = res.body.find((p: any) => p.id === clinic.id);
    expect(returnedClinic).toMatchObject({
      name: clinic.name,
      nameAr: clinic.nameAr,
      slug: clinic.slug,
      description: 'A full-service family clinic.',
      descriptionAr: 'عيادة عائلية متكاملة الخدمات.',
      logoUrl: 'https://example.com/logo.png',
      coverImageUrl: 'https://example.com/cover.png',
      address: '1 Test Street',
      phone: '+966 11 000 0000',
      businessHoursText: 'Sun-Thu 9-5',
      businessHoursTextAr: 'الأحد - الخميس: 9 - 5',
      workingDays: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
      openTime: '09:00',
      closeTime: '17:00',
    });
  });

  it('reflects variety - a clinic-like and a salon-like tenant both present', async () => {
    const res = await request(http).get('/api/v1/platforms/public').expect(200);
    const ids = res.body.map((p: any) => p.id);
    expect(ids).toContain(clinic.id);
    expect(ids).toContain(salon.id);
  });

  it('never includes a suspended (isActive:false) platform', async () => {
    const res = await request(http).get('/api/v1/platforms/public').expect(200);
    expect(res.body.map((p: any) => p.id)).not.toContain(suspended.id);
  });

  it('search filters by name, case-insensitively', async () => {
    const res = await request(http)
      .get('/api/v1/platforms/public')
      .query({ search: clinic.name.toUpperCase() })
      .expect(200);
    expect(res.body.map((p: any) => p.id)).toEqual([clinic.id]);
  });
});
