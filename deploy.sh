#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> pulling latest..."
git pull origin main

# ─── backend ────────────────────────────────────────────────────────────────
echo
echo "==> backend: install + migrate + build..."
cd backend
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
cd ..

echo
echo "==> restarting backend..."
pm2 startOrReload ecosystem.config.js --only appointments-backend --update-env

echo "    waiting for backend..."
for i in $(seq 1 24); do
  curl -sf -o /dev/null http://127.0.0.1:6410/docs-json && break
  [ "$i" -eq 24 ] && { echo "!! backend did not come up"; pm2 logs appointments-backend --lines 50 --nostream; exit 1; }
  sleep 5
done
echo "    backend ok"

# ─── mcp tools ──────────────────────────────────────────────────────────────
echo
echo "==> mcp-gateway: pushing tool config..."
# push.sh already fails with a clear message when GATEWAY_URL or the key
# var is unset - let it print that rather than replacing it with a generic
# warning. only truly soft-fail cases (gateway temporarily unreachable, not
# yet registered) reach the fallback echo; the script itself is not silent.
if ! (cd mcp-gateway && ./push.sh); then
  echo "   !! mcp-gateway push failed — check mcp-gateway/.env for"
  echo "      GATEWAY_URL and ACCOUNT_API_KEY (or APPOINTMENTS_EDIT_KEY)."
  echo "      Continuing deploy — tool config may be stale on the gateway."
fi

# ─── frontend ───────────────────────────────────────────────────────────────
echo
echo "==> frontend: install + build..."
cd frontend
npm ci
npm run build
cd ..

echo
echo "==> restarting frontend..."
# --only: the backend is already live and health-checked above — a second
# restart here would cause unnecessary downtime for active requests.
pm2 startOrReload ecosystem.config.js --only appointments-frontend --update-env

echo "    waiting for frontend..."
for i in $(seq 1 24); do
  curl -sf -o /dev/null http://127.0.0.1:6411 && break
  [ "$i" -eq 24 ] && { echo "!! frontend did not come up"; pm2 logs appointments-frontend --lines 50 --nostream; exit 1; }
  sleep 5
done
echo "    frontend ok"

pm2 save
echo
echo "==> done"
pm2 status
