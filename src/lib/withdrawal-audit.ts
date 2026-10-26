/**
 * Auditoria automatica de saque — roda em TODA solicitacao de saque.
 *
 * Objetivo: detectar saques suspeitos / fraudulentos ANTES do admin ver.
 * Bloqueia automaticamente os casos criticos (severity: "block") e
 * destaca os casos warning pro admin avaliar antes de aprovar.
 *
 * NUNCA confiamos cegamente no balanceCents do User. Reconciliamos sempre
 * contra a soma das Transactions PAID/REFUNDED + historico de saques.
 *
 * Casos cobertos:
 *  1. Balance drift   — balanceCents nao bate com (paid - refunded - withdrawn)
 *  2. Account age     — conta recem-criada solicitando saque grande
 *  3. Refund rate     — % de refund alto nas vendas (chargeback iminente)
 *  4. Chargeback rate — historico de chargebacks alto (fraude do seller)
 *  5. Velocity        — muitos saques em curto periodo
 *  6. Sudden spike    — volume de venda hoje >> mediana historica (card stuffing)
 *  7. KYC incompleto  — saque grande sem documentacao
 *  8. First withdraw  — primeiro saque + valor alto (cheat & cash-out)
 *  9. Disputes open   — Stripe dispute aberto, deve segurar
 * 10. PIX key mismatch — chave nao bate com CPF do KYC (lavagem)
 */

import { prisma } from "./prisma";

export type WithdrawalAuditFlag = {
  code: string;
  severity: "info" | "warn" | "block";
  message: string;
  data?: Record<string, unknown>;
};

export type WithdrawalAuditReport = {
  flags: WithdrawalAuditFlag[];
  /** 0-100. >=70 = bloqueia. >=40 = warning amarelo. <40 = ok. */
  score: number;
  computedAt: string;
  balanceMatch: {
    ok: boolean;
    drift: number;
    paidNetCents: number;
    refundedNetCents: number;
    chargebackNetCents: number;
    withdrawnCents: number;
    pendingWithdrawalCents: number;
    /** Efeito líquido (after-before) de ajustes manuais do admin (user.balance.set). */
    manualAdjustmentsCents?: number;
    expectedBalance: number;
    actualBalance: number;
  };
  ratios: {
    refundRate: number;
    chargebackRate: number;
    totalSales: number;
  };
  velocity: {
    withdrawalsLast24h: number;
    withdrawalsLast7d: number;
  };
};

function severityWeight(s: WithdrawalAuditFlag["severity"]): number {
  if (s === "block") return 40;
  if (s === "warn") return 15;
  return 3;
}

export async function auditWithdrawalRequest(
  userId: string,
  requestedAmountCents: number,
): Promise<WithdrawalAuditReport> {
  const flags: WithdrawalAuditFlag[] = [];
  const now = new Date();
  const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ===== Dados do user =====
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      createdAt: true,
      balanceCents: true,
      kycStatus: true,
      name: true,
      // Saldo pode vir de indicacoes — seller sem venda propria PODE ter
      // saldo legitimo via rede / desvio creditado nele como referrer.
      referralEarningsCents: true,
      referralDeviationEarningsCents: true,
    },
  });
  if (!user) {
    return {
      flags: [
        {
          code: "user_not_found",
          severity: "block",
          message: "Usuario nao encontrado.",
        },
      ],
      score: 100,
      computedAt: now.toISOString(),
      balanceMatch: {
        ok: false,
        drift: 0,
        paidNetCents: 0,
        refundedNetCents: 0,
        chargebackNetCents: 0,
        withdrawnCents: 0,
        pendingWithdrawalCents: 0,
        expectedBalance: 0,
        actualBalance: 0,
      },
      ratios: { refundRate: 0, chargebackRate: 0, totalSales: 0 },
      velocity: { withdrawalsLast24h: 0, withdrawalsLast7d: 0 },
    };
  }

  // ===== Agregados de transacoes (lifetime) =====
  // CRITICAL: filtra divertedToAcquirer/Referrer porque essas txs NUNCA
  // creditam saldo do seller (acquirer skim ou rede). Sem o filtro, o
  // calculo do expectedBalance fica superestimado e drift sempre nega.
  const txAggs = await prisma.transaction.groupBy({
    by: ["status"],
    where: {
      userId,
      divertedToAcquirer: false,
      divertedToReferrer: false,
    },
    _sum: { netCents: true, amountCents: true },
    _count: true,
  });

  // Pra count de "vendas legitimas" usado em refund/chargeback rate, conta
  // TUDO (inclusive desviada) — taxa de refund eh signal de qualidade,
  // independe se a venda foi desviada ou nao.
  const txAggsAll = await prisma.transaction.groupBy({
    by: ["status"],
    where: { userId },
    _count: true,
  });

  let paidNet = 0;
  let refundedNet = 0;
  let chargebackNet = 0;
  let paidCount = 0;
  let refundCount = 0;
  let chargebackCount = 0;
  for (const g of txAggs) {
    const net = g._sum.netCents ?? 0;
    if (g.status === "PAID") paidNet += net;
    if (g.status === "REFUNDED") refundedNet += net;
    if (g.status === "CHARGEBACK") chargebackNet += net;
  }
  for (const g of txAggsAll) {
    if (g.status === "PAID") paidCount += g._count;
    if (g.status === "REFUNDED") refundCount += g._count;
    if (g.status === "CHARGEBACK") chargebackCount += g._count;
  }

  // ===== Holding/retencao nao liberados =====
  // Txs PAID com releasedToBalance=false ainda NAO foram creditadas
  // (cron de holding-release vai creditar depois). Igualmente,
  // retentionReleased=false significa retencao ainda nao liberada.
  // Subtraido do expected balance.
  const holdingAgg = await prisma.transaction.aggregate({
    where: {
      userId,
      status: "PAID",
      divertedToAcquirer: false,
      divertedToReferrer: false,
      releasedToBalance: false,
    },
    _sum: { netCents: true, retentionAmountCents: true },
  });
  const retentionPendingAgg = await prisma.transaction.aggregate({
    where: {
      userId,
      status: "PAID",
      divertedToAcquirer: false,
      divertedToReferrer: false,
      retentionReleased: false,
    },
    _sum: { retentionAmountCents: true },
  });
  const holdingNet =
    (holdingAgg._sum.netCents ?? 0) -
    (holdingAgg._sum.retentionAmountCents ?? 0);
  const retentionPending = retentionPendingAgg._sum.retentionAmountCents ?? 0;

  // ===== Taxas de plataforma debitadas em refund/chargeback =====
  // markTransactionRefunded/Chargedback debitam silenciosamente:
  //   refund -> R$10 por
  //   chargeback -> R$50 por
  // Mas APENAS ate o limite do saldo na hora (nao negativa). Pra fim
  // de reconciliacao usamos a ESTIMATIVA conservadora (count * fixed).
  const REFUND_FEE_CENTS = 1000;
  const CHARGEBACK_FEE_CENTS = 5000;
  const refundFeesDebited = refundCount * REFUND_FEE_CENTS;
  const chargebackFeesDebited = chargebackCount * CHARGEBACK_FEE_CENTS;

  // ===== Agregados de saques (lifetime) =====
  // POLITICA jun/2026: saques pre-fix tinham balance_debit = amount+fee.
  // Pos-fix: balance_debit = amount apenas. Pra reconciliar saldo certo,
  // precisamos saber a data de cada record.
  const FIX_DEPLOYED_AT = new Date("2026-06-05T00:00:00Z");
  const withdrawalRecords = await prisma.withdrawal.findMany({
    where: { userId, status: { in: ["PAID", "PENDING", "PROCESSING"] } },
    select: {
      status: true,
      amountCents: true,
      feeCents: true,
      createdAt: true,
    },
  });
  let withdrawnTotal = 0;
  let pendingWithdrawalTotal = 0;
  for (const w of withdrawalRecords) {
    const isPreFix = w.createdAt < FIX_DEPLOYED_AT;
    const debit = isPreFix ? w.amountCents + w.feeCents : w.amountCents;
    if (w.status === "PAID") withdrawnTotal += debit;
    if (w.status === "PENDING" || w.status === "PROCESSING") {
      pendingWithdrawalTotal += debit;
    }
  }

  // ===== Verificacao de integridade do balance =====
  // expected = vendas creditadas (paid_net released)
  //          + ganho por indicacao (referralEarningsCents direto no User)
  //          + ganho por desvio rede (referralDeviationEarningsCents)
  //          - refunds/chargebacks
  //          - taxas plataforma (R$10/refund + R$50/chargeback)
  //          - saques pagos/pendentes/processando
  //
  // paidNet ja FILTRA divertedToX (calculado acima). Mas inclui txs com
  // releasedToBalance=false (holding). Subtraimos holdingNet pra so contar
  // o que efetivamente foi creditado. Retencao pendente tambem subtraida.
  const referralCredits =
    (user.referralEarningsCents ?? 0) +
    (user.referralDeviationEarningsCents ?? 0);

  // ===== Ajustes MANUAIS de saldo pelo admin =====
  // O drift NÃO pode alarmar por algo que o próprio admin fez de propósito
  // (ex: "Definir saldo" no painel → action user.balance.set). Soma o efeito
  // líquido (after - before) de cada ajuste e inclui no expected. Sem isso,
  // QUALQUER seller que teve o saldo editado/zerado acusava drift gigante
  // FALSO (auditoria jun/2026: seller com 5x balance.set→0 acusava ~R$3,4k de
  // drift que era SÓ os ajustes manuais — nada de bug no gateway).
  // Captura OS DOIS tipos de edição manual de saldo pelo admin:
  //  - user.balance.set    (adminSetBalanceAndGmv) → SET absoluto, payload
  //    { before:{balanceCents}, after:{balanceCents?} } → delta = after-before.
  //  - user.balance.adjust (adminCreditUser)        → INCREMENTO sinalizado,
  //    payload { cents } → delta = cents. (Antes ESTE ficava de fora, o que
  //    causava drift falso e — pior — faria o teto de saque abaixo barrar
  //    seller legítimo que o admin creditou na mão.)
  const balanceLogs = await prisma.adminAuditLog.findMany({
    where: {
      target: userId,
      action: { in: ["user.balance.set", "user.balance.adjust"] },
    },
    select: { action: true, payload: true },
  });
  let manualAdjustmentsCents = 0;
  for (const l of balanceLogs) {
    if (l.action === "user.balance.adjust") {
      const p = l.payload as { cents?: number } | null;
      if (typeof p?.cents === "number" && Number.isFinite(p.cents)) {
        manualAdjustmentsCents += p.cents;
      }
      continue;
    }
    // user.balance.set
    const p = l.payload as {
      before?: { balanceCents?: number };
      after?: { balanceCents?: number };
    } | null;
    const before = p?.before?.balanceCents;
    const after = p?.after?.balanceCents;
    if (typeof before === "number" && typeof after === "number") {
      manualAdjustmentsCents += after - before;
    }
  }

  const expectedBalance =
    paidNet -
    holdingNet -
    retentionPending -
    refundedNet -
    chargebackNet -
    refundFeesDebited -
    chargebackFeesDebited -
    withdrawnTotal -
    pendingWithdrawalTotal +
    referralCredits +
    manualAdjustmentsCents;
  const drift = user.balanceCents - expectedBalance;

  // Tolerancia: 200 cents pra arredondamentos
  const balanceOk = Math.abs(drift) <= 200;
  if (!balanceOk) {
    // POLITICA jun/2026: drift NAO bloqueia mais o saque, vira warning
    // visivel pro admin avaliar. Agora o expected JÁ desconta os ajustes
    // manuais conhecidos (user.balance.set), então um drift que sobra é mais
    // provável de ser real — mas segue sem bloquear (pode haver outros
    // ajustes não logados, ex: adminCreditUser direto).
    flags.push({
      code: "balance_drift",
      severity: Math.abs(drift) > 100_000 ? "warn" : "info",
      message: `Saldo difere do esperado em R$ ${(Math.abs(drift) / 100).toFixed(2)} (${drift > 0 ? "a mais" : "a menos"}), já descontados ajustes manuais conhecidos (R$ ${(manualAdjustmentsCents / 100).toFixed(2)}). Não bloqueia.`,
      data: {
        drift,
        expected: expectedBalance,
        actual: user.balanceCents,
        manualAdjustmentsCents,
      },
    });
  }

  // ===== TETO DE SAQUE: não pode sacar mais do que vendeu (líquido) =====
  // Regra explícita do admin (jun/2026): "ninguém pode solicitar saque de um
  // valor MAIOR do que vendeu desde o último saque; a auditoria deve considerar
  // as edições do admin no saldo do seller."
  //
  // `expectedBalance` reconcilia:
  //   vendas líquidas (netCents = bruto − taxa de adquirente)
  //   − refunds/chargebacks − taxas de plataforma (R$10/R$50)
  //   − TODOS os saques anteriores (pagos + pendentes)
  //   + ganhos de referral/desvio  + ajustes manuais do admin (set E adjust)
  //   − holding/retenção ainda não liberados.
  //
  // AUDIT jul/2026 — teto agora respeita o BALANCE REAL quando há drift POSITIVO
  // (saldo real > reconciliado). Antes o teto era `expectedBalance` estrito, o
  // que barrava seller confiável com drift pequeno (~R$400) sobrando por
  // crédito/ajuste legítimo não capturado no log — ex: seller Paulo tinha
  // R$408 no balance mas o expected computado dava R$0,72, saques travavam.
  // Racional: o balance real É a verdade operacional (ele bloqueia sozinho via
  // `updateMany where balanceCents >= debit` no debit final). Quando drift é
  // POSITIVO, o pior caso é liberar até o balance real — se algum crédito
  // fantasma foi injetado fraudulentamente, o `balance_drift` flag GRANDE
  // (>R$1k) já vira warning pro admin. Quando drift NEGATIVO (balance < expected),
  // mantém o expected como teto (mais conservador — indica algo debitou o
  // balance sem correspondência, possivelmente bug).
  const withdrawableCeiling =
    drift >= 0
      ? Math.max(0, user.balanceCents)
      : Math.max(0, expectedBalance);
  const capTolerance = Math.max(1000, Math.round(requestedAmountCents * 0.02));
  if (requestedAmountCents > withdrawableCeiling + capTolerance) {
    const excess = requestedAmountCents - withdrawableCeiling;
    flags.push({
      code: "exceeds_reconciled_sales",
      severity: "block",
      message: `Saque de R$ ${(requestedAmountCents / 100).toFixed(2)} excede o disponível (R$ ${(withdrawableCeiling / 100).toFixed(2)}) em R$ ${(excess / 100).toFixed(2)}. Não é permitido sacar mais do que o saldo reconciliado — já considerados os ajustes manuais do admin (R$ ${(manualAdjustmentsCents / 100).toFixed(2)}). Bloqueio automático.`,
      data: {
        requestedAmountCents,
        withdrawableCeiling,
        excess,
        expectedBalance,
        actualBalance: user.balanceCents,
        drift,
        manualAdjustmentsCents,
        paidNetCents: paidNet,
        withdrawnCents: withdrawnTotal,
        pendingWithdrawalCents: pendingWithdrawalTotal,
      },
    });
  }

  // ===== Account age =====
  const ageDays = (now.getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 3 && requestedAmountCents >= 50_000) {
    flags.push({
      code: "new_account_high_value",
      severity: "warn",
      message: `Conta criada ha ${ageDays.toFixed(1)} dias solicitando saque de R$ ${(requestedAmountCents / 100).toFixed(2)}. Verificar identidade.`,
      data: { ageDays, amount: requestedAmountCents },
    });
  } else if (ageDays < 1) {
    flags.push({
      code: "very_new_account",
      severity: "warn",
      message: `Conta criada ha menos de 24h. Saque de R$ ${(requestedAmountCents / 100).toFixed(2)}.`,
      data: { ageDays, amount: requestedAmountCents },
    });
  }

  // ===== Refund rate =====
  const totalSales = paidCount + refundCount + chargebackCount;
  const refundRate = totalSales > 0 ? refundCount / totalSales : 0;
  const chargebackRate = totalSales > 0 ? chargebackCount / totalSales : 0;

  if (refundRate >= 0.30 && totalSales >= 5) {
    flags.push({
      code: "high_refund_rate",
      severity: "block",
      message: `Taxa de refund alta: ${(refundRate * 100).toFixed(1)}% (${refundCount}/${totalSales}). Bloqueio automatico — pode haver mais refunds pendentes.`,
      data: { refundRate, refundCount, totalSales },
    });
  } else if (refundRate >= 0.15 && totalSales >= 5) {
    flags.push({
      code: "elevated_refund_rate",
      severity: "warn",
      message: `Taxa de refund elevada: ${(refundRate * 100).toFixed(1)}% (${refundCount}/${totalSales}).`,
      data: { refundRate, refundCount, totalSales },
    });
  }

  // ===== Chargeback rate =====
  if (chargebackRate >= 0.03 && totalSales >= 10) {
    flags.push({
      code: "high_chargeback_rate",
      severity: "block",
      message: `Taxa de chargeback critica: ${(chargebackRate * 100).toFixed(2)}% (${chargebackCount}/${totalSales}). Adquirentes punem >1%. Reter saldo.`,
      data: { chargebackRate, chargebackCount, totalSales },
    });
  } else if (chargebackRate >= 0.01 && totalSales >= 10) {
    flags.push({
      code: "elevated_chargeback_rate",
      severity: "warn",
      message: `Taxa de chargeback elevada: ${(chargebackRate * 100).toFixed(2)}% (${chargebackCount}/${totalSales}).`,
      data: { chargebackRate, chargebackCount, totalSales },
    });
  }

  // ===== Velocity (frequencia de saques) =====
  const recentWithdraws = await prisma.withdrawal.findMany({
    where: {
      userId,
      createdAt: { gt: ago7d },
      status: { in: ["PAID", "PENDING", "PROCESSING"] },
    },
    select: { id: true, createdAt: true, amountCents: true },
  });
  const last24h = recentWithdraws.filter((w) => w.createdAt > ago24h);
  if (last24h.length >= 3) {
    flags.push({
      code: "withdrawal_velocity_24h",
      severity: "warn",
      message: `${last24h.length} saques solicitados nas ultimas 24h. Verificar padrao.`,
      data: { count: last24h.length },
    });
  }
  if (recentWithdraws.length >= 7) {
    flags.push({
      code: "withdrawal_velocity_7d",
      severity: "warn",
      message: `${recentWithdraws.length} saques nos ultimos 7 dias.`,
      data: { count: recentWithdraws.length },
    });
  }

  // ===== Sudden spike (vendas hoje muito acima da mediana) =====
  // Compara: vendas das ultimas 24h vs mediana diaria dos ultimos 30d.
  const salesLast24h = await prisma.transaction.aggregate({
    where: {
      userId,
      status: "PAID",
      createdAt: { gt: ago24h },
    },
    _sum: { netCents: true },
    _count: true,
  });
  const salesLast30d = await prisma.transaction.aggregate({
    where: {
      userId,
      status: "PAID",
      createdAt: { gt: ago30d, lt: ago24h },
    },
    _sum: { netCents: true },
    _count: true,
  });
  const avgDailyLast30d = (salesLast30d._sum.netCents ?? 0) / 29; // ~29 dias entre 30d e 24h
  const spike24h = salesLast24h._sum.netCents ?? 0;
  if (avgDailyLast30d > 0 && spike24h > avgDailyLast30d * 10 && spike24h > 100_000) {
    flags.push({
      code: "sudden_revenue_spike",
      severity: "warn",
      message: `Vendas nas ultimas 24h (R$ ${(spike24h / 100).toFixed(2)}) sao ${(spike24h / avgDailyLast30d).toFixed(1)}x a media diaria. Possivel card stuffing — segurar saque.`,
      data: { spike24h, avgDailyLast30d, multiplier: spike24h / avgDailyLast30d },
    });
  }

  // ===== KYC =====
  if (user.kycStatus !== "approved" && requestedAmountCents >= 100_000) {
    flags.push({
      code: "kyc_incomplete_high_value",
      severity: "warn",
      message: `KYC ${user.kycStatus ?? "pendente"} + saque de R$ ${(requestedAmountCents / 100).toFixed(2)}. Recomenda-se documentacao antes de aprovar.`,
      data: { kycStatus: user.kycStatus, amount: requestedAmountCents },
    });
  }

  // ===== First withdrawal — SEMPRE manual review (16/07/2026, pós-fraude) =====
  //
  // Pentester conseguiu forjar R$ 2100 em vendas via webhook exploit e ia
  // sacar R$ 1952 no PRIMEIRO SAQUE dele. Se o webhook não tivesse sido
  // exposto, ele ainda teria que passar por review manual — camada extra.
  //
  // Regra: PRIMEIRO saque NUNCA vai automático. Sempre `warn` no audit +
  // `tryAutoWithdraw` pula (checkado lá com totalPastPaid == 0).
  const totalPastWithdrawals = await prisma.withdrawal.count({
    where: { userId, status: "PAID" },
  });
  if (totalPastWithdrawals === 0) {
    flags.push({
      code: "first_withdrawal_ever",
      severity: "warn",
      message: `Primeiro saque do seller (R$ ${(requestedAmountCents / 100).toFixed(2)}). Política obriga review manual pra novos sellers — nunca vai automático.`,
      data: { amount: requestedAmountCents },
    });
  }
  if (totalPastWithdrawals === 0 && requestedAmountCents >= 300_000) {
    flags.push({
      code: "first_withdrawal_high_value",
      severity: "warn",
      message: `Primeiro saque no valor de R$ ${(requestedAmountCents / 100).toFixed(2)}. Verificação extra recomendada.`,
      data: { amount: requestedAmountCents },
    });
  }

  // (Disputes do Stripe: modelo nao mapeado no schema; pular checagem
  // direta. Chargebacks ja entram no `chargebackRate` via Transaction.status)

  // ===== Sem vendas + sem referral =====
  // Antes (jun/2026 pre-fix) bloqueava qualquer user com paidCount=0.
  // Mas seller PODE ter saldo legitimo via referral (passive earnings) ou
  // via desvio onde ele eh o REFERRER. Agora so vira warning quando o
  // saldo nao tem origem nem em venda direta nem em referral.
  if (paidCount === 0 && requestedAmountCents > 0 && referralCredits === 0) {
    flags.push({
      code: "no_paid_sales_no_referral",
      severity: "warn",
      message: `Nenhuma venda PAID nem ganho de referral. Saldo deve vir de ajuste manual — admin revisar.`,
      data: { balanceCents: user.balanceCents, referralCredits },
    });
  }

  // ===== Score final =====
  const score = Math.min(
    100,
    flags.reduce((acc, f) => acc + severityWeight(f.severity), 0),
  );

  return {
    flags,
    score,
    computedAt: now.toISOString(),
    balanceMatch: {
      ok: balanceOk,
      drift,
      paidNetCents: paidNet,
      refundedNetCents: refundedNet,
      chargebackNetCents: chargebackNet,
      withdrawnCents: withdrawnTotal,
      pendingWithdrawalCents: pendingWithdrawalTotal,
      manualAdjustmentsCents,
      expectedBalance,
      actualBalance: user.balanceCents,
    },
    ratios: {
      refundRate,
      chargebackRate,
      totalSales,
    },
    velocity: {
      withdrawalsLast24h: last24h.length,
      withdrawalsLast7d: recentWithdraws.length,
    },
  };
}

/** True se o report contem qualquer flag de severity="block". */
export function hasBlockingFlag(report: WithdrawalAuditReport): boolean {
  return report.flags.some((f) => f.severity === "block");
}
