-- AlterTable
ALTER TABLE "Checkout" ADD COLUMN     "videoHeadline" TEXT,
ADD COLUMN     "videoUrl" TEXT;

-- CreateTable
CREATE TABLE "CheckoutVariant" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "headline" TEXT,
    "ctaText" TEXT,
    "priceCentsOverride" INTEGER,
    "theme" JSONB NOT NULL DEFAULT '{}',
    "weight" INTEGER NOT NULL DEFAULT 50,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "checkoutId" TEXT,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "duration" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "businessAccountId" TEXT,
    "accessToken" TEXT NOT NULL,
    "recoveryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "recoveryDelayMinutes" INTEGER NOT NULL DEFAULT 15,
    "recoveryTemplate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckoutVariant_checkoutId_idx" ON "CheckoutVariant"("checkoutId");

-- CreateIndex
CREATE INDEX "CheckoutVariant_active_idx" ON "CheckoutVariant"("active");

-- CreateIndex
CREATE INDEX "VideoEvent_checkoutId_idx" ON "VideoEvent"("checkoutId");

-- CreateIndex
CREATE INDEX "VideoEvent_sessionId_idx" ON "VideoEvent"("sessionId");

-- CreateIndex
CREATE INDEX "VideoEvent_createdAt_idx" ON "VideoEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConfig_userId_key" ON "WhatsappConfig"("userId");

-- AddForeignKey
ALTER TABLE "CheckoutVariant" ADD CONSTRAINT "CheckoutVariant_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoEvent" ADD CONSTRAINT "VideoEvent_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConfig" ADD CONSTRAINT "WhatsappConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
