# Phase 2: public frontend, AI booking assistant, multi-tenant dashboards

Phase 1 (everything in the other docs/ files) built the API: a backend that
works, is tested, and already has a real MCP integration. Nobody outside an
API client has ever seen this product. Phase 2 is the part a human actually
uses: a public site where a customer finds a business and books a slot —
by hand or by talking to an assistant — and two dashboards (tenant,
platform admin) to manage it.

Read order:

1. `MONOREPO-AND-DEPLOYMENT.md` — repo restructuring, Docker, deploy.sh, pm2, nginx
2. `DATA-MODEL-V2.md` — every schema change phase 2 needs, in one place
3. `FRONTEND-ARCHITECTURE.md` — the Next.js app, routing, the BFF pattern
4. `AI-BOOKING-ASSISTANT.md` — the chat widget and the tool-calling backend behind it
5. `ROLES-AND-DASHBOARDS.md` — admin vs. tenant, auth, what each dashboard can do
6. `ROADMAP-V2.md` — build order

## The four decisions worth reading before anything else

These shape most of what's in the other five files. Flagging them up
front rather than letting them show up as surprises three files deep.

**1. The AI assistant calls the same underlying actions an external MCP
client would, but in-process rather than through the gateway.** An
earlier version of this decision had the chat backend call
`/mcp/appointments` using a system-generated, platform-scoped API key,
the same way an external AI client does. That required a key's raw value
to be recoverable server-side, which conflicts with this system's actual
API-key storage model — only a one-way hash is ever kept after creation
(`AUTH-AND-API-KEYS.md`). Instead, the chat backend calls
`ServicesService`/`SlotsService`/`BookingsService` directly, in-process —
the same methods the REST controllers already call, no bearer credential
needed. The external MCP integration itself (what an outside AI client
uses, with a user's own personal API key) is completely unchanged by
this — see `AI-BOOKING-ASSISTANT.md`'s "Why in-process, not the gateway".

**2. API keys need to become platform-scoped, not just user-scoped.**
Today an `ApiKey` grants its scopes across every platform its owner has —
fine when the only caller was the owner themselves, wrong once a key
might be scoped to just one of several platforms an owner has. `ApiKey`
gets a nullable `platformId`: null keeps today's behavior (every platform
the user owns), set means "this platform only." (This is a standalone
capability in its own right — see `DATA-MODEL-V2.md` — not tied to the
chat assistant, which no longer uses an API key of any kind.)

**3. "One active appointment" is a database constraint, same philosophy
as double-booking.** Not an app-level check-then-insert — a partial
unique index on `Booking(platformId, customerEmail) WHERE status =
'CONFIRMED'`. Requires denormalizing `platformId` onto `Booking` itself
(today it's only reachable via `slot.platformId`); see
`DATA-MODEL-V2.md`.

**4. Production deploys via PM2 on the host, not via Docker.** A
`Dockerfile` exists for CI/local parity and as a fallback if this ever
needs to move to a managed container host, but `git pull → build → pm2
startOrReload` is the real production path. Called out explicitly in
`MONOREPO-AND-DEPLOYMENT.md` since it's easy to assume "has a Dockerfile"
means "deploys via Docker," which isn't the case here.

## What's explicitly out of scope for phase 2

- Payments. Nothing in the original spec or this expansion mentions
  billing a customer; booking stays free-to-book.
- Multi-language content authored per platform (a tenant's own bio/hours
  text is whatever language they type it in). The *site chrome* (nav,
  buttons, the admin/tenant dashboards) being bilingual EN/AR is in
  scope — see `FRONTEND-ARCHITECTURE.md`.
- Tenant team members (still single-owner per platform, per phase 1's
  `ROADMAP.md`). Not reopened here.
