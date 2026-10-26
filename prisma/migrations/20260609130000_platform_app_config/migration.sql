-- CreateTable: credenciais de app (Meta/TikTok) da plataforma (admin-managed)
CREATE TABLE IF NOT EXISTS "PlatformAppConfig" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appSecretEnc" TEXT NOT NULL,
    "configId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAppConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformAppConfig_platform_key" ON "PlatformAppConfig"("platform");
