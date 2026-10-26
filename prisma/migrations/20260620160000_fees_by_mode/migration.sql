-- Override de taxas por modo de adquirente POR indicado (setado pelo referrer/admin).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "feesByMode" JSONB;
