-- Sub-accounts
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "parentUserId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSubAccount" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "User_parentUserId_idx" ON "User"("parentUserId");
ALTER TABLE "User"
  ADD CONSTRAINT "User_parentUserId_fkey"
  FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Product SAC fields
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sacEmail" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sacWhatsapp" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "pageUrl" TEXT;

-- Coproducer
CREATE TABLE IF NOT EXISTS "Coproducer" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "splitPercent" DOUBLE PRECISION NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Coproducer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Coproducer_productId_idx" ON "Coproducer"("productId");
ALTER TABLE "Coproducer"
  ADD CONSTRAINT "Coproducer_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deliverable
CREATE TABLE IF NOT EXISTS "Deliverable" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'url',
  "contentUrl" TEXT,
  "contentText" TEXT,
  "emailSubject" TEXT,
  "emailBody" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Deliverable_productId_key" ON "Deliverable"("productId");
ALTER TABLE "Deliverable"
  ADD CONSTRAINT "Deliverable_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
