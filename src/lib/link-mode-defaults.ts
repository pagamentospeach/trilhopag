import { type OpsMode } from "@/lib/ops-modes";

/**
 * O SHAPE das taxas por modo de adquirente, e o helper que monta ele.
 *
 * ⚠️ MORA AQUI, NÃO em app/dashboard/rede/link-mode-defaults-editor.tsx.
 *
 * 08/08/2026 (davi): "ao tentar abrir a aba Minha rede o site da erro ao
 * carregar a pagina". Era isto: `buildLinkModeDefaults` nasceu dentro do
 * arquivo do editor, que é `"use client"`, e DOIS Server Components chamavam
 * ela — /dashboard/rede e /admin01/users. Quando um Server Component importa
 * um valor de um módulo client, o bundler troca TODO export por uma referência
 * de cliente; não existe exceção pro export que não é componente. Chamar essa
 * referência no servidor lança "Attempted to call ... from the server but it is
 * on the client", e o throw acontecia antes de qualquer JSX — a página inteira
 * morria no error boundary.
 *
 * É exatamente o mesmo bug que derrubou a /dashboard em 06/08/2026 com
 * "OVERVIEW_METRIC_KEYS is not iterable" (lá um array virou proxy, aqui uma
 * função). Por isso a regra: valor compartilhado entre server e client mora em
 * módulo NEUTRO — sem "use client", sem "use server".
 *
 * Re-exportar do arquivo client (`export { buildLinkModeDefaults } from ...`)
 * NÃO resolve: o re-export continua sendo referência de cliente.
 */

/** Modo que só movimenta PIX (black, hot). */
export type ModePix = { pixPct: number; pixFix: number };
/** Modo que movimenta PIX e cartão (white, sag). */
export type ModeWhite = ModePix & { cardPct: number; cardFix: number };

export type LinkModeDefaults = {
  black: ModePix;
  white: ModeWhite;
  hot: ModePix;
  // SAG movimenta PIX e cartão (como o white), então tem as duas colunas.
  sag: ModeWhite;
  withdrawalFeeCents: number;
};

/**
 * Monta um LinkModeDefaults completo a partir de um resolvedor por campo.
 *
 * Existe porque o mesmo objeto `{ black, white, hot }` era escrito à mão em 4
 * telas (modal de taxas em massa, modal por indicado, engrenagem do link e a
 * lista de users do admin). Cada cópia é um lugar onde um modo novo pode ser
 * esquecido — e um `LinkModeDefaults` sem a chave do modo não quebra em
 * runtime, só renderiza um formulário com campos `undefined`.
 *
 * `pick(modo, campo)` é quem sabe de onde vem o número (taxa do indicador,
 * override salvo, default da plataforma). Modos PIX-only não recebem `cardPct`
 * nem `cardFix` — ficariam gravados no JSON sem nunca serem lidos.
 */
export function buildLinkModeDefaults(
  pick: (
    mode: OpsMode,
    field: "pixPct" | "pixFix" | "cardPct" | "cardFix",
  ) => number,
  withdrawalFeeCents: number,
): LinkModeDefaults {
  const pix = (m: OpsMode): ModePix => ({
    pixPct: pick(m, "pixPct"),
    pixFix: pick(m, "pixFix"),
  });
  const withCard = (m: OpsMode): ModeWhite => ({
    ...pix(m),
    cardPct: pick(m, "cardPct"),
    cardFix: pick(m, "cardFix"),
  });
  return {
    black: pix("black"),
    white: withCard("white"),
    hot: pix("hot"),
    sag: withCard("sag"),
    withdrawalFeeCents,
  };
}
