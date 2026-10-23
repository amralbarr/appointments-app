-- Change the column default to true so every new platform gets cancellation
-- enabled out of the box. Also backfills all existing platforms that were
-- created with the old false default — no tenant should need a manual DB
-- update just to get the standard behaviour.
ALTER TABLE "Platform" ALTER COLUMN "customerCancellationEnabled" SET DEFAULT true;
UPDATE "Platform" SET "customerCancellationEnabled" = true WHERE "customerCancellationEnabled" = false;
