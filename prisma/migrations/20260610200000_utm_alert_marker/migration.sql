-- Dedup do alerta "vendas sem campanha" (UTM faltando).
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "lastUtmAlertDay" TEXT;
