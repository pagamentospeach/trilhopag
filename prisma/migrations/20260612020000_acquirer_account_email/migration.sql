-- E-mail da conta da adquirente (login no PSP). Admin-only, plaintext,
-- exibido na aba de adquirentes. Coluna nullable e aditiva (sem downtime).
ALTER TABLE "Acquirer" ADD COLUMN IF NOT EXISTS "accountEmail" TEXT;
