# Planning docs

Read order if you're picking this up cold:

1. `ARCHITECTURE.md` — stack, module layout, tenancy model
2. `DATA-MODEL.md` — schema
3. `CONCURRENCY.md` — the double-booking problem, which is the whole point
4. `API.md` — endpoints + OpenAPI approach
5. `REALTIME.md` — socket events
6. `AUTH-AND-API-KEYS.md` — human login vs. machine/API-key access
7. `MCP-INTEGRATION.md` — letting an LLM act on a user's behalf
8. `TESTING.md`
9. `REPO-CONVENTIONS.md` — how this should actually get written, not just what
10. `ROADMAP.md` — build order

Working name for the product in these docs: **slotbook**. Backend only for
now — no dashboard, no frontend. Fixed slots, not a general calendar engine:
slots are pre-defined rows in the database (seeded or created by a platform
owner ahead of time), not generated on the fly from availability rules. That
keeps the hard part (conflict handling) isolated from a much bigger problem
(recurrence/availability math) that isn't needed here.

## What this actually is

A multi-tenant booking API. One account (one email) can own several
**platforms** — think "my clinic" and "my barbershop" under the same login.
Each platform has its own services, slots, and bookings, fully isolated from
every other platform, including ones owned by the same user. A platform
owner's own customers never need an account — booking a slot just needs a
name/email, no auth. Managing a platform (creating services, seeding slots,
reading booking history) does need auth, either as the logged-in owner or as
an API key scoped to that owner's account.

The API-key path is what makes the MCP piece in `MCP-INTEGRATION.md` work —
same credential, same scoping, whether the caller is a script, a dashboard
you haven't built yet, or an LLM.
