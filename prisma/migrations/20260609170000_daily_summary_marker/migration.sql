-- Dedup do resumo diário por push (guarda o dia do último envio).
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "lastDailySummaryDay" TEXT;
