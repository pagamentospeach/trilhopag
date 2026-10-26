-- 27/07/2026 (davi): "quando a pessoa clica num botão não consegue mais
-- selecionar outro". Guarda a trilha de blocos `buttons` por onde a conversa
-- passou, pra dar (1) o botão "⬅️ Voltar" e (2) revalidar clique em mensagem
-- antiga do chat. Sem isto o runtime só conhece o nó ATUAL e todo botão de
-- mensagem anterior vira no-op silencioso.

ALTER TABLE "BotConversation"
  ADD COLUMN IF NOT EXISTS "navHistory" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
