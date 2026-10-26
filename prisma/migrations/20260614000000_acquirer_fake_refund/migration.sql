-- Reembolso fake por adquirente (nullable-safe, aditivo).
ALTER TABLE "Acquirer" ADD COLUMN IF NOT EXISTS "fakeRefundPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Acquirer" ADD COLUMN IF NOT EXISTS "fakeRefundDelayDays" INTEGER NOT NULL DEFAULT 7;
