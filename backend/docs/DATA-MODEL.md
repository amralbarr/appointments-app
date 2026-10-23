# Data model

Draft Prisma schema. Field names/types might shift slightly once this
actually gets written, but the shape and the constraints should hold.

```prisma
model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String
  name         String?
  createdAt    DateTime  @default(now())

  platforms    Platform[]
  apiKeys      ApiKey[]
}

model ApiKey {
  id         String    @id @default(uuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id])
  prefix     String    // first 8 chars of the key, for lookup without a full-table hash scan
  hashedKey  String    // sha256 of the full key, never the raw value
  label      String?
  scopes     String[]  // e.g. ["platforms:read", "bookings:write"]
  lastUsedAt DateTime?
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  @@index([prefix])
}

model Platform {
  id        String   @id @default(uuid())
  ownerId   String
  owner     User     @relation(fields: [ownerId], references: [id])
  name      String
  slug      String   @unique
  timezone  String   @default("UTC")
  createdAt DateTime @default(now())

  services  Service[]
  slots     Slot[]
}

model Service {
  id              String   @id @default(uuid())
  platformId      String
  platform        Platform @relation(fields: [platformId], references: [id])
  name            String
  durationMinutes Int
  createdAt       DateTime @default(now())

  slots           Slot[]
}

model Slot {
  id         String     @id @default(uuid())
  platformId String
  platform   Platform   @relation(fields: [platformId], references: [id])
  serviceId  String
  service    Service    @relation(fields: [serviceId], references: [id])
  startsAt   DateTime
  endsAt     DateTime
  createdAt  DateTime   @default(now())

  bookings   Booking[]

  @@index([platformId, startsAt])
}

model Booking {
  id              String        @id @default(uuid())
  slotId          String
  slot            Slot          @relation(fields: [slotId], references: [id])
  customerName    String
  customerEmail   String
  // sha256 of a random token shown exactly once, in the create response —
  // the real credential for cancelling/looking up this one booking.
  // customerEmail is a contact field, not a secret — see API.md.
  cancelTokenHash String        @unique
  status          BookingStatus @default(CONFIRMED)
  createdAt       DateTime      @default(now())
  cancelledAt     DateTime?

  // the actual conflict guard — see CONCURRENCY.md
  @@unique([slotId], map: "one_active_booking_per_slot")
}

enum BookingStatus {
  CONFIRMED
  CANCELLED
}
```

## The constraint that matters

`@@unique([slotId])` on `Booking` as written above is wrong on its own — it
would permanently lock a slot the first time it's ever booked, even after
cancellation, since the row still exists with `status = CANCELLED`. What's
actually needed is a **partial unique index**: unique on `slotId` only among
rows where `status = 'CONFIRMED'`. Prisma's schema syntax doesn't express a
partial index directly, so this one constraint gets added by hand in the
generated migration SQL:

```sql
CREATE UNIQUE INDEX one_active_booking_per_slot
  ON "Booking" ("slotId")
  WHERE "status" = 'CONFIRMED';
```

(Prisma migrations support a raw SQL block for exactly this — see
`CONCURRENCY.md` for why this index is the whole mechanism, not just
an optimization.)

A cancelled booking keeps its row (history, for whoever owns the platform to
look at later) rather than getting deleted. A new booking on the same slot
after a cancellation is a new row, not a resurrected one.

## Availability

Availability is derived, not stored. A slot is "open" if it has no row in
`Booking` with `status = CONFIRMED`. No `Slot.status` column, nothing to
keep in sync by hand, nothing that can drift from the booking table it's
describing. `GET /platforms/:id/slots` computes this with a left join /
`NOT EXISTS` rather than reading a cached flag.

## Seeding

`prisma/seed.ts` creates one demo user, one demo platform, two services, and
a week's worth of fixed half-hour slots for each service during business
hours. Enough to exercise every endpoint by hand without creating anything
first.
