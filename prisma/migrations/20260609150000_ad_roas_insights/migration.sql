-- ROAS insights: meta de ROAS, alerta de queima, escalar vencedora + snapshot diario.

-- AdCampaign: meta por campanha + dedups de alerta/scale
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "targetRoas" DOUBLE PRECISION;
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "alertedBurnAt" TIMESTAMP(3);
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "lastScaledAt" TIMESTAMP(3);

-- UserSettings: meta global + alertas + auto-scale
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "adTargetRoas" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "adAlertsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "adBurnAlertCents" INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "autoScaleEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "autoScaleMinRoas" DOUBLE PRECISION NOT NULL DEFAULT 2;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "autoScaleStepPct" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "autoScaleMaxBudgetCents" INTEGER NOT NULL DEFAULT 0;

-- Snapshot diario de gasto x receita (grao usuario/dia)
CREATE TABLE IF NOT EXISTS "AdSpendSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "revenueCents" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdSpendSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdSpendSnapshot_userId_day_key" ON "AdSpendSnapshot"("userId", "day");
CREATE INDEX IF NOT EXISTS "AdSpendSnapshot_userId_day_idx" ON "AdSpendSnapshot"("userId", "day");

DO $$ BEGIN
  ALTER TABLE "AdSpendSnapshot" ADD CONSTRAINT "AdSpendSnapshot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
