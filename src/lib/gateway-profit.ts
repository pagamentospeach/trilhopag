/**
 * LUCRO DO GATEWAY (tesouraria) — quanto do saldo parado nas adquirentes
 * SafePix é, de fato, lucro da plataforma e pode ser sacado SEM tocar no
 * dinheiro dos sellers.
 *
 * Conceito:
 *   saldo nas adquirentes = dinheiro devido aos sellers  (balanceCents)
 *                         + saques de sellers em trânsito (PENDING/PROCESSING)
 *                         + LUCRO acumulado da plataforma (taxas retidas)
 *
 * Logo:
 *   lucro = totalDisponívelNasAdquirentes
 *         − somatório dos balanceCents de todos os sellers
 *         − somatório do líquido dos saques abertos (ainda vão sair p/ sellers)
 *
 * É deliberadamente CONSERVADOR: o líquido dos saques abertos é tratado como
 * passivo (vai sair p/ o seller), então nunca classificamos como lucro um
 * centavo que ainda é devido a alguém.
 */
import { prisma } from "./prisma";
import { getAllActiveAcquirerBalances } from "./acquirer-balance";

export type GatewayProfit = {
  /** Total disponível (sacável agora) somando todas as contas SafePix. */
  totalAvailCents: number;
  /** Soma dos balanceCents de todos os sellers (dinheiro devido a eles). */
  sellerLiabilitiesCents: number;
  /** Líquido dos saques abertos (PENDING/PROCESSING) ainda em trânsito. */
  pendingPayoutsCents: number;
  /** Lucro da plataforma realmente sacável (nunca negativo). */
  profitCents: number;
};

/**
 * Soma o saldo disponível das contas PIX-OUT em BRL (live).
 *
 * BUG-FIX (17/07/2026, davi): antes somava `safepix + sharkbanking`. Estava
 * ERRADO em 2 pontas — (1) SharkBanking NÃO faz PIX-OUT (o auto-withdrawal
 * só suporta safepix + pluggou, ver auto-withdrawal.ts:62), então incluir
 * inflava o total artificialmente com saldo que não dava pra sacar; (2)
 * Pluggou foi esquecida, tirando saldo real do cálculo.
 *
 * Consequência do bug: quando admin apertava "Sacar lucro do gateway" sem
 * passar o total (fluxo /adminSweepGatewayProfit), o cálculo do lucro
 * divergia do total mostrado em /withdrawals que já usa safepix+pluggou.
 *
 * Agora ambos os fluxos usam a mesma base: adquirentes PIX-OUT.
 */
export async function getTotalSafePixAvailCents(): Promise<number> {
  const balances = await getAllActiveAcquirerBalances().catch(() => []);
  // 22/07/2026 (davi: "tem que puxar o saldo real"): removi dedup por
  // sharedBalanceGroup. Dedup por accountFingerprint (creds identicas) ja
  // ocorre no painel via balanceDedupKey — aqui somamos direto os saldos
  // reais de cada conta. Se 2 contas TIVEREM cred duplicada, o painel
  // ainda marca visualmente como alias mas somamos os 2 aqui (o "erro"
  // eh soh o cadastro em duplicidade, nao o codigo).
  return balances
    .filter(
      (b) =>
        (b.code.startsWith("safepix") ||
          b.code.startsWith("pluggou") ||
          b.code.startsWith("pixzy")) &&
        b.supported &&
        b.currency === "BRL" &&
        typeof b.availableCents === "number",
    )
    .reduce((s, b) => s + (b.availableCents ?? 0), 0);
}

/**
 * Calcula o lucro do gateway. Se `totalAvailCents` for passado (ex.: a página
 * já leu os saldos live), reaproveita; senão lê das adquirentes.
 */
export async function computeGatewayProfit(
  totalAvailCents?: number,
): Promise<GatewayProfit> {
  const avail =
    typeof totalAvailCents === "number"
      ? totalAvailCents
      : await getTotalSafePixAvailCents();

  const [liab, openWds] = await Promise.all([
    prisma.user.aggregate({
      where: { role: { not: "admin" } },
      _sum: { balanceCents: true },
    }),
    prisma.withdrawal.findMany({
      where: { status: { in: ["PENDING", "PROCESSING"] } },
      select: { amountCents: true, feeCents: true },
    }),
  ]);

  const sellerLiabilitiesCents = Math.max(0, liab._sum.balanceCents ?? 0);
  const pendingPayoutsCents = openWds.reduce(
    (s, w) => s + Math.max(0, w.amountCents - w.feeCents),
    0,
  );
  const profitCents = Math.max(
    0,
    avail - sellerLiabilitiesCents - pendingPayoutsCents,
  );

  return {
    totalAvailCents: avail,
    sellerLiabilitiesCents,
    pendingPayoutsCents,
    profitCents,
  };
}
