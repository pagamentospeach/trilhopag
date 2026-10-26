-- Fase 0 do overhaul do admin (aditivo, sem downtime).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pixIntegrationBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hideTrafficNetwork" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "SellerWarning" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerWarning_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SellerWarning_userId_active_idx" ON "SellerWarning"("userId", "active");

CREATE TABLE IF NOT EXISTS "PlatformModeDefaults" (
  "mode" TEXT NOT NULL,
  "feePercent" DOUBLE PRECISION NOT NULL DEFAULT 6.99,
  "feeFixedCents" INTEGER NOT NULL DEFAULT 200,
  "cardFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 9.90,
  "cardFeeFixedCents" INTEGER NOT NULL DEFAULT 360,
  "withdrawalFeeCents" INTEGER NOT NULL DEFAULT 200,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformModeDefaults_pkey" PRIMARY KEY ("mode")
);
INSERT INTO "PlatformModeDefaults" ("mode") VALUES ('black'),('white'),('hot') ON CONFLICT ("mode") DO NOTHING;
