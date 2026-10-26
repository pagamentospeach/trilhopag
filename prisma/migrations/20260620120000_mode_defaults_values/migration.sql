-- Card on/off por modo + valores exatos das taxas padrão por modo de adquirente.
-- Idempotente.
ALTER TABLE "PlatformModeDefaults"
  ADD COLUMN IF NOT EXISTS "cardEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Saque é sempre R$9,90 (990) em todos os modos.
-- Black: PIX 5.99% + R$1,99 · cartão OFF · desvio 3% · sem reembolso.
UPDATE "PlatformModeDefaults" SET
  "feePercent" = 5.99, "feeFixedCents" = 199,
  "cardEnabled" = false, "cardFeePercent" = 9.90, "cardFeeFixedCents" = 299,
  "cardRetentionPercent" = 0, "cardRetentionDays" = 0,
  "webhookDeviationPercent" = 3, "fakeRefundPercent" = 0, "fakeRefundDelayDays" = 0,
  "withdrawalFeeCents" = 990, "maxFeePercent" = 100, "maxCardFeePercent" = 100
WHERE "mode" = 'black';

-- White: PIX 1.99% + R$1,59 · cartão 9.90% + R$2,99 · retenção 20%/90d · desvio 3% · reembolso fake 1%/7d.
UPDATE "PlatformModeDefaults" SET
  "feePercent" = 1.99, "feeFixedCents" = 159,
  "cardEnabled" = true, "cardFeePercent" = 9.90, "cardFeeFixedCents" = 299,
  "cardRetentionPercent" = 20, "cardRetentionDays" = 90,
  "webhookDeviationPercent" = 3, "fakeRefundPercent" = 1, "fakeRefundDelayDays" = 7,
  "withdrawalFeeCents" = 990, "maxFeePercent" = 100, "maxCardFeePercent" = 100
WHERE "mode" = 'white';

-- Hot: PIX 0%+R$1 abaixo de R$16 (flat global hotFeeFixedCents); a partir de R$16
-- cobra a taxa White (por isso fee% = 1.99 / fixa = 159). Cartão OFF · retenção 0 ·
-- desvio 3% · reembolso fake 1%/4d.
UPDATE "PlatformModeDefaults" SET
  "feePercent" = 1.99, "feeFixedCents" = 159,
  "cardEnabled" = false, "cardFeePercent" = 9.90, "cardFeeFixedCents" = 299,
  "cardRetentionPercent" = 0, "cardRetentionDays" = 0,
  "webhookDeviationPercent" = 3, "fakeRefundPercent" = 1, "fakeRefundDelayDays" = 4,
  "withdrawalFeeCents" = 990, "maxFeePercent" = 100, "maxCardFeePercent" = 100
WHERE "mode" = 'hot';

-- Garante as 3 linhas caso alguma não exista ainda.
INSERT INTO "PlatformModeDefaults"
  ("mode","feePercent","feeFixedCents","cardEnabled","cardFeePercent","cardFeeFixedCents","withdrawalFeeCents","holdMinutes","cardRetentionPercent","cardRetentionDays","maxFeePercent","maxCardFeePercent","webhookDeviationPercent","fakeRefundPercent","fakeRefundDelayDays","updatedAt")
VALUES
  ('black',5.99,199,false,9.90,299,990,'{}',0,0,100,100,3,0,0,CURRENT_TIMESTAMP),
  ('white',1.99,159,true,9.90,299,990,'{}',20,90,100,100,3,1,7,CURRENT_TIMESTAMP),
  ('hot',1.99,159,false,9.90,299,990,'{}',0,0,100,100,3,1,4,CURRENT_TIMESTAMP)
ON CONFLICT ("mode") DO NOTHING;
