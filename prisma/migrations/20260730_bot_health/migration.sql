-- Monitor de saúde 24/7 dos bots de funil (/api/cron/bot-health).
--
-- 30/07/2026: um bot ficou mudo por dias e o painel continuou exibindo
-- "Bot rodando". Estas colunas guardam o veredito do monitor pra que o
-- estado real do bot apareça no dashboard sem ninguém precisar testar
-- na mão. Ver src/lib/bot-health.ts.
--
-- Puramente aditivo: nenhuma coluna é dropada ou alterada.
ALTER TABLE "SaleBot" ADD COLUMN IF NOT EXISTS "healthStatus"    TEXT;
ALTER TABLE "SaleBot" ADD COLUMN IF NOT EXISTS "healthIssue"     TEXT;
ALTER TABLE "SaleBot" ADD COLUMN IF NOT EXISTS "healthDetail"    TEXT;
ALTER TABLE "SaleBot" ADD COLUMN IF NOT EXISTS "healthCheckedAt" TIMESTAMP(3);
ALTER TABLE "SaleBot" ADD COLUMN IF NOT EXISTS "healthAlertedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SaleBot_healthStatus_idx" ON "SaleBot"("healthStatus");
