/**
 * Sanitiza erros de PROVIDER (SafePix, etc.) pra mensagens SIMPLES pro
 * seller/cliente. O seller NUNCA pode ver o nome do provider, "Adquirente N",
 * JSON cru, status HTTP ou stack. O default NUNCA repassa o texto cru —
 * qualquer coisa não reconhecida vira uma mensagem genérica e amigável.
 *
 * Mantemos o erro CRU só nos logs do servidor (pra admin/debug), nunca na
 * resposta pro usuário.
 */

export type ErrorAudience = "seller" | "customer";

/** Extrai um valor "R$ X" de uma frase (lida com o "R$ R$" duplo da SafePix). */
function extractBRL(s: string, anchor: RegExp): string | null {
  const m = s.match(anchor);
  return m?.[1] ?? null;
}

/**
 * Traduz um erro de geração de cobrança/PIX numa mensagem amigável.
 * audience="seller" → fala em "chame um gerente"; "customer" → fala com quem
 * está pagando (sem expor nada interno).
 */
export function friendlyPaymentError(
  raw: string | null | undefined,
  audience: ErrorAudience = "seller",
): string {
  const s = String(raw ?? "");
  const lower = s.toLowerCase();

  // 1. Valor ACIMA do limite máximo (ex: "limite máximo de R$ 500,00",
  //    "Amount exceeds single transaction limit" — pagar.me/Caju en inglês).
  if (
    (lower.includes("limite") &&
      (lower.includes("máxim") || lower.includes("maxim") || lower.includes("excede"))) ||
    lower.includes("amount exceeds") ||
    lower.includes("exceeds single transaction limit") ||
    lower.includes("exceeds transaction limit")
  ) {
    const val = extractBRL(s, /m[áa]ximo de\s*(?:r\$\s*)+([\d.,]+)/i);
    if (audience === "customer") {
      return val
        ? `Pagamento via PIX indisponível para valores acima de R$ ${val}. Tente um valor menor ou fale com o vendedor.`
        : "Pagamento via PIX indisponível para este valor. Tente um valor menor ou fale com o vendedor.";
    }
    return val
      ? `PIX acima de R$ ${val} não é permitido nesta conta. Chame um gerente para habilitar.`
      : "Valor acima do limite permitido pela adquirente desta conta. Chame um gerente para habilitar.";
  }

  // 2. Valor ABAIXO do mínimo. Pagar.me devolve "O campo amount deve ser pelo
  //    menos 500" (centavos) em inglês — captura também.
  if (
    lower.includes("mínim") ||
    lower.includes("minim") ||
    (lower.includes("abaixo") && lower.includes("valor")) ||
    lower.includes("deve ser pelo menos") ||
    lower.includes("must be at least") ||
    lower.includes("below minimum")
  ) {
    const val = extractBRL(s, /m[íi]nimo de\s*(?:r\$\s*)+([\d.,]+)/i);
    return val
      ? `O valor mínimo para PIX é R$ ${val}.`
      : "Valor abaixo do mínimo permitido para PIX.";
  }

  // 3. Chave PIX inválida.
  if (lower.includes("chave") && (lower.includes("inválid") || lower.includes("invalid"))) {
    return "Chave PIX inválida. Confira e tente novamente.";
  }

  // 4. Documento (CPF/CNPJ) inválido.
  if (
    (lower.includes("documento") || lower.includes("cpf") || lower.includes("cnpj")) &&
    (lower.includes("inválid") || lower.includes("invalid") || lower.includes("incorret"))
  ) {
    return "Documento (CPF/CNPJ) inválido. Confira os dados e tente de novo.";
  }

  // 5. Timeout / demora.
  if (lower.includes("timeout") || lower.includes("abort") || lower.includes("demor")) {
    return "A operação demorou mais que o esperado. Tente novamente em instantes.";
  }

  // 6. Default genérico — NUNCA repassa o texto cru.
  if (audience === "customer") {
    return "Não foi possível gerar o PIX agora. Tente novamente em instantes ou fale com o vendedor.";
  }
  return "Não foi possível gerar o PIX agora. Tente novamente em instantes ou chame o suporte.";
}

/**
 * Sanitiza o `failReason` de um SAQUE mostrado PRO SELLER. Se o motivo for um
 * erro TÉCNICO/de provider (vaza SafePix/adquirente/HTTP/JSON), troca por uma
 * mensagem tranquilizadora. Se for uma mensagem HUMANA (ex: motivo de rejeição
 * digitado pelo admin), passa direto. (O admin continua vendo o motivo cru.)
 */
export function sellerWithdrawalReason(
  raw: string | null | undefined,
): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Indícios de erro técnico/provider → esconde.
  if (
    /safepix|adquirente|withdrawal|auto falhou|reconcile|transfer|\bIP\b|\{|\}|https?:|\b4\d\d\b|\b5\d\d\b|timeout/i.test(
      s,
    )
  ) {
    return "Não foi possível enviar automaticamente. Nossa equipe vai processar o seu saque manualmente em breve.";
  }
  return s;
}
