# Preventing double-booking

This is the part worth getting right; everything else in the API is
ordinary CRUD.

## The failure mode

Two requests arrive for the same open slot within milliseconds of each
other (two browser tabs, a retried request, two people genuinely racing for
the same appointment). Without something enforcing exclusivity, both read
"slot is open", both write a booking, both get a 201. Now the platform owner
has double-booked a 30-minute slot.

## What doesn't actually fix it

- **Checking "is this slot open?" then inserting, in application code.**
  This is the bug, not a fix for it — there's a gap between the read and the
  write that two concurrent requests can both fall into, no matter how small
  the gap looks. This has to be solved at the database, not in TypeScript.
- **An in-process mutex / lock map keyed by slot id.** Only works if there's
  exactly one process ever running. One extra instance, one PM2 cluster
  mode, one horizontal scale-out, and it's silently wrong again.
- **Optimistic locking (a `version` column, update-with-where-version-matches).**
  Works, but it's solving a problem the database already solves more
  directly for this exact shape (one slot, one active booking) — it's the
  right tool when you're updating a row and need to detect a conflicting
  update to that same row, not when you're trying to prevent two rows from
  ever coexisting.

## What does

A partial unique index in Postgres:

```sql
CREATE UNIQUE INDEX one_active_booking_per_slot
  ON "Booking" ("slotId")
  WHERE "status" = 'CONFIRMED';
```

Both racing requests run `INSERT INTO "Booking" (...) VALUES (...)`. Postgres
serializes the two inserts at the index level — one commits, the other gets
a unique-violation error (`23505` / Prisma's `P2002`), full stop, no
window for both to succeed. This holds under any number of concurrent
callers, any number of app instances, because the guarantee lives in the one
place both callers ultimately go through: the database.

Application code just needs to catch that specific error and turn it into a
clean response:

```ts
try {
  return await this.prisma.booking.create({ data: { slotId, customerName, customerEmail } });
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictException('This slot was just booked by someone else.');
  }
  throw err;
}
```

No transaction needed around the insert itself — a single `INSERT` is
already atomic. A transaction does matter once the realtime emit needs to
happen only after a successful commit (see `REALTIME.md`), and if slot
validation (does this slot exist, does it belong to this platform/service)
moves inside the same unit of work later.

## Cancellation re-opens the slot for free

Cancelling sets `status = CANCELLED` on the existing row. The partial index
only covers `CONFIRMED` rows, so the moment that update commits, the slot
has zero rows satisfying the index — a new `POST .../bookings` for the same
slot just works, no separate "re-open slot" step, nothing to forget.

## How this gets tested

The test that actually matters: fire N (say, 20) concurrent
`POST /platforms/:id/slots/:slotId/bookings` requests at the same open slot
with `Promise.all`, then assert:

- exactly one resolved 201
- the other N-1 resolved 409
- `SELECT count(*) FROM "Booking" WHERE "slotId" = ? AND status = 'CONFIRMED'`
  is exactly 1

Then cancel that booking and repeat the same concurrent burst — assert
exactly one of the new attempts succeeds, proving the slot really did reopen
rather than staying permanently claimed by the index.

See `TESTING.md` for where this lives and how the test DB is set up to make
it deterministic rather than flaky.
