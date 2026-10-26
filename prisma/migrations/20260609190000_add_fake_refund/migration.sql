-- REEMBOLSO FAKE (admin-only).
-- Config por conta: % das vendas pagas que viram REFUNDED auto + dias ate cair.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fakeRefundPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fakeRefundDelayDays" INTEGER NOT NULL DEFAULT 7;

-- Agendamento por transacao (cron fake-refunds aplica markTransactionRefunded).
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "fakeRefundScheduledAt" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "fakeRefundApplied" BOOLEAN NOT NULL DEFAULT false;
