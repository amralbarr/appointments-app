import { INestApplication } from '@nestjs/common';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { buildTestApp } from './helpers';

const FIXTURE_PASSWORD = ['fixture', 'only', randomBytes(3).toString('hex')].join('-');

// an owner can fill in the six new profile fields through the existing
// PATCH /platforms/:id route - no new endpoint needed for this.
describe('PATCH /platforms/:id - profile fields', () => {
  let app: INestApplication;
  let http: any;
  let accessToken: string;
  let platformId: string;

  beforeAll(async () => {
    app = await buildTestApp();
    http = app.getHttpServer();

    const suffix = randomBytes(4).toString('hex');
    const register = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: `profile-owner-${suffix}@example.com`, password: FIXTURE_PASSWORD })
      .expect(201);
    accessToken = register.body.accessToken;

    const platform = await request(http)
      .post('/api/v1/platforms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Profile Test ${suffix}` })
      .expect(201);
    platformId = platform.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('round-trips all six new profile fields', async () => {
    const update = {
      description: 'An updated description.',
      logoUrl: 'https://example.com/new-logo.png',
      coverImageUrl: 'https://example.com/new-cover.png',
      address: '42 Updated Avenue',
      phone: '+966 50 999 8888',
      businessHoursText: 'Mon-Fri 9-6',
    };

    await request(http)
      .patch(`/api/v1/platforms/${platformId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(update)
      .expect(200);

    const res = await request(http)
      .get(`/api/v1/platforms/${platformId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject(update);
  });

  // bilingual-content update: nameAr/descriptionAr/businessHoursTextAr and
  // the structured workingDays/openTime/closeTime fields round-trip the
  // same way as the six original profile fields above.
  it('round-trips the Arabic content fields and structured working hours', async () => {
    const update = {
      nameAr: 'اسم تجريبي بالعربية',
      descriptionAr: 'وصف تجريبي بالعربية لهذا النشاط التجاري.',
      businessHoursTextAr: 'الأحد - الخميس: 9 صباحًا - 6 مساءً',
      workingDays: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
      openTime: '09:00',
      closeTime: '18:00',
    };

    await request(http)
      .patch(`/api/v1/platforms/${platformId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(update)
      .expect(200);

    const res = await request(http)
      .get(`/api/v1/platforms/${platformId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject(update);
  });

  it('rejects an invalid openTime/closeTime format', async () => {
    await request(http)
      .patch(`/api/v1/platforms/${platformId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ openTime: '9am' })
      .expect(400);
  });

  it('rejects a workingDays value outside the real WeekDay enum', async () => {
    await request(http)
      .patch(`/api/v1/platforms/${platformId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ workingDays: ['SUNDAY'] })
      .expect(400);
  });

  // isActive is admin-only, never settable through this owner-facing
  // route - the global ValidationPipe's forbidNonWhitelisted rejects it
  // outright since it isn't a declared field on UpdatePlatformDto.
  it('rejects isActive in the PATCH body - not a field this route accepts', async () => {
    await request(http)
      .patch(`/api/v1/platforms/${platformId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false })
      .expect(400);
  });
});
