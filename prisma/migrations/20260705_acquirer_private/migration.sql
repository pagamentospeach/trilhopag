-- AlterTable
ALTER TABLE "Acquirer"
  ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "privateAllowedEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Acquirer_isPrivate_idx" ON "Acquirer"("isPrivate");
