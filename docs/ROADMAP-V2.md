# Phase 2 build order

Same spirit as phase 1's `ROADMAP.md`: each step should leave the repo in
a state that actually runs, commits land incrementally, and the
concurrency/security-sensitive pieces get a real test the moment they
exist rather than at the very end.

1. **Repo restructure.** ~~Done~~ — `backend/`, `frontend/`, top-level
   `mcp-gateway/` already exist on disk; full phase-1 test suite already
   re-confirmed passing from the new location. Still open: stage and
   commit the move itself (one commit, preserves history), and the root
   `.gitignore` gap this surfaced (`mcp-gateway/.env` was briefly
   unprotected — fixed, see `MONOREPO-AND-DEPLOYMENT.md`).
2. **Schema changes** (`DATA-MODEL-V2.md`): `User.role`, `Platform`
   profile fields + `isActive`, `ApiKey.platformId`,
   `Booking.platformId` + the second partial unique index,
   `ChatConversation`/`ChatMessage`. One migration, hand-written SQL for
   the backfill + partial index same as phase 1's two migrations.
3. **Platform-scoped API keys.** `ApiKeysService`/`AuthGuard` honor
   `platformId` when a key has one. Test: a platform-scoped key can't see
   or touch a different platform owned by the same user.
4. **Public platform listing + richer profile.** New
   `GET /platforms/public`, extended `PATCH /platforms/:id` for the new
   profile fields.
   **Extend `seed.ts`** right after this (`DATA-MODEL-V2.md`'s "Seed data"
   section) — a clinic, a salon, a solo consultant, and one suspended
   platform. Doing this now, not after the frontend exists, means every
   frontend step from here on renders against real variety instead of one
   lonely clinic.
5. **The second conflict case.** `BookingsService.create()` distinguishes
   slot-conflict from customer-already-has-a-booking-conflict. Test:
   concurrent bookings for the *same customer* across *different* open
   slots at the same platform — exactly one should succeed, mirroring
   `test/booking-concurrency.e2e-spec.ts`'s shape for the new constraint.
6. **Admin role + routes.** `AdminGuard`, `AdminController`
   (list/create/suspend platforms). Test: an `OWNER` hitting an admin
   route gets 403, an `ADMIN` can act on a platform they don't own.
7. **Chat backend.** `ChatModule`, the Anthropic tool-calling loop
   executing in-process against `ServicesService`/`SlotsService`/
   `BookingsService` directly (see `AI-BOOKING-ASSISTANT.md`'s "Why
   in-process, not the gateway"), `ChatConversation`/`ChatMessage`
   persistence. Mock the Anthropic call in unit tests, but prove the
   tool-execution half against a real test database at least once (not
   mocked Prisma) — same discipline that caught `cancel_booking`'s
   query-param bug for real the first time this app was tested against
   something real, adapted here to the in-process execution path rather
   than a live external gateway call, since that call no longer happens.
8. **Frontend scaffold.** Next.js app, the three route groups, the BFF
   proxy routes, login.
9. **Public pages.** `/list`, `/[slug]` — profile display, service/slot
   picker, the manual booking form, realtime slot updates via Socket.IO.
10. **The chat widget.** The floating `AIAssistantChat.tsx` component,
    wired to the new `/api/chat` BFF route, the email-gate step before
    first message.
11. **Tenant dashboard pages.**
12. **Admin dashboard pages.**
13. **Docker + deploy.** `backend/Dockerfile`, `frontend/Dockerfile`
    (parity targets), top-level `deploy.sh`, `ecosystem.config.js`,
    `ngnix/appointments.buildron.net` (the folder is really spelled
    `ngnix/` - see `MONOREPO-AND-DEPLOYMENT.md`). Smoke-test the actual `deploy.sh`
    against a local/staging host before calling this done — a deploy
    script that's never been run is exactly the kind of thing phase 1
    kept finding real bugs in (`register.sh`'s syntax error, the
    `cancel_booking` query-param bug) by actually running it instead of
    trusting it on review.
14. **README + docs pass**, same closing step as phase 1.

## Explicitly deferred (consistent with phase 1's own deferral list)

- Payment collection.
- Per-platform custom domains (every tenant lives under
  `appointments.buildron.net/{slug}` — a platform getting its own domain
  is a real feature, not assumed here).
- Streaming chat responses.
- Cluster-mode / multi-instance backend (flagged in
  `MONOREPO-AND-DEPLOYMENT.md` — needs a shared rate-limit store first).
