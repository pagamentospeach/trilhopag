-- Campanha favoritada (vencedora) — aparece no topo do dashboard.
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "favorite" BOOLEAN NOT NULL DEFAULT false;
