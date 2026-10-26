/**
 * Sanitização de erros pra responses HTTP.
 *
 * NUNCA expor:
 *  - Stack traces
 *  - Mensagens Prisma (ex: "P2002: Unique constraint failed on column...")
 *  - File paths
 *  - SQL queries
 *  - Mensagens de libs externas (Resend, Stripe, etc)
 *
 * Use `sanitizeErrorForResponse()` antes de mandar erro pro client.
 */

export function sanitizeErrorForResponse(err: unknown): {
  status: number;
  body: { error: string; message: string; code?: string };
} {
  // Errors conhecidos do Trilho com mensagens safe
  if (err instanceof Error) {
    const name = err.name;

    // Prisma errors — esconde detalhes
    if (name === "PrismaClientKnownRequestError") {
      const code = (err as unknown as { code?: string }).code;
      if (code === "P2002") {
        return {
          status: 409,
          body: { error: "conflict", message: "Recurso já existe", code: "P2002" },
        };
      }
      if (code === "P2025") {
        return {
          status: 404,
          body: { error: "not_found", message: "Recurso não encontrado", code: "P2025" },
        };
      }
      // Outros P-codes — não vaza
      return {
        status: 500,
        body: { error: "database_error", message: "Erro de banco de dados" },
      };
    }
    if (name === "PrismaClientValidationError") {
      return {
        status: 422,
        body: { error: "validation_error", message: "Dados inválidos" },
      };
    }
    if (name === "ZodError") {
      return {
        status: 422,
        body: { error: "validation_error", message: "Dados inválidos" },
      };
    }

    // Errors específicos do Trilho (whitelist)
    if (
      name === "WithdrawalError" ||
      name === "IdempotencyKeyReuseError" ||
      name === "ServerActionForbiddenError"
    ) {
      return {
        status: 400,
        body: { error: name.toLowerCase(), message: err.message },
      };
    }
  }

  // Fallback genérico — esconde tudo
  return {
    status: 500,
    body: { error: "internal_error", message: "Erro interno. Tente novamente." },
  };
}

/**
 * Logger interno de errors (vai pro Vercel logs).
 * Sempre loga com prefixo padronizado pra fácil grep.
 */
export function logServerError(context: string, err: unknown, extra?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[error:${context}]`, message, { stack, ...extra });
}
