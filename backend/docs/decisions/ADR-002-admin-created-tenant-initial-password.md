# ADR-002: How an admin-created tenant gets an initial password

**Status:** Accepted

## Decision

`ROLES-AND-DASHBOARDS.md` specifies that `POST /admin/platforms` "creates a
`User` (if the email doesn't already have one)... owned by them" but
doesn't say how that brand-new user ever authenticates — they never typed
a password themselves, and this backend has no mailer/SMTP capability
anywhere in its stack to send one.

**Chosen approach:** `AdminPlatformsService.createForOwner()` generates a
random password (same `bcrypt` hashing path as `AuthService.register()`),
creates the `User` with it, and returns the raw generated password exactly
once, in the `201` response body alongside the created user/platform. The
response includes a note that this is the tenant's initial password and
must be relayed to them out-of-band (phone, in person, a manual email) —
there is no automated delivery.

## Why this approach

- **Matches an established convention already in this exact codebase**:
  `ApiKeysService.create()` returns a raw secret exactly once, in the
  creation response, with the same "save this now, it's gone after this"
  posture; `BookingsService.create()` does the same for `cancelToken`.
  This isn't a new pattern being introduced for one endpoint — it's the
  existing one, applied again.
- **Doesn't block this feature on building a mailer.** No email-sending
  library exists anywhere in `package.json`; requiring one to finish this
  would be a large, unrelated scope expansion. A mailer is a reasonable
  future enhancement, not a dependency of this decision.
- **Alternative considered and rejected:** have the admin supply the
  initial password themselves as a request body field. Rejected because it
  pushes a security-relevant choice (password strength) onto whoever is
  filling out an admin form, with no validation this backend could usefully
  enforce beyond what `RegisterDto` already does for self-registration —
  generating it server-side is strictly safer and costs nothing extra to
  implement.

## Consequences

- `POST /admin/platforms`'s response shape is bigger than a typical create
  response (it must include the plaintext initial password) — this is
  intentional and the DTO documents it with an explicit `@ApiProperty`
  description so it's obvious in `/docs` that this field won't appear
  again on any later read of the same user.
- The admin workflow has a real manual step (relaying the password) that a
  mailer would remove later — logged here, not silently assumed away, so a
  future "add transactional email" effort has one clear place this
  decision would need revisiting (this ADR's own `Status` line would
  change to `Superseded by ADR-00N` at that point).
