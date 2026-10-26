-- 23/07/2026 (davi): 'Pega qualquer dominio de qualquer outro seller e deixa
-- nessa conta ativo para usar tambem'. Compartilhamento de dominio de
-- checkout entre sellers — o dono continua sendo o unico dono (userId), mas
-- pode compartilhar leitura com outros userIds via array.
ALTER TABLE "CustomDomain"
ADD COLUMN IF NOT EXISTS "sharedWithUserIds" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

-- Index GIN pra lookup rapido (WHERE 'X' = ANY sharedWithUserIds).
CREATE INDEX IF NOT EXISTS "CustomDomain_sharedWithUserIds_idx"
ON "CustomDomain" USING GIN ("sharedWithUserIds");
