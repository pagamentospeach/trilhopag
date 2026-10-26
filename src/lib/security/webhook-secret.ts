/**
 * Webhook secret determinístico por-transação.
 *
 * Contexto (16/07/2026 — pós-incidente forge):
 * A SafePix não assina os webhooks (confirmado inspecionando raw payloads) e o
 * GET /payment-transaction/{id} retorna 401 em TODAS as credenciais. Ou seja,
 * o body do webhook não pode ser verificado nem por HMAC nem por API-callback.
 *
 * Resultado antigo: um atacante que conhecesse o `providerId` (que é público —
 * retornado na criação da PIX) postava `{Id, Status: "PAID"}` no webhook e a
 * plataforma creditava. Ele forjou 5 vendas totalizando R$ 2100.
 *
 * Defesa nova: incluímos um `?whs=<hash>` na `postback_url` que enviamos pra
 * SafePix. A SafePix guarda essa URL EXATA e chama ela quando o pagamento
 * é confirmado. Só nós conhecemos o algoritmo pra gerar o hash — e ele é
 * derivado do nosso próprio `txId` interno (que é único). No webhook, a
 * gente lê o `whs` da URL, busca a tx pelo `providerId`, computa o hash
 * esperado do `txId` local e compara constant-time.
 *
 * Ataque cross-seller (forjar tx de OUTRO seller): attacker não sabe o txId
 * de outra tx nem o whs correspondente. 403.
 *
 * Ataque intra-conta (forjar tx da PRÓPRIA conta): attacker cria pix dele,
 * a SafePix guarda `postback_url?whs=X`. Se o painel SafePix expõe essa URL
 * ao dono da conta, ele conhece o whs e pode forjar. Defesa em camadas
 * cobre esse caso:
 *   1) `first_withdrawal_manual_review` — primeiro saque sempre em revisão
 *      manual (novo em 16/07/2026). Admin cross-checka contra saldo real da
 *      conta SafePix antes de aprovar.
 *   2) Auditoria de balance drift bloqueia saque se sales != crédito real
 *      na conta SafePix (já existente).
 *
 * Sem env var nova — usa APP_ENCRYPTION_KEY que já está em prod.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const HMAC_LEN = 32; // 32 hex chars = 128 bits (mais que suficiente pra colisão)

function getSecret(): string {
  const s = process.env.APP_ENCRYPTION_KEY;
  if (!s || s.length < 16) {
    // Em prod isso NUNCA deve acontecer — a env var é obrigatória há muito.
    // Se acontecer, retornamos um secret vazio e o compare vai sempre falhar
    // (fail-closed), o que é o comportamento correto.
    console.error("[webhook-secret] APP_ENCRYPTION_KEY não configurada!");
    return "";
  }
  return s;
}

/**
 * Gera o hash determinístico pra um txId.
 *
 * Retorna hex[0..HMAC_LEN]. NÃO é reversível.
 */
export function computeWebhookSecret(txId: string): string {
  return createHmac("sha256", getSecret())
    .update(`webhook:${txId}`)
    .digest("hex")
    .slice(0, HMAC_LEN);
}

/**
 * Anexa `?whs=<hash>` (ou `&whs=`) ao URL do postback. Idempotente — se
 * já tem `whs=`, retorna igual.
 */
export function buildPostbackUrl(baseUrl: string, txId: string): string {
  if (baseUrl.includes("whs=")) return baseUrl;
  const whs = computeWebhookSecret(txId);
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}whs=${whs}`;
}

/**
 * Verifica se o whs do request bate com o esperado pra essa tx. Constant-time.
 * Retorna false se algum lado estiver vazio.
 */
export function verifyWebhookSecret(
  providedWhs: string | null | undefined,
  txId: string,
): boolean {
  if (!providedWhs || !txId) return false;
  const expected = computeWebhookSecret(txId);
  if (providedWhs.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(providedWhs), Buffer.from(expected));
  } catch {
    return false;
  }
}
