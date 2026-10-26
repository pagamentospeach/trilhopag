-- 22/07/2026 (davi HOT features): tags, anti-abuse, broadcast tag filter.

ALTER TABLE "BotConversation"
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "blocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "blockedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "startCount1h" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "startWindowStartedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "BotConversation_tags_idx"
  ON "BotConversation" USING GIN ("tags");
CREATE INDEX IF NOT EXISTS "BotConversation_blocked_idx"
  ON "BotConversation" ("blocked");

ALTER TABLE "BotBroadcast"
  ADD COLUMN IF NOT EXISTS "tagFilter" TEXT;
