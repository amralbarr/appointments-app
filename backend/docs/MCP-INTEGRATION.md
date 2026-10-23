# Letting an LLM use this on a user's behalf

Goal: any account holder can hand their own personal API key to an AI
assistant and have it list their platforms, check availability, and
create/cancel bookings — strictly scoped to that one account's own data,
with zero awareness anywhere in the LLM-facing layer that multi-tenancy even
exists. The tenancy boundary is enforced once, in this app's own backend,
the same place it's already enforced for every other caller.

This follows the same config-driven gateway pattern already running for
another platform in this workspace (a single declarative YAML file per
platform, served by one shared gateway process, no bespoke per-platform MCP
server) rather than hand-writing a standalone
`@modelcontextprotocol/sdk` server with one `.ts` file per tool. That
approach works and is already deployed; there's no reason to re-invent a
different shape here.

## Pieces

**1. One backend endpoint this app owns: `POST /auth/mcp/verify`**

```
POST /auth/mcp/verify
X-Internal-Secret: <MCP_INTERNAL_SECRET>
Body: { "apiKey": "sk_live_..." }

200 -> { "userId": "...", "scopes": [...], "accessToken": "<jwt, 15 min>" }
401 -> key invalid/revoked
```

Internally this is `verifyApiKey()` from `AUTH-AND-API-KEYS.md` plus minting
a JWT. `MCP_INTERNAL_SECRET` is a shared secret between this backend and the
gateway process — not the user's own credential, just proof the call is
coming from the gateway and not a random client hitting this endpoint
directly. Guarded the same way as any internal-only route (header check,
reject before touching the DB on mismatch).

**2. One gateway config file: `mcp/configs/appointments.yaml`**

Lives in this repo (not the gateway's repo), tracked in git the same way a
platform's other config lives next to the code it describes, and gets
pushed to the shared gateway's database with a small script — nothing about
this app's MCP surface requires redeploying the gateway itself.

```yaml
id: appointments
name: "Slotbook"
baseUrl: "https://api.slotbook.example.com/api/v1"

auth:
  strategy: apiKeyVerify
  keyPrefix: "sk_live_"
  verifyUrl: "https://api.slotbook.example.com/api/v1/auth/mcp/verify"
  verifyHeaderName: x-internal-secret
  verifySecretEnv: APPOINTMENTS_MCP_INTERNAL_SECRET
  forwardTokenField: accessToken
  scopesField: scopes

tools:
  - name: list_platforms
    description: "List platforms owned by the authenticated user."
    method: GET
    path: /platforms
    scope: platforms:read
    schema: {}

  - name: get_platform
    description: "Get one platform by id."
    method: GET
    path: "/platforms/{id}"
    scope: platforms:read
    schema:
      id: { type: string, description: "Platform id" }

  - name: list_services
    description: "List services offered by a platform."
    method: GET
    path: "/platforms/{platformId}/services"
    scope: platforms:read
    schema:
      platformId: { type: string }

  - name: list_slots
    description: "List slots for a platform, optionally filtered."
    method: GET
    path: "/platforms/{platformId}/slots"
    scope: platforms:read
    schema:
      platformId: { type: string }
      serviceId:  { type: string, optional: true }
      from:       { type: string, optional: true, description: "ISO date" }
      to:         { type: string, optional: true, description: "ISO date" }
      onlyOpen:   { type: boolean, optional: true, default: true }

  - name: create_booking
    description: "Book an open slot. Fails with a clear conflict error if someone else just took it."
    method: POST
    path: "/platforms/{platformId}/slots/{slotId}/bookings"
    scope: bookings:write
    schema:
      platformId:    { type: string }
      slotId:        { type: string }
      customerName:  { type: string }
      customerEmail: { type: string }

  - name: cancel_booking
    description: "Cancel a booking, freeing its slot."
    method: DELETE
    path: "/bookings/{bookingId}"
    scope: bookings:write
    schema:
      bookingId:     { type: string }
      customerEmail: { type: string, description: "Must match the email the booking was made with" }

  - name: list_bookings
    description: "List booking history for a platform the caller owns."
    method: GET
    path: "/platforms/{platformId}/bookings"
    scope: bookings:read
    schema:
      platformId: { type: string }
      status:     { type: enum, values: [CONFIRMED, CANCELLED], optional: true }
```

Every tool's `schema` block mirrors the matching DTO's own `class-validator`
rules by hand — same field names, same optionality. If a DTO changes, this
file changes in the same PR; nothing auto-generates it, which is an
explicit tradeoff (simplicity now, over building real codegen for nine
tools). `npm run mcp:check-drift` (`scripts/check-mcp-schema-drift.ts`)
catches the gap that tradeoff leaves open: a field renamed/added/removed on
one side and not the other, and — the one that actually happened — a
GET/DELETE tool's field missing from `queryParams`, which the gateway
silently drops instead of erroring on.

**3. Registration, same three scripts as the existing platform**

`register.sh` / `push.sh` / `pull.sh`, copied from the existing pattern and
repointed at `appointments`:

```bash
cp .env.example .env            # fill in GATEWAY_URL, ACCOUNT_API_KEY, APPOINTMENTS_AUTH_JSON
./register.sh mcp/configs/appointments.yaml public
# mint an edit key from the gateway's admin UI, save as APPOINTMENTS_EDIT_KEY
./push.sh mcp/configs/appointments.yaml
```

Registered `public`, not `private` — same reasoning as the existing
platform: `apiKeyVerify` already resolves the caller to a real,
backend-checked identity and scope set on every call, so a second
gateway-level credential on top of that would just be one more secret to
manage for no additional protection. `private` is for a platform with no
independent backend auth of its own to lean on; this one has one.

## What a user actually does

1. Logs in, goes to their account's API key settings, generates a key
   (`sk_live_...`), copies it once.
2. Gives that key to their AI assistant/agent, pointed at the shared
   gateway's `/mcp/appointments` endpoint.
3. Every tool call the assistant makes carries that key. The gateway
   exchanges it for a scoped token on first use (or per-call — see the
   existing platform's own README for the gateway's exact caching behavior)
   and forwards every request as that user, and only that user. The
   assistant can list and book across every platform that one user owns; it
   cannot see or touch anyone else's, and never learns that other tenants
   exist at all.

## The one thing to double check before trusting this in production

`list_bookings` and `get_platform` leak customer PII (name/email) to
whatever LLM is asking — same as the REST endpoint already does for the
owner, but now the recipient is a model rather than a browser. Scoping that
tool's responses to a redacted view (last-4-of-email, or omit email
entirely) is the first thing to revisit if this is ever exposed to an
assistant the user doesn't fully control themselves — not needed for a
personal-assistant use case where the user is both the account owner and
the one driving the LLM, but worth writing down now rather than
discovering it later.
