-- Visibilidade das redes de anúncio na aba Integrações do best-tracker do seller.
-- Idempotente: seguro re-rodar. Default: meta+tiktok ligados, google+kwai escondidos.
CREATE TABLE IF NOT EXISTS "SellerIntegrationVisibility" (
  "platform" TEXT NOT NULL,
  "visible" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerIntegrationVisibility_pkey" PRIMARY KEY ("platform")
);

INSERT INTO "SellerIntegrationVisibility" ("platform", "visible", "updatedAt") VALUES
  ('meta',   true,  CURRENT_TIMESTAMP),
  ('tiktok', true,  CURRENT_TIMESTAMP),
  ('google', false, CURRENT_TIMESTAMP),
  ('kwai',   false, CURRENT_TIMESTAMP)
ON CONFLICT ("platform") DO NOTHING;
