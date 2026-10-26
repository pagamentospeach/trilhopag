ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "recoveryEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "recoveryDiscount15Cents" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "recoveryDiscount30Cents" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "recoveryRedirectUrl" TEXT;

ALTER TABLE "TrackingPixel" ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE "TrackingPixel" ADD COLUMN IF NOT EXISTS "eventPurchase" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TrackingPixel" ADD COLUMN IF NOT EXISTS "eventInitiateCheckout" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TrackingPixel" ADD COLUMN IF NOT EXISTS "valueMode" TEXT NOT NULL DEFAULT 'gross';

CREATE INDEX IF NOT EXISTS "TrackingPixel_productId_idx" ON "TrackingPixel"("productId");

ALTER TABLE "TrackingPixel"
  ADD CONSTRAINT "TrackingPixel_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
