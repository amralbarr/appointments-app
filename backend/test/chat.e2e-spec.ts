const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function gatewayResponse(json: unknown) {
  return { ok: true, status: 200, json: async () => ({ text: JSON.stringify(json), json }) };
}

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { buildTestApp } from './helpers';

const FIXTURE_PASSWORD = ['fixture', 'only', randomBytes(3).toString('hex')].join('-');

// The full POST /platforms/:platformId/chat request/response contract,
// through real http, real postgres, the AI gateway mocked at the
// http-call boundary only.
describe('POST /platforms/:platformId/chat', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;

  beforeAll(async () => {
    app = await buildTestApp();
    prisma = new PrismaClient();
    http = app.getHttpServer();
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('a new customerEmail creates a ChatConversation; a second message from the same email continues it', async () => {
    const suffix = randomBytes(4).toString('hex');
    const owner = await prisma.user.create({ data: { email: `chat-owner-${suffix}@example.com`, passwordHash: 'unused' } });
    const platform = await prisma.platform.create({
      data: { ownerId: owner.id, name: `Chat Clinic ${suffix}`, slug: `chat-clinic-${suffix}` },
    });
    const customerEmail = `chat-customer-${suffix}@example.com`;

    mockFetch.mockResolvedValueOnce(gatewayResponse({ action: 'reply', message: 'Hi! How can I help you today?' }));
    const first = await request(http)
      .post(`/api/v1/platforms/${platform.id}/chat`)
      .send({ customerEmail, message: 'hello' })
      .expect(201);

    expect(first.body).toEqual({ reply: 'Hi! How can I help you today?' });

    const conversations = await prisma.chatConversation.findMany({ where: { platformId: platform.id, customerEmail } });
    expect(conversations).toHaveLength(1);
    const conversationId = conversations[0].id;

    mockFetch.mockResolvedValueOnce(gatewayResponse({ action: 'reply', message: 'Sure, we offer general consultations.' }));
    const second = await request(http)
      .post(`/api/v1/platforms/${platform.id}/chat`)
      .send({ customerEmail, message: 'what do you offer' })
      .expect(201);

    expect(second.body).toEqual({ reply: 'Sure, we offer general consultations.' });

    // same conversation row continued, not a new one.
    const conversationsAfter = await prisma.chatConversation.findMany({ where: { platformId: platform.id, customerEmail } });
    expect(conversationsAfter).toHaveLength(1);
    expect(conversationsAfter[0].id).toBe(conversationId);
  });

  it('404s for a suspended platform, same posture as every other public-facing path', async () => {
    const suffix = randomBytes(4).toString('hex');
    const owner = await prisma.user.create({ data: { email: `chat-owner-${suffix}@example.com`, passwordHash: 'unused' } });
    const platform = await prisma.platform.create({
      data: { ownerId: owner.id, name: `Suspended Clinic ${suffix}`, slug: `suspended-chat-${suffix}`, isActive: false },
    });

    await request(http)
      .post(`/api/v1/platforms/${platform.id}/chat`)
      .send({ customerEmail: 'c@x.com', message: 'hello' })
      .expect(404);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("a follow-up call to the owner's chat-conversations read endpoint shows the full persisted exchange", async () => {
    const suffix = randomBytes(4).toString('hex');
    const ownerEmail = `chat-log-owner-${suffix}@example.com`;
    const register = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: ownerEmail, password: FIXTURE_PASSWORD })
      .expect(201);
    const accessToken = register.body.accessToken;

    const platformRes = await request(http)
      .post('/api/v1/platforms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Chat Log Clinic ${suffix}` })
      .expect(201);
    const platformId = platformRes.body.id;
    const customerEmail = `chat-log-customer-${suffix}@example.com`;

    mockFetch.mockResolvedValueOnce(gatewayResponse({ action: 'reply', message: 'Hello there!' }));
    await request(http)
      .post(`/api/v1/platforms/${platformId}/chat`)
      .send({ customerEmail, message: 'hi' })
      .expect(201);

    const conversationsList = await request(http)
      .get(`/api/v1/platforms/${platformId}/chat-conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(conversationsList.body).toHaveLength(1);
    expect(conversationsList.body[0].customerEmail).toBe(customerEmail);

    const messages = await request(http)
      .get(`/api/v1/platforms/${platformId}/chat-conversations/${conversationsList.body[0].id}/messages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(messages.body.map((m: any) => m.role)).toEqual(['USER', 'ASSISTANT']);
    expect(messages.body[0].content).toBe('hi');
    expect(messages.body[1].content).toBe('Hello there!');
  });

  it('a tool call and its result round-trip through the owner read endpoint too, not just plain text turns', async () => {
    const suffix = randomBytes(4).toString('hex');
    const ownerEmail = `chat-tool-log-owner-${suffix}@example.com`;
    const register = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: ownerEmail, password: FIXTURE_PASSWORD })
      .expect(201);
    const accessToken = register.body.accessToken;

    const platformRes = await request(http)
      .post('/api/v1/platforms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Chat Tool Log Clinic ${suffix}` })
      .expect(201);
    const platformId = platformRes.body.id;
    await request(http)
      .post(`/api/v1/platforms/${platformId}/services`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Consultation', durationMinutes: 30 })
      .expect(201);
    const customerEmail = `chat-tool-log-customer-${suffix}@example.com`;

    mockFetch
      .mockResolvedValueOnce(gatewayResponse({ action: 'call_tool', tool: 'list_services', args: {} }))
      .mockResolvedValueOnce(gatewayResponse({ action: 'reply', message: 'We offer Consultation.' }));
    await request(http)
      .post(`/api/v1/platforms/${platformId}/chat`)
      .send({ customerEmail, message: 'what do you offer' })
      .expect(201);

    const conversations = await request(http)
      .get(`/api/v1/platforms/${platformId}/chat-conversations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const messages = await request(http)
      .get(`/api/v1/platforms/${platformId}/chat-conversations/${conversations.body[0].id}/messages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(messages.body.map((m: any) => m.role)).toEqual(['USER', 'TOOL', 'ASSISTANT']);
    const toolRow = messages.body[1];
    expect(toolRow.toolName).toBe('list_services');
    expect(toolRow.toolResult).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Consultation' })]),
    );
  });

  it("a non-owner gets 404 on the chat-conversations read endpoint", async () => {
    const suffix = randomBytes(4).toString('hex');
    const owner = await prisma.user.create({ data: { email: `chat-nonowner-owner-${suffix}@example.com`, passwordHash: 'unused' } });
    const platform = await prisma.platform.create({
      data: { ownerId: owner.id, name: `Not Mine Clinic ${suffix}`, slug: `not-mine-${suffix}` },
    });

    const strangerEmail = `stranger-${suffix}@example.com`;
    const register = await request(http)
      .post('/api/v1/auth/register')
      .send({ email: strangerEmail, password: FIXTURE_PASSWORD })
      .expect(201);

    await request(http)
      .get(`/api/v1/platforms/${platform.id}/chat-conversations`)
      .set('Authorization', `Bearer ${register.body.accessToken}`)
      .expect(404);
  });
});
