# ADR-001: How platform-scoped API key enforcement threads through the existing auth stack

**Status:** Accepted

## Decision

`DATA-MODEL.md` decides *that* an `ApiKey` becomes platform-scopable
(`ApiKey.platformId`, nullable) and *that* every owner-scoped query must
honor it. It doesn't specify the concrete mechanism for getting that
restriction from "the key presented on this HTTP request" to "the specific
`PlatformsService.getOwned()` call this request eventually makes," across
five existing modules. This ADR specifies that mechanism, since a
different implementer could reasonably choose a different one (a separate
guard, a decorator-based scope check, a middleware), and the choice
materially affects how many existing files this change touches.

**Chosen approach: extend the existing `AuthenticatedUser` shape and thread
an optional `platformId` through the same path `scopes` already travels.**

1. `AuthenticatedUser` (`common/decorators/current-user.decorator.ts`)
   gains an optional field: `platformId?: string`.
2. `ApiKeysService.verify()` returns it alongside `userId`/`scopes` (the
   key's own `platformId` column, `undefined` if null).
3. `AuthGuard`'s API-key branch copies it onto `request.user` exactly like
   `scopes` already is.
4. `AuthGuard`'s JWT branch reads it from a new optional `platformId` claim
   on the JWT payload (only ever present on a JWT minted via
   `AuthService.issueScopedAccessToken()` for the MCP-verify path — a
   normal human-login JWT never carries one, meaning a logged-in owner's
   own session is never platform-restricted, only a delegated key can be).
5. `AuthService.issueScopedAccessToken()` and `McpController.verify()` both
   gain the parameter needed to carry it through to the minted JWT.
6. `PlatformsService.getOwned(ownerId, platformId, callerPlatformId?)`
   gains a third parameter: when present and it doesn't match the
   requested `platformId`, this throws the exact same `NotFoundException`
   as a non-owner would get — no new error shape, no new status code.
7. Every existing call site that currently calls `getOwned` (or an
   equivalent owner-scoped query) is updated to pass `user.platformId`
   through: `PlatformsController`, `ServicesService`, `SlotsService`,
   `BookingsService.listForPlatform`, and the chat-log read endpoints.
8. `PlatformsController.list()` (today: "every platform this owner owns")
   additionally filters to just the one platform when the calling key is
   scoped, so a scoped key's "list my platforms" view can't even enumerate
   the existence of the owner's other platforms.

## Why this approach

- **Reuses the exact mechanism `scopes` already uses**, rather than
  inventing a parallel one. Anyone who already understands how `scopes`
  flows from a key through `AuthGuard` to `ScopesGuard` already understands
  how `platformId` flows too — same shape, same guard, one more field.
- **The 404-not-403 posture extends naturally.** `getOwned()` is already
  the single method every ownership check funnels through
  (`ARCHITECTURE.md`'s own stated design); adding one more constraint to
  the one method that already centralizes this is far less invasive than
  introducing a second enforcement layer that would need to agree with the
  first one everywhere.
- **No new guard class.** A separate `PlatformScopeGuard` was considered
  and rejected: it would need the exact same `request.user` state anyway,
  and splitting "does this key belong to the right user" (today's
  `AuthGuard`) from "does this key's platform restriction match the
  requested platform" (a hypothetical new guard) across two files makes it
  easier for a future change to update one and forget the other.

## Consequences

- Every module that currently calls `getOwned` needs a small, mechanical
  signature-and-call-site update — more files touched than a more
  surgical approach might need, but each change is a one-line addition,
  not a rewrite.
- A normal human-login JWT never carries `platformId` at all (step 4
  above) — meaning platform-scoping is, by this design, exclusively an
  API-key-delegation concept, never something a logged-in human session
  itself can be restricted by. This matches every root doc's framing of
  platform-scoped keys as being specifically for a delegated/automated
  caller, never for the owner's own interactive session.
