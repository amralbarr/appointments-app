#!/usr/bin/env bash
# pulls the current live config down as configs/appointments.yaml.pulled
# for review - never overwrites the tracked file automatically. diff it,
# merge by hand, rm the .pulled file. same reasoning as every other
# platform's pull.sh in this workspace: the gateway only stores literal
# values, so an automatic merge risks corrupting unrelated text.

set -euo pipefail
cd "$(dirname "$0")"

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

OUT="configs/appointments.yaml.pulled"
curl -sf -H "Authorization: Bearer ${KEY}" \
  "${GATEWAY_URL}/admin/api/platforms/appointments/config" \
  -o "$OUT"

echo "Pulled into ${OUT}."
echo "Review: diff configs/appointments.yaml ${OUT}"
