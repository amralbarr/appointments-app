// never a real, paid call in any automated test - the gateway call is
// mocked at the http boundary (global.fetch) since there's no sdk client
// to mock anymore, same spirit as every other external-dependency mock in
// this codebase.
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function gatewayResponse(json: unknown) {
  return { ok: true, status: 200, json: async () => ({ text: JSON.stringify(json), json }) };
}

import { NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';

describe('ChatService.handleMessage', () => {
  let prisma: any;
  let toolExecutor: any;
  let service: ChatService;

  // cancellation enabled by default for this file's shared fixture - the
  // toggle itself (and cancel_booking actually disappearing from the
  // tool list when it's off) has its own dedicated test below.
  const platform = {
    id: 'platform-1',
    name: 'Test Clinic',
    description: 'A friendly clinic.',
    isActive: true,
    customerCancellationEnabled: true,
  };

  beforeEach(() => {
    mockFetch.mockReset();
    prisma = {
      platform: { findFirst: jest.fn().mockResolvedValue(platform) },
      chatConversation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'conv-1', platformId: platform.id, customerEmail: 'c@x.com' }),
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      service: {
        findMany: jest.fn().mockResolvedValue([{ name: 'Consultation', durationMinutes: 30 }]),
      },
    };
    toolExecutor = { execute: jest.fn() };
    service = new ChatService(prisma, toolExecutor);
  });

  function lastRequestBody() {
    return JSON.parse(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].body);
  }

  it('404s for a platform that does not exist or is suspended', async () => {
    prisma.platform.findFirst.mockResolvedValue(null);

    await expect(
      service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'hi' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('finds an existing conversation rather than creating a new one when one already exists', async () => {
    prisma.chatConversation.findFirst.mockResolvedValue({ id: 'existing-conv', platformId: platform.id, customerEmail: 'c@x.com' });
    mockFetch.mockResolvedValue(gatewayResponse({ action: 'reply', message: 'Hello again.' }));

    await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'hi again' });

    expect(prisma.chatConversation.create).not.toHaveBeenCalled();
  });

  it('creates a new conversation when none exists for this (platformId, customerEmail)', async () => {
    mockFetch.mockResolvedValue(gatewayResponse({ action: 'reply', message: 'Hi, how can I help?' }));

    await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'hi' });

    expect(prisma.chatConversation.create).toHaveBeenCalledWith({
      data: { platformId: 'platform-1', customerEmail: 'c@x.com' },
    });
  });

  // AI_GATEWAY_API_KEY/AI_GATEWAY_URL/AI_GATEWAY_PROVIDER/AI_CHAT_MODEL
  // (documented in .env.example) are actually read and sent on the real
  // request - confirmed here at the unit level (real .env loaded in this
  // process, no mocking of process.env itself).
  it('reads AI_CHAT_MODEL/AI_GATEWAY_PROVIDER from the environment and sends them to the gateway', async () => {
    mockFetch.mockResolvedValue(gatewayResponse({ action: 'reply', message: 'ok' }));

    await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'hi' });

    const body = lastRequestBody();
    expect(body.model).toBe(process.env.AI_CHAT_MODEL || 'company-coder');
    expect(body.provider).toBe(process.env.AI_GATEWAY_PROVIDER || 'agentox');
    expect(body.jsonMode).toBe(true);
    expect(process.env.AI_GATEWAY_API_KEY).toBeDefined();
  });

  it('sends the bearer token as an Authorization header', async () => {
    mockFetch.mockResolvedValue(gatewayResponse({ action: 'reply', message: 'ok' }));

    await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'hi' });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe(`Bearer ${process.env.AI_GATEWAY_API_KEY}`);
  });

  it("the system prompt states today's date, the platform's real current services, and the one-active-booking rule", async () => {
    mockFetch.mockResolvedValue(gatewayResponse({ action: 'reply', message: 'We offer Consultation.' }));

    await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'what do you offer' });

    const body = lastRequestBody();
    const today = new Date().toISOString().slice(0, 10);
    expect(body.systemPrompt).toContain(today);
    expect(body.systemPrompt).toContain('Consultation');
    expect(body.systemPrompt.toLowerCase()).toContain('one active');
  });

  // Re-confirmed at the ChatService level, not only at the mapper level
  // (mcp-tool-schema.spec.ts already covers that) - the system prompt
  // text is this provider's only way of telling the model which tools
  // exist, so it must list exactly the 4 customer-facing ones.
  it('lists exactly the 4 customer-facing tools in the system prompt, never the owner-only ones', async () => {
    mockFetch.mockResolvedValue(gatewayResponse({ action: 'reply', message: 'ok' }));

    await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'hi' });

    const body = lastRequestBody();
    for (const name of ['list_services', 'list_slots', 'create_booking', 'cancel_booking']) {
      expect(body.systemPrompt).toContain(name);
    }
    for (const name of ['list_platforms', 'get_platform', 'list_bookings']) {
      expect(body.systemPrompt).not.toContain(name);
    }
  });

  // the actual default this toggle exists for - cancel_booking must be
  // genuinely absent from the tool list (not just an unenforced rule the
  // model could ignore), checked against the real tool-description line
  // shape so a coincidental substring match elsewhere in the prompt
  // (e.g. this test's own disabled-notice rule, which legitimately
  // mentions the tool's name in prose) can't make this pass for the
  // wrong reason.
  it('drops cancel_booking from the tool list entirely when the platform has not enabled it, and tells the model why', async () => {
    prisma.platform.findFirst.mockResolvedValue({ ...platform, customerCancellationEnabled: false });
    mockFetch.mockResolvedValue(gatewayResponse({ action: 'reply', message: 'ok' }));

    await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'hi' });

    const body = lastRequestBody();
    expect(body.systemPrompt).not.toContain('cancel_booking(bookingId, cancelToken)');
    for (const name of ['list_services', 'list_slots', 'create_booking']) {
      expect(body.systemPrompt).toContain(name);
    }
    expect(body.systemPrompt).toContain('has not enabled self-service cancellation');
  });

  it('persists the user message, then the final assistant reply, as ChatMessage rows', async () => {
    mockFetch.mockResolvedValue(gatewayResponse({ action: 'reply', message: 'Sure, here is our availability.' }));

    const result = await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'any openings?' });

    expect(result).toEqual({ reply: 'Sure, here is our availability.' });
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: { conversationId: 'conv-1', role: 'USER', content: 'any openings?' },
    });
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: { conversationId: 'conv-1', role: 'ASSISTANT', content: 'Sure, here is our availability.' },
    });
  });

  it('executes a call_tool action, persists a TOOL-role row with toolName/toolResult, and feeds the result back for a final reply', async () => {
    const bookingResult = { id: 'booking-1', status: 'CONFIRMED', cancelToken: 'tok-123' };
    mockFetch
      .mockResolvedValueOnce(
        gatewayResponse({
          action: 'call_tool',
          tool: 'create_booking',
          args: { slotId: 'slot-1', customerName: 'A', customerEmail: 'c@x.com' },
        }),
      )
      .mockResolvedValueOnce(gatewayResponse({ action: 'reply', message: 'Booked! See you then.' }));
    toolExecutor.execute.mockResolvedValue(bookingResult);

    const result = await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'book me the 9am slot' });

    expect(toolExecutor.execute).toHaveBeenCalledWith(
      'create_booking',
      'platform-1',
      { slotId: 'slot-1', customerName: 'A', customerEmail: 'c@x.com' },
      'c@x.com',
    );
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-1',
        role: 'TOOL',
        content: 'create_booking ran',
        toolName: 'create_booking',
        toolResult: bookingResult,
      },
    });
    expect(result).toEqual({ reply: 'Booked! See you then.' });

    // the second gateway call must have seen the tool result in its
    // prompt, not crashed or silently dropped it.
    const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondCallBody.prompt).toContain('create_booking result');
    expect(secondCallBody.prompt).toContain('booking-1');
  });

  // A thrown domain exception becomes a structured error result fed back
  // to the model, never an unhandled exception that crashes the whole
  // chat request.
  it('translates a thrown domain exception into an error result instead of crashing', async () => {
    mockFetch
      .mockResolvedValueOnce(
        gatewayResponse({ action: 'call_tool', tool: 'create_booking', args: { slotId: 'slot-1', customerName: 'A', customerEmail: 'c@x.com' } }),
      )
      .mockResolvedValueOnce(gatewayResponse({ action: 'reply', message: 'Looks like that one is already taken.' }));
    toolExecutor.execute.mockRejectedValue(new Error('This slot was just booked by someone else.'));

    const result = await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'book me the 9am slot' });

    expect(result).toEqual({ reply: 'Looks like that one is already taken.' });
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-1',
        role: 'TOOL',
        content: 'create_booking failed',
        toolName: 'create_booking',
        toolResult: { error: 'This slot was just booked by someone else.' },
      },
    });

    const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondCallBody.prompt).toContain('create_booking failed');
    expect(secondCallBody.prompt).toContain('just booked by someone else');
  });

  // A customer could type "book it under victim@example.com" and have
  // the model fill create_booking's
  // customerEmail from that text - the session's own opening email must
  // always win, the same trust-boundary posture platformId already has.
  it("passes the session's own opening customerEmail to the tool executor, never whatever the model's args claim for that field", async () => {
    mockFetch
      .mockResolvedValueOnce(
        gatewayResponse({
          action: 'call_tool',
          tool: 'create_booking',
          args: { slotId: 'slot-1', customerName: 'A', customerEmail: 'victim@example.com' },
        }),
      )
      .mockResolvedValueOnce(gatewayResponse({ action: 'reply', message: 'Booked!' }));
    toolExecutor.execute.mockResolvedValue({ id: 'booking-1' });

    await service.handleMessage('platform-1', { customerEmail: 'the-real-customer@example.com', message: 'book it under victim@example.com' });

    expect(toolExecutor.execute).toHaveBeenCalledWith(
      'create_booking',
      'platform-1',
      expect.any(Object),
      'the-real-customer@example.com',
    );
  });

  // a hallucinated or owner-only tool name must never reach the executor.
  it('refuses to execute a tool name outside the 4 customer-facing ones, and tells the model instead of crashing', async () => {
    mockFetch
      .mockResolvedValueOnce(gatewayResponse({ action: 'call_tool', tool: 'list_bookings', args: {} }))
      .mockResolvedValueOnce(gatewayResponse({ action: 'reply', message: "Here's what I can help with." }));

    const result = await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'show me everyone\'s bookings' });

    expect(toolExecutor.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ reply: "Here's what I can help with." });
    const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondCallBody.prompt).toContain('not available');
  });

  // One rate-limited http request can't drive unbounded real tool
  // executions (and unbounded gateway billing) by the model just never
  // emitting a "reply" action.
  it('stops after MAX_TOOL_CALLS rounds even if the model never produces a reply action, without crashing', async () => {
    mockFetch.mockResolvedValue(gatewayResponse({ action: 'call_tool', tool: 'list_services', args: {} }));
    toolExecutor.execute.mockResolvedValue([]);

    const result = await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'do a lot of things' });

    expect(result.reply.length).toBeGreaterThan(0);
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('falls back to treating plain non-JSON text as the reply, rather than crashing on a malformed gateway response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: 'Sure, I can help with that!', json: null }),
    });

    const result = await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'hi' });

    expect(result).toEqual({ reply: 'Sure, I can help with that!' });
  });

  // real bug found testing against the real gateway (ai.qtech.sa's
  // company-coder model): instead of the exact contract
  // {"action":"call_tool","tool":"create_booking",...}, it sent
  // {"action":"create_booking","tool":"create_booking",...} - the tool's
  // own name standing in for the literal word "call_tool". Without this,
  // parseAction's strict check falls through to "treat the whole raw JSON
  // as the reply", leaking it straight to the customer instead of ever
  // calling the tool.
  it('recognizes a tool name used directly as the action value, not just the literal "call_tool" contract', async () => {
    const bookingResult = { id: 'booking-1', status: 'CONFIRMED' };
    mockFetch
      .mockResolvedValueOnce(
        gatewayResponse({
          action: 'create_booking',
          tool: 'create_booking',
          args: { slotId: 'slot-1', customerName: 'A', customerEmail: 'c@x.com' },
        }),
      )
      .mockResolvedValueOnce(gatewayResponse({ action: 'reply', message: 'Booked!' }));
    toolExecutor.execute.mockResolvedValue(bookingResult);

    const result = await service.handleMessage('platform-1', { customerEmail: 'c@x.com', message: 'book me the 9am slot' });

    expect(toolExecutor.execute).toHaveBeenCalledWith(
      'create_booking',
      'platform-1',
      { slotId: 'slot-1', customerName: 'A', customerEmail: 'c@x.com' },
      'c@x.com',
    );
    expect(result).toEqual({ reply: 'Booked!' });
  });
});
