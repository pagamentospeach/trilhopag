/**
 * Preços dos temas — modulo PURO sem dependencia de Prisma/server.
 * Pode ser importado em client components com seguranca (sem bundle leak).
 *
 * Server-side, `theme-access.ts` re-exporta esses simbolos pra manter
 * compatibilidade com o codigo antigo. O fonte da verdade fica aqui.
 */

// Preço padrão TODOS os temas: R$ 25,00 (17/07/2026, davi: "Mude todos os
// preços dos temas para R$25"). Antes: R$20 padrão (era R$5 legado).
export const THEME_PRICE_CENTS = 2500;

/**
 * Preços EXCLUSIVOS por tema. Zerado em 17/07/2026 — todos usam o padrão
 * único. Se quiser voltar premium um dia, adicionar aqui.
 */
export const PREMIUM_THEME_PRICES: Record<string, number> = {};

/** Retorna o preco em centavos do tema. Default = THEME_PRICE_CENTS. */
export function getThemePriceCents(themeKey: string): number {
  return PREMIUM_THEME_PRICES[themeKey] ?? THEME_PRICE_CENTS;
}

/** Formata o preco em R$ pt-BR (ex: "R$ 100,00"). */
export function formatThemePriceBRL(themeKey: string): string {
  const cents = getThemePriceCents(themeKey);
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}
