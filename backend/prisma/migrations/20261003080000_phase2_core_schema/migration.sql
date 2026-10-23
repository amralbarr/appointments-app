-- phase 2 core schema: roles, platform profile + suspension, platform-scoped
-- api keys, denormalized booking.platformId + the second conflict index,
-- and the chat tables. hand-written, same reason as both existing
-- migrations in this project: prisma migrate dev refuses to run
-- non-interactively past the data-loss warning on Booking.platformId
-- (required column, backfilled from existing rows) — see docs/DATA-MODEL-V2.md
-- "Migration notes".

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- AlterTable: User gets a role, defaulting every existing row to OWNER
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'OWNER';

-- AlterTable: Platform gets public profile fields + the suspension flag
ALTER TABLE "Platform" ADD COLUMN "description" TEXT;
ALTER TABLE "Platform" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Platform" ADD COLUMN "coverImageUrl" TEXT;
ALTER TABLE "Platform" ADD COLUMN "address" TEXT;
ALTER TABLE "Platform" ADD COLUMN "phone" TEXT;
ALTER TABLE "Platform" ADD COLUMN "businessHoursText" TEXT;
ALTER TABLE "Platform" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: ApiKey becomes platform-scopable (null = unrestricted, same
-- behavior every key issued before this column existed keeps having)
ALTER TABLE "ApiKey" ADD COLUMN "platformId" TEXT;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: ChatConversation
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ChatMessage
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatConversation_platformId_customerEmail_idx" ON "ChatConversation"("platformId", "customerEmail");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Booking.platformId — denormalized from slot.platformId, same
-- backfill-then-NOT-NULL sequencing the booking_cancel_token migration
-- already established for exactly this situation (a required column added
-- to a table that may already have rows).
ALTER TABLE "Booking" ADD COLUMN "platformId" TEXT;
UPDATE "Booking" b SET "platformId" = s."platformId" FROM "Slot" s WHERE b."slotId" = s."id";
ALTER TABLE "Booking" ALTER COLUMN "platformId" SET NOT NULL;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Booking_platformId_customerEmail_idx" ON "Booking"("platformId", "customerEmail");

-- the second conflict guard — same mechanism as one_active_booking_per_slot
-- (see the init migration + docs/CONCURRENCY.md), applied to a different
-- pair of columns: one CONFIRMED booking per (platform, customer), not per
-- slot. a cancelled row drops out of this index too, so cancelling always
-- re-opens both the slot AND the customer's ability to book again.
CREATE UNIQUE INDEX "one_active_booking_per_customer" ON "Booking"("platformId", "customerEmail") WHERE "status" = 'CONFIRMED';
