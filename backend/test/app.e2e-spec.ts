import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { randomBytes } from 'crypto';
import { buildTestApp } from './helpers';

// not a real credential - every test user in this file is thrown away at
// the end of the run, this just has to be long enough to pass the DTO's
// own MinLength(8) check.
const FIXTURE_PASSWORD = ['fixture', 'only', randomBytes(3).toString('hex')].join('-');

describe('core http behavior', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await buildTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  function freshEmail() {
    return `${randomBytes(4).toString('hex')}@example.com`;
  }

  async function registerAndLogin(email: string) {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: FIXTURE_PASSWORD })
      .expect(201);
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: FIXTURE_PASSWORD });
  }

  it('registers, logs in, and rejects a wrong password with the same message either way', async () => {
    const email = freshEmail();
    const login = await registerAndLogin(email);
    expect(login.status).toBe(201);
    expect(login.body.accessToken).toBeDefined();

    const badPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'nope' })
      .expect(401);

    const unknownEmail = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: freshEmail(), password: 'nope' })
      .expect(401);

    expect(badPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('rejects a malformed register payload with a 400, not a 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: '123' })
      .expect(400);
    expect(res.body.statusCode).toBe(400);
  });

  it("404s a platform that exists but belongs to someone else, same as one that doesn't exist", async () => {
    const ownerLogin = await registerAndLogin(freshEmail());
    const created = await request(app.getHttpServer())
      .post('/api/v1/platforms')
      .set('Authorization', `Bearer ${ownerLogin.body.accessToken}`)
      .send({ name: 'Owned By Someone Else' })
      .expect(201);

    const outsiderLogin = await registerAndLogin(freshEmail());

    await request(app.getHttpServer())
      .get(`/api/v1/platforms/${created.body.id}`)
      .set('Authorization', `Bearer ${outsiderLogin.body.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get('/api/v1/platforms/does-not-exist')
      .set('Authorization', `Bearer ${outsiderLogin.body.accessToken}`)
      .expect(404);
  });

  it('lets a platform owner issue a scoped api key and use it like a bearer token', async () => {
    const login = await registerAndLogin(freshEmail());

    const key = await request(app.getHttpServer())
      .post('/api/v1/auth/api-keys')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ label: 'test key', scopes: ['platforms:read'] })
      .expect(201);
    expect(key.body.rawKey).toMatch(/^sk_live_/);

    await request(app.getHttpServer())
      .get('/api/v1/platforms')
      .set('Authorization', `Bearer ${key.body.rawKey}`)
      .expect(200);

    // this key only has platforms:read - writing should be forbidden
    await request(app.getHttpServer())
      .post('/api/v1/platforms')
      .set('Authorization', `Bearer ${key.body.rawKey}`)
      .send({ name: 'Should not be allowed' })
      .expect(403);
  });
});
