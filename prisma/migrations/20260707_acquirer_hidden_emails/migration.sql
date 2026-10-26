-- Denylist por email (07/07/2026): esconde adquirente pra sellers especificos
-- por email. Vale por cima de qualquer outra visibilidade (publica/privada).
ALTER TABLE "Acquirer"
  ADD COLUMN "hiddenFromEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
