-- Task 3 + Task 6: per-mode receiving-time (holding) + card retention + max-fee ceiling
ALTER TABLE "PlatformModeDefaults" ADD COLUMN IF NOT EXISTS "holdMinutes" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "PlatformModeDefaults" ADD COLUMN IF NOT EXISTS "cardRetentionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PlatformModeDefaults" ADD COLUMN IF NOT EXISTS "cardRetentionDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlatformModeDefaults" ADD COLUMN IF NOT EXISTS "maxFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 100;
ALTER TABLE "PlatformModeDefaults" ADD COLUMN IF NOT EXISTS "maxCardFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 100;
