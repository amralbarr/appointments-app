# Build order

Roughly sequential — each step should leave the app in a state that
actually runs, even if incomplete, so a commit can land after each one (see
`REPO-CONVENTIONS.md`).

1. **Scaffold.** `nest new`, Prisma init, `docker-compose.yml` with just
   Postgres, `.env.example`.
2. **Schema + migration + seed.** The models in `DATA-MODEL.md`, the raw-SQL
   partial unique index added by hand to the generated migration, then
   `seed.ts`.
3. **Auth.** Register/login/refresh, password hashing, JWT guard.
4. **API keys.** Issue/list/revoke, the hash-and-lookup verification path,
   `ApiKeyGuard`.
5. **Platforms CRUD**, ownership checks wired in from the start (not bolted
   on after).
6. **Services CRUD.**
7. **Slots** — public read endpoint with the derived-availability query,
   owner-only create/delete.
8. **Bookings** — create with the conflict handling from `CONCURRENCY.md`,
   cancel, the two read endpoints.
9. **Realtime gateway** — wired into the booking/cancel service methods,
   after-commit emit.
10. **Swagger pass** — every DTO gets real `@ApiProperty` examples, not just
    types; confirm `/docs` actually reflects every route.
11. **Tests** — unit, integration, the concurrency burst test, the socket
    test. This can't be step 1 given there's nothing to test yet, but it
    also shouldn't be left until everything else is "done" — the
    concurrency test in particular is worth writing as soon as booking
    create exists, not at the very end.
12. **MCP integration** — `/auth/mcp/verify`, `mcp/configs/appointments.yaml`,
    register + push against the shared gateway, one real end-to-end tool
    call to prove it.
13. **README + docs pass**, conventions from `REPO-CONVENTIONS.md` applied
    for real, not just described.
14. **Hardening pass**, once the thing actually worked end to end and the
    real gaps were visible rather than hypothetical: a real `cancelToken`
    replacing email-matching, rate limiting on the public booking
    endpoints, and a script that catches MCP/DTO schema drift instead of
    relying on remembering to keep them in sync by hand.

## Explicitly deferred, not forgotten

- **Team members on a platform** (today: single owner only). Natural
  extension — a join table with a role — once there's an actual need for
  it.
- **Recurring/rule-based slot generation.** Out of scope on purpose — see
  `README.md`. Fixed, pre-created slots are a deliberately smaller problem.
- **Redacting customer PII from LLM-facing tool responses.** Called out in
  `MCP-INTEGRATION.md` — matters once this is used by anyone other than the
  account owner themselves.
