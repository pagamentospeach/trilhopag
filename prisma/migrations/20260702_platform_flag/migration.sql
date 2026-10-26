-- CreateTable
CREATE TABLE "PlatformFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFlag_pkey" PRIMARY KEY ("key")
);

-- Seed: liga a otimizacao automatica de nominal por padrao (default do david).
INSERT INTO "PlatformFlag" ("key", "enabled", "updatedAt")
VALUES ('acquirer_nominal_dedup_auto', true, NOW())
ON CONFLICT ("key") DO NOTHING;
