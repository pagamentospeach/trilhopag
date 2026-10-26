-- Moeda da conta de anúncio (display-only no tracking; não afeta BRL do gateway).
ALTER TABLE "AdAccount" ADD COLUMN IF NOT EXISTS "currency" TEXT;
