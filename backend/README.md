# slotbook

A multi-tenant fixed-slot appointment booking API. One account can own
several platforms (think "my clinic" and "my barbershop" under the same
login), each with its own services, slots, and bookings, fully isolated
from each other. Booking a slot needs no account at all - just a name and
email - but managing a platform does.

This folder is the backend only - see the repo root `README.md` for the
frontend and how the two fit together (a Next.js app now lives at
`../frontend/`). Slots are pre-created rows, not generated from
recurrence rules - that's a deliberately smaller problem than a general
calendar engine, see `docs/README.md` for why.

## Running it locally

```bash
cp .env.example .env
docker compose up -d                 # postgres on localhost:6412
npm install
npx prisma migrate deploy
npm run prisma:seed                  # one demo clinic, two services, a week of slots
npm run start:dev
```

API is at `http://localhost:6410/api/v1`, interactive docs at
`http://localhost:6410/docs`. The seed script logs the demo login
(`dana@example.com` / `password123`) when it finishes.

## Tests

```bash
docker compose -f docker-compose.test.yml up -d   # separate postgres, port 5433
DATABASE_URL_TEST="postgresql://slotbook:slotbook@localhost:5433/slotbook_test" \
  npx prisma migrate deploy

npm test              # unit - prisma mocked, fast
npm run test:e2e       # integration, including the concurrency burst test below
```

The one test actually worth reading is
`test/booking-concurrency.e2e-spec.ts` - it fires 20 simultaneous booking
requests at the same open slot against a real database and checks that
exactly one succeeds. Everything else in this repo is fairly ordinary CRUD;
that one test is the point.

## Why it's built this way

**Double-booking is prevented by a database constraint, not application
code.** A partial unique index on `Booking(slotId) WHERE status =
'CONFIRMED'` means two concurrent inserts for the same slot get serialized
by Postgres itself - one succeeds, the other fails with a unique violation
that gets mapped to a 409. I looked at an in-process lock and at optimistic
locking with a version column first; both work, but both solve a problem
the database already solves more directly for this exact shape. Full
writeup in `docs/CONCURRENCY.md`.

**Availability is computed, not stored.** Whether a slot is "open" is
derived from the booking table on every read (no confirmed booking = open),
rather than a `status` flag on the slot itself that could drift out of
sync with reality. One less thing to get wrong.

**Two credential types, one identity underneath.** A human gets a
password + JWT. A script or an AI assistant gets a personal API key
(`sk_live_...`) with its own scopes. Both resolve to the same `{ userId,
scopes }` shape before anything downstream has to care which kind of
caller it's talking to.

**The MCP integration reuses an existing gateway pattern rather than
inventing a new one.** `mcp/configs/appointments.yaml` + a `/auth/mcp/verify`
endpoint let an AI assistant book/cancel/list on a user's behalf using that
user's own API key, scoped exactly the way a normal API call would be - no
special-casing for "the caller happens to be an LLM." See
`docs/MCP-INTEGRATION.md`.

## Hardening pass

Three things flagged as deferred limitations got fixed once the thing
actually worked end to end and the real gaps were visible rather than
hypothetical:

- **Cancelling a booking now needs a real `cancelToken`**, a random value
  returned exactly once in the create response and stored only as a hash -
  not the customer's email, which is routinely guessable or outright
  public and was never actually a secret to gate a destructive action on.
- **The public booking endpoints are rate limited** - 10/min/ip on
  create/cancel/lookup, the actual abuse surface since there's no account
  to ban. Verified against a running server: the 11th request in a minute
  gets a clean 429, everything else is unaffected.
- **`npm run mcp:check-drift`** parses `appointments.yaml` and flags a
  GET/DELETE tool with a field missing from `queryParams` (silently
  dropped by the gateway) or a tool's schema disagreeing with the DTO it
  calls into - the exact two bug classes that bit this project for real
  the first time it was tested against a live gateway, not something
  hypothetical.

## Known limitations

- **Team members on a platform** - today it's single-owner only. A join
  table with a role is the natural extension, not built because nothing
  in scope actually needs it yet.
- **No recurring/rule-based slot generation**, on purpose - see
  `docs/README.md` for why fixed, pre-created slots are a deliberately
  smaller problem than a general calendar engine.
- **Customer PII (name/email) is still visible to `list_bookings` over
  MCP** for the account owner's own platforms. Fine when the owner is the
  one driving their own assistant; worth redacting before this is ever
  exposed to an assistant the owner doesn't fully control.

## More detail

The planning notes in `docs/` go deeper on all of the above - written
before any code existed, then mostly held up as the actual build order
(`docs/ROADMAP.md`). `docs/DATA-MODEL.md` has the full schema,
`docs/API.md` the full endpoint list.
