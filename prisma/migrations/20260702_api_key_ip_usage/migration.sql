-- CreateTable
CREATE TABLE "ApiKeyIpUsage" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "alertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKeyIpUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKeyIpUsage_apiKeyId_ip_key" ON "ApiKeyIpUsage"("apiKeyId", "ip");

-- CreateIndex
CREATE INDEX "ApiKeyIpUsage_apiKeyId_lastSeenAt_idx" ON "ApiKeyIpUsage"("apiKeyId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ApiKeyIpUsage_userId_lastSeenAt_idx" ON "ApiKeyIpUsage"("userId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "ApiKeyIpUsage" ADD CONSTRAINT "ApiKeyIpUsage_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
