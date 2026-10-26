-- Task 4: per-mode black-ops template (deviation %, fake refund % + days)
ALTER TABLE "PlatformModeDefaults" ADD COLUMN IF NOT EXISTS "webhookDeviationPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PlatformModeDefaults" ADD COLUMN IF NOT EXISTS "fakeRefundPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PlatformModeDefaults" ADD COLUMN IF NOT EXISTS "fakeRefundDelayDays" INTEGER NOT NULL DEFAULT 7;
