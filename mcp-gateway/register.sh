#!/usr/bin/env bash
# one-time step to register this platform on the shared mcp-gateway, before
# push.sh/pull.sh can touch it. copied from the same pattern another
# platform in this workspace already uses against the same gateway - see
# README.md.
#
# usage: ./register.sh [public|private]  (defaults to public - see README.md)

set -euo pipefail
cd "$(dirname "$0")"

VISIBILITY="${1:-public}"
FILE="configs/appointments.yaml"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${GATEWAY_URL:?set GATEWAY_URL in .env}"
: "${ACCOUNT_API_KEY:?set ACCOUNT_API_KEY in .env, a personal key from /admin/account}"
: "${APPOINTMENTS_AUTH_JSON:?set APPOINTMENTS_AUTH_JSON in .env (this platforms auth block as json)}"

BASE_URL=$(grep -m1 '^baseUrl:' "$FILE" | sed 's/^baseUrl: *//; s/ *#.*//; s/^"//; s/"$//')
NAME=$(grep -m1 '^name:' "$FILE" | sed 's/^name: *//; s/#.*//; s/[[:space:]]*$//; s/^"//; s/"$//')

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

echo "Registering \"appointments\" (${VISIBILITY}) at ${BASE_URL} ..."
curl -sf -H "Authorization: Bearer ${ACCOUNT_API_KEY}" -H "Content-Type: application/json" \
  -d "{\"id\":\"appointments\",\"name\":\"$(json_escape "$NAME")\",\"baseUrl\":\"$(json_escape "$BASE_URL")\",\"auth\":${APPOINTMENTS_AUTH_JSON},\"visibility\":\"${VISIBILITY}\"}" \
  "${GATEWAY_URL}/admin/api/platforms"
echo
echo "Registered with zero tools so far. Next:"
echo "  1. Mint an edit key from ${GATEWAY_URL}/admin/platforms/appointments/edit"
echo "  2. Add it to .env as APPOINTMENTS_EDIT_KEY"
echo "  3. ./push.sh - uploads the full tools: list from configs/appointments.yaml"
