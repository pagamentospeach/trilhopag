-- Observação livre do admin por transação (anotação interna). Nullable/aditiva.
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "adminNote" TEXT;
