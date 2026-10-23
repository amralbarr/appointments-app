# The AI booking assistant

## UI vs. backend: a thin, reusable widget over a purpose-built backend

**The widget UI is intentionally generic** —
`frontend/src/components/shared/AIAssistantChat.tsx`. Floating bubble
button, animated panel, message bubbles with markdown rendering for the
bot's replies, typing indicator, suggestion pills on first open. That
component has zero business logic in it; it posts a message to `/api/chat`
and renders whatever comes back. Keeping it generic means the same
component could front a completely different kind of assistant (a FAQ
bot, a support widget) with no changes beyond the API route it talks to.

**The backend is purpose-built — this isn't a FAQ bot.** A simpler
assistant could get away with keyword-overlap matching against a
knowledge base, stuffing a couple of matches into a system prompt, and
forwarding the whole thing to a completion endpoint that just generates a
reply. That never takes an action. This project's assistant has to
actually create and cancel real bookings, which is a different kind of
system — genuine tool-calling, not prompt-stuffing.

## Identity: email instead of an anonymous client id

A simpler chat widget can get away with a random anonymous client id
stashed in `localStorage` the first time anyone opens the chat — fine for
a FAQ bot that just wants to keep a conversation thread together. This
assistant needs to know *which customer* it's talking to, because the
backend's one-active-booking-per-customer rule (`DATA-MODEL-V2.md`) is
keyed on `customerEmail`, not a browser id.

So: the first time the widget opens on a given tenant's page, before any
message can be sent, it asks for an email (one inline step, not a modal —
"What's your email, so I can find or start your booking?"). That email is
stored as `appointments_email::{slug}` in `localStorage` — scoped per
tenant, since the same visitor could be a genuine customer at two
different businesses with two different emails. Every subsequent message
carries that email; the backend uses it to find or create the
`ChatConversation` row.

## Backend: a new `ChatModule`, one endpoint

```
POST /platforms/:platformId/chat   (public, same 10/min/ip throttle tier as booking writes)
  body: { customerEmail: string, message: string }
  returns: { reply: string }
```

What it does, per message:

1. Find-or-create `ChatConversation` by `(platformId, customerEmail)`.
2. Load the last ~20 `ChatMessage` rows for that conversation as history.
3. Build a system prompt: the platform's name/description/services
   (fetched fresh, not cached — a tenant editing their services should be
   reflected on the very next message), today's date, and the one
   business rule the model actually needs stated explicitly: a customer
   can only have one active (CONFIRMED) booking at a time here, and if
   they already have one, creating another will fail — tell them to
   cancel the existing one first rather than retrying blindly.
4. Call the company's internal AI gateway (`ai.qtech.sa`, model/provider
   configurable via env — never a direct paid model provider like
   Anthropic) with that system prompt, the history, and the new message.
   This gateway is a one-shot prompt/completion API with `jsonMode`, not a
   native function-calling API, so the **customer-scoped tool list**
   below isn't passed as a structured `tools` parameter the way it would
   be for a tool-calling-native provider — it's described in plain text
   inside the system prompt instead, alongside a JSON response contract
   (`{"action":"reply",...}` or `{"action":"call_tool",...}`) the model is
   asked to follow. Deliberately narrower than the full owner-facing MCP
   surface:

   | Tool | Why it's here |
   |---|---|
   | `list_services` | so the assistant can answer "what do you offer" |
   | `list_slots` | so it can answer "what's open Tuesday" |
   | `create_booking` | the actual booking action |
   | `cancel_booking` | the actual cancellation action |

   **Deliberately excluded: `list_bookings`.** That tool (phase 1,
   owner-scoped) returns every booking on the platform, including other
   customers' names and emails — handing it to a customer-facing
   assistant would leak PII to whoever can out-talk the model into asking
   for it, constraint checked by a system prompt alone isn't a security
   boundary. The assistant never needs it: see the next section for how
   it still answers "what's my appointment."
5. If the model's JSON response is a `call_tool` action, execute it
   **in-process** by calling the matching existing service method
   directly — `ServicesService`, `SlotsService`, `BookingsService`, the
   exact same methods the REST controllers already call, no HTTP
   round-trip, no API key involved. For the one owner-scoped call
   (`list_services`), the chat backend resolves the platform's own
   `ownerId` first (a plain read) and passes it straight through, since
   this caller is the platform's own system acting on its own data, not a
   delegated external credential. Feed the result back to the model as a
   plain text line appended to the next prompt (this provider has no
   structured `tool_result` message type), repeat until it returns a
   `reply` action. The parser is deliberately lenient here: real testing
   against this provider's own model found it sometimes collapses the
   contract into `{"action":"create_booking","tool":"create_booking",...}`
   instead of the literal `{"action":"call_tool","tool":"create_booking"}`
   asked for — recognized as the same thing rather than falling back to
   leaking raw JSON at the customer. See "Why in-process, not the
   gateway" below for why this isn't routed through `/mcp/appointments`
   the way an external AI client's calls are.
6. Persist the user message, any tool calls + their results, and the
   final assistant reply as `ChatMessage` rows. Return the reply.

## How "edit/cancel via AI" works without a PII-leaking lookup tool

A customer asking "cancel my appointment" needs the assistant to know
*which* booking — normally that means looking it up, which is exactly
the lookup `cancel_booking` deliberately doesn't have (per `API.md`,
`customerEmail` was never a secret, so a find-by-email tool would let
anyone probe for someone else's booking by guessing their email).

The fix doesn't need a new tool at all: **the conversation history already
has it.** When `create_booking` succeeds earlier in this same
`(platformId, customerEmail)`-keyed conversation, its `cancelToken` is
sitting right there in that tool call's persisted `ChatMessage.toolResult`
— because this conversation thread only exists for the one customer who
was present when that booking was made. The system prompt tells the model
exactly this: "if the customer asks to cancel or change their booking,
check the earlier tool results in this conversation for the
`cancelToken` you already have — don't ask the customer to dig it up
unless this is a new conversation and you genuinely don't have it, in
which case ask them to paste the confirmation they were given at booking
time."

This also means a returning customer in a *fresh* conversation (cleared
`localStorage`, different device) who's lost their token has to paste it
back in — same recovery story the plain REST flow already has (per
`README.md`'s known limitations), not a gap the AI path introduces.

## Why in-process, not the gateway

The original design for this section called for the same thing an
external AI client does: hand the platform's own assistant API key to a
tool-execution loop that calls `/mcp/appointments` and back, on the
reasoning that reusing the *same* tool surface (`MCP-INTEGRATION.md`)
beats maintaining two parallel implementations of "how does a booking get
created."

That design hit a real constraint `DATA-MODEL-V2.md` and
`AUTH-AND-API-KEYS.md` already establish and this doc missed: an API key
is only ever stored as a one-way `sha256` hash plus a lookup prefix — the
raw value is shown exactly once, at creation, and is gone after that, by
design, for every key this system issues. For the chat backend to present
a platform's assistant key to the gateway as its own bearer credential —
the same way an external caller would — it would need that raw value
recoverable server-side, on every conversation turn, potentially long
after the key was created. The only way to make that possible is to
introduce a new class of stored secret (something reversible, not a
one-way hash) that the rest of this codebase deliberately avoids
everywhere else. That's a real, scoped security-posture regression for a
narrow convenience, not a free latency tradeoff — not worth it.

So: **the chat backend calls `ServicesService`/`SlotsService`/
`BookingsService` directly, in-process** — the exact same methods the
REST controllers already call, with no bearer credential needed because
there's no HTTP hop to authenticate. Nothing about `Platform` gets a
system-generated API key; there's no `assistantApiKeyId` field, no key to
protect, no new secret-storage surface at all.

This only changes how *this one in-process caller* (the chat feature
itself) invokes the underlying actions. It changes nothing about the
external MCP integration — an outside AI client still authenticates with
a user's own personal API key through the gateway, exactly as
`MCP-INTEGRATION.md` already describes, completely unaffected by this
decision.

The one thing worth keeping from the original design: the customer-facing
tool definitions (now plain-text descriptions embedded in the system
prompt, not a structured `tools` API parameter) are still generated from
`mcp-gateway/configs/appointments.yaml`'s own schema blocks (a small
mapper, not hand-duplicated JSON) — one source of truth for *what the
four customer-facing tools look like*, even though *how they execute* is
now a direct in-process call instead of an HTTP round-trip, and *how
they're described to the model* is prose instead of a typed schema.
`npm run mcp:check-drift` still protects that file against drifting from
the DTOs it describes, same as before; the chat backend's mapper just
reads the same already-correct file one more way.

## New environment variables

```
AI_GATEWAY_API_KEY=
AI_GATEWAY_URL=https://ai.qtech.sa/media/api/v1/text/generate
AI_GATEWAY_PROVIDER=agentox
AI_CHAT_MODEL=company-coder
```

## What's explicitly not built here

- No streaming responses in v1 — the widget shows a typing indicator and
  waits for the full reply. Streaming is a pure enhancement, not required
  by anything in scope.
- No voice, no multi-turn tool-call visualization in the UI (the customer
  just sees the final reply). A platform owner CAN see the full tool-call
  trace, since `ChatMessage` persists it — that's what `chat-logs` in the
  tenant dashboard is for.
