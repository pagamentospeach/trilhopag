-- 23/07/2026 (davi): sub-conta agora exige email do seller na criacao pra o
-- admin conseguir buscar por email como se fosse conta normal. Coluna nullable
-- (contas parent nao tem), sem unique (multiplas subs podem apontar pro mesmo
-- email real). Index pra admin search rapido.

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "subAccountLinkedEmail" VARCHAR(254);

CREATE INDEX IF NOT EXISTS "User_subAccountLinkedEmail_idx"
ON "User"("subAccountLinkedEmail");
