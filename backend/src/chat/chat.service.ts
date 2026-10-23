import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ToolExecutor } from './tool-executor';
import { buildCustomerFacingTools, ChatTool } from './mcp-tool-schema';
import { ChatMessageDto } from './dto/chat-message.dto';

// a model that keeps requesting tools forever shouldn't hang this
// request indefinitely - 5 rounds is generous for any real customer
// conversation (ask -> tool -> reply is the common case, 1 round). Unlike
// the old Anthropic-based design, this gateway's jsonMode response is one
// JSON object per call, never several parallel tool_use blocks - so one
// round is inherently at most one tool call, and this single constant
// bounds both the round count and the total tool-call count.
const MAX_TOOL_CALLS = 5;

// repo-root prompts/ai-prompt.json, not backend/ - resolved the same
// process.cwd()-based way as mcp-tool-schema.ts's own YAML_PATH, for the
// same reason (see that file's comment). Edit that file to change the
// assistant's persona/rules/response-contract without touching code; a
// missing/malformed file falls back to the inline defaults below rather
// than ever failing a chat request over it.
const PROMPT_PATH = path.resolve(process.cwd(), '../prompts/ai-prompt.json');

interface PromptFile {
  persona: string;
  rules: string[];
  // each line may contain a literal "{{toolDescriptions}}" placeholder,
  // substituted at request time - the one piece of this contract that's
  // genuinely dynamic per-platform (which tools exist), everything else
  // here is static instruction text that belongs in the file like
  // persona/rules, not hardcoded alongside them.
  responseContract: string[];
}

function loadPromptFile(): PromptFile | null {
  try {
    const raw = fs.readFileSync(PROMPT_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PromptFile>;
    if (
      typeof parsed.persona === 'string' &&
      Array.isArray(parsed.rules) &&
      Array.isArray(parsed.responseContract)
    ) {
      return { persona: parsed.persona, rules: parsed.rules, responseContract: parsed.responseContract };
    }
    return null;
  } catch {
    return null;
  }
}

type ModelAction =
  | { action: 'reply'; message: string }
  | { action: 'call_tool'; tool: string; args: Record<string, unknown> };

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly toolExecutor: ToolExecutor,
  ) {}

  async handleMessage(platformId: string, dto: ChatMessageDto): Promise<{ reply: string }> {
    // a suspended platform's chat is invisible too, same posture as
    // every other public-facing read/write path.
    const platform = await this.prisma.platform.findFirst({
      where: { id: platformId, isActive: true },
    });
    if (!platform) throw new NotFoundException('No such platform.');

    const conversation = await this.findOrCreateConversation(platformId, dto.customerEmail);
    const history = await this.loadHistory(conversation.id);
    const services = await this.prisma.service.findMany({
      where: { platformId },
      select: { id: true, name: true, durationMinutes: true },
    });

    // persisted before the model call so the customer's own message is
    // never lost even if the gateway call itself fails.
    await this.prisma.chatMessage.create({
      data: { conversationId: conversation.id, role: 'USER', content: dto.message },
    });

    // off by default per platform (Platform.customerCancellationEnabled)
    // - dropping the tool itself, not just telling the model not to use
    // it, since a code-level guard is the real enforcement point anyway
    // (BookingsService.cancel() refuses regardless) and a model that
    // never sees "cancel_booking" in its tool list can't attempt it or
    // confuse a customer by trying and failing.
    const allTools = buildCustomerFacingTools();
    const tools = platform.customerCancellationEnabled
      ? allTools
      : allTools.filter((t) => t.name !== 'cancel_booking');
    const system = this.buildSystemPrompt(
      platform.name,
      platform.description,
      services,
      tools,
      platform.customerCancellationEnabled,
    );
    const toolNames = new Set(tools.map((t) => t.name));

    // this gateway takes one flat prompt string, not a structured message
    // array like the old Anthropic design - the whole transcript gets
    // flattened into plain lines instead. TOOL-role rows aren't replayed
    // here either (same reasoning the old design had: they're a
    // persisted audit trail for the owner dashboard, not something the
    // model needs re-fed across separate http requests).
    const transcriptLines: string[] = history
      .filter((m) => m.role !== 'TOOL')
      .map((m) => `${m.role === 'USER' ? 'Customer' : 'Assistant'}: ${m.content}`);
    transcriptLines.push(`Customer: ${dto.message}`);

    const toolResultLines: string[] = [];
    let finalReply = '';
    let toolCallCount = 0;

    for (let round = 0; round < MAX_TOOL_CALLS; round++) {
      const prompt = [...transcriptLines, ...toolResultLines, 'Respond now with your next JSON action.'].join(
        '\n',
      );
      let gatewayResult: { text: string; json: unknown };
      try {
        gatewayResult = await this.callGateway(prompt, system);
      } catch {
        // gateway unreachable or returned an error — return a user-facing
        // message rather than letting the uncaught Error propagate to a 500.
        // the real cause is already logged by AllExceptionsFilter if it
        // ever reaches there, but catching here keeps the chat widget
        // functional (it shows this as a bot message) instead of showing
        // a hard error to the customer.
        finalReply = "I'm temporarily unavailable — please try again in a moment.";
        break;
      }
      const action = this.parseAction(gatewayResult, toolNames);

      if (action.action === 'reply') {
        finalReply = action.message;
        break;
      }

      if (toolCallCount >= MAX_TOOL_CALLS) {
        finalReply = "I've taken quite a few actions in this message already - let's continue in your next message.";
        break;
      }

      if (!toolNames.has(action.tool)) {
        // a hallucinated or owner-only tool name - tell the model, don't
        // execute, don't crash, don't persist a fake TOOL row for a tool
        // that never actually ran.
        toolResultLines.push(`Tool "${action.tool}" is not available. Available tools were listed above.`);
        continue;
      }

      toolCallCount++;
      const { payload, isError } = await this.runTool(
        action.tool,
        action.args,
        platformId,
        conversation.id,
        dto.customerEmail,
      );
      toolResultLines.push(
        `Tool ${action.tool} ${isError ? 'failed' : 'result'}: ${JSON.stringify(payload)}`,
      );

      if (round === MAX_TOOL_CALLS - 1) {
        // honest, not "Done" - that wording claimed success regardless of
        // whether the last tool call (visible right above as isError)
        // actually succeeded. found by actually running a request that
        // exhausted every round on repeated empty list_slots results and
        // got told "Done" with nothing having happened.
        finalReply = isError
          ? "I wasn't able to complete that - could you try rephrasing, or give me a bit more detail?"
          : "I've taken a few actions for you already - let me know if you need anything else.";
      }
    }

    await this.prisma.chatMessage.create({
      data: { conversationId: conversation.id, role: 'ASSISTANT', content: finalReply },
    });

    return { reply: finalReply };
  }

  private async findOrCreateConversation(platformId: string, customerEmail: string) {
    const existing = await this.prisma.chatConversation.findFirst({
      where: { platformId, customerEmail },
    });
    if (existing) return existing;
    return this.prisma.chatConversation.create({ data: { platformId, customerEmail } });
  }

  private async loadHistory(conversationId: string) {
    const recentDesc = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return recentDesc.reverse(); // chronological order for the model
  }

  private buildSystemPrompt(
    platformName: string,
    description: string | null,
    services: { id: string; name: string; durationMinutes: number }[],
    tools: ChatTool[],
    cancellationEnabled: boolean,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    // the real id, not just the name - without this the model has no real
    // serviceId to pass to list_slots/create_booking and hallucinates a
    // plausible-looking slug instead (e.g. "general_consultation"), which
    // silently filters every real query down to zero results rather than
    // erroring - found by actually sending a real chat message through
    // the real gateway and tracing a `list_slots` call that came back
    // empty against a platform with 100 real open slots.
    const serviceList = services.length
      ? services.map((s) => `- ${s.name} (${s.durationMinutes} min, id: ${s.id})`).join('\n')
      : 'No services are currently listed.';

    const promptFile = loadPromptFile();
    const persona = (promptFile?.persona ?? 'You are the booking assistant for "{{platformName}}".').replace(
      '{{platformName}}',
      platformName,
    );
    // ai-prompt.json is the one real source for these - this only covers
    // the file being missing/malformed, so it stays generic rather than a
    // second copy of the real rules that can quietly drift out of sync
    // with it (exactly what happened before this comment was written).
    const rules = promptFile?.rules ?? [
      'Follow the platform owner\'s booking policies and be accurate about what tools report - ' +
        'never claim an action succeeded, or that you recall something from earlier in this ' +
        'conversation, unless a tool result actually said so just now.',
    ];
    // per-platform runtime state, not something a static prompt file can
    // know - never from ai-prompt.json, always computed here. cancel_
    // booking is already dropped from `tools` above when this is false,
    // so this rule exists only to explain the gap in the model's own
    // reply - not as the actual enforcement (the missing tool already is).
    if (!cancellationEnabled) {
      rules.push(
        'This business has not enabled self-service cancellation for customers. If asked to ' +
          'cancel or change a booking, say so plainly and tell the customer to contact the ' +
          'business directly - do not claim you cancelled it, and do not tell them to paste a ' +
          'cancelToken, since there is no cancel_booking tool available to you right now.',
      );
    }

    const toolDescriptions = tools
      .map((t) => `- ${t.name}(${Object.keys(t.input_schema.properties).join(', ')}): ${t.description}`)
      .join('\n');

    // same file-is-the-real-source rule as persona/rules above - this
    // inline version is the missing/malformed-file fallback only.
    const responseContractLines = promptFile?.responseContract ?? [
      'You must respond with ONLY a single JSON object, no other text before or after it, ' +
        'matching exactly one of these two shapes:',
      '{"action":"reply","message":"<your natural-language reply to the customer>"}',
      'or, to take an action:',
      '{"action":"call_tool","tool":"<one of the tool names below>","args":{...fields that tool needs}}',
      'The literal word "call_tool" must be the "action" value, every time - never the tool\'s own ' +
        'name as the "action" value (so never {"action":"create_booking",...} - that must be ' +
        '{"action":"call_tool","tool":"create_booking",...} instead).',
      'Available tools (use each one\'s real id shown below for any field asking for an id - never ' +
        'invent or guess a slug-looking id of your own):',
      '{{toolDescriptions}}',
      'A tool result (or a tool-not-available notice) appears as a line below when one happened ' +
        "- use it to decide your next action or final reply. Never invent a tool result yourself.",
    ];
    const responseContract = responseContractLines
      .map((line) => line.replace('{{toolDescriptions}}', toolDescriptions))
      .join('\n');

    return [persona, description ?? '', `Today's date is ${today}.`, `Services currently offered:\n${serviceList}`]
      .concat(rules)
      .concat([responseContract])
      .filter(Boolean)
      .join('\n\n');
  }

  // this gateway has no native function-calling - a one-shot prompt/
  // completion call with jsonMode:true instead, so tool-calling is a
  // hand-rolled loop (see handleMessage) driven by a JSON response
  // contract in the system prompt, not a structured tools/tool_use API.
  private async callGateway(prompt: string, systemPrompt: string): Promise<{ text: string; json: unknown }> {
    const url = process.env.AI_GATEWAY_URL;
    const provider = process.env.AI_GATEWAY_PROVIDER;
    const model = process.env.AI_CHAT_MODEL;
    if (!url || !provider || !model) {
      // fail loudly and immediately, not with a request to some baked-in
      // default endpoint the caller never actually configured - the env
      // file is the one real source for where/who this talks to.
      throw new Error(
        'AI gateway not configured: AI_GATEWAY_URL, AI_GATEWAY_PROVIDER, and AI_CHAT_MODEL must all be set.',
      );
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        model,
        jsonMode: true,
        temperature: 0.2,
        topP: 1,
        prompt,
        systemPrompt,
      }),
    });

    if (!res.ok) {
      throw new Error(`AI gateway returned ${res.status}`);
    }

    const data = (await res.json()) as { text?: string; json?: unknown };
    return { text: data.text ?? '', json: data.json };
  }

  // never trusts the gateway to actually follow the contract exactly - a
  // smaller model following this doesn't always emit the literal
  // {"action":"call_tool","tool":"X"} shape asked for; observed in real
  // testing against ai.qtech.sa's company-coder model, it sometimes
  // collapses that into {"action":"X","tool":"X",...} instead (the tool
  // name standing in for the literal word "call_tool"). Recognizing that
  // shape too - rather than only the one literal contract string - is the
  // difference between a real booking happening and the model's raw JSON
  // leaking to the customer as plain text. Plain prose instead of JSON (or
  // a provider hiccup) still becomes that text treated as a plain reply,
  // never a crashed request.
  private parseAction(result: { text: string; json: unknown }, toolNames: Set<string>): ModelAction {
    const candidate =
      result.json && typeof result.json === 'object' ? result.json : this.tryParseJson(result.text);

    if (candidate && typeof candidate === 'object') {
      const obj = candidate as Record<string, unknown>;
      if (obj.action === 'call_tool' && typeof obj.tool === 'string') {
        return { action: 'call_tool', tool: obj.tool, args: (obj.args as Record<string, unknown>) ?? {} };
      }
      if (typeof obj.action === 'string' && toolNames.has(obj.action)) {
        return { action: 'call_tool', tool: obj.action, args: (obj.args as Record<string, unknown>) ?? {} };
      }
      if (obj.action === 'reply' && typeof obj.message === 'string') {
        return { action: 'reply', message: obj.message };
      }
    }

    return { action: 'reply', message: result.text || "Sorry, I didn't catch that - could you rephrase?" };
  }

  private tryParseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  // A domain exception (ConflictException from a real booking conflict,
  // NotFoundException from a bad id, etc.) becomes a structured error
  // result the model can reason about and relay to the customer - never
  // an unhandled exception that crashes the whole chat request.
  private async runTool(
    toolName: string,
    args: Record<string, unknown>,
    platformId: string,
    conversationId: string,
    sessionCustomerEmail: string,
  ): Promise<{ payload: unknown; isError: boolean }> {
    let payload: unknown;
    let isError = false;

    try {
      payload = await this.toolExecutor.execute(toolName, platformId, args, sessionCustomerEmail);
    } catch (err) {
      isError = true;
      payload = { error: err instanceof Error ? err.message : 'Something went wrong.' };
    }

    await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: 'TOOL',
        content: `${toolName} ${isError ? 'failed' : 'ran'}`,
        toolName,
        toolResult: payload as Prisma.InputJsonValue,
      },
    });

    return { payload, isError };
  }
}
