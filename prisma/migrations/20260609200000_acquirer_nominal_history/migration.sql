-- Historico de troca de nominal das adquirentes (auto-detect do QR).
CREATE TABLE IF NOT EXISTS "AcquirerNominalChange" (
    "id" TEXT NOT NULL,
    "acquirerId" TEXT NOT NULL,
    "oldNominal" TEXT NOT NULL,
    "newNominal" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcquirerNominalChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AcquirerNominalChange_acquirerId_createdAt_idx" ON "AcquirerNominalChange"("acquirerId", "createdAt");
CREATE INDEX IF NOT EXISTS "AcquirerNominalChange_createdAt_idx" ON "AcquirerNominalChange"("createdAt");

DO $$ BEGIN
  ALTER TABLE "AcquirerNominalChange" ADD CONSTRAINT "AcquirerNominalChange_acquirerId_fkey"
    FOREIGN KEY ("acquirerId") REFERENCES "Acquirer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
