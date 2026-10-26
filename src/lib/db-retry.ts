import { isTransientFetchError } from "./providers/safepix";

/**
 * Executa uma leitura/op de DB com 1 RETRY rápido em erro TRANSIENTE
 * (timeout do Neon, queda de conexão — ex.: "The operation was aborted due to
 * timeout"). Erros DETERMINÍSTICOS (query inválida, etc.) relançam na hora.
 *
 * Uso: nas leituras CRÍTICAS pré-dispatch das rotas de PIX. Um soluço do Neon
 * NÃO pode "bugar" a geração do PIX — o cliente nunca pode ver erro técnico.
 * Combina com o try/catch de topo da rota (que vira 503 amigável) e com o
 * auto-retry do front: 3 camadas pra garantir "o PIX SEMPRE gera".
 *
 * ⚠️ Use SÓ em operações IDEMPOTENTES (leituras / cálculos puros). NUNCA em
 * create/update — repetir um write pode duplicar efeito colateral.
 */
export async function withDbRetry<T>(
  op: () => Promise<T>,
  opts?: { retries?: number; backoffMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 1;
  const backoffMs = opts?.backoffMs ?? 150;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await op();
    } catch (e) {
      lastErr = e;
      // Repete SÓ em erro transiente (timeout/rede) e se ainda há tentativa.
      if (attempt < retries && isTransientFetchError(e)) {
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw e;
    }
  }
  // Inalcançável (o loop sempre retorna ou lança), mas o TS exige um retorno.
  throw lastErr;
}
