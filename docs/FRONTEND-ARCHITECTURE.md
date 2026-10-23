# Frontend: Next.js app

## Stack

Next.js (App Router), TypeScript, Tailwind CSS — a well-trodden, boring
combination, deliberately. `framer-motion` + `lucide-react` for the chat
widget specifically (see `AI-BOOKING-ASSISTANT.md`); the rest of the UI
doesn't need animation-library weight it isn't already paying for.

Socket.IO client for the realtime slot updates phase 1's backend already
emits (`docs/REALTIME.md`) — the tenant page's slot picker listens for
`slot.booked`/`slot.cancelled` the same way the backend doc always
intended a real UI to.

## The BFF pattern

The frontend never holds a credential of its own and never calls the
backend directly from the browser. Every browser request goes to a
Next.js API route, which:

- for public reads (tenant list, tenant page, slot availability) — just
  proxies straight through, no auth needed, matching the backend's own
  public endpoints.
- for tenant-dashboard and admin-dashboard calls — reads a tenant's or
  admin's JWT out of an httpOnly cookie and forwards it as
  `Authorization: Bearer`, so client components never touch the token
  directly, via a single `app/api/dashboard/[...path]/route.ts` catch-all.
- `app/api/auth/login/route.ts` — calls the backend's real
  `POST /auth/login`, sets the httpOnly cookie from the response. One
  login route serves both tenant owners and admins; the dashboard a user
  lands on after login is decided by `role` in the JWT, not by which
  login form they used.

```
frontend/src/app/
  (public)/
    list/page.tsx                 -> GET /platforms (public listing — see note below)
    [slug]/page.tsx                -> tenant page: profile + services + slot picker + chat widget
  (dashboard)/
    dashboard/
      layout.tsx                   -> tenant-only guard (role check happens in (admin) instead)
      page.tsx                     -> edit own platform profile
      services/page.tsx            -> manage services
      slots/page.tsx                -> list + create slots one at a time (not actually
                                          bulk - scoped narrower than this tree's
                                          original wording implied)
      bookings/page.tsx             -> booking history for this platform
      chat-logs/page.tsx            -> this platform's ChatConversation history
  (admin)/
    admin/
      layout.tsx                    -> ADMIN-role guard
      page.tsx                       -> all platforms, suspend/activate
      tenants/new/page.tsx            -> create a platform on someone's behalf
  login/page.tsx                    -> one login form, role-based redirect after
  api/
    auth/login/route.ts
    auth/logout/route.ts
    dashboard/[...path]/route.ts     -> BFF proxy, tenant-scoped (role OWNER)
    admin/[...path]/route.ts          -> BFF proxy, admin-scoped (role ADMIN, separate so a
                                          stolen tenant cookie can never reach admin routes)
    chat/route.ts                     -> proxies to the new chat endpoint, see AI-BOOKING-ASSISTANT.md
    public/platforms/route.ts          -> the /list page's data source
    public/platforms/[slug]/route.ts   -> the [slug] page's data source
    public/slots/[platformId]/route.ts                            -> live slot picker (client-side)
    public/slots/[platformId]/[slotId]/bookings/route.ts           -> the manual booking form
    public/bookings/[bookingId]/route.ts                            -> booking lookup/cancel by token
```

The last three weren't in this tree's original listing — added once
building the manual booking form and the live slot picker made clear
they needed the same public-proxy treatment as the two routes above,
per this doc's own "every browser request goes through a Next.js
route" rule.

**Public listing note:** phase 1's `GET /platforms` is owner-scoped (jwt
or api key, "only the caller's own" — see `docs/API.md`). The `/list`
page needs a genuinely public endpoint instead —
`GET /platforms/public?search=` returning only `isActive: true` platforms
with their public profile fields (name, slug, description, logoUrl), no
owner-only data. New backend route, not a reuse of the existing one; the
existing one keeps its current owner-scoped meaning unchanged.

## Route groups split by trust boundary

`(public)`, `(dashboard)`, `(admin)` — three parenthesized groups, each
with its own `layout.tsx` doing the access check for that group (tenant
dashboard checks for a valid cookie + `role: OWNER` and that the JWT's
user actually owns the platform being edited; admin checks `role: ADMIN`).
Splitting the two authenticated areas into separate route groups (rather
than one dashboard with conditional admin sections) is deliberate: a
compromised tenant session should have zero path to admin routes, not a
hidden nav item that happens to 403.

## i18n / RTL

RTL is handled via logical CSS properties throughout (`start-*`/`end-*`,
never `left-*`/`right-*` mixed in — a genuinely easy bug class to
reintroduce by accident in any one new component, worth a second look
whenever a layout uses a hardcoded side). Phase 2's site chrome (nav,
buttons, dashboard labels, the chat widget's own strings) follows the
same convention. A tenant's own
content (`description`, `businessHoursText`) is stored and shown exactly
as the tenant typed it — not translated, not assumed to be one language
or the other.

## What's explicitly simple here, on purpose

- No SSR data-fetching complexity beyond what a public listing/profile
  page needs (these are cacheable, mostly-static pages — `revalidate`
  on a short interval, not a bespoke real-time SSR pipeline).
- No component library beyond Tailwind + a handful of hand-built
  primitives (card, button, input) — rolling these by hand instead of
  pulling in MUI/shadcn wholesale, since a booking UI this size doesn't
  need more than that.
- The booking form itself (`AI-BOOKING-ASSISTANT.md` covers the AI path)
  is plain: service picker -> slot picker (live via the public
  `GET /platforms/:id/slots` endpoint, already built) -> name/email form
  -> `POST .../bookings` -> show the `cancelToken` + a "save this" nudge,
  identical to what a script testing the API already does today, just
  with a UI around it.
