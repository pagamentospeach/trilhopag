-- Canal de vendas no Telegram — 01/08/2026 (davi).
--
-- "teria como adicionar uma função pra adicionar um canal que nesse canal
--  iria mostrar quando saísse vendas? (um separado!)"
--
-- Cada venda APROVADA vira uma mensagem num canal do Telegram do seller.
-- Separado do SaleBot de propósito: o notificador daquele foi removido em
-- 21/07/2026 (0.7% de cobertura, 66% de falha) e o que sobrou lá é o bot
-- interativo do funil. Ver src/lib/sales-channel.ts.
--
-- Puramente aditivo: cria tabela nova, não toca em nada existente.
CREATE TABLE IF NOT EXISTS "SalesChannel" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "botToken"     TEXT NOT NULL,
  "chatId"       TEXT NOT NULL,
  "modes"        TEXT[] DEFAULT ARRAY[]::TEXT[],
  "showCustomer" BOOLEAN NOT NULL DEFAULT true,
  "showTotals"   BOOLEAN NOT NULL DEFAULT true,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "totalSent"    INTEGER NOT NULL DEFAULT 0,
  "totalFailed"  INTEGER NOT NULL DEFAULT 0,
  "lastSentAt"   TIMESTAMP(3),
  "lastError"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesChannel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalesChannel_userId_idx" ON "SalesChannel"("userId");
CREATE INDEX IF NOT EXISTS "SalesChannel_active_idx" ON "SalesChannel"("active");

-- Cascade: seller apagado leva os canais dele junto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SalesChannel_userId_fkey'
  ) THEN
    ALTER TABLE "SalesChannel"
      ADD CONSTRAINT "SalesChannel_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
