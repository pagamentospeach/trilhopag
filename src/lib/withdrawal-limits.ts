/**
 * Mínimos e taxas de saque. FONTE ÚNICA.
 *
 * ⚠️ MORA AQUI, e não em lib/withdrawals.ts, por um motivo específico.
 *
 * 08/08/2026: o formulário de saque dizia "mín. R$ 30,00" e tinha placeholder
 * "30,00" enquanto o servidor rejeitava qualquer coisa abaixo de R$ 50,00. O
 * seller lia trinta, digitava trinta e cinco, e batia num erro sacando o
 * próprio dinheiro. Os dois números eram literais escritos à mão em arquivos
 * diferentes, então nada avisou quando um mudou e o outro não.
 *
 * A correção óbvia seria o formulário importar a constante do withdrawals.ts,
 * onde ela já era exportada. Não dá: aquele módulo importa `prisma`, e o
 * formulário é "use client" — importar de lá arrastaria o Prisma pro bundle do
 * navegador e quebraria o build. É a mesma fronteira que derrubou a
 * /dashboard/rede nesta mesma sessão (ver lib/link-mode-defaults.ts).
 *
 * Por isso: módulo NEUTRO, sem "use client" nem "use server" e sem nenhum
 * import. Servidor e navegador leem o mesmo número, e a divergência deixa de
 * ser possível em vez de só ter sido corrigida.
 */

/** Mínimo de saque PIX — R$ 50,00. */
export const MIN_WITHDRAWAL_CENTS = 5_000;

/** Mínimo P2P USDT — R$ 2.000,00. */
export const MIN_USDT_CENTS = 200_000;

/** Taxa fixa do saque PIX — R$ 9,90. */
export const WITHDRAWAL_FEE_CENTS = 990;

/**
 * Taxa fixa em cima do P2P USDT.
 * 23/07/2026 (davi): 'Tira esses 10 reais, vai ser somente 1% mesmo'
 * — era R$ 10,00; passou pra R$ 0 (sem taxa fixa).
 */
export const USDT_FIXED_FEE_CENTS = 0;

/**
 * % adicional sobre o valor do saque P2P.
 * 23/07/2026 (davi): 'Abaixa a taxa de saque em cripto para 1% + 10 reais'
 * (era 6.5% + R$10; passou pra 1% + R$10; depois pra 1% sem fixo).
 */
export const USDT_PERCENT_FEE = 0.01;

/** Rótulo em reais de um valor em centavos, pra texto de formulário. */
export function centsLabel(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
