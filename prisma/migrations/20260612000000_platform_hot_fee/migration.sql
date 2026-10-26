-- HOT: taxa total fixa por venda (centavos) no PlatformDefaults. Default R$0,75.
ALTER TABLE "PlatformDefaults" ADD COLUMN IF NOT EXISTS "hotFeeFixedCents" INTEGER NOT NULL DEFAULT 75;
