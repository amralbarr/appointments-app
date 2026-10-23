# appointments-app

A multi-tenant fixed-slot appointment booking platform. Phase 1 built the
API (`backend/`) - a tested, documented REST service with a real MCP
integration so an AI client can book on a user's own behalf. Phase 2
(this repo's current state) builds the part a human actually uses: a
public site where a customer finds a business and books a slot - by hand
or by talking to an AI booking assistant - and two dashboards (tenant,
platform admin) to run it.

## Layout

```
appointments-app/
  backend/       NestJS API, Prisma/Postgres, the real business logic.
                  See backend/README.md for the backend specifically.
  frontend/      Next.js app (App Router) - public pages, the AI chat
                  widget, tenant dashboard, admin dashboard. Never calls
                  the backend from the browser - every request goes
                  through this app's own BFF API routes, which hold the
                  real credential server-side.
  mcp-gateway/    The shared MCP gateway process phase 1 already built -
                  lets an external AI client (not this repo's own chat
                  widget, which calls the backend in-process instead)
                  book/cancel/list on a user's behalf using that user's
                  own API key.
  ngnix/          nginx config for the one real domain this deploys to.
  docs/           Phase 2's own planning docs (cross-cutting - the
                  frontend, the AI assistant, roles/dashboards, this
                  deploy setup). backend/docs/ is phase 1's own
                  implementation detail instead.
  deploy.sh, ecosystem.config.js
                  The real production deploy path - see "Deploying"
                  below for why this isn't Docker, despite both
                  services also having a Dockerfile.
```

## Running it locally

Backend and frontend are two separate processes; both need to be running
for the frontend to actually work (it proxies every data call to the
backend server-side).

```bash
# backend
cd backend
cp .env.example .env            # fill in AI_GATEWAY_API_KEY for the AI
                                 #  chat widget to actually reply - see
                                 #  "Known limitations" below
docker compose up -d             # postgres on localhost:6412
npm install
npx prisma migrate deploy
npm run prisma:seed              # several demo tenants, see below
npm run start:dev                # http://localhost:6410/api/v1

# frontend, in a second terminal
cd frontend
cp .env.example .env.local       # BACKEND_INTERNAL_URL defaults to the
                                 #  backend above already, usually no
                                 #  edit needed
npm install
npm run dev                      # http://localhost:6411
```

The seed script prints every demo login when it finishes. As of this
writing: `dana@example.com` (a family clinic), two more owner accounts
(a barber studio, an independent consultant), one suspended demo
platform (to show the admin dashboard's suspend/reactivate working on
something real), and `admin@example.com` - all `password123`. Visit
`http://localhost:6411/list` to see the public tenant list, or
`/login` to sign in as any of the above.

## Deploying

Production runs via **PM2 on the host, not Docker**, even though both
`backend/Dockerfile` and `frontend/Dockerfile` exist and build cleanly -
they're a parity/CI target, not the real deploy path (a Dockerfile that
exists "just in case" isn't the same as a Dockerfile that's actually in
the deploy path). A single-host PM2 deploy is simpler to operate at this
scale - no image registry, no container networking to debug - and
nothing is lost if this needs to move to a container host later, since
the Dockerfiles are already there.

**First time on a fresh server**, before `deploy.sh` can run at all:

```bash
sudo ./setup.sh
```

Installs nginx/certbot/PM2 if missing (never touches Node/Docker - too
invasive to assume control of on a shared host, it just checks and tells
you if either's missing), creates `backend/.env` / `frontend/.env.local` /
`mcp-gateway/.env` with real generated secrets (never overwrites one that
already exists), brings up this app's own dev-grade Postgres container,
and installs `appointments.buildron.net`'s own nginx site + TLS cert -
only that one file under `sites-available`/`sites-enabled`, every other
domain on the box is left exactly as it was. Safe to re-run any time;
every step checks whether it's already done first. Still needs a human
for `AI_GATEWAY_API_KEY` and the mcp-gateway's `ACCOUNT_API_KEY` (see what
it prints at the end) - neither can be generated unattended.

**Every deploy after that**, the real path:

```bash
./deploy.sh
```

`git pull`, build + `prisma migrate deploy` for the backend, a
health-checked PM2 reload, then the same for the frontend, then
`pm2 save`. `ecosystem.config.js` is the PM2 process definition both
services run under (`fork` mode, not `cluster` - the rate limiter's
in-process store would silently multiply under cluster mode).
`ngnix/appointments.buildron.net` is the one real nginx vhost, mostly
just proxying everything to the frontend, with the one exception
Socket.IO's realtime slot updates need (`Upgrade`/`Connection` headers).

## Why it's built this way

**The frontend never holds a credential of its own.** Every browser
request goes to a Next.js API route first (the BFF pattern), which reads
a session cookie server-side and forwards the real bearer token to the
backend. A tenant's dashboard and the admin dashboard are two genuinely
separate route groups with two separate BFF proxies, not one shared
proxy with an `if (isAdmin)` branch - a stolen tenant session should have
zero code path into an admin action, not a branch that happens to reject
it.

**The AI chat widget calls the backend's services in-process, not
through the MCP gateway.** An outside AI client (a real MCP tool caller)
still goes through the gateway with its own API key, exactly as phase 1
built it. This repo's own customer-facing chat widget is a different
caller entirely - it's part of the backend process itself, calling
`ServicesService`/`SlotsService`/`BookingsService` directly, because
giving it a system-generated API key would have meant making API keys
recoverable server-side, which conflicts with how this system stores
them (a one-way hash, by design, everywhere else). See
`docs/AI-BOOKING-ASSISTANT.md` for the full reasoning.

**Double-booking is still a database constraint, not application code**
(unchanged from phase 1) - a partial unique index serializes concurrent
inserts for the same slot at the Postgres level. Phase 2 added a second
one for "one active booking per customer per platform," same mechanism.

## Known limitations

Written honestly, not glossed over:

- **No refresh-token flow in the frontend yet.** A logged-in session
  lasts exactly the backend's own 15-minute access-token TTL, then
  you're logged out and have to sign in again. The backend issues a real
  refresh token already (phase 1); nothing in the frontend proxies or
  uses it yet.
- **The AI chat widget needs a real `AI_GATEWAY_API_KEY`** in
  `backend/.env` to actually reply - without one, the backend still
  responds cleanly (a real error, not a crash or a hang), but no actual
  conversation happens. Everything else in this app works without it.
  Confirmed working end to end (real tool calls, real bookings) against
  the company's own `ai.qtech.sa` gateway once that key is set.
- **A tenant's own content (bio, hours text) is never translated** - it's
  stored and shown exactly as the tenant typed it. Only the site chrome
  itself (nav, buttons, dashboard labels) is bilingual EN/AR.
- **An owner with more than one platform** (a real, supported backend
  capability - platform-scoped API keys exist for exactly this) doesn't
  get a platform switcher in the dashboard yet; "edit my platform" edits
  whichever one `GET /platforms` returns first.
- Everything `backend/README.md`'s own "Known limitations" section
  already says is still true too (team members on a platform, no
  recurring slot generation) - this repo doesn't revisit those.

## More detail

`backend/README.md` for the backend specifically. `docs/` for how phase
2 was planned (the BFF pattern, the AI assistant's design, roles and
dashboards, this deploy setup) - written before most of this code
existed, then mostly held up as the actual build order.
