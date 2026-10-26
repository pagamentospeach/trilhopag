-- 22/07/2026 (davi: "Pode fazer TUDO!"): kit completo do bot Telegram HOT.
-- Adiciona: broadcast, comandos custom, analytics, e enriquecimentos em
-- BotConversation (variables/scheduledResume/language) + Transaction
-- (botFunnelTrace pra reconciliar modo link).

-- 1) BotConversation: novos campos pra input/wait/language/variables
ALTER TABLE "BotConversation"
  ADD COLUMN IF NOT EXISTS "pendingInputNodeId" TEXT,
  ADD COLUMN IF NOT EXISTS "variables" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "scheduledResumeAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledResumeNodeId" TEXT,
  ADD COLUMN IF NOT EXISTS "languageCode" TEXT,
  ADD COLUMN IF NOT EXISTS "firstName" TEXT,
  ADD COLUMN IF NOT EXISTS "username" TEXT;

CREATE INDEX IF NOT EXISTS "BotConversation_scheduledResumeAt_idx"
  ON "BotConversation" ("scheduledResumeAt");
CREATE INDEX IF NOT EXISTS "BotConversation_botId_updatedAt_idx"
  ON "BotConversation" ("botId", "updatedAt");

-- 2) Transaction: rastreio de tx originada em bloco payment modo LINK
ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "botFunnelTrace" TEXT;

CREATE INDEX IF NOT EXISTS "Transaction_botFunnelTrace_idx"
  ON "Transaction" ("botFunnelTrace");

-- 3) BotBroadcast: mensagem em massa (Telegram)
CREATE TABLE IF NOT EXISTS "BotBroadcast" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Broadcast',
  "text" TEXT NOT NULL,
  "imageUrl" TEXT,
  "buttonLabel" TEXT,
  "buttonUrl" TEXT,
  "languageFilter" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "cursorId" TEXT,
  "totalTargets" INTEGER NOT NULL DEFAULT 0,
  "totalSent" INTEGER NOT NULL DEFAULT 0,
  "totalFailed" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BotBroadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BotBroadcast_userId_createdAt_idx"
  ON "BotBroadcast" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "BotBroadcast_status_scheduledAt_idx"
  ON "BotBroadcast" ("status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "BotBroadcast_botId_idx"
  ON "BotBroadcast" ("botId");

-- 4) BotCommand: comandos customizados (/comprar, /suporte, etc)
CREATE TABLE IF NOT EXISTS "BotCommand" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "command" TEXT NOT NULL,
  "funnelId" TEXT,
  "startNodeId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BotCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BotCommand_botId_command_key"
  ON "BotCommand" ("botId", "command");
CREATE INDEX IF NOT EXISTS "BotCommand_botId_active_idx"
  ON "BotCommand" ("botId", "active");

-- 5) BotAnalyticsEvent: eventos pra drop-off analytics
CREATE TABLE IF NOT EXISTS "BotAnalyticsEvent" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "funnelId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "nodeType" TEXT,
  "event" TEXT NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BotAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BotAnalyticsEvent_botId_funnelId_createdAt_idx"
  ON "BotAnalyticsEvent" ("botId", "funnelId", "createdAt");
CREATE INDEX IF NOT EXISTS "BotAnalyticsEvent_funnelId_nodeId_event_idx"
  ON "BotAnalyticsEvent" ("funnelId", "nodeId", "event");
CREATE INDEX IF NOT EXISTS "BotAnalyticsEvent_createdAt_idx"
  ON "BotAnalyticsEvent" ("createdAt");
