import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto por requisição pro log da API.
 *
 * ⚠️ POR QUE `AsyncLocalStorage` E NÃO UMA VARIÁVEL DE MÓDULO.
 *
 * O wrapper de log (lib/api-log.ts) precisa de duas coisas que nascem em
 * lugares diferentes: o `userId`, que só aparece DENTRO do handler quando o
 * `authenticate()` roda, e o status final, que só existe quando o handler
 * termina.
 *
 * A saída preguiçosa seria uma variável no escopo do módulo. Ela funciona no
 * teste e falha em produção: este servidor atende requisições concorrentes, e
 * duas chamadas simultâneas de sellers diferentes sobrescreveriam a variável
 * uma da outra. O log do seller A sairia com o `userId` do seller B — que num
 * gateway é vazamento de dado entre contas, não bug de telemetria.
 *
 * `AsyncLocalStorage` mantém um valor por cadeia assíncrona: cada requisição
 * enxerga só o seu.
 */
type Ctx = { userId?: string; apiKeyId?: string; errorCode?: string };

export const apiLogContext = new AsyncLocalStorage<Ctx>();

/** Chamado pelo `authenticate()` quando a chave é validada. */
export function marcarDonoDaRequisicao(userId: string, apiKeyId: string) {
  const ctx = apiLogContext.getStore();
  if (ctx) {
    ctx.userId = userId;
    ctx.apiKeyId = apiKeyId;
  }
}

/** Chamado pelo `errorResponse()` pra o log saber o motivo da recusa. */
export function marcarErro(code: string) {
  const ctx = apiLogContext.getStore();
  if (ctx) ctx.errorCode = code;
}
