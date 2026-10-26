-- AddColumn: status de auditoria + motivo de reprovacao (apelacao em massa)
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "secondaryStatus" TEXT;
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "rejectReason" TEXT;
