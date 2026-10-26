-- Rejeição pelo admin (anti-fraude) em produtos e checkouts. Aditivo/nullable-safe.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "adminRejected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "adminRejectReason" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "adminRejectedAt" TIMESTAMP(3);
ALTER TABLE "Checkout" ADD COLUMN IF NOT EXISTS "adminRejected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Checkout" ADD COLUMN IF NOT EXISTS "adminRejectReason" TEXT;
ALTER TABLE "Checkout" ADD COLUMN IF NOT EXISTS "adminRejectedAt" TIMESTAMP(3);
