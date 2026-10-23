# Roles, auth, and the two dashboards

## Two roles, one login

`User.role` (`DATA-MODEL-V2.md`): `OWNER` (default — today's only role,
a tenant who runs their own platform) or `ADMIN` (can see and manage
every platform, not just their own). One login form, one
`POST /auth/login`, same JWT shape as phase 1 — the only change is the
JWT payload now carries `role`, and a new `AdminGuard` checks it.

```ts
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.role !== 'ADMIN') throw new ForbiddenException('Admin only.');
    return true;
  }
}
```

An admin is created once, by hand (a seed script or a direct DB update —
same "no self-service path to becoming an admin" posture as any other
project; nobody registers their way into that role).

## Tenant dashboard (`role: OWNER`, must own the platform being edited)

Everything here is the existing owner-scoped phase-1 API, just with a UI
in front of it — no new backend routes except where noted.

| Page | Backend calls |
|---|---|
| Edit profile | `PATCH /platforms/:id` — extended to accept the new profile fields (`description`, `logoUrl`, `coverImageUrl`, `address`, `phone`, `businessHoursText`) from `DATA-MODEL-V2.md` |
| Services | existing `GET`/`POST`/`PATCH`/`DELETE /platforms/:id/services` |
| Slots | existing `GET`/`POST`/`DELETE /platforms/:id/slots` |
| Bookings | existing `GET /platforms/:id/bookings` |
| Chat logs | **new** — `GET /platforms/:id/chat-conversations` + `GET .../chat-conversations/:conversationId/messages`, owner-scoped the same way bookings already are, so a tenant can see what their AI assistant has been telling customers |

A tenant can only ever act on a platform they own —
`PlatformsService.getOwned()` already enforces this everywhere; nothing
new to build there, just more pages calling into it.

## Admin dashboard (`role: ADMIN`)

| Page | Backend calls |
|---|---|
| All platforms | **new** `GET /admin/platforms` — every platform regardless of owner, including suspended ones |
| Create a tenant | **new** `POST /admin/platforms` — creates a `User` (if the email doesn't already have one) + a `Platform` owned by them |
| Suspend / reactivate | **new** `PATCH /admin/platforms/:id/status` — flips `isActive`, no soft-delete, no data loss, same reasoning as api-key revocation in phase 1 (a flag, not a destructive action) |

All three are genuinely new routes, guarded by `AdminGuard` on top of the
normal `AuthGuard`/`ScopesGuard` chain — not a reuse of the owner-scoped
`PlatformsController`, since "every platform" and "one platform I own" are
different enough queries that forcing them through the same controller
would mean sprinkling `if (isAdmin)` branches through code that's
currently simple specifically because it never has to ask that question.
A separate `AdminController` keeps that branch at the routing layer
instead, where it belongs.

## What happens to a suspended platform

- Its public page (`/[slug]`) and its row on `/list` disappear — the new
  public `GET /platforms/public` endpoint (`FRONTEND-ARCHITECTURE.md`)
  filters to `isActive: true` only.
- `PlatformsService.getOwned()` still finds it for its own owner (so they
  can see *why* — a "this platform is suspended, contact support" state
  in the tenant dashboard, not a confusing 404) but every other owner
  -scoped action stays blocked by whatever the dashboard UI chooses to
  show for that state. The API itself doesn't need a special suspended
  -specific status code — a suspended platform simply isn't `isActive`,
  and each read path decides what that means for its own response.
- Existing bookings aren't touched — suspension stops *new* public
  activity, it isn't a data-destroying action.
