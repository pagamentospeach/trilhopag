import { NextResponse } from "next/server";
import { verifyApiKey } from "./api-keys";
import { getClientIp } from "./rate-limit";
import {
  marcarDonoDaRequisicao,
  marcarErro,
} from "./api-log-context";

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  // Anota o motivo pro log da requisicao (09/08/2026). E o campo que responde
  // "por que minha chamada foi recusada" sem precisar do corpo da resposta —
  // que nao e gravado de proposito (ver lib/api-log.ts).
  marcarErro(code);
  return NextResponse.json<{ error: ApiError }>(
    { error: { code, message, details } },
    { status },
  );
}

/**
 * Gate de SCOPE pra endpoints sensíveis (ex: saques). Política permissiva:
 *  - Chave SEM scopes definidos (default — todas as chaves atuais) → LIBERA.
 *  - Chave COM scopes definidos → só libera se o scope pedido estiver na lista.
 *
 * Assim dá pra, no futuro, emitir chaves restritas (ex: só leitura) sem
 * quebrar nenhuma integração existente. Retorna a resposta de erro 403 se
 * negado, ou null se autorizado.
 */
export function requireScope(
  record: { scopes: string[] },
  scope: string,
): NextResponse | null {
  if (!record.scopes || record.scopes.length === 0) return null; // permissivo
  if (record.scopes.includes(scope) || record.scopes.includes("*")) return null;
  return errorResponse(
    403,
    "insufficient_scope",
    `Esta API key não tem permissão para "${scope}". Gere uma chave com esse escopo em /dashboard/api-keys.`,
  );
}

export async function authenticate(request: Request) {
  const auth = request.headers.get("authorization");
  // Fallback: aceita X-Api-Key alem de Authorization: Bearer. Algumas libs
  // (PHP curl legado, Postman importado) só mandam X-Api-Key — nao vale
  // recusar cobranca boa por isso.
  const altKey =
    request.headers.get("x-api-key") ??
    request.headers.get("x-trilhopag-key") ??
    null;

  // NEVER-FAIL POLICY (08/07/2026, david: "a api NUNCA pode falhar, tira
  // tudo de segurança que pode fazer um pix nao ser gerado"):
  // Rate limits REMOVIDOS do fluxo de geracao de PIX. Um seller vendendo
  // em pico (100 req/s de checkout customizado) nao pode ser cortado —
  // isso vira "cliente sem PIX". Auth ainda eh mandatoria (nao vai gerar
  // PIX pra qualquer um), mas SEM throttle.
  //
  // Trade-off aceito: se chave vazar, o abuso NAO eh cortado por rate-limit
  // aqui. Detectado por outros mecanismos (IP tracking + alerta em
  // /dashboard/api-keys + admin ve massa de tx suspeitas em alerts).

  const record = await verifyApiKey(auth, altKey);
  if (!record) {
    return {
      record: null,
      response: errorResponse(
        401,
        "unauthorized",
        "Invalid or missing API key. Use 'Authorization: Bearer tp_live_<your-key>'.",
      ),
    };
  }

  // Anota de quem e a requisicao pro log (09/08/2026). O wrapper `withApiLog`
  // le isso quando o handler termina — ver lib/api-log-context.ts.
  marcarDonoDaRequisicao(record.userId, record.id);

  const ip = getClientIp(request);
  return { record, response: null, ip };
}
