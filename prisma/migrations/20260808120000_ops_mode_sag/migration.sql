-- MODO SAG (SUB ADQUIRENTE GATEWAY) — 08/08/2026 (davi).
--
-- Nao ha mudanca de SCHEMA aqui de proposito: `User.pixOpsMode`,
-- `User.cardOpsMode` e `Acquirer.mode` sao String (nao enum), e
-- `PlatformModeDefaults.mode` e @id String. Um modo novo e DADO.
--
-- Esta migration so garante que a linha de defaults do sag EXISTA antes de
-- qualquer conta cair nesse modo. A pagina /admin01/taxas-padrao tambem faz
-- upsert por modo, mas ela so roda quando um admin abre a tela — e o
-- signup-bootstrap le PlatformModeDefaults na hora que a conta nasce.
--
-- VALORES: clonados do WHITE, porque o SAG e o modo que mais se parece com ele
-- (PIX + cartao, com retencao). NAO sao numeros escolhidos pro SAG — sao um
-- ponto de partida seguro pra linha nao nascer com os defaults do schema
-- (6,99% + R$2,00, retencao 0). O admin ajusta em /admin01/taxas-padrao.
INSERT INTO "PlatformModeDefaults" (
  "mode",
  "feePercent", "feeFixedCents",
  "cardEnabled", "cardFeePercent", "cardFeeFixedCents",
  "withdrawalFeeCents", "holdMinutes",
  "cardRetentionPercent", "cardRetentionDays",
  "maxFeePercent", "maxCardFeePercent",
  "webhookDeviationPercent", "fakeRefundPercent", "fakeRefundDelayDays",
  "updatedAt"
)
SELECT
  'sag',
  "feePercent", "feeFixedCents",
  "cardEnabled", "cardFeePercent", "cardFeeFixedCents",
  "withdrawalFeeCents", "holdMinutes",
  "cardRetentionPercent", "cardRetentionDays",
  "maxFeePercent", "maxCardFeePercent",
  "webhookDeviationPercent", "fakeRefundPercent", "fakeRefundDelayDays",
  CURRENT_TIMESTAMP
FROM "PlatformModeDefaults"
WHERE "mode" = 'white'
ON CONFLICT ("mode") DO NOTHING;

-- Rede de seguranca: se por algum motivo a linha 'white' nao existir, cria a
-- do sag com os mesmos valores que a migration original usou pro white.
INSERT INTO "PlatformModeDefaults" (
  "mode",
  "feePercent", "feeFixedCents",
  "cardEnabled", "cardFeePercent", "cardFeeFixedCents",
  "withdrawalFeeCents", "holdMinutes",
  "cardRetentionPercent", "cardRetentionDays",
  "maxFeePercent", "maxCardFeePercent",
  "webhookDeviationPercent", "fakeRefundPercent", "fakeRefundDelayDays",
  "updatedAt"
)
VALUES (
  'sag',
  1.99, 159,
  true, 9.90, 299,
  990, '{}',
  20, 90,
  100, 100,
  3, 1, 7,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("mode") DO NOTHING;
