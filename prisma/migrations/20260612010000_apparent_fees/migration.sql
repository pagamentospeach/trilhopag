-- TAXAS APARENTES (admin-only, cosmético). Quando non-null, é o que o seller
-- VÊ na aba Perfil → Taxas — pode diferir da taxa REAL. Null = mostra a real.
-- NÃO afeta cálculo de venda/saque. Colunas nullable e aditivas (sem downtime).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentFeePercent" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentFeeFixedCents" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentCardFeePercent" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentCardFeeFixedCents" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentBoletoFeePercent" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentBoletoFeeFixedCents" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentApplePayFeePercent" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentApplePayFeeFixedCents" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentGooglePayFeePercent" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentGooglePayFeeFixedCents" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apparentWithdrawalFeeCents" INTEGER;
