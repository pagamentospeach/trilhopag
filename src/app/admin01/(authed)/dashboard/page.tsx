import Link from "next/link";
import {
  Users,
  CreditCard,
  Wallet,
  PiggyBank,
  Receipt,
  Banknote,
  Calendar,
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Database,
  RotateCcw,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getStoredNeonUsage, type NeonUsageSnapshot } from "@/lib/neon-usage";
import {
  formatBRL,
  startOfBrtDay,
  startOfBrtMonth,
  startOfBrtYear,
  acquirerNominalLabel,
} from "@/lib/utils";
import {
  ACQUIRER_DEFAULT_PIX_COST_PERCENT,
  ACQUIRER_DEFAULT_PIX_COST_FIXED_CENTS,
  ACQUIRER_DEFAULT_CARD_COST_PERCENT,
  ACQUIRER_DEFAULT_CARD_COST_FIXED_CENTS,
} from "@/lib/fees";
import {
  isOpsMode,
  OPS_MODE_LABEL,
  OPS_MODES,
  type OpsMode,
} from "@/lib/ops-modes";

export const dynamic = "force-dynamic";

/** Cor do numero de cada modo no breakdown de sellers ativos hoje. */
const MODE_COUNT_ACCENT: Record<OpsMode, string> = {
  black: "text-zinc-200",
  white: "text-zinc-200",
  hot: "text-orange-300",
  sag: "text-cyan-300",
};

type RangeKey =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "month"
  | "year"
  | "all"
  | "custom";

function resolveRange(
  range: string | undefined,
  from: string | undefined,
  to: string | undefined,
): { gte: Date | null; lte: Date | null; label: string } {
  const now = new Date();
  // Início do dia NO FUSO DE BRASÍLIA (UTC-3). Antes usava o fuso do servidor
  // (UTC na Vercel), então o "dia" virava às 21h em vez de 00:00.
  const startOfToday = startOfBrtDay(now);
  const k = (range ?? "today") as RangeKey;
  switch (k) {
    case "today":
      return { gte: startOfToday, lte: null, label: "Hoje" };
    case "yesterday": {
      const yd = new Date(startOfToday);
      yd.setDate(yd.getDate() - 1);
      return { gte: yd, lte: startOfToday, label: "Ontem" };
    }
    case "7d": {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 7);
      return { gte: d, lte: null, label: "Últimos 7 dias" };
    }
    case "30d": {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 30);
      return { gte: d, lte: null, label: "Últimos 30 dias" };
    }
    case "month": {
      return { gte: startOfBrtMonth(now), lte: null, label: "Este mês" };
    }
    case "year": {
      return { gte: startOfBrtYear(now), lte: null, label: "Este ano" };
    }
    case "all":
      return { gte: null, lte: null, label: "Todo o histórico" };
    case "custom": {
      const fromD = from ? new Date(from) : null;
      const toD = to ? new Date(to) : null;
      return {
        gte: fromD && !isNaN(fromD.valueOf()) ? fromD : null,
        lte: toD && !isNaN(toD.valueOf()) ? toD : null,
        label: "Personalizado",
      };
    }
    default:
      return { gte: null, lte: null, label: "Todo o histórico" };
  }
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "month", label: "Este mês" },
  { key: "year", label: "Este ano" },
  { key: "all", label: "Tudo" },
];

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = await searchParams;
  const { gte, lte, label } = resolveRange(sp.range, sp.from, sp.to);

  // Filtro de período aplicado em paidAt
  const paidWhere: Record<string, unknown> = {
    status: "PAID",
    provider: { not: "test" },
  };
  if (gte || lte) {
    paidWhere.paidAt = {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  const txWhere: Record<string, unknown> = { provider: { not: "test" } };
  if (gte || lte) {
    txWhere.createdAt = {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  const [
    paidInRange,
    pendingInRange,
    refundedInRange,
    chargebackInRange,
    pixGenerated,
    pixPaid,
  ] = await Promise.all([
    prisma.transaction.aggregate({
      where: paidWhere,
      _sum: { amountCents: true, feeCents: true, netCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: { ...txWhere, status: "PENDING" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: { ...txWhere, status: "REFUNDED" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: { ...txWhere, status: "CHARGEBACK" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.count({
      where: { ...txWhere, method: "PIX" },
    }),
    prisma.transaction.count({
      where: { ...paidWhere, method: "PIX" },
    }),
  ]);

  // ============ MÉTRICAS DE REDE/INDICAÇÕES + SAQUES ============
  // Usuários vindos via referral no período (filtra createdAt + referredByUserId not null)
  const referralWhere: Record<string, unknown> = {
    referredByUserId: { not: null },
  };
  if (gte || lte) {
    referralWhere.createdAt = {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  const [
    referralSignupsCount,
    topReferrersGrouped,
    paidWithdrawalsAgg,
  ] = await Promise.all([
    prisma.user.count({ where: referralWhere }),
    // Top sellers que mais INDICAM — agrupa users por referredByUserId
    prisma.user.groupBy({
      by: ["referredByUserId"],
      where: referralWhere,
      _count: { _all: true },
      orderBy: { _count: { referredByUserId: "desc" } },
      take: 10,
    }),
    // Total de saques pagos no período (pra calcular lucro do saque)
    prisma.withdrawal.aggregate({
      where:
        gte || lte
          ? {
              status: "PAID",
              paidAt: {
                ...(gte ? { gte } : {}),
                ...(lte ? { lte } : {}),
              },
            }
          : { status: "PAID" },
      _sum: { feeCents: true, amountCents: true },
      _count: { _all: true },
    }),
  ]);

  // Hidrata top referrers com info do user
  const topReferrerIds = topReferrersGrouped
    .map((r) => r.referredByUserId)
    .filter((id): id is string => !!id);
  const topReferrerUsers = await prisma.user.findMany({
    where: { id: { in: topReferrerIds } },
    select: { id: true, name: true, email: true, referralEarningsCents: true },
  });
  const topReferrerMap = new Map(topReferrerUsers.map((u) => [u.id, u]));
  const topReferrers = topReferrersGrouped
    .map((g) => {
      if (!g.referredByUserId) return null;
      const u = topReferrerMap.get(g.referredByUserId);
      if (!u) return null;
      return {
        userId: g.referredByUserId,
        name: u.name ?? u.email,
        email: u.email,
        signups: g._count._all,
        earningsCents: u.referralEarningsCents,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Lucro do saque: cada saque pago = taxa cobrada do user MENOS o custo fixo
  // que pagamos pra adquirente em cada transferência. Esse custo varia POR
  // ADQUIRENTE (Acquirer.withdrawalCostFixedCents): ex. SafePix R$2,50.
  // Cruzamos Withdrawal.providerAccount (= code da conta que processou)
  // com o custo dela; saques sem providerAccount (manuais) caem no default.
  const DEFAULT_WITHDRAWAL_COST_CENTS = 250;
  const totalWithdrawalsFees = paidWithdrawalsAgg._sum.feeCents ?? 0;
  const totalWithdrawalsCount = paidWithdrawalsAgg._count._all;

  const [withdrawalCostAcquirers, paidWithdrawalsByAccount] = await Promise.all([
    prisma.acquirer.findMany({
      select: { code: true, withdrawalCostFixedCents: true },
    }),
    prisma.withdrawal.groupBy({
      by: ["providerAccount"],
      where:
        gte || lte
          ? {
              status: "PAID",
              paidAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) },
            }
          : { status: "PAID" },
      _count: { _all: true },
    }),
  ]);
  const withdrawalCostByCode = new Map(
    withdrawalCostAcquirers.map((a) => [a.code, a.withdrawalCostFixedCents]),
  );
  const withdrawalAcquirerCostsTotal = paidWithdrawalsByAccount.reduce(
    (sum, g) => {
      const costPer =
        (g.providerAccount
          ? withdrawalCostByCode.get(g.providerAccount)
          : undefined) ?? DEFAULT_WITHDRAWAL_COST_CENTS;
      return sum + g._count._all * costPer;
    },
    0,
  );
  const withdrawalNetProfit =
    totalWithdrawalsFees - withdrawalAcquirerCostsTotal;

  // Breakdown PIX vs CARD + custo POR ADQUIRENTE.
  // ALMA do "lucro REAL" da plataforma:
  //   lucroReal = sellerFees - referrerPayouts - acquirerCostsReais
  //              - diversionPayouts (creditados pra referrer via desvio)
  //
  // Aqui cruzamos tx.providerPayload.acquirer_id com Acquirer.pixCost*/
  // cardCost* pra ter o custo REAL por tx (nao um chute hardcoded).
  const [paidPixAgg, paidCardAgg, allAcquirers, paidTxsForCost] =
    await Promise.all([
      prisma.transaction.aggregate({
        where: { ...paidWhere, method: "PIX" },
        _sum: { amountCents: true, feeCents: true },
        _count: { _all: true },
      }),
      prisma.transaction.aggregate({
        where: { ...paidWhere, method: { not: "PIX" } },
        _sum: { amountCents: true, feeCents: true },
        _count: { _all: true },
      }),
      // Tabela de custos de todas as adquirentes (lookup map)
      prisma.acquirer.findMany({
        select: {
          id: true,
          code: true,
          nominalName: true,
          institution: true,
          shortCode: true,
          pixCostPercent: true,
          pixCostFixedCents: true,
          cardCostPercent: true,
          cardCostFixedCents: true,
        },
      }),
      // Pull tx-level data pra computar custo REAL + referrer payouts +
      // surcharge revenue + diversion payouts. Cap em 50k pra evitar OOM.
      prisma.transaction.findMany({
        where: paidWhere,
        select: {
          amountCents: true,
          method: true,
          divertedToReferrer: true,
          providerPayload: true,
        },
        take: 50_000,
      }).catch(() => []),
    ]);

  const acqMap = new Map(allAcquirers.map((a) => [a.id, a]));

  // Agrega per-acquirer: PIX + CARD costs reais + surcharge revenue +
  // diversion payouts + referrer earnings. Tudo numa passada so.
  let acquirerCostPix = 0;
  let acquirerCostCard = 0;
  let referrerPayouts = 0;
  // Breakdown POR ADQUIRENTE: bruto processado, custo da adquirente, líquido.
  const perAcquirer = new Map<
    string,
    { code: string; name: string; gross: number; cost: number; count: number }
  >();

  for (const t of paidTxsForCost) {
    const payload =
      (t.providerPayload as Record<string, unknown> | null) ?? {};
    const acqId =
      typeof payload.acquirer_id === "string" ? payload.acquirer_id : null;
    const acq = acqId ? acqMap.get(acqId) : null;

    let txCost: number;
    if (t.method === "PIX") {
      const pct = acq?.pixCostPercent ?? ACQUIRER_DEFAULT_PIX_COST_PERCENT;
      const fix = acq?.pixCostFixedCents ?? ACQUIRER_DEFAULT_PIX_COST_FIXED_CENTS;
      txCost = Math.round((t.amountCents * pct) / 100) + fix;
      acquirerCostPix += txCost;
    } else {
      const pct = acq?.cardCostPercent ?? ACQUIRER_DEFAULT_CARD_COST_PERCENT;
      const fix =
        acq?.cardCostFixedCents ?? ACQUIRER_DEFAULT_CARD_COST_FIXED_CENTS;
      txCost = Math.round((t.amountCents * pct) / 100) + fix;
      acquirerCostCard += txCost;
    }

    // Acumula POR ADQUIRENTE (bruto / custo / contagem) pra tabela líquido/adq.
    // Tudo sem acquirer_id resolvível cai num único "Sem adquirente".
    const acqKey = acq && acqId ? acqId : "none";
    const pa = perAcquirer.get(acqKey) ?? {
      code: acq?.code ?? "—",
      name: acq
        ? acquirerNominalLabel(acq.nominalName || acq.code, acq.institution)
        : "Sem adquirente",
      gross: 0,
      cost: 0,
      count: 0,
    };
    pa.gross += t.amountCents;
    pa.cost += txCost;
    pa.count += 1;
    perAcquirer.set(acqKey, pa);

    // Referrer earnings (passive): seller indicou alguem e leva % da fee.
    // SÓ conta vendas NÃO-desviadas. Numa venda desviada (divertedToReferrer) o
    // referrer é pago via diversion_referrer_cents — contabilizado SEPARADO na
    // seção "Desvio de vendas" — e NÃO via referrer_earnings_cents. Esse
    // referrer_earnings_cents fica congelado no payload na criação do PIX mas
    // NUNCA é creditado quando a venda é desviada (o crédito normal é pulado
    // pra divertedToReferrer). Subtraí-lo aqui descontava do "Lucro" um
    // pagamento-fantasma que não aconteceu — fazendo o lucro do admin parecer
    // menor/estagnado a cada venda desviada.
    if (!t.divertedToReferrer) {
      const ref = Number(payload.referrer_earnings_cents ?? 0);
      if (Number.isFinite(ref) && ref > 0) referrerPayouts += ref;
    }
  }

  const acquirerCostTotal = acquirerCostPix + acquirerCostCard;

  // Faturamento líquido POR ADQUIRENTE (bruto − custo da adquirente).
  const acquirerRevenue = [...perAcquirer.values()]
    .map((a) => ({ ...a, net: a.gross - a.cost }))
    .sort((x, y) => y.net - x.net);
  const acqRevTotals = acquirerRevenue.reduce(
    (s, a) => ({
      gross: s.gross + a.gross,
      cost: s.cost + a.cost,
      net: s.net + a.net,
      count: s.count + a.count,
    }),
    { gross: 0, cost: 0, net: 0, count: 0 },
  );

  const sellerFeesTotal =
    (paidPixAgg._sum.feeCents ?? 0) + (paidCardAgg._sum.feeCents ?? 0);
  // Lucro REAL = fees do seller - referrer payouts - custo adquirente
  // (surcharge JA esta dentro do sellerFeesTotal pq fee virou fee+surcharge
  // no recompute pos-dispatch)
  const realPlatformProfit =
    sellerFeesTotal - referrerPayouts - acquirerCostTotal;

  const pixCount = paidPixAgg._count._all;
  const cardCount = paidCardAgg._count._all;
  // (variaveis usadas mais abaixo no JSX)
  void pixCount;
  void cardCount;

  // Top sellers por SALDO ATUAL (lifetime, nao filtra periodo) — admin
  // precisa ver quem tem dinheiro parado pra antecipar problemas de saque.
  const [topByBalance, balanceSumAgg] = await Promise.all([
    prisma.user.findMany({
      where: { balanceCents: { gt: 0 } },
      orderBy: { balanceCents: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        email: true,
        balanceCents: true,
        pendingBalanceCents: true,
        blocked: true,
        kycStatus: true,
      },
    }),
    prisma.user.aggregate({
      _sum: { balanceCents: true, pendingBalanceCents: true },
      _count: { _all: true },
    }),
  ]);
  const totalSellerBalance = balanceSumAgg._sum.balanceCents ?? 0;

  // NOTA: o painel "Caixa real × Passivo" (reconRealProfit) foi removido do
  // dashboard, então sua computação lifetime (queries pesadas) também saiu.

  // ============ DESVIO DE VENDAS — quanto foi tirado de cada player =====
  // UNIFIED: cobre AMBOS os tipos de desvio.
  //  - divertedToAcquirer: skim silencioso TOTAL. Plataforma fica com tudo.
  //    platform_profit = netCents (o que o seller teria recebido).
  //  - divertedToReferrer: split via referralDeviationPlatformSharePercent.
  //    platform_profit = diversion_platform_cents (fallback 50% do amount
  //    quando ainda nao gravado — janela de 60s antes do cron escrever).
  //    referrer_profit = diversion_referrer_cents (mesmo fallback).
  //
  // O fallback eh CRITICO: durante os 60s entre PAID e cron release-paid-to-
  // seller, o split nao esta no payload. Sem fallback, recem-desvios apareciam
  // como gross_lost > 0 mas platform_profit = 0 — confundindo o admin.
  type DiversionRow = {
    userId: string;
    count: bigint;
    gross_lost: bigint | null;
    platform_profit: bigint | null;
    referrer_profit: bigint | null;
    acquirer_count: bigint | null;
    referrer_count: bigint | null;
  };

  // Build SQL com filtro de periodo opcional
  let diversionRows: DiversionRow[] = [];
  let diversionTotals = {
    totalGrossLostCents: 0,
    totalPlatformProfitCents: 0,
    totalReferrerProfitCents: 0,
    totalCount: 0,
    totalAcquirerCount: 0,
    totalReferrerCount: 0,
  };
  try {
    // Filtro de período PARAMETRIZADO (Prisma.sql liga ${gte}/${lte} como
    // bind params $1/$2 — nada de interpolar string em SQL). Prisma.empty
    // quando não há período (preserva o comportamento do filtro vazio,
    // inclusive linhas com paidAt NULL no caso "todo o histórico").
    const periodCond =
      gte && lte
        ? Prisma.sql`AND "paidAt" >= ${gte} AND "paidAt" <= ${lte}`
        : gte
          ? Prisma.sql`AND "paidAt" >= ${gte}`
          : lte
            ? Prisma.sql`AND "paidAt" <= ${lte}`
            : Prisma.empty;

    // Por seller, top 25 por valor desviado
    // FIX 09/07/2026 (audit ohipnotic): acquirer-skim CREDITA o referrer
    // quando referralDeviationEnabled=true (50/50 do net com plataforma).
    // Antes a query assumia 100% pra plataforma em divertedToAcquirer —
    // desvios do Renan sumiam da tabela. Agora usa o payload real
    // (diversion_platform_cents + diversion_referrer_cents) e cai pro
    // fallback netCents/0 SO se o payload nao tem split gravado.
    diversionRows = await prisma.$queryRaw<DiversionRow[]>(Prisma.sql`
      SELECT
        "userId",
        COUNT(*)::bigint AS count,
        SUM("amountCents")::bigint AS gross_lost,
        SUM(
          CASE
            WHEN "divertedToAcquirer" THEN COALESCE(
              ("providerPayload"->>'diversion_platform_cents')::int,
              "netCents"
            )
            ELSE COALESCE(
              ("providerPayload"->>'diversion_platform_cents')::int,
              "amountCents" / 2
            )
          END
        )::bigint AS platform_profit,
        SUM(
          CASE
            WHEN "divertedToAcquirer" THEN COALESCE(
              ("providerPayload"->>'diversion_referrer_cents')::int,
              0
            )
            ELSE COALESCE(
              ("providerPayload"->>'diversion_referrer_cents')::int,
              "amountCents" / 2
            )
          END
        )::bigint AS referrer_profit,
        SUM(CASE WHEN "divertedToAcquirer" THEN 1 ELSE 0 END)::bigint AS acquirer_count,
        SUM(CASE WHEN "divertedToReferrer" AND NOT "divertedToAcquirer" THEN 1 ELSE 0 END)::bigint AS referrer_count
      FROM "Transaction"
      WHERE "status" = 'PAID'
        AND ("divertedToAcquirer" = true OR "divertedToReferrer" = true)
        AND provider != 'test'
        ${periodCond}
      GROUP BY "userId"
      ORDER BY gross_lost DESC NULLS LAST
      LIMIT 25
    `);

    // Totais agregados (separado pra incluir TODOS, nao so top 25)
    const totalsRaw = await prisma.$queryRaw<
      Array<{
        cnt: bigint;
        gross: bigint | null;
        platform: bigint | null;
        referrer: bigint | null;
        acquirer_cnt: bigint | null;
        referrer_cnt: bigint | null;
      }>
    >(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS cnt,
        SUM("amountCents")::bigint AS gross,
        SUM(
          CASE
            WHEN "divertedToAcquirer" THEN COALESCE(
              ("providerPayload"->>'diversion_platform_cents')::int,
              "netCents"
            )
            ELSE COALESCE(
              ("providerPayload"->>'diversion_platform_cents')::int,
              "amountCents" / 2
            )
          END
        )::bigint AS platform,
        SUM(
          CASE
            WHEN "divertedToAcquirer" THEN COALESCE(
              ("providerPayload"->>'diversion_referrer_cents')::int,
              0
            )
            ELSE COALESCE(
              ("providerPayload"->>'diversion_referrer_cents')::int,
              "amountCents" / 2
            )
          END
        )::bigint AS referrer,
        SUM(CASE WHEN "divertedToAcquirer" THEN 1 ELSE 0 END)::bigint AS acquirer_cnt,
        SUM(CASE WHEN "divertedToReferrer" AND NOT "divertedToAcquirer" THEN 1 ELSE 0 END)::bigint AS referrer_cnt
      FROM "Transaction"
      WHERE "status" = 'PAID'
        AND ("divertedToAcquirer" = true OR "divertedToReferrer" = true)
        AND provider != 'test'
        ${periodCond}
    `);
    const t = totalsRaw[0];
    if (t) {
      diversionTotals = {
        totalCount: Number(t.cnt ?? 0),
        totalGrossLostCents: Number(t.gross ?? 0),
        totalPlatformProfitCents: Number(t.platform ?? 0),
        totalReferrerProfitCents: Number(t.referrer ?? 0),
        totalAcquirerCount: Number(t.acquirer_cnt ?? 0),
        totalReferrerCount: Number(t.referrer_cnt ?? 0),
      };
    }
  } catch (e) {
    console.error("[dashboard] diversion query failed:", e);
  }

  // Resolve nomes dos sellers
  const diversionUserIds = diversionRows.map((r) => r.userId);
  const diversionUsers =
    diversionUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: diversionUserIds } },
          select: { id: true, name: true, email: true, blocked: true },
        })
      : [];
  const diversionUserMap = new Map(diversionUsers.map((u) => [u.id, u]));

  // Métricas derivadas
  const gross = paidInRange._sum.amountCents ?? 0;
  const net = paidInRange._sum.netCents ?? 0;
  const sales = paidInRange._count._all;
  const pixApprovalRate =
    pixGenerated > 0 ? (pixPaid / pixGenerated) * 100 : 0;
  const refundRate =
    sales > 0
      ? ((refundedInRange._count._all + chargebackInRange._count._all) / sales) * 100
      : 0;

  const neonUsage = await getStoredNeonUsage();

  // ============ NOVAS MÉTRICAS — SELLERS ATIVOS HOJE / SAQUES HOJE ========
  // "Hoje" = a partir de 00:00 no fuso de Brasília (servidor roda em UTC).
  const startToday = startOfBrtDay();

  // ============ LUCRO COM MEDs FAKE (23/07/2026, davi) ============
  // Cada MED fake reverte o saldo do seller (netCents) mas o dinheiro do
  // cliente NUNCA sai da nossa adquirente — vira lucro puro da plataforma.
  // Filtro: providerPayload.fake_refund = 'true' + refundedAt no periodo.
  // Uso o operador ?& / ->> do JSONB.
  const fakeRefundPeriodCond =
    gte && lte
      ? Prisma.sql`AND "refundedAt" >= ${gte} AND "refundedAt" <= ${lte}`
      : gte
        ? Prisma.sql`AND "refundedAt" >= ${gte}`
        : lte
          ? Prisma.sql`AND "refundedAt" <= ${lte}`
          : Prisma.empty;

  const fakeRefundStatsRaw = await prisma.$queryRaw<
    Array<{ cnt: bigint; net: bigint | null; gross: bigint | null }>
  >(Prisma.sql`
    SELECT
      COUNT(*)::bigint AS cnt,
      SUM("netCents")::bigint AS net,
      SUM("amountCents")::bigint AS gross
    FROM "Transaction"
    WHERE status = 'REFUNDED'
      AND "fakeRefundApplied" = true
      AND provider != 'test'
      ${fakeRefundPeriodCond}
  `).catch(() => [] as Array<{ cnt: bigint; net: bigint | null; gross: bigint | null }>);
  const fakeRefundStats = fakeRefundStatsRaw[0];
  const fakeRefundCount = Number(fakeRefundStats?.cnt ?? 0);
  const fakeRefundNetCents = Number(fakeRefundStats?.net ?? 0);
  const fakeRefundGrossCents = Number(fakeRefundStats?.gross ?? 0);

  const [
    activeTodayGroups,
    sacadoHojeAgg,
    acqConvAgg,
    acqConvList,
    recentSales,
  ] = await Promise.all([
    // Sellers ativos hoje: users distintos com ≥1 tx PAGA (real) hoje.
    prisma.transaction.groupBy({
      by: ["userId"],
      where: {
        status: "PAID",
        provider: { not: "test" },
        paidAt: { gte: startToday },
      },
      _count: { _all: true },
    }),
    // Sacado hoje: SOMA dos saques PAGOS cujo paidAt (ou createdAt) é hoje.
    prisma.withdrawal.aggregate({
      where: {
        status: "PAID",
        OR: [
          { paidAt: { gte: startToday } },
          { paidAt: null, createdAt: { gte: startToday } },
        ],
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    // (portado de /insights) Conversão por adquirente — acumulado lifetime.
    prisma.userAcquirer.groupBy({
      by: ["acquirerId"],
      _sum: { totalAttempts: true, totalApproved: true },
    }),
    prisma.acquirer.findMany({
      select: {
        id: true,
        code: true,
        shortCode: true,
        nominalName: true,
        institution: true,
        mode: true,
        active: true,
        globalEnabled: true,
      },
    }),
    // (portado de /insights) Vendas ao vivo — render estático read-only, mas
    // mostrando o LUCRO do gateway (feeCents) de cada venda no lugar do valor.
    // FIX 08/07/2026 (Felipe Lopes venda com "—" eterno): algumas tx PAID
    // ficam com paidAt=null (webhook seteou status mas nao o timestamp em
    // algum branch antigo). Inclui createdAt no select pra fallback no
    // timeAgo — a linha sempre mostra "tempo desde" mesmo se paidAt sumir.
    prisma.transaction.findMany({
      where: { status: "PAID", provider: { not: "test" } },
      select: {
        id: true,
        feeCents: true,
        method: true,
        provider: true,
        paidAt: true,
        createdAt: true,
        customerEmail: true,
        divertedToAcquirer: true,
        divertedToReferrer: true,
        user: { select: { id: true, name: true, email: true } },
      },
      // Sort estavel: paidAt DESC com NULLS LAST — Postgres default poe null
      // PRIMEIRO no DESC, o que fazia tx PAID sem paidAt (zumbi) aparecer no
      // topo da lista pra sempre (bug do Felipe Lopes). Agora null vai pro
      // fim + tie-break por createdAt.
      orderBy: [
        { paidAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 30,
    }),
  ]);

  const activeSellersTodayIds = activeTodayGroups
    .map((g) => g.userId)
    .filter((id): id is string => !!id);
  const activeSellersTodayCount = activeSellersTodayIds.length;

  // Breakdown por pixOpsMode entre os ativos de hoje. O contador zerado sai de
  // OPS_MODES: escrito a mao, um modo novo nao apareceria no breakdown e os
  // numeros simplesmente nao fechariam com o total.
  const activeModeCounts = Object.fromEntries(
    OPS_MODES.map((m) => [m, 0]),
  ) as Record<OpsMode, number>;
  if (activeSellersTodayIds.length > 0) {
    const modeGroups = await prisma.user.groupBy({
      by: ["pixOpsMode"],
      where: { id: { in: activeSellersTodayIds } },
      _count: { _all: true },
    });
    for (const m of modeGroups) {
      if (isOpsMode(m.pixOpsMode)) {
        activeModeCounts[m.pixOpsMode] = m._count._all;
      }
    }
  }

  const sacadoHoje = sacadoHojeAgg._sum.amountCents ?? 0;

  // Conversão por adquirente (acumulado lifetime).
  const acqConvById = new Map(acqConvAgg.map((a) => [a.acquirerId, a._sum]));
  const acqConvRows = acqConvList
    .map((a) => {
      const agg = acqConvById.get(a.id);
      const attempts = agg?.totalAttempts ?? 0;
      const approved = agg?.totalApproved ?? 0;
      const rate = attempts > 0 ? (approved / attempts) * 100 : null;
      return { ...a, attempts, approved, rate };
    })
    .sort((x, y) => y.attempts - x.attempts);

  // Vendas ao vivo (estático): cada linha mostra o lucro do gateway (feeCents).
  // FIX 08/07/2026: usa paidAt SE existir, senao cai pro createdAt (evita
  // "—" eterno em tx PAID sem paidAt setado — bug do Felipe Lopes).
  const liveSales = recentSales.map((s) => ({
    id: s.id,
    feeCents: s.feeCents,
    method: s.method,
    provider: s.provider,
    paidAt: s.paidAt ?? s.createdAt,
    customerEmail: s.customerEmail,
    seller: s.user.name ?? s.user.email,
    sellerId: s.user.id,
    diverted: s.divertedToAcquirer || s.divertedToReferrer,
  }));

  function timeAgo(d: Date | null): string {
    if (!d) return "agora";
    const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}min`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-red-400">
            Admin Dashboard
          </p>
          <h1 className="text-3xl font-bold text-white mt-1">Visão Geral</h1>
          <p className="text-sm text-zinc-400 flex items-center gap-2">
            <Calendar className="size-3.5" />
            {label}
          </p>
        </div>
        <RangeFilter currentRange={sp.range ?? "today"} from={sp.from} to={sp.to} />
      </header>

      {/* Infra — Neon data-transfer (movido pro topo) */}
      {neonUsage && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <NeonUsageCard snap={neonUsage} />
        </section>
      )}

      {/* Core — período: GMV · Lucro (simples) · Net sellers */}
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard
          Icon={Receipt}
          label="GMV período"
          value={formatBRL(gross)}
          sub={`${sales} venda(s)`}
          accent="text-cyan-300"
        />
        <MetricCard
          Icon={PiggyBank}
          label="Lucro"
          value={formatBRL(realPlatformProfit)}
          accent={realPlatformProfit >= 0 ? "text-cyan-300" : "text-red-400"}
        />
        <MetricCard
          Icon={CreditCard}
          label="Net sellers"
          value={formatBRL(net)}
          sub="Pago aos sellers"
        />
      </section>

      {/* Sellers ativos hoje — count principal + breakdown por modo, num box só */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-300">
              <Users className="size-5" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                Sellers ativos hoje
              </p>
              <p className="mt-0.5 text-3xl font-bold leading-none tabular-nums text-cyan-300">
                {activeSellersTodayCount}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">≥1 venda paga hoje</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {OPS_MODES.map((m) => ({
              name: OPS_MODE_LABEL[m],
              count: activeModeCounts[m],
              accent: MODE_COUNT_ACCENT[m],
            })).map(({ name, count, accent }) => (
              <div
                key={name}
                className="min-w-[84px] rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-center"
              >
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {name}
                </p>
                <p className={`text-xl font-bold tabular-nums ${accent}`}>
                  {count}
                </p>
                <p className="text-[9px] text-zinc-600">ativos · pixOpsMode</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Saques — sacado hoje · saldo disponível · lucro de saques · lucro MEDs fake */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          Icon={Banknote}
          label="Sacado hoje"
          value={formatBRL(sacadoHoje)}
          sub={`${sacadoHojeAgg._count._all} saque(s) pago(s)`}
          accent="text-orange-300"
        />
        <MetricCard
          Icon={Wallet}
          label="Saldo disponível (todos sellers)"
          value={formatBRL(totalSellerBalance)}
          sub="Dinheiro parado na plataforma"
          accent="text-yellow-300"
        />
        <MetricCard
          Icon={PiggyBank}
          label={`Lucro de saques — ${label}`}
          value={formatBRL(withdrawalNetProfit)}
          accent={withdrawalNetProfit >= 0 ? "text-purple-300" : "text-red-400"}
        />
        {/* 23/07/2026 (davi): "bota uma metrica de lucro com meds fakes na
            minha dashboard de admin". Cada MED fake reverte o saldo do seller
            (netCents) mas o dinheiro do cliente NUNCA sai da nossa adquirente
            — vira lucro puro pra plataforma. Mostro NET (o que a plataforma
            "recuperou") + count + gross (o que o cliente pagou originalmente). */}
        <MetricCard
          Icon={RotateCcw}
          label={`Lucro MEDs fake — ${label}`}
          value={formatBRL(fakeRefundNetCents)}
          sub={
            fakeRefundCount > 0
              ? `${fakeRefundCount} refund(s) fake · gross ${formatBRL(fakeRefundGrossCents)}`
              : "Nenhum MED fake aplicado no período"
          }
          accent={fakeRefundNetCents > 0 ? "text-red-300" : "text-zinc-400"}
        />
      </section>

      {/* Qualidade — Aprovação PIX · Reembolso/CB · Pendentes período */}
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard
          Icon={Activity}
          label="Taxa aprovação PIX"
          value={`${pixApprovalRate.toFixed(1)}%`}
          sub={`${pixPaid} pagos / ${pixGenerated} gerados`}
          accent={pixApprovalRate >= 60 ? "text-cyan-300" : "text-yellow-300"}
        />
        <MetricCard
          Icon={ArrowDownRight}
          label="Reembolso / Chargeback"
          value={`${refundRate.toFixed(2)}%`}
          sub={`${refundedInRange._count._all} ref + ${chargebackInRange._count._all} cb`}
          accent={refundRate > 2 ? "text-red-400" : "text-zinc-200"}
        />
        <MetricCard
          Icon={ArrowUpRight}
          label="Pendentes período"
          value={formatBRL(pendingInRange._sum.amountCents ?? 0)}
          sub={`${pendingInRange._count._all} aguardando pagamento`}
        />
      </section>

      {/* ============ DESVIO DE VENDAS (colapsado) ============ */}
      <details className="group rounded-2xl border border-orange-400/30 bg-gradient-to-br from-orange-400/[0.05] to-transparent overflow-hidden">
        <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-orange-200 hover:bg-orange-400/[0.04] flex items-center justify-between">
          <span>Desvio de vendas — {label} · clique pra abrir</span>
          <span className="text-[10px] font-normal text-zinc-500 group-open:hidden">
            {formatBRL(diversionTotals.totalGrossLostCents)} ·{" "}
            {diversionTotals.totalCount} desvios
          </span>
        </summary>
        <header className="border-t border-orange-400/[0.10] bg-black/30 px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300 font-bold">
              Desvio de vendas — {label}
            </p>
            <h2 className="text-base font-semibold text-white mt-0.5">
              Dinheiro tirado de cada player · lucro da plataforma
            </h2>
            <p className="text-[10px] text-zinc-500 mt-1">
              Inclui <strong className="text-red-300">divertedToAcquirer</strong>{" "}
              (skim silencioso — 100% plataforma se seller nao tem referrer com{" "}
              referralDeviationEnabled, senao 50/50 com referrer) +{" "}
              <strong className="text-purple-300">divertedToReferrer</strong>{" "}
              (split via referralDeviationPlatformSharePercent). Desvio recente
              pode aparecer com 50/50 estimado por até 60s — cron grava o split
              real depois da janela de edição.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">
              {diversionTotals.totalCount} desvios ·{" "}
              <span className="text-red-300">
                {diversionTotals.totalAcquirerCount} skim
              </span>{" "}
              ·{" "}
              <span className="text-purple-300">
                {diversionTotals.totalReferrerCount} rede
              </span>
            </p>
            <p className="text-2xl font-mono font-bold text-orange-200 tabular-nums">
              {formatBRL(diversionTotals.totalGrossLostCents)}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              gross desviado dos sellers
            </p>
          </div>
        </header>

        {/* 3 cards de totais */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-black/20 border-b border-white/[0.04]">
          <div className="rounded-lg bg-orange-400/[0.06] border border-orange-400/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              Total tirado dos players
            </p>
            <p className="text-lg font-mono font-bold text-orange-200 tabular-nums">
              {formatBRL(diversionTotals.totalGrossLostCents)}
            </p>
            <p className="text-[9px] text-zinc-500 mt-0.5">
              gross amount das vendas desviadas
            </p>
          </div>
          <div className="rounded-lg bg-cyan-400/[0.06] border border-cyan-400/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              Meu lucro com o desvio
            </p>
            <p className="text-lg font-mono font-bold text-cyan-300 tabular-nums">
              {formatBRL(diversionTotals.totalPlatformProfitCents)}
            </p>
            <p className="text-[9px] text-zinc-500 mt-0.5">
              share da plataforma no split
            </p>
          </div>
          <div className="rounded-lg bg-blue-400/[0.06] border border-blue-400/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              Pago aos referrers
            </p>
            <p className="text-lg font-mono font-bold text-blue-300 tabular-nums">
              {formatBRL(diversionTotals.totalReferrerProfitCents)}
            </p>
            <p className="text-[9px] text-zinc-500 mt-0.5">
              share dos referrers no split
            </p>
          </div>
        </div>

        {/* Tabela por seller */}
        <div>
          <div className="grid grid-cols-12 gap-4 border-b border-white/[0.06] bg-black/30 px-5 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
            <span className="col-span-1">#</span>
            <span className="col-span-4">Seller (perdeu)</span>
            <span className="col-span-1 text-right">Desvios</span>
            <span className="col-span-2 text-right">Tirado dele</span>
            <span className="col-span-2 text-right">Meu lucro</span>
            <span className="col-span-2 text-right">Pro referrer</span>
          </div>
          {diversionRows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-zinc-500">
              Nenhuma venda desviada no período.
            </p>
          ) : (
            diversionRows.map((r, idx) => {
              const u = diversionUserMap.get(r.userId);
              const gross = Number(r.gross_lost ?? 0);
              const platform = Number(r.platform_profit ?? 0);
              const referrer = Number(r.referrer_profit ?? 0);
              const count = Number(r.count ?? 0);
              const acqCnt = Number(r.acquirer_count ?? 0);
              const refCnt = Number(r.referrer_count ?? 0);
              return (
                <Link
                  key={r.userId}
                  href={`/admin01/users/${r.userId}`}
                  className="grid grid-cols-12 gap-4 border-b border-white/[0.04] px-5 py-2.5 text-sm hover:bg-orange-400/[0.04] transition-colors"
                >
                  <span className="col-span-1 text-zinc-500 font-mono tabular-nums">
                    #{idx + 1}
                  </span>
                  <div className="col-span-4 min-w-0">
                    <p className="text-white truncate">{u?.name ?? u?.email ?? r.userId.slice(0, 12)}</p>
                    <p className="text-[10px] text-zinc-500 font-mono truncate">
                      {u?.email ?? "—"}
                    </p>
                  </div>
                  <span className="col-span-1 text-right font-mono text-zinc-400 tabular-nums">
                    <span title={`skim=${acqCnt} rede=${refCnt}`}>{count}</span>
                    {(acqCnt > 0 || refCnt > 0) && (
                      <span className="block text-[9px] font-normal">
                        {acqCnt > 0 && (
                          <span className="text-red-300">{acqCnt}sk</span>
                        )}
                        {acqCnt > 0 && refCnt > 0 && (
                          <span className="text-zinc-600">·</span>
                        )}
                        {refCnt > 0 && (
                          <span className="text-purple-300">{refCnt}rd</span>
                        )}
                      </span>
                    )}
                  </span>
                  <span className="col-span-2 text-right font-mono text-orange-200 tabular-nums">
                    {formatBRL(gross)}
                  </span>
                  <span className="col-span-2 text-right font-mono text-cyan-300 font-bold tabular-nums">
                    {formatBRL(platform)}
                  </span>
                  <span className="col-span-2 text-right font-mono text-blue-300 tabular-nums">
                    {formatBRL(referrer)}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </details>

      {/* ============ MÉTRICAS DE REDE/INDICAÇÕES (colapsado) ============ */}
      <details className="group rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-400/[0.04] to-transparent overflow-hidden">
        <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-5 py-4 hover:bg-blue-400/[0.04]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-blue-400">
              Crescimento da rede — {label}
            </p>
            <h2 className="text-base font-semibold text-white mt-0.5">
              Pessoas vindas via indicação + top indicadores
            </h2>
          </div>
          <p className="text-3xl font-bold font-mono tabular-nums text-blue-300">
            +{referralSignupsCount}
          </p>
        </summary>
        <div className="px-5 pb-5">
        {topReferrers.length > 0 ? (
          <div className="rounded-lg bg-black/30 overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_140px] gap-3 border-b border-white/[0.06] px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
              <span>Seller indicador</span>
              <span className="text-right">Indicados</span>
              <span className="text-right">Ganhos da rede</span>
            </div>
            {topReferrers.map((r) => (
              <div
                key={r.userId}
                className="grid grid-cols-[1fr_100px_140px] gap-3 border-b border-white/[0.03] px-4 py-2 text-xs items-center last:border-b-0"
              >
                <Link
                  href={`/admin01/users/${r.userId}`}
                  className="text-white hover:text-cyan-300 truncate"
                >
                  {r.name}
                  <span className="text-zinc-500 ml-1">· {r.email}</span>
                </Link>
                <span className="text-right font-mono text-blue-300 tabular-nums">
                  {r.signups}
                </span>
                <span className="text-right font-mono text-cyan-300 tabular-nums">
                  {formatBRL(r.earningsCents)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 italic">
            Nenhuma indicação no período.
          </p>
        )}
        </div>
      </details>

      {/* ============ FATURAMENTO LÍQUIDO POR ADQUIRENTE (colapsado) ============ */}
      <details className="group rounded-2xl border border-teal-400/20 bg-gradient-to-br from-teal-400/[0.04] to-transparent overflow-hidden">
        <summary className="cursor-pointer select-none px-5 py-4 hover:bg-teal-400/[0.04]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-teal-400">
            Por adquirente — {label}
          </p>
          <h2 className="text-base font-semibold text-white mt-0.5">
            Faturamento líquido por adquirente (descontado o custo da
            adquirente)
          </h2>
        </summary>
        <div className="px-5 pb-5">
        {acquirerRevenue.length > 0 ? (
          <div className="rounded-lg bg-black/30 overflow-x-auto">
            <div className="grid min-w-[560px] grid-cols-[1.4fr_70px_120px_120px_130px] gap-3 border-b border-white/[0.06] px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
              <span>Adquirente</span>
              <span className="text-right">Vendas</span>
              <span className="text-right">Bruto</span>
              <span className="text-right">Custo adq.</span>
              <span className="text-right">Líquido</span>
            </div>
            {acquirerRevenue.map((a) => (
              <div
                key={a.code}
                className="grid min-w-[560px] grid-cols-[1.4fr_70px_120px_120px_130px] gap-3 border-b border-white/[0.03] px-4 py-2 text-xs items-center last:border-b-0"
              >
                <span className="text-white truncate">
                  {a.name}
                  {a.code !== a.name && (
                    <span className="text-zinc-500 ml-1">· {a.code}</span>
                  )}
                </span>
                <span className="text-right font-mono text-zinc-300 tabular-nums">
                  {a.count}
                </span>
                <span className="text-right font-mono text-zinc-200 tabular-nums">
                  {formatBRL(a.gross)}
                </span>
                <span className="text-right font-mono text-red-300 tabular-nums">
                  −{formatBRL(a.cost)}
                </span>
                <span className="text-right font-mono font-bold text-teal-300 tabular-nums">
                  {formatBRL(a.net)}
                </span>
              </div>
            ))}
            <div className="grid min-w-[560px] grid-cols-[1.4fr_70px_120px_120px_130px] gap-3 border-t border-white/[0.1] bg-black/20 px-4 py-2 text-xs items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Total
              </span>
              <span className="text-right font-mono text-zinc-300 tabular-nums">
                {acqRevTotals.count}
              </span>
              <span className="text-right font-mono text-zinc-200 tabular-nums">
                {formatBRL(acqRevTotals.gross)}
              </span>
              <span className="text-right font-mono text-red-300 tabular-nums">
                −{formatBRL(acqRevTotals.cost)}
              </span>
              <span className="text-right font-mono font-bold text-teal-300 tabular-nums">
                {formatBRL(acqRevTotals.net)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-500 italic">
            Nenhuma venda paga no período.
          </p>
        )}
        <p className="text-[10px] text-zinc-500 mt-2">
          <span className="text-zinc-400">Bruto</span> = volume pago processado ·{" "}
          <span className="text-zinc-400">Custo adq.</span> = taxa da adquirente
          (pixCost/cardCost configurado por adquirente) ·{" "}
          <span className="text-teal-300">Líquido</span> = bruto − custo.
        </p>
        </div>
      </details>

      {/* Saldo dos players (lifetime, nao filtrado por periodo) — colapsado */}
      <details className="rounded-2xl border border-yellow-400/20 bg-gradient-to-br from-yellow-400/[0.04] to-transparent overflow-hidden">
        <summary className="cursor-pointer list-none px-5 py-3 hover:bg-yellow-400/[0.04] flex items-center gap-2">
          <Wallet className="size-4 text-yellow-300" />
          <span className="text-sm font-semibold text-white">
            Total parado: {formatBRL(totalSellerBalance)}
          </span>
        </summary>
        <div>
          <div className="grid grid-cols-12 gap-4 border-b border-white/[0.06] bg-black/30 px-5 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
            <span className="col-span-1">#</span>
            <span className="col-span-5">Seller</span>
            <span className="col-span-2 text-right">Saldo disponivel</span>
            <span className="col-span-2 text-right">Pendente</span>
            <span className="col-span-1 text-right">KYC</span>
            <span className="col-span-1 text-right">Status</span>
          </div>
          {topByBalance.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-zinc-500">
              Nenhum seller com saldo positivo.
            </p>
          ) : (
            topByBalance.map((u, idx) => (
              <Link
                key={u.id}
                href={`/admin01/users/${u.id}`}
                className="grid grid-cols-12 gap-4 border-b border-white/[0.04] px-5 py-2.5 text-sm hover:bg-yellow-400/[0.03] transition-colors"
              >
                <span className="col-span-1 text-zinc-500 font-mono tabular-nums">
                  #{idx + 1}
                </span>
                <div className="col-span-5 min-w-0">
                  <p className="text-white truncate">{u.name ?? u.email}</p>
                  <p className="text-[10px] text-zinc-500 truncate font-mono">
                    {u.email}
                  </p>
                </div>
                <span className="col-span-2 text-right font-mono text-yellow-200 font-bold tabular-nums">
                  {formatBRL(u.balanceCents)}
                </span>
                <span className="col-span-2 text-right font-mono text-zinc-400 tabular-nums">
                  {formatBRL(u.pendingBalanceCents)}
                </span>
                <span className="col-span-1 text-right">
                  <span
                    className={`text-[9px] uppercase font-bold ${
                      u.kycStatus === "approved"
                        ? "text-cyan-300"
                        : u.kycStatus === "in_review"
                          ? "text-yellow-300"
                          : u.kycStatus === "rejected"
                            ? "text-red-300"
                            : "text-zinc-500"
                    }`}
                  >
                    {u.kycStatus === "approved"
                      ? "OK"
                      : u.kycStatus === "in_review"
                        ? "rev"
                        : u.kycStatus === "rejected"
                          ? "rej"
                          : "—"}
                  </span>
                </span>
                <span className="col-span-1 text-right text-[9px] uppercase font-bold">
                  {u.blocked ? (
                    <span className="text-red-300">BLOQ</span>
                  ) : (
                    <span className="text-cyan-300">ok</span>
                  )}
                </span>
              </Link>
            ))
          )}
        </div>
      </details>

      {/* ===== (portado de /insights) CONVERSÃO POR ADQUIRENTE (colapsado) ===== */}
      <details className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <summary className="cursor-pointer select-none border-b border-white/[0.06] px-5 py-3 hover:bg-white/[0.02]">
          <h2 className="text-sm font-semibold text-white">
            Conversão por adquirente
          </h2>
          <p className="text-[11px] text-zinc-500">
            Acumulado lifetime (tentativas vs aprovadas, somado de todos os
            sellers).
          </p>
        </summary>
        <div className="divide-y divide-white/[0.04]">
          {acqConvRows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              Nenhuma adquirente.
            </p>
          ) : (
            acqConvRows.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 px-5 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-200 truncate flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-zinc-500">
                      {a.shortCode || a.code}
                    </span>
                    <span className="truncate">{acquirerNominalLabel(a.nominalName, a.institution)}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${
                        a.mode === "white"
                          ? "bg-zinc-200/10 text-zinc-300"
                          : a.mode === "both"
                            ? "bg-blue-400/15 text-blue-300"
                            : "bg-zinc-700/40 text-zinc-400"
                      }`}
                    >
                      {a.mode}
                    </span>
                    {(!a.active || !a.globalEnabled) && (
                      <span className="rounded-full bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 text-[8px] font-bold text-red-300">
                        off
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {a.approved}/{a.attempts} aprovadas
                  </p>
                </div>
                <div className="hidden sm:block w-32 h-2 rounded-full bg-white/[0.06] overflow-hidden shrink-0">
                  <div
                    className={`h-full ${
                      a.rate === null
                        ? ""
                        : a.rate >= 70
                          ? "bg-cyan-400"
                          : a.rate >= 40
                            ? "bg-yellow-400"
                            : "bg-red-400"
                    }`}
                    style={{ width: `${a.rate ?? 0}%` }}
                  />
                </div>
                <span
                  className={`w-14 text-right font-mono tabular-nums shrink-0 ${
                    a.rate === null
                      ? "text-zinc-600"
                      : a.rate >= 70
                        ? "text-cyan-300"
                        : a.rate >= 40
                          ? "text-yellow-300"
                          : "text-red-300"
                  }`}
                >
                  {a.rate === null ? "—" : `${a.rate.toFixed(0)}%`}
                </span>
              </div>
            ))
          )}
        </div>
      </details>

      {/* ===== (portado de /insights) VENDAS AO VIVO — lucro do gateway/linha (colapsado) ==== */}
      <details className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <summary className="cursor-pointer select-none border-b border-white/[0.06] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="relative inline-flex size-2 rounded-full bg-cyan-400" />
            </span>
            <h2 className="text-sm font-semibold text-white">Vendas ao vivo</h2>
            <span className="text-[10px] text-zinc-500">
              últimas 30 · lucro do gateway por venda
            </span>
          </div>
        </summary>
        <div className="max-h-[28rem] overflow-y-auto divide-y divide-white/[0.04]">
          {liveSales.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              Nenhuma venda ainda.
            </p>
          ) : (
            liveSales.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-5 py-2.5 text-sm"
              >
                <span className="text-[10px] text-zinc-500 w-10 shrink-0 tabular-nums">
                  {timeAgo(s.paidAt)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-200 truncate">
                    {s.seller}
                    {s.diverted && (
                      <span className="ml-1.5 rounded-full bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 text-[9px] font-bold text-red-300">
                        desviada
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-zinc-500 truncate">
                    {s.customerEmail ?? "—"} · {s.method} · {s.provider}
                  </p>
                </div>
                <span
                  className="shrink-0 font-mono tabular-nums text-cyan-300"
                  title="Lucro do gateway (feeCents)"
                >
                  {formatBRL(s.feeCents)}
                </span>
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}

function RangeFilter({
  currentRange,
  from,
  to,
}: {
  currentRange: string;
  from?: string;
  to?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1.5">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={`?range=${r.key}`}
          className={`rounded-lg px-3 py-1.5 text-xs transition ${
            currentRange === r.key
              ? "bg-cyan-400 text-black font-semibold"
              : "text-zinc-300 hover:bg-white/[0.05]"
          }`}
        >
          {r.label}
        </Link>
      ))}
      <form method="GET" className="flex items-center gap-1">
        <input type="hidden" name="range" value="custom" />
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1 text-xs text-zinc-200"
        />
        <span className="text-[10px] text-zinc-500">→</span>
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1 text-xs text-zinc-200"
        />
        <button
          type="submit"
          className={`rounded-lg px-3 py-1.5 text-xs transition ${
            currentRange === "custom"
              ? "bg-cyan-400 text-black font-semibold"
              : "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]"
          }`}
        >
          Aplicar
        </button>
      </form>
    </div>
  );
}

function MetricCard({
  Icon,
  label,
  value,
  sub,
  accent,
}: {
  Icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
        {Icon && <Icon className="size-3" />}
        {label}
      </div>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums font-mono ${accent ?? "text-white"}`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function NeonUsageCard({ snap }: { snap: NeonUsageSnapshot }) {
  const pct = Math.min(100, Math.round(snap.pct * 100));
  const tone =
    snap.level === "crit"
      ? { border: "border-red-500/30", text: "text-red-300", bar: "bg-red-400" }
      : snap.level === "warn"
        ? { border: "border-amber-500/30", text: "text-amber-300", bar: "bg-amber-400" }
        : { border: "border-white/[0.08]", text: "text-cyan-300", bar: "bg-cyan-400" };
  const periodEnd = snap.periodEnd
    ? new Date(snap.periodEnd).toLocaleDateString("pt-BR")
    : "—";
  const fetchedAt = snap.fetchedAt
    ? new Date(snap.fetchedAt).toLocaleString("pt-BR")
    : "—";
  return (
    <div className={`rounded-2xl border ${tone.border} bg-white/[0.02] p-5`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
          <Database className="size-3" />
          Neon · data-transfer (período)
        </div>
        {snap.subscriptionType && (
          <span className="text-[10px] text-zinc-600">{snap.subscriptionType}</span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums font-mono ${tone.text}`}>
        {snap.usedGb.toFixed(2)} GB{" "}
        <span className="text-sm text-zinc-500">
          / {snap.capGb} GB · {pct}%
        </span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-zinc-500 mt-1.5">
        Projeção ~{snap.projectedGb.toFixed(1)} GB até {periodEnd} · atualizado {fetchedAt}
      </p>
    </div>
  );
}
