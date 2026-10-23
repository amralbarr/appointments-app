# Testing

## Layers

**Unit** — plain Jest, no DB. Mostly `bookings.service.ts`'s error mapping
(P2002 -> ConflictException) and `auth.service.ts`'s key hashing/lookup
logic, with Prisma mocked.

**Integration** — Supertest against a real Postgres (docker-compose test
service, migrated fresh and seeded before the suite runs, torn down after).
Covers the actual request/response contract: validation errors return the
right shape, ownership checks actually 404 for a non-owner, a full
booking -> cancel -> rebook cycle works end to end through real HTTP.

**Concurrency** — the one that actually justifies the architecture doc. See
below.

**Realtime** — a real `socket.io-client` connected to the test server,
asserting it receives `slot.booked` after an HTTP booking call resolves,
and nothing before.

## Running

```bash
docker compose -f docker-compose.test.yml up -d
npm run test             # unit
npm run test:e2e         # integration + concurrency + realtime
```

A single `docker-compose.test.yml` spinning up just Postgres on a different
port than local dev, so running tests never touches whatever's in the dev
database.

## The concurrency test, concretely

```ts
it('only one of N concurrent bookings on the same slot succeeds', async () => {
  const slot = await createOpenSlot();

  const attempts = Array.from({ length: 20 }, () =>
    request(app.getHttpServer())
      .post(`/api/v1/platforms/${slot.platformId}/slots/${slot.id}/bookings`)
      .send({ customerName: 'Test', customerEmail: `t${Math.random()}@example.com` }),
  );

  const results = await Promise.all(attempts);
  const succeeded = results.filter(r => r.status === 201);
  const conflicted = results.filter(r => r.status === 409);

  expect(succeeded).toHaveLength(1);
  expect(conflicted).toHaveLength(19);

  const confirmedCount = await prisma.booking.count({
    where: { slotId: slot.id, status: 'CONFIRMED' },
  });
  expect(confirmedCount).toBe(1);
});

it('a cancelled slot can be won again under the same concurrent burst', async () => {
  // book it, cancel it, then repeat the 20-way burst from above
  // and assert exactly one of the new 20 succeeds
});
```

This is the test most likely to flake if written against an in-memory
mock instead of real Postgres — the whole point is proving the database
constraint holds under genuine concurrent connections, not just that the
application code has an if-statement for the 409 case. Worth resisting the
temptation to mock Prisma here even though every other integration test
could get away with it.

## What's explicitly not covered

No load testing, no multi-instance/horizontal-scaling test (the partial
unique index argument in `CONCURRENCY.md` is a property of Postgres, not of
how many app instances are running, so a 2-instance test wouldn't prove
anything a single-instance test doesn't already prove). No browser/E2E —
there's no frontend yet to test against.
