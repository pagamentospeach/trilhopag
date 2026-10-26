-- Esconde a adquirente das telas do seller (continua processando normal).
-- IF NOT EXISTS porque a coluna foi aplicada manualmente em prod (deploy não
-- roda migrate deploy, só prisma generate) — mantém idempotente.
ALTER TABLE "Acquirer" ADD COLUMN IF NOT EXISTS "hiddenFromSellers" BOOLEAN NOT NULL DEFAULT false;
