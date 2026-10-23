# Realtime

Socket.IO, one gateway, one namespace (`/realtime`). Clients join a room per
platform:

```ts
socket.emit('join', { platformId });
```

The gateway checks the join against the same auth as everything else
(jwt or api key — a platform owner watching their own dashboard, or an
anonymous customer-facing page just watching one platform's slots flip from
open to booked doesn't need any credential at all, since slot
availability is already a public read per `API.md`). Join is unauthenticated
for read-only room membership; nothing is ever emitted to a room that
reveals anything beyond what `GET /platforms/:id/slots` already exposes
publicly.

## Events

| Event | Payload | When |
|---|---|---|
| `slot.booked` | `{ slotId, platformId, bookedAt }` | after a booking commits |
| `slot.cancelled` | `{ slotId, platformId, cancelledAt }` | after a cancellation commits |

No payload field beyond what's needed to tell a listening client "go
re-fetch this slot" — not leaking customer name/email over the socket to
every room member, even though the REST endpoint that reveals that detail
is already owner-only.

## Ordering: emit after commit, not before

The emit happens from inside the booking/cancel service method, after the
Prisma call has actually resolved successfully — not optimistically before
it, and not from the controller. If the insert fails with a 409 (the whole
point of `CONCURRENCY.md`), nothing goes out over the socket for that
attempt. A client that only trusts socket events should never see a
"booked" event for a booking that didn't actually happen.

## What this isn't

Not a full realtime sync layer, no presence, no typing indicators, no
reconnect-and-replay-missed-events buffer. A client that was disconnected
when an event fired just re-fetches `GET /platforms/:id/slots` on reconnect
— the socket is a nudge to refetch, not the source of truth itself.
