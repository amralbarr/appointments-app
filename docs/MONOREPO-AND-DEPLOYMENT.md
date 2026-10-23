# Monorepo layout, Docker, deploy.sh, PM2, nginx

The deployment approach deliberately favors operational simplicity over
infrastructure sophistication: a single host, PM2 managing two Node
processes, nginx terminating TLS and proxying to both. Docker images exist
for local parity and as an escape hatch if this ever needs to move to a
managed container host, but they aren't what runs in production day to
day — see "Why PM2, not Docker, in production" below for the reasoning.

## Top-level layout

```
appointments-app/
  backend/                  <- NestJS API, Prisma/Postgres
    src/
    prisma/
    test/
    scripts/
    docs/                    <- backend-specific docs (ARCHITECTURE.md, API.md, etc.)
    Dockerfile               <- multi-stage, parity/portability build
    docker-compose.yml       <- local dev only (postgres)
    docker-compose.test.yml
    package.json
    ...
  frontend/                  <- Next.js (App Router)
  mcp-gateway/                <- a sibling of backend/ and frontend/, not nested
                                  under either — its config needs to be editable
                                  independently of either app's own deploy
    configs/appointments.yaml
    push.sh / pull.sh / register.sh
  ngnix/                      <- appointments.buildron.net's nginx config.
                                  Spelled "ngnix" rather than "nginx" — an early
                                  typo kept intentionally once the production
                                  server's real path already referenced it
  docs/                       <- cross-cutting docs (this file and its siblings)
  .gitignore                  <- root-level
  setup.sh                    <- first-time-server bootstrap only, see below
  deploy.sh                   <- the real deploy path
  ecosystem.config.js         <- PM2 process definitions
```

Two `docs/` folders, deliberately: `backend/docs/` is the backend's own
implementation detail (schema, API, concurrency — things only the backend
needs to explain), `docs/` at the root is cross-cutting (this whole
deployment story, the frontend, the AI assistant, roles/dashboards).

There are two READMEs for the same reason: `backend/README.md` documents
the API on its own and is still accurate read in isolation; the root
`README.md` explains the `backend/` + `frontend/` + `mcp-gateway/` shape
as a whole.

## Backend Dockerfile (multi-stage)

A standard multi-stage Node build, adapted for what this backend
specifically needs (no `wait-for-it.sh`/custom startup script — Prisma
migrations run as a separate `deploy.sh` step, not inside the container
entrypoint, since production here doesn't actually run the container —
see below):

```dockerfile
# build context is the REPO ROOT: docker build -f backend/Dockerfile .
FROM node:22-alpine AS builder
WORKDIR /usr/src/app
COPY backend/package*.json ./
RUN npm ci
COPY backend/. .
RUN apk add --no-cache openssl
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-alpine
RUN apk add --no-cache postgresql-client openssl
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY backend/package*.json ./
COPY prompts /usr/src/prompts
COPY mcp-gateway/configs /usr/src/mcp-gateway/configs
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
```

Real, as-built corrections from an earlier draft of this Dockerfile
(found by actually running the built image, not assumed): plain `npm ci`,
not `--ignore-scripts` (that was skipping `bcrypt`'s own install step,
which is what fetches its real musl-compatible binary); `openssl`
installed in *both* stages (Prisma's query-engine needs it present to
correctly detect and load the matching engine - alpine 3.24 dropped the
old `openssl1.1-compat` package entirely); `dist/src/main.js`, not
`dist/main.js` (this project's real `tsc` output nests under `src/`).
Also needs a `.dockerignore` excluding `node_modules`/`dist` - without
one, `COPY . .` silently overwrites the container's own correctly-
installed dependencies with whatever's on the host machine building the
image.

**Build context moved to the repo root** (a second real bug, found the
same way - actually running the built image and hitting a real crash, not
assumed): the chat feature reads two sibling repo-root files at runtime
via a `process.cwd()`-relative `../` path - `chat.service.ts`'s
`PROMPT_PATH` (`../prompts/ai-prompt.json`) and `mcp-tool-schema.ts`'s
`YAML_PATH` (`../mcp-gateway/configs/appointments.yaml`), both
deliberately outside `backend/` so a non-engineer can edit the AI
assistant's persona or the MCP tool list without touching code (see
`AI-BOOKING-ASSISTANT.md`/`MCP-INTEGRATION.md`). A `backend/`-only build
context can't see either file - the container booted fine and most
endpoints worked, but every `POST .../chat` request 500'd with a real
`ENOENT: no such file or directory, open '/usr/src/mcp-gateway/configs/
appointments.yaml'` the instant a real chat message was sent through it
(`ai-prompt.json`'s own missing-file case already falls back to a safe
inline default - `appointments.yaml`'s doesn't, and crashed outright).
Fixed by building from the repo root instead (`docker build -f
backend/Dockerfile .`, never `docker build ./backend`) and adding two
`COPY` lines to land both sibling paths where the image's own `../`
resolution expects them. The root-level `.dockerignore` (not
`backend/.dockerignore`, which no longer applies and was removed) governs
this build now - it has to exclude both services' `node_modules`/build
output, or the exact "stale host files silently overwrite the container's
own correctly-installed ones" bug above reopens for a repo-root context
instead.

Used for: local parity testing, and as the real artifact if this ever
needs to run somewhere PM2 isn't an option (a managed container host).
**Not** what production actually runs day to day — see "Why PM2, not
Docker, in production" below.

## Frontend Dockerfile (multi-stage, optional/parity only)

Same reasoning — exists for parity, production runs `next start` under
PM2 directly:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/public ./public
COPY package*.json next.config.ts ./
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
```

Needs its own `.dockerignore` too, same reasoning as the backend's.

## Why PM2, not Docker, in production

This deploys like a typical single-host Node app: `git pull`,
`npm install`, `prisma migrate deploy`, `npm run build`, then
`pm2 startOrReload` — no `docker build`/`docker run` step for the backend
or frontend themselves, even though both have Dockerfiles. Chosen over
the more commonly-assumed "always deploy via Docker" because:

- a single-host PM2 deploy is simpler to operate for a project this size
  (no image registry, no container networking to debug)
- `pm2 startOrReload` + `--update-env` is a clean, already-proven rolling
  restart for exactly two Node processes
- the Dockerfiles above still exist, so nothing is lost if this needs to
  move to a container host later — it's a deployment *target* decision,
  not a build decision

## `ecosystem.config.js` (top level)

```js
module.exports = {
  apps: [
    {
      name: 'appointments-backend',
      cwd: './backend',
      script: 'dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=256',
      env: { NODE_ENV: 'production', PORT: 6410 },
      max_memory_restart: '500M',
      autorestart: true,
      restart_delay: 3000,
    },
    {
      name: 'appointments-frontend',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 6411',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'production',
        BACKEND_INTERNAL_URL: 'http://localhost:6410/api/v1',
      },
      max_memory_restart: '512M',
      autorestart: true,
      restart_delay: 3000,
    },
  ],
};
```

`exec_mode: 'fork'`, not `'cluster'` — this API has no in-memory state
that benefits from multiple workers yet (the throttler's storage is
in-process; cluster mode would mean each worker enforces its own separate
rate limit, quietly multiplying the real limit by instance count). Worth
revisiting if load ever actually requires more than one instance — at
that point the throttler needs a shared store (Redis) regardless of exec
mode.

## `setup.sh` (top level, first-time only)

`deploy.sh` assumes nginx, certbot, PM2, Node, and the dev Postgres
container are already present, and that `.env` files already exist —
fine for every deploy after the first, but a fresh server needs something
that actually bootstraps all of that. `setup.sh` fills that gap: system
packages (nginx/certbot — never Node/PM2's *version*, just checked, not
force-installed/upgraded, since a shared host may have other apps
depending on what's already there), `backend/.env` /
`frontend/.env.local` / `mcp-gateway/.env` with real generated secrets
(the shared `MCP_INTERNAL_SECRET` is generated once and written to both
backend and gateway identically — see `MCP-INTEGRATION.md`), the dev-grade
Postgres container brought up for real via `docker compose up -d`, and
`appointments.buildron.net`'s own nginx site + TLS cert.

The nginx/TLS half follows a careful pattern: `--register-unsafely-
without-email`, test-before-reload so a config mistake can never take
down another domain's nginx, an explicit "only this one domain's files
were touched" callout — adapted for the one real wrinkle here: this
repo's own committed `ngnix/appointments.buildron.net` already hardcodes
the post-certbot HTTPS block (cert paths included), rather than an
HTTP-only file that certbot's `--nginx` plugin would auto-edit in place.
So `setup.sh` installs a temporary HTTP-only block of its own first (just
enough for the ACME challenge), runs `certbot certonly` (obtains the cert
without rewriting the config), then swaps in the repo's real committed
file — ending with the live config being byte-for-byte what's in git, not
whatever certbot's auto-editor would have produced.

Safe to re-run: every step checks whether it's already done (an existing
`.env`, an existing cert, nginx/certbot already installed) and skips
rather than redoing or overwriting. Still needs a human for
`AI_GATEWAY_API_KEY` and `mcp-gateway/.env`'s `ACCOUNT_API_KEY` — neither
is something a script should generate unattended.

## `deploy.sh` (top level)

Backend-then-frontend, with a health-check wait in between: the
frontend's build doesn't actually depend on the backend being up, but
reloading the backend first and confirming it's actually serving before
moving on is still the right order — a broken migration should stop the
deploy before the frontend goes out too.

```bash
#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "pulling..."
git pull origin main

echo "backend..."
cd backend
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
cd ..

pm2 startOrReload ecosystem.config.js --only appointments-backend --update-env

echo "waiting for backend..."
for i in $(seq 1 24); do
  curl -sf -o /dev/null http://127.0.0.1:6410/docs-json && break
  [ "$i" -eq 24 ] && { echo "backend did not come up"; pm2 logs appointments-backend --lines 50 --nostream; exit 1; }
  sleep 5
done

echo "frontend..."
cd frontend
npm ci
npm run build
cd ..

pm2 startOrReload ecosystem.config.js --update-env
pm2 save
echo "done."
pm2 status
```

`deploy.sh` also runs `mcp-gateway/push.sh` itself, every deploy - not
just when `mcp-gateway/configs/appointments.yaml` actually changed
(push.sh is a plain PUT of the current file, harmless if nothing changed).
Soft-fails with a warning rather than aborting the deploy if it's not
registered yet (`APPOINTMENTS_EDIT_KEY` unset) - a brand new server's
first deploy still completes, the gateway step just needs a human to run
`register.sh` once afterward.

## `.github/workflows/deploy.yml` (CI/CD)

On a push to `main`, GitHub Actions SSHes into the server and runs
`git pull && bash ./deploy.sh` — no build happens in CI itself, the
server does the real build, same as a human running `deploy.sh` by hand
would. Needs four repo secrets configured in GitHub (Settings → Secrets
and variables → Actions, environment "server deploy"): `SERVER_IP`,
`SERVER_USER`, `SSH_PRIVATE_KEY`, and optionally `SERVER_PORT` (defaults
to 22). The server path is this repo's real one: `~/general/appointments-app`.

## nginx (folder name: `ngnix/`)

One domain, one server block — everything proxies to the Next.js
frontend, which itself proxies API calls server-side to the backend (the
BFF pattern in `FRONTEND-ARCHITECTURE.md`). The one exception: real-time
Socket.IO traffic, which needs the `Upgrade`/`Connection` headers both
reference configs already carry for exactly this reason.

```nginx
server {
    listen 80;
    server_name appointments.buildron.net;
    return 301 https://appointments.buildron.net$request_uri;
}

server {
    listen 443 ssl http2;
    server_name appointments.buildron.net;
    ssl_certificate /etc/letsencrypt/live/appointments.buildron.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/appointments.buildron.net/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:6411;
        include proxy_params;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

`appointments.buildron.net/list` and `appointments.buildron.net/{slug}`
are both just Next.js routes — no nginx-level path routing needed.

## Local dev stays a plain process per service

`docker compose up -d` for Postgres (run from `backend/`), `npm run
start:dev` for the backend, and `npm run dev` (`next dev -p 6411`, a
pinned port — plain unpinned `next dev` defaults to 3000, which could
still collide with an unrelated local process, same reasoning as the
backend's own `.env.example` defaults to, which would collide the moment
both run locally at once; found and fixed for real while verifying the
root README's own setup instructions actually work) for the frontend —
no PM2, no Docker, no nginx locally. Matches the standing project
convention: Docker/PM2 are production concerns, the inner dev loop stays
a plain process per service.

## Notes from getting this running for real

A couple of small, concrete corrections surfaced only once this was
actually built and deployed, worth recording precisely because the plan
otherwise reads as if nothing needed adjusting:

- `backend/Dockerfile`'s multi-stage build needed more than a straight
  `npm ci` to actually run, not just build — alpine's musl libc affects
  `bcrypt`'s own native install step, Prisma's query-engine needs
  `openssl` present at runtime to detect and load the matching engine
  (alpine 3.24 dropped the old `openssl1.1-compat` package entirely), and
  both services needed their own `.dockerignore` to keep `node_modules`
  and build output out of the build context. Found by actually running
  the built images, not assumed.
- The backend's real compiled entry point is `dist/src/main.js`, not
  `dist/main.js` as an earlier draft of this doc's own `ecosystem.config.js`
  snippet assumed — `nest-cli.json`'s `sourceRoot` preserves the `src/`
  prefix under this project's own `tsconfig.json`. Both the real
  `ecosystem.config.js` and `backend/Dockerfile`'s `CMD` use the correct
  path.
