# Auth: humans and machines

Two credential types, one identity model underneath. Whoever's calling
either way resolves to a `userId` + a set of scopes, and everything
downstream (platform ownership checks, etc.) doesn't care which path got it
there.

## Human login

Standard email/password:

- `passwordHash` via bcrypt, never plaintext, never reversible.
- Access token: JWT, short-lived (15 min), sent as `Authorization: Bearer`.
- Refresh token: longer-lived (7–30 days), httpOnly cookie, rotated on every
  use (`/auth/refresh` issues a new pair and invalidates the old refresh
  token — a replayed stolen refresh token stops working the moment the real
  owner refreshes once).

Nothing unusual here. It exists mainly so a platform owner can create
services/slots and look at booking history without needing an API key for
every little thing.

## API keys — the credential that matters more

An API key is how a script, a cron job, or an LLM acts as a specific user
without that user typing a password into a config file somewhere.

- Format: `sk_live_` + 32 random bytes, base62-encoded.
- Shown in full exactly once, at creation (`POST /auth/api-keys` response).
  Stored as `sha256(fullKey)` plus the first 8 characters as a lookup
  `prefix` (so verifying a key is one indexed lookup by prefix, then a hash
  comparison on that narrowed set — not a full-table hash check).
- Scopes, assigned at creation time, e.g. `["platforms:read",
  "bookings:read", "bookings:write"]`. A guard checks the required scope per
  route against the key's stored scopes — same enforcement point whether the
  caller used a password-derived JWT (which gets every scope the user has,
  implicitly) or a narrower key.
- Revocation is a `revokedAt` timestamp, not a delete — a revoked key still
  shows up in `GET /auth/api-keys` so the owner can see it existed and when
  it stopped working.
- `lastUsedAt` updated (best-effort, fire-and-forget, not blocking the
  request) on every successful verification — the only way an owner finds
  out a forgotten key is still being used somewhere.

## Verifying a key

```ts
async function verifyApiKey(rawKey: string) {
  const prefix = rawKey.slice(0, 8);
  const candidates = await prisma.apiKey.findMany({ where: { prefix, revokedAt: null } });
  const hashed = sha256(rawKey);
  const match = candidates.find(k => k.hashedKey === hashed);
  if (!match) throw new UnauthorizedException();
  return { userId: match.userId, scopes: match.scopes };
}
```

A guard (`ApiKeyGuard`) does this for any request carrying
`Authorization: Bearer sk_live_...` instead of a JWT — distinguished by
prefix before even attempting JWT verification.

This exact function is also what backs the one MCP-specific endpoint,
`POST /auth/mcp/verify` — described in `MCP-INTEGRATION.md` — which wraps it
with one extra step: mint a short-lived JWT carrying that `userId`/`scopes`
and hand that back instead of the scopes alone, because the thing calling
this endpoint (the shared MCP gateway) wants a bearer token it can forward
to every subsequent tool call, not a raw key it has to re-verify on each one.
