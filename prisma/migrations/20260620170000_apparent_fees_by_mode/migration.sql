-- Taxas APARENTES por modo de adquirente (cosmético; o que o seller vê). Nullable por campo.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentFeesByMode" JSONB;
