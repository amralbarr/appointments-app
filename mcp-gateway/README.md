# This app's MCP config - sync only, no gateway code here

The actual gateway (tool engine, auth strategies, admin UI, database) is a
separate shared service - nothing platform-specific runs from this folder.
This is just this app's own copy of its config, kept in git for review
history, synced to the gateway's live database via `push.sh`/`pull.sh`.
Full design reasoning is in `../docs/MCP-INTEGRATION.md`; this file is just
the "how to actually run it" counterpart.

## Files

- **`configs/appointments.yaml`** - the whole tool list + auth strategy.
  Edit this, then `push.sh` to make it live - no gateway redeploy needed.
- **`register.sh [public|private]`** - one-time step before `push.sh`/
  `pull.sh` can touch a platform that doesn't exist on the gateway yet.
- **`push.sh`** - uploads `configs/appointments.yaml`, replacing the live
  config immediately.
- **`pull.sh`** - downloads the live config to `configs/appointments.yaml.pulled`
  for review (never auto-merges - see the comment at the top of the script).
- **`.env`** (gitignored, copy `.env.example`) - every key these scripts need.

## Workflow

```bash
cp .env.example .env            # fill in GATEWAY_URL + ACCOUNT_API_KEY first
./register.sh                   # one-time, registers as a public platform
vim configs/appointments.yaml   # add/edit tools
./push.sh                       # live immediately
git add configs/appointments.yaml && git commit
```

## One account key edits every platform that account owns

`push.sh`/`pull.sh` use `ACCOUNT_API_KEY` if it's set (falling back to the
narrower, single-platform `APPOINTMENTS_EDIT_KEY` only if it isn't) -
confirmed directly against the gateway's own source
(`src/admin/session-auth.ts`'s `requireConfigEditAccess`): it accepts
either a platform-specific edit key, or a personal account-level key
belonging to that platform's actual owner. If the same real account
registers multiple platforms on this gateway (e.g. this one and another
platform you run), one `ACCOUNT_API_KEY` already authenticates `push.sh`/`pull.sh`
for all of them - no need to separately mint and track an edit key per
platform. `APPOINTMENTS_EDIT_KEY` still works and stays supported, for a
narrower credential handed to someone who shouldn't have full account
access.

## Why `apiKeyVerify`, and why public

Every MCP call carries the caller's own `sk_live_...` key. The gateway
POSTs it to this app's `/auth/mcp/verify` (guarded by `x-internal-secret`
matching `MCP_INTERNAL_SECRET`), gets back `{ userId, scopes, accessToken }`,
and forwards `accessToken` as the real bearer token to every tool call after
that - so the gateway itself never needs to know this app's users exist,
and this app's own ownership checks (the same `getOwned()` every other
caller goes through) are the entire tenancy boundary.

Because that verify step already resolves a real, backend-checked identity
on every call, a second gateway-level credential on top of it would gate
nothing extra - that's why this platform is registered `public` rather than
`private`.

`APPOINTMENTS_MCP_INTERNAL_SECRET` here must be the literal same value as
`MCP_INTERNAL_SECRET` in the main app's own `.env` - these are never
substituted independently.

## Getting a key to actually call a tool with

A user generates their own `sk_live_...` key from `POST /auth/api-keys`
(see `../docs/AUTH-AND-API-KEYS.md`), or via `npm run mcp:generate-key --
<email>` for a quick local one. That's the only credential needed - point
an MCP client at the gateway's `/mcp/appointments` endpoint with it.
