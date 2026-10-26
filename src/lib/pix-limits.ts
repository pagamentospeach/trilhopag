import { type OpsMode } from "./ops-modes";
/**
 * TETO DE VALOR POR MODO DE OPERAÇÃO (01/08/2026, davi: "limite gerar pix
 * acima de 1000 reais no modo white! maximo 1000 reias!").
 *
 * Seller em modo WHITE não gera PIX acima de R$ 1.000,00. Black e hot seguem
 * sem teto.
 *
 * ONDE ISSO É APLICADO — importante:
 * O gate roda nos PONTOS DE ENTRADA (checkout, upsell, API v1, cobrança
 * avulsa, assinatura), ANTES de criar a Transaction. NÃO dá pra barrar só no
 * dispatchPixCharge: quando o dispatch falha, o checkout devolve 202
 * ("gerando PIX...") e o cron /api/cron/pending-charge-retry re-tenta 20x em
 * ~30min antes de marcar FAILED e abrir AdminNotification. Ou seja, barrar lá
 * embaixo deixaria o cliente num spinner infinito e encheria o alerts bar do
 * admin de falso positivo. Barrando na entrada, o cliente recebe erro na hora
 * e nenhuma tx órfã é criada.
 *
 * Mesmo assim existe um gate de última linha no dispatchPixCharge pra cobrir
 * qualquer caminho novo que esqueça de chamar este helper — e o cron de retry
 * reconhece esse erro como DEFINITIVO (não fica re-tentando).
 *
 * Impacto medido antes de ligar (30 dias, 59 sellers white): 17.935 PIX
 * gerados, 16 acima de R$ 1.000 e ZERO deles pago. O teto não corta receita
 * real — corta um padrão que não converte.
 */

/** Teto do modo white, em centavos. R$ 1.000,00 — o valor exato passa. */
export const WHITE_MODE_MAX_PIX_CENTS = 100_000;

/**
 * Marcador do erro de teto. O cron de retry procura por esta string pra saber
 * que a falha é DETERMINÍSTICA (re-tentar 20x não vai mudar o valor da tx) e
 * marcar FAILED de cara.
 */
export const WHITE_LIMIT_ERROR_CODE = "white_amount_limit";

/** Mensagem mostrada pro cliente/seller. Sem jargão interno de "modo white". */
export const WHITE_LIMIT_MESSAGE =
  "Valor acima do limite permitido para esta conta (máximo R$ 1.000,00 por PIX).";

/**
 * `true` quando o PIX deve ser BARRADO: seller em white pedindo acima do teto.
 * Recebe o `User.pixOpsMode` cru — hoje só existe OpsMode.
 */
export function exceedsWhitePixLimit(
  pixOpsMode: string | null | undefined,
  amountCents: number,
): boolean {
  return pixOpsMode === "white" && amountCents > WHITE_MODE_MAX_PIX_CENTS;
}
