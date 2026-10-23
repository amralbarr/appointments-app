#!/bin/bash
# One-time bootstrap for a FRESH server - everything that has to happen
# exactly once, before ./deploy.sh can run for the first time: system
# packages, .env files (real generated secrets, not committed ones), the
# dev-grade Postgres container brought up for real, and this app's own
# nginx site + TLS cert.
#
# Safe to re-run: every step checks whether it's already done first and
# skips if so. Never touches another site's nginx config, another app's
# PM2 processes, or an existing .env - this only ever adds its own files
# alongside whatever else is already running on the box.
#
# Usage: sudo ./setup.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DOMAIN="appointments.buildron.net"
NGINX_SITE_SRC="$SCRIPT_DIR/ngnix/$DOMAIN"
NGINX_AVAILABLE="/etc/nginx/sites-available/$DOMAIN"
NGINX_ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

echo "==> appointments-app first-time server setup"
echo

# ─── central .env.production, if present ────────────────────────────────────
# optional - everything below still works with none of these set (falls
# back to auto-generating secrets the same way it always has). see
# .env.production.example for what each of these is for.
if [ -f .env.production ]; then
  echo "==> Loading .env.production"
  set -a
  # shellcheck disable=SC1091
  source .env.production
  set +a
  echo
fi

# ─── 0. sanity checks ──────────────────────────────────────────────────────
HAS_APT=0
if command -v apt-get >/dev/null 2>&1; then
  HAS_APT=1
fi

# this script needs root for the system-package/nginx parts, but
# node_modules/the generated prisma client/the .env files must end up
# owned by the real deploy user, not root - otherwise ./deploy.sh (run
# later as that regular user, no sudo) can't even rmdir its own
# node_modules/.bin on the next npm ci. $SUDO_USER is set by sudo itself
# to whoever actually ran it; DEPLOY_USER resolves to that, or to
# whoever's running this script directly if it wasn't invoked via sudo at
# all (the no-apt local dry-run path).
DEPLOY_USER="${SUDO_USER:-$(whoami)}"
run_as_deploy_user() {
  if [ "$(whoami)" = "$DEPLOY_USER" ]; then
    "$@"
  else
    sudo -u "$DEPLOY_USER" -H "$@"
  fi
}

if [ "$HAS_APT" -eq 1 ] && [ "$(id -u)" -ne 0 ]; then
  echo "This needs root to install system packages and write nginx config." >&2
  echo "Re-run as: sudo ./setup.sh" >&2
  exit 1
fi

if [ "$HAS_APT" -eq 0 ]; then
  echo "!! No apt-get here - this isn't the target Ubuntu/Debian server."
  echo "   Skipping nginx/certbot/system-package steps; running the"
  echo "   .env + database bootstrap only, useful for a local dry run."
  echo
fi

# ─── 1. system packages (idempotent - apt-get no-ops if already installed) ─
if [ "$HAS_APT" -eq 1 ]; then
  echo "==> Checking nginx + certbot"
  if ! command -v nginx >/dev/null 2>&1 || ! command -v certbot >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y nginx certbot python3-certbot-nginx
  else
    echo "    already installed"
  fi
fi

echo "==> Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. This script won't install/upgrade Node on a" >&2
  echo "shared server - another app here may depend on a specific" >&2
  echo "version already. Install Node 20+ yourself, then re-run." >&2
  exit 1
fi
NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node $(node --version) found, need 20+. Not auto-upgrading on a" >&2
  echo "shared server - upgrade yourself, then re-run." >&2
  exit 1
fi
echo "    $(node --version) ok"

echo "==> Checking Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install it yourself (not auto-installed here -" >&2
  echo "too invasive to run unattended on a shared server), then re-run." >&2
  exit 1
fi
echo "    ok"

echo "==> Checking PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
else
  echo "    already installed"
fi
echo

# ─── 2. backend/.env ────────────────────────────────────────────────────────
# ${VAR:-...} picks up whatever .env.production set above; anything left
# blank there (or no .env.production at all) still gets a real generated
# value, same as before.
echo "==> backend/.env"
if [ -f backend/.env ]; then
  echo "    already exists, leaving it alone"
  # still need these for the mcp-gateway step below
  MCP_INTERNAL_SECRET="$(grep '^MCP_INTERNAL_SECRET=' backend/.env | cut -d= -f2-)"
else
  JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-$(openssl rand -hex 32)}"
  JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-$(openssl rand -hex 32)}"
  MCP_INTERNAL_SECRET="${MCP_INTERNAL_SECRET:-$(openssl rand -hex 32)}"
  PG_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 20)}"

  cp backend/.env.example backend/.env
  sed -i.bak \
    -e "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=${PG_PASSWORD}#" \
    -e "s#^DATABASE_URL=.*#DATABASE_URL=\"postgresql://slotbook:${PG_PASSWORD}@localhost:6412/slotbook\"#" \
    -e "s#^JWT_ACCESS_SECRET=.*#JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}#" \
    -e "s#^JWT_REFRESH_SECRET=.*#JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}#" \
    -e "s#^MCP_INTERNAL_SECRET=.*#MCP_INTERNAL_SECRET=${MCP_INTERNAL_SECRET}#" \
    ${AI_GATEWAY_API_KEY:+-e "s#^AI_GATEWAY_API_KEY=.*#AI_GATEWAY_API_KEY=${AI_GATEWAY_API_KEY}#"} \
    ${AI_GATEWAY_URL:+-e "s#^AI_GATEWAY_URL=.*#AI_GATEWAY_URL=${AI_GATEWAY_URL}#"} \
    ${AI_GATEWAY_PROVIDER:+-e "s#^AI_GATEWAY_PROVIDER=.*#AI_GATEWAY_PROVIDER=${AI_GATEWAY_PROVIDER}#"} \
    ${AI_CHAT_MODEL:+-e "s#^AI_CHAT_MODEL=.*#AI_CHAT_MODEL=${AI_CHAT_MODEL}#"} \
    backend/.env
  rm -f backend/.env.bak
  echo "    created"
  [ -z "${AI_GATEWAY_API_KEY:-}" ] && echo "    !! still needs AI_GATEWAY_API_KEY filled in by hand"
fi
echo

# ─── 3. frontend/.env.local ─────────────────────────────────────────────────
echo "==> frontend/.env.local"
if [ -f frontend/.env.local ]; then
  echo "    already exists, leaving it alone"
else
  cp frontend/.env.example frontend/.env.local
  if [ "$HAS_APT" -eq 1 ]; then
    # NEXT_PUBLIC_* is sent to the BROWSER - localhost there means every
    # real visitor's own machine, not this server. BACKEND_INTERNAL_URL
    # stays localhost on purpose (server-side only, same-host call).
    # found for real: a live production chat widget/realtime connection
    # silently failing for every visitor because this was never
    # substituted for the real domain.
    sed -i.bak \
      -e "s#^NEXT_PUBLIC_BACKEND_SOCKET_URL=.*#NEXT_PUBLIC_BACKEND_SOCKET_URL=https://${DOMAIN}#" \
      frontend/.env.local
    rm -f frontend/.env.local.bak
    echo "    created, NEXT_PUBLIC_BACKEND_SOCKET_URL set to https://${DOMAIN}"
    echo "    (nginx's own /socket.io/ location routes it to the backend)"
  else
    echo "    created from .env.example (defaults already point at the"
    echo "    backend on this same host - no edit needed for local dev)"
  fi
fi
echo

# ─── 4. mcp-gateway/.env ─────────────────────────────────────────────────────
echo "==> mcp-gateway/.env"
if [ -f mcp-gateway/.env ]; then
  echo "    already exists, leaving it alone"
else
  cp mcp-gateway/.env.example mcp-gateway/.env
  # must be the literal same value as backend's MCP_INTERNAL_SECRET - see
  # mcp-gateway/README.md, "Why apiKeyVerify, and why public"
  sed -i.bak \
    -e "s#^APPOINTMENTS_MCP_INTERNAL_SECRET=.*#APPOINTMENTS_MCP_INTERNAL_SECRET=${MCP_INTERNAL_SECRET}#" \
    ${GATEWAY_URL:+-e "s#^GATEWAY_URL=.*#GATEWAY_URL=${GATEWAY_URL}#"} \
    ${ACCOUNT_API_KEY:+-e "s#^ACCOUNT_API_KEY=.*#ACCOUNT_API_KEY=${ACCOUNT_API_KEY}#"} \
    ${APPOINTMENTS_EDIT_KEY:+-e "s#^APPOINTMENTS_EDIT_KEY=.*#APPOINTMENTS_EDIT_KEY=${APPOINTMENTS_EDIT_KEY}#"} \
    mcp-gateway/.env
  rm -f mcp-gateway/.env.bak
  echo "    created, APPOINTMENTS_MCP_INTERNAL_SECRET matched to backend's"
  if [ -z "${ACCOUNT_API_KEY:-}" ]; then
    echo "    !! still needs ACCOUNT_API_KEY filled in by hand, then:"
    echo "       cd mcp-gateway && ./register.sh && ./push.sh"
  else
    echo "    ACCOUNT_API_KEY set from .env.production - run"
    echo "       cd mcp-gateway && ./register.sh && ./push.sh"
    echo "    once this platform isn't registered yet"
  fi
fi
echo

# ─── 5. postgres ─────────────────────────────────────────────────────────────
# explicit -p so this always reuses the same project/container/volume
# regardless of what directory this gets invoked from - never spins up a
# second, differently-named postgres for the same app.
echo "==> Postgres (docker compose, backend/docker-compose.yml)"
(cd backend && docker compose -p appointments-app up -d)
echo -n "    waiting for it to accept connections"
for i in $(seq 1 24); do
  if (cd backend && docker compose -p appointments-app exec -T postgres pg_isready -U slotbook) >/dev/null 2>&1; then
    echo " ok"
    break
  fi
  [ "$i" -eq 24 ] && { echo; echo "postgres did not come up in time" >&2; exit 1; }
  echo -n "."
  sleep 2
done
echo

# ─── 5b. seed demo tenants/admin/appointments on a genuinely fresh db ──────
# npm ci + prisma generate/migrate here too (not left purely to deploy.sh)
# because seeding needs a generated client and an applied schema to run
# against at all - both are themselves idempotent (npm ci reconciles
# node_modules to the lockfile; migrate deploy only applies pending
# migrations), so re-running this alongside deploy.sh's own later copy of
# the same two commands is harmless, never duplicate work that breaks.
echo "==> Seed data (demo tenants, admin, services, slots, bookings)"
# as the real deploy user, not root - otherwise node_modules/the
# generated prisma client end up root-owned and ./deploy.sh (run later as
# that regular user, no sudo) can't even rmdir its own node_modules/.bin
# on its own next npm ci. found for real on the first live server run.
(cd backend && run_as_deploy_user npm ci && run_as_deploy_user npx prisma generate && run_as_deploy_user npx prisma migrate deploy)
EXISTING_PLATFORMS="$(cd backend && run_as_deploy_user npx prisma db execute --stdin <<< "SELECT count(*) FROM \"Platform\";" 2>/dev/null | grep -oE '[0-9]+' | tail -1 || echo "0")"
if [ "${EXISTING_PLATFORMS:-0}" -gt 0 ]; then
  echo "    db already has data ($EXISTING_PLATFORMS platform(s)) - skipping seed"
else
  (cd backend && run_as_deploy_user npm run prisma:seed)
  echo "    seeded: demo clinic/salon/consultant tenants + one suspended"
  echo "    platform, the admin account, services, a week of slots, and"
  echo "    the seed script's own sample bookings - every login it printed"
  echo "    above uses password123."
fi
echo

# everything this script creates (.env files, node_modules, the generated
# prisma client) must end up owned by the real deploy user, not root -
# run_as_deploy_user already keeps npm/npx from creating root-owned files
# going forward, but the .env files themselves were written earlier in
# this same script, before DEPLOY_USER existed as a concept, by whichever
# user actually ran this (root, under sudo). harmless no-op when this
# wasn't run via sudo at all.
if [ "$(whoami)" != "$DEPLOY_USER" ]; then
  chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$SCRIPT_DIR"
fi

if [ "$HAS_APT" -eq 0 ]; then
  echo "==> Skipping nginx/TLS (not the target server) - done."
  echo "Run ./deploy.sh next to actually build and start the app."
  exit 0
fi

# ─── 6. nginx + TLS ──────────────────────────────────────────────────────────
echo "==> nginx site for $DOMAIN"
if [ -f "$CERT_PATH" ]; then
  echo "    cert already exists, installing the full config directly"
  cp "$NGINX_SITE_SRC" "$NGINX_AVAILABLE"
  ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  nginx -t
  systemctl reload nginx
else
  echo "    no cert yet - installing an http-only block first so certbot"
  echo "    can complete the challenge, then letting certbot add TLS"
  cat > "$NGINX_AVAILABLE" <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:6411;
        include proxy_params;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
  ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  # validates the WHOLE nginx config, every other site included - if
  # anything here is wrong, this fails and nginx keeps serving the old,
  # already-working config for every other domain. never a forced reload.
  nginx -t
  systemctl reload nginx

  if certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos \
      --register-unsafely-without-email; then
    # cert now exists at the standard path this repo's own config file
    # already hardcodes - install the real, canonical, committed config
    # (with the https block) instead of the http-only stand-in above.
    cp "$NGINX_SITE_SRC" "$NGINX_AVAILABLE"
    nginx -t
    systemctl reload nginx
    echo "    TLS issued, full config live"
  else
    echo "    !! certbot failed - DNS for $DOMAIN probably isn't pointed"
    echo "       at this server yet. The http-only block is still live"
    echo "       (nothing else was touched); fix DNS and re-run ./setup.sh"
    echo "       to pick up where this left off."
  fi
fi
echo

# ─── 7. pm2 survives a reboot ────────────────────────────────────────────────
echo "==> pm2 startup"
pm2 startup -s || echo "    (if this printed a command above, run it once by hand)"
echo

echo "==> Setup done. Only $NGINX_AVAILABLE / $NGINX_ENABLED were"
echo "    touched - every other site's nginx config is untouched."
echo
echo "Still needs a human:"
echo "    - fill in backend/.env's AI_GATEWAY_API_KEY, if setup.sh had to generate it"
echo "    - mint mcp-gateway/.env's ACCOUNT_API_KEY, then"
echo "      cd mcp-gateway && ./register.sh && ./push.sh"
echo "    - confirm DNS for $DOMAIN points here, if the TLS step above"
echo "      had to skip"
echo "    - run ./deploy.sh to actually build and start the app"
