#!/usr/bin/env bash
# uploads configs/appointments.yaml, replacing the live config on the
# shared gateway immediately - no gateway redeploy needed. only updates a
# platform that already exists; run register.sh first if it doesn't.

set -euo pipefail
cd "$(dirname "$0")"

FILE="configs/appointments.yaml"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${GATEWAY_URL:?set GATEWAY_URL in .env}"
# the gateway's own requireConfigEditAccess accepts EITHER a
# platform-specific edit key OR the owning account's personal
# ACCOUNT_API_KEY (checked by platform ownership, not by key type) - so
# one account key already works across every platform that account owns,
# no separate edit key needed per platform. Prefer it when set.
KEY="${ACCOUNT_API_KEY:-${APPOINTMENTS_EDIT_KEY:?set ACCOUNT_API_KEY or APPOINTMENTS_EDIT_KEY in .env}}"

RENDERED="$(mktemp)"
trap 'rm -f "$RENDERED"' EXIT
cp "$FILE" "$RENDERED"

# forces id: to match the filename, same as every other platform in this
# workspace does - makes drift physically impossible instead of a
# manual-edit footgun.
sed -i.bak "s/^id:.*/id: appointments/" "$RENDERED" && rm -f "$RENDERED.bak"

curl -sf -H "Authorization: Bearer ${KEY}" \
  --data-binary @"$RENDERED" -X PUT \
  "${GATEWAY_URL}/admin/api/platforms/appointments/config"

echo
echo "Pushed ${FILE} live to \"appointments\"."
