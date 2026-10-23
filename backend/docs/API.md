# API

Base path `/api/v1`. JSON in, JSON out. OpenAPI generated from
`@nestjs/swagger` decorators on the actual DTOs — never a hand-maintained
spec file living separately from the code it describes — served at
`/docs` (Swagger UI) and `/docs-json` (raw spec, what the MCP gateway's own
tool schemas should stay consistent with by hand, see
`MCP-INTEGRATION.md`).

## Auth

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /auth/register | none | email + password |
| POST | /auth/login | none | returns access token, sets refresh cookie |
| POST | /auth/refresh | refresh cookie | rotates both tokens |
| POST | /auth/logout | jwt | clears refresh cookie |
| GET | /auth/api-keys | jwt | list own keys (never returns the raw key again) |
| POST | /auth/api-keys | jwt | create a key, raw value returned once |
| DELETE | /auth/api-keys/:id | jwt | revoke |
| POST | /auth/mcp/verify | internal | see `MCP-INTEGRATION.md` |

## Platforms

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /platforms | jwt or api key | create, caller becomes owner |
| GET | /platforms | jwt or api key | only the caller's own |
| GET | /platforms/public | none | public listing - `isActive:true` only, `?search=` substring match on name, no owner-only fields. The `/list` page's data source (`docs/FRONTEND-ARCHITECTURE.md`) |
| GET | /platforms/public/:slug | none | public detail lookup by slug - same `isActive:true` filter, same public-field shape; 404 (not a distinguishing error) for both a nonexistent slug and a suspended one. The `/[slug]` page's data source |
| GET | /platforms/:id | jwt or api key (owner) | 404 if not owner |
| PATCH | /platforms/:id | jwt or api key (owner) | name/timezone/description/logoUrl/coverImageUrl/address/phone/businessHoursText/nameAr/descriptionAr/businessHoursTextAr/workingDays/openTime/closeTime - not `isActive`, that's admin-only below |

## Admin (phase 2 - `role: ADMIN` only, see `docs/ROLES-AND-DASHBOARDS.md`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /admin/platforms | jwt, `role: ADMIN` | every platform regardless of owner, including suspended ones |
| POST | /admin/platforms | jwt, `role: ADMIN` | create a tenant (user + platform) on someone's behalf; response includes `initialPassword` if the owner email didn't already have an account - shown exactly once |
| PATCH | /admin/platforms/:id/status | jwt, `role: ADMIN` | `{ isActive }` - suspend/reactivate, a flag flip, never a delete |

An API key can never satisfy `role: ADMIN`, even one belonging to a user
whose own role is `ADMIN` - the JWT-only `role` claim is deliberate, see
`AUTH-AND-API-KEYS.md`.

## Chat (phase 2 - the AI booking assistant, see `docs/AI-BOOKING-ASSISTANT.md`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /platforms/:platformId/chat | none | talk to a platform's AI booking assistant; `{ customerEmail, message }` -> `{ reply }`. Same 10/min/ip throttle tier as the booking write endpoints |
| GET | /platforms/:platformId/chat-conversations | jwt or api key (owner) | every customer conversation this platform's assistant has had |
| GET | /platforms/:platformId/chat-conversations/:conversationId/messages | jwt or api key (owner) | full message history for one conversation, including tool calls + results |

The chat backend calls `ServicesService`/`SlotsService`/`BookingsService`
directly, in-process - no API key, no MCP gateway round-trip. See
"Why in-process, not the gateway" in `docs/AI-BOOKING-ASSISTANT.md`.

## Services

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /platforms/:id/services | jwt or api key (owner) | |
| POST | /platforms/:id/services | jwt or api key (owner) | name + durationMinutes |
| PATCH | /platforms/:id/services/:serviceId | jwt or api key (owner) | |
| DELETE | /platforms/:id/services/:serviceId | jwt or api key (owner) | blocked if it has future slots |

## Slots

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /platforms/:id/slots | **none** | public availability view; `?serviceId=&from=&to=&onlyOpen=true` |
| GET | /platforms/:id/slots/:slotId | none | |
| POST | /platforms/:id/slots | jwt or api key (owner) | create one fixed slot |
| DELETE | /platforms/:id/slots/:slotId | jwt or api key (owner) | only if it has no confirmed booking |

Slots are public reads on purpose — a would-be customer needs to see
availability before they have any credential at all.

## Bookings

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /platforms/:id/slots/:slotId/bookings | none | the one write a customer makes directly; name + email, response includes `cancelToken` |
| DELETE | /bookings/:bookingId | none, requires `?cancelToken=` match | cancel own booking — see note below |
| GET | /bookings/:bookingId | none, requires `?cancelToken=` match | look up a confirmation |
| GET | /platforms/:id/bookings | jwt or api key (owner) | full history for the owner, `?status=` |

Cancelling without a login is matched against a `cancelToken` — a random
value generated at booking time, returned exactly once in the create
response, stored only as a hash (`Booking.cancelTokenHash`, same sha256
pattern as api keys). Not `customerEmail`: an email is routinely guessable
or even public (a business card, a mailing list), so it was never actually
a secret to gate a destructive action on — an earlier version of this API
did exactly that, and it was wrong. Losing the token means the platform
owner has to cancel it for the customer; there's no recovery flow, same
tradeoff as losing an api key.

`cancelToken` is a query param on both the DELETE and the GET lookup, not a
body field — found out the hard way that the MCP gateway's engine never
forwards a body on DELETE/GET regardless of what a tool schema declares
(only POST/PATCH), so a body-based design would have silently dropped this
field for every MCP caller. Query param is also just more conventional for
a DELETE anyway.

## Error shape

Every error response, regardless of status code:

```json
{
  "statusCode": 409,
  "error": "CONFLICT",
  "message": "This slot was just booked by someone else.",
  "path": "/api/v1/platforms/abc/slots/xyz/bookings"
}
```

One global exception filter produces this for both Nest's own HTTP
exceptions and the one domain-specific case (`ConflictException` from the
booking race, see `CONCURRENCY.md`). Validation failures (`class-validator`
on the DTOs) get the same shape with `message` as an array of per-field
problems instead of a single string.

| Status | When |
|---|---|
| 400 | DTO validation failure |
| 401 | missing/invalid credential |
| 403 | valid credential, wrong scope |
| 404 | resource doesn't exist, or exists but caller doesn't own it |
| 409 | slot already booked (the one that actually matters) |
