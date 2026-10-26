-- Desvio de webhook por modo de adquirente x metodo de pagamento (interno). Nullable por campo.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deviationByMode" JSONB;
