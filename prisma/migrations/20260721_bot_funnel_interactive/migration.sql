-- 21/07/2026 (davi): funil de bot interativo (botoes/enquete/random/location/
-- media-library). Adiciona pendingPollId em BotConversation e a tabela
-- MediaAsset (biblioteca de midia reutilizavel do seller).

ALTER TABLE "BotConversation"
  ADD COLUMN "pendingPollId" TEXT;

CREATE INDEX IF NOT EXISTS "BotConversation_pendingPollId_idx"
  ON "BotConversation" ("pendingPollId");

-- Biblioteca de midia reutilizavel do seller. Uploads pra funil de bot
-- caem automaticamente aqui (via /api/dashboard/upload). Seller reusa em
-- N funis sem re-upload (economia de bandwidth/blob).
CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "filename" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MediaAsset_userId_kind_idx" ON "MediaAsset" ("userId", "kind");
CREATE INDEX "MediaAsset_userId_createdAt_idx" ON "MediaAsset" ("userId", "createdAt");

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
