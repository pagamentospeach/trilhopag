-- Taxa de câmbio manual (override) pra BRL por conta de anúncio.
ALTER TABLE "AdAccount" ADD COLUMN IF NOT EXISTS "fxRateOverride" DOUBLE PRECISION;
