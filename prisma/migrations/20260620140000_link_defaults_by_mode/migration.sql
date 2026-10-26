-- Taxas por modo de adquirente que o INDICADOR define pros indicados.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "linkDefaultsByMode" JSONB;
