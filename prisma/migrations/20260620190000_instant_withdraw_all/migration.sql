-- Instant withdrawal for ALL sellers (existing + new), no daily value limit.
-- The over-withdrawal protection is enforced by the withdrawal audit
-- (exceeds_reconciled_sales block flag), NOT by a daily limit.

-- New rows default to instant withdrawal enabled
ALTER TABLE "User" ALTER COLUMN "autoWithdrawEnabled" SET DEFAULT true;

-- New rows default to NO daily limit (0 = unlimited)
ALTER TABLE "User" ALTER COLUMN "autoWithdrawDailyLimitCents" SET DEFAULT 0;

-- Apply to all existing sellers
UPDATE "User"
SET "autoWithdrawEnabled" = true,
    "autoWithdrawDailyLimitCents" = 0
WHERE "role" IS DISTINCT FROM 'admin';
