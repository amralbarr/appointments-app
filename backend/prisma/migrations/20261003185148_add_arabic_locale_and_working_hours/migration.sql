-- bilingual (Arabic) content fields + structured working-time data, in one
-- migration per explicit instruction (fold the working-hours addition into
-- the still-unapplied Arabic-locale migration rather than ship it as a
-- second one). Both additions are additive, nullable-or-defaulted only, no
-- backfill required. Arabic is the platform's default locale going
-- forward; every existing English field keeps its current nullability
-- unchanged.
--
-- workingDays is a real Postgres enum array (WeekDay[]), not a bare
-- TEXT[] or an Int bitmask: Postgres/Prisma support a native enum-array
-- column directly, it's readable in a raw query or Prisma Studio without
-- decoding bits, and — unlike a bare TEXT[] — the DB itself now rejects
-- any value outside the real 7-day set, matching this schema's existing
-- convention of a real enum for every other fixed/closed value set
-- (UserRole/BookingStatus/ChatRole). It's NOT NULL with a DEFAULT '{}' —
-- Prisma's generated diff omits NOT NULL on list columns by default (see
-- the pre-existing ApiKey.scopes column), but every actual consumer of
-- this field expects "always an array, never null", so it's tightened
-- here. openTime/closeTime are plain nullable "HH:mm" strings, the same
-- plain-String convention this schema already uses everywhere.
--
-- note: an earlier draft of this migration also contained an unrelated
-- regenerated drop/re-add of "ApiKey_platformId_fkey" (pre-existing drift
-- between this schema's previously-unspecified onDelete default for that
-- optional relation and the hand-written ON DELETE RESTRICT in the
-- phase2_core_schema migration). That's now resolved at the schema level
-- instead of deferred again: ApiKey.platform declares `onDelete: Restrict`
-- explicitly, matching the real applied constraint, so it no longer shows
-- up in this or any future migration diff.

-- CreateEnum
CREATE TYPE "WeekDay" AS ENUM ('SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT');

-- AlterTable
ALTER TABLE "Platform" ADD COLUMN     "businessHoursTextAr" TEXT,
ADD COLUMN     "closeTime" TEXT,
ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "openTime" TEXT,
ADD COLUMN     "workingDays" "WeekDay"[] NOT NULL DEFAULT ARRAY[]::"WeekDay"[];

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "nameAr" TEXT;
