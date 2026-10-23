-- written by hand, same as the init migration's partial index — prisma
-- migrate dev refused to run non-interactively because of the data-loss
-- warning on adding a required+unique column to a table with existing
-- rows (all synthetic local test data, cleared first).

ALTER TABLE "Booking" ADD COLUMN "cancelTokenHash" TEXT NOT NULL;

CREATE UNIQUE INDEX "Booking_cancelTokenHash_key" ON "Booking"("cancelTokenHash");
