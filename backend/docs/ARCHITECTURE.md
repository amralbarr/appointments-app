# Architecture

## Stack

- NestJS + TypeScript
- PostgreSQL + Prisma
- Socket.IO (via `@nestjs/websockets` + `@nestjs/platform-socket.io`)
- `@nestjs/swagger` for OpenAPI, served at `/docs`
- Jest + Supertest for tests
- Docker Compose for local Postgres (and the app itself, optionally)

No frontend. No session-based web dashboard yet either — everything is an
API. If a dashboard happens later it's just another API client.

## Module layout

```
src/
  main.ts
  app.module.ts
  prisma/
    prisma.module.ts
    prisma.service.ts        # extends PrismaClient, handles connect/disconnect
  common/
    filters/                 # exception filter -> consistent error shape
    guards/                  # jwt guard, api-key guard
    decorators/              # @CurrentUser(), @Scopes(...)
  auth/
    auth.module.ts
    auth.controller.ts       # register, login, refresh, api-keys CRUD, mcp/verify
    auth.service.ts
    strategies/              # passport-jwt
    dto/
  users/
    users.module.ts
    users.service.ts
  platforms/
    platforms.module.ts
    platforms.controller.ts
    platforms.service.ts
    dto/
  services/                  # domain "service" (haircut, consult, ...), not a NestJS layer
    services.module.ts
    services.controller.ts
    services.service.ts
    dto/
  slots/
    slots.module.ts
    slots.controller.ts
    slots.service.ts
    dto/
  bookings/
    bookings.module.ts
    bookings.controller.ts
    bookings.service.ts      # the conflict-handling lives here, see CONCURRENCY.md
    dto/
  realtime/
    realtime.module.ts
    realtime.gateway.ts      # socket.io gateway, emits slot.booked / slot.cancelled
prisma/
  schema.prisma
  migrations/
  seed.ts
```

One controller/service pair per resource. Nothing fancier than that — no
CQRS, no separate domain layer, no repository interfaces sitting in front of
Prisma. The project is small enough that an extra layer of indirection would
just be something to maintain for no payoff. If it grows past a few more
resources this is the first thing worth revisiting, not the last.

## Tenancy model

- `User` — one row per email. Owns zero or more platforms.
- `Platform` — a business/calendar ("my clinic"). Owned by exactly one user
  for v1 (no shared ownership, no team members — noted as a later extension
  in `ROADMAP.md`, not built now because nothing in the current scope needs
  it).
- `Service`, `Slot`, `Booking` all hang off a `Platform`, directly or
  transitively.

Isolation is enforced in the service layer, not just by route shape: every
query that touches `Service`/`Slot`/`Booking` is scoped by `platformId`
pulled from the authenticated caller's own platform ownership, never from a
client-supplied value alone. A request for `/platforms/7/bookings` from a
user who doesn't own platform 7 gets a 404, not a 403 — don't confirm the
platform exists to someone who can't see it.

Booking a slot itself is the one unauthenticated path: a platform's own
customers hit `POST /platforms/:id/slots/:slotId/bookings` with just their
name and email, no account needed. Everything else (creating services,
seeding slots, reading booking history, issuing API keys) requires the
caller to be the platform's owner — either logged in, or holding that
owner's API key. See `AUTH-AND-API-KEYS.md`.

## Request flow, two shapes

**Human / dashboard caller:** email+password -> short-lived JWT (+ refresh
cookie) -> every subsequent request carries `Authorization: Bearer <jwt>`.

**Machine / LLM caller:** a personal API key issued once from the account ->
either sent straight to this API (`Authorization: Bearer sk_live_...`,
verified against the stored hash on every request) or, for the MCP path,
handed to the shared gateway which exchanges it for a short-lived JWT behind
the scenes on the gateway's own first call. Functionally the same
destination (a request carrying a valid identity + scopes), two different
front doors. Details in `MCP-INTEGRATION.md`.
