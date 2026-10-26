import { after } from "next/server";
import { prisma } from "./prisma";
import { apiLogContext } from "./api-log-context";

/**
 * Log de requisição da API pública (seção 13 do prompt de revamp).
 *
 * ⚠️ A GRAVAÇÃO NUNCA BLOQUEIA A RESPOSTA.
 *
 * Esta lib existe no caminho de `POST /v1/transactions` — a rota que gera o
 * PIX. A política do davi sobre ela é explícita e está escrita em
 * lib/api-response.ts: *"a api NUNCA pode falhar, tira tudo de segurança que
 * pode fazer um pix nao ser gerado"*. Um `INSERT` bloqueante aqui significa
 * que um soluço do Neon vira cliente sem PIX.
 *
 * Por isso o write vai em `after()`, o mesmo mecanismo que o `lastUsedAt` da
 * chave usa desde que ele derrubava requests (lib/api-keys.ts:41). A resposta
 * sai primeiro; o log grava depois; erro no log não afeta ninguém.
 *
 * ── O QUE NÃO É GRAVADO, E POR QUÊ ──────────────────────────────────────
 *
 * Corpo de requisição e de resposta ficam FORA. O corpo destas rotas é dado
 * de pagamento: nome, e-mail, CPF do comprador, valor. Guardar isso por 30
 * dias numa tabela de log é criar um segundo lugar de onde esses dados podem
 * vazar, pra resolver um problema de diagnóstico que metadado já resolve.
 *
 * A query string também sai: ela carrega identificador em várias rotas.
 */
export function logApiRequest(input: {
  userId: string;
  apiKeyId?: string | null;
  method: string;
  /** URL completa. A query é descartada aqui dentro. */
  url: string;
  statusCode: number;
  /** `performance.now()` do início da rota. */
  inicioMs: number;
  errorCode?: string | null;
}) {
  const durationMs = Math.max(0, Math.round(performance.now() - input.inicioMs));

  let path = "/";
  try {
    path = new URL(input.url).pathname.slice(0, 200);
  } catch {
    // URL malformada não pode derrubar a rota. Sem caminho, o registro ainda
    // vale pelo status e pela duração.
  }

  const gravar = async () => {
    try {
      await prisma.apiRequestLog.create({
        data: {
          userId: input.userId,
          apiKeyId: input.apiKeyId ?? null,
          method: input.method.slice(0, 10),
          path,
          statusCode: input.statusCode,
          durationMs,
          errorCode: input.errorCode?.slice(0, 60) ?? null,
        },
      });
    } catch (e) {
      console.error("[api-log] falha ao gravar", e);
    }
  };

  try {
    after(gravar);
  } catch {
    // `after()` só existe dentro de um route handler. Fora dele (teste,
    // script), cai no fire-and-forget puro — mesmo fallback que o
    // `lastUsedAt` usa.
    void gravar();
  }
}

/** Últimos registros do seller. Usado pela aba de logs. */
export async function listarApiLogs(userId: string, take = 100) {
  return prisma.apiRequestLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      method: true,
      path: true,
      statusCode: true,
      durationMs: true,
      errorCode: true,
      createdAt: true,
    },
  });
}

/** Dias que o log é mantido. Ver o cron de limpeza. */
export const RETENCAO_DIAS = 30;

/**
 * Apaga registros velhos.
 *
 * Sem isto a tabela cresce sem teto num gateway que recebe requisição por
 * segundo — e uma tabela de log gigante é o tipo de coisa que ninguém percebe
 * até a conta do banco chegar.
 */
export async function limparApiLogsAntigos() {
  const corte = new Date(Date.now() - RETENCAO_DIAS * 86_400_000);
  const r = await prisma.apiRequestLog.deleteMany({
    where: { createdAt: { lt: corte } },
  });
  return r.count;
}


/**
 * Embrulha um handler de rota da API pública pra registrar a requisição.
 *
 * O handler roda dentro do `AsyncLocalStorage`, então o `authenticate()` lá
 * dentro consegue anotar de quem é a chave sem precisar devolver isso pra cá
 * (ver api-log-context.ts pro porquê de não ser uma variável de módulo).
 *
 * ⚠️ O `try/finally` NÃO engole erro: o `throw` continua subindo. Só garante
 * que a requisição que estourou também seja registrada — que é justamente a
 * que o dev do outro lado está tentando entender.
 *
 * Requisição sem `userId` (chave inválida) não é gravada: sem dono, a linha
 * não pertence a nenhum seller e não apareceria em painel nenhum. Falha de
 * auth continua no `console.warn` do verifyApiKey.
 */
export function withApiLog<A extends unknown[]>(
  handler: (request: Request, ...rest: A) => Promise<Response>,
) {
  return async (request: Request, ...rest: A): Promise<Response> => {
    const inicioMs = performance.now();
    return apiLogContext.run({}, async () => {
      let status = 500;
      try {
        const res = await handler(request, ...rest);
        status = res.status;
        return res;
      } finally {
        const ctx = apiLogContext.getStore();
        if (ctx?.userId) {
          logApiRequest({
            userId: ctx.userId,
            apiKeyId: ctx.apiKeyId,
            method: request.method,
            url: request.url,
            statusCode: status,
            inicioMs,
            errorCode: ctx.errorCode,
          });
        }
      }
    });
  };
}
