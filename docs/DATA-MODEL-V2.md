# Schema changes for phase 2

Every change below is additive to `DATA-MODEL.md`, not a rewrite of it.
Each one is driven by a specific phase-2 requirement — no speculative
fields.

## `User` gets a role

```prisma
enum UserRole {
  OWNER  // the existing, only role today — runs their own platform(s)
  ADMIN  // can create/suspend ANY platform, not just their own
}

model User {
  // ...existing fields...
  role UserRole @default(OWNER)
}
```

An admin is still a `User` row — logs in through the exact same
`/auth/login`, no parallel auth system. `ScopesGuard`/`AuthGuard` already
put `scopes: ['*']` on a password-login JWT; a new `AdminGuard` just checks
`role === 'ADMIN'` on top of that for the handful of admin-only routes
(`ROLES-AND-DASHBOARDS.md` has the full list).

## `Platform` gets real profile content and a suspension flag

Today a `Platform` is just `name`/`slug`/`timezone` — enough for the API
challenge, not enough for a public page a customer actually looks at.

```prisma
model Platform {
  // ...existing fields...
  description       String?
  logoUrl           String?
  coverImageUrl     String?
  address           String?
  phone             String?
  // free-form, not a rigid per-weekday schema — a tenant might say
  // "closed Fridays" or "by appointment only on weekends"; structured
  // open/close times belong to Slot generation, not this display field.
  businessHoursText String?
  isActive          Boolean  @default(true)
}
```

`isActive` is the admin's suspension lever — `PlatformsService.getOwned()`
already centralizes every ownership check; a suspended platform fails
there too (404, same as a nonexistent one, not a special "suspended"
error — don't tell an attacker probing slugs the difference between
"doesn't exist" and "got banned").

No `assistantApiKeyId` field here, and no system-generated API key per
platform at all — an earlier draft of this doc had the AI chat
(`AI-BOOKING-ASSISTANT.md`) authenticate to the MCP gateway with one, the
same way an external AI client does. That required the key's raw value
to be recoverable server-side, which conflicts with this system's actual
API-key storage model (`AUTH-AND-API-KEYS.md`: only a one-way hash is
ever kept after creation). The chat backend instead calls
`ServicesService`/`SlotsService`/`BookingsService` directly, in-process —
see `AI-BOOKING-ASSISTANT.md`'s "Why in-process, not the gateway" for the
full reasoning. Nothing about `Platform` needs its own credential as a
result.

## `ApiKey` becomes platform-scopable

```prisma
model ApiKey {
  // ...existing fields...
  platformId String?
  platform   Platform? @relation(fields: [platformId], references: [id])
}
```

`platformId: null` keeps every key issued in phase 1 working exactly as
before (scopes apply across every platform the user owns).
`platformId` set means "these scopes only ever apply to this one
platform" — `ApiKeysService.verify()` needs one new check:
`PlatformsService`-style ownership logic now also carries an optional
`platformId` constraint that every owner-scoped query (`getOwned`,
`listForPlatform`, etc.) must honor when the calling key has one. This is
the one real behavior change to existing phase-1 code, not just an
additive field — flagged here so it doesn't get missed during
implementation.

## `Booking` gets a denormalized `platformId` and a second partial index

```prisma
model Booking {
  // ...existing fields...
  platformId String  // denormalized from slot.platformId at creation time

  // one CONFIRMED booking per (platform, customer) — same mechanism as
  // one_active_booking_per_slot, see docs/CONCURRENCY.md. added by hand
  // in the migration SQL, same reason: prisma can't express a partial
  // index in schema.prisma directly.
  // @@index([platformId, customerEmail])  <- plain index, real constraint is raw SQL:
  // CREATE UNIQUE INDEX one_active_booking_per_customer
  //   ON "Booking" ("platformId", "customerEmail") WHERE "status" = 'CONFIRMED';
}
```

This changes `BookingsService.create()`'s error handling: a conflict can
now come from *either* partial index — the existing
`one_active_booking_per_slot` (someone else took this slot) or the new
`one_active_booking_per_customer` (this customer already has an open
booking at this platform). Postgres's `P2002` error includes which
constraint fired (`err.meta?.target` / the constraint name from the raw
driver error) — the 409 message needs to actually distinguish these two
cases for the customer ("this slot was just taken" reads very differently
from "you already have an upcoming appointment, cancel it first"), so
`create()` needs to inspect which index tripped rather than returning one
generic message for both.

## New: `ChatConversation` and `ChatMessage`

For the AI assistant's history (admin-visible, same spirit as a typical
chat-log audit trail, but tied to a platform + customer identity instead
of an anonymous visitor):

```prisma
model ChatConversation {
  id            String   @id @default(uuid())
  platformId    String
  platform      Platform @relation(fields: [platformId], references: [id])
  customerEmail String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  messages ChatMessage[]

  @@index([platformId, customerEmail])
}

enum ChatRole {
  USER
  ASSISTANT
  TOOL
}

model ChatMessage {
  id             String           @id @default(uuid())
  conversationId String
  conversation   ChatConversation @relation(fields: [conversationId], references: [id])
  role           ChatRole
  content        String
  // present only on a TOOL-role row: which MCP tool ran and what it
  // returned — lets a platform owner actually see what the assistant did
  // on their behalf, not just what it said.
  toolName       String?
  toolResult     Json?
  createdAt      DateTime @default(now())

  @@index([conversationId, createdAt])
}
```

A conversation is keyed by `(platformId, customerEmail)`, not a session
id — a returning customer typing the same email continues their existing
conversation and the assistant can see "you already have a booking for
Tuesday," which it needs to know anyway to answer "what's my
appointment?" correctly.

## Migration notes

Same situation phase 1 hit twice already
(`prisma/migrations/.../migration.sql` for both the init and
`booking_cancel_token` migrations): `prisma migrate dev` refuses to run
non-interactively past a data-loss warning, so expect to hand-write this
migration's SQL the same way, especially for `Booking.platformId NOT NULL`
on a table that may already have rows. Backfill `platformId` from
`slot.platformId` in the same migration before adding the `NOT NULL`
constraint:

```sql
ALTER TABLE "Booking" ADD COLUMN "platformId" TEXT;
UPDATE "Booking" b SET "platformId" = s."platformId" FROM "Slot" s WHERE b."slotId" = s."id";
ALTER TABLE "Booking" ALTER COLUMN "platformId" SET NOT NULL;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id");

CREATE UNIQUE INDEX "one_active_booking_per_customer"
  ON "Booking" ("platformId", "customerEmail") WHERE "status" = 'CONFIRMED';
```

## Seed data: several tenants, not just one clinic

Phase 1's seed script (`backend/prisma/seed.ts`) creates exactly one demo
platform — fine for exercising the API by hand, not enough to make
`/list` (`FRONTEND-ARCHITECTURE.md`) or the new profile fields look like
a real multi-tenant product. The seed script gets extended to create
several tenants spanning different kinds of businesses someone would
actually run through this platform — the point is variety, not a specific
list, so new verticals are easy to add the same way later:

| Tenant | Owner | Services | Why it's in the seed |
|---|---|---|---|
| A family clinic | `dana@example.com` (today's existing demo user, unchanged) | General consultation, follow-up | Already there — kept as-is, just gets the new profile fields filled in |
| A hair/barber salon | a new demo user | Haircut, beard trim, coloring | Different `durationMinutes` spread (quick services) than the clinic's — good for proving the slot picker handles both |
| An independent consultant ("manager" in the sense of a one-person professional — a business/legal/fitness consultant, not a platform-admin role) | a new demo user | 30/60-min consultation slots | The "any person can use the platform" case — a single freelancer, not a multi-staff business, proving a platform doesn't need to look like a clinic to fit this model |
| One platform seeded with `isActive: false` | a new demo user | — | So the admin dashboard's suspend/reactivate UI has something real to show working, not just a happy-path demo |

Each gets real-looking `description`/`address`/`phone`/`businessHoursText`
content (not lorem ipsum — the seed is also what a screenshot of the
`/list` page ends up showing). No per-tenant API key to create — the AI
chat widget talks to every seeded tenant equally, in-process, with no
credential of its own (`AI-BOOKING-ASSISTANT.md`).

Kept in one script, not split per-tenant — `seed.ts` loops a small
in-file array of tenant definitions (name, slug, profile fields, services,
slot generation params) through the same creation logic each time, rather
than hand-repeating the clinic's bespoke code four times. Running the
seed script twice stays idempotent (same `upsert`-by-slug pattern phase 1
already uses), so re-seeding after a schema change doesn't duplicate
anything.
