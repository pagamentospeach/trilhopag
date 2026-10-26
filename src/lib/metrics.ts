import { prisma } from "./prisma";

export async function getDashboardMetrics(userId: string) {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [
    user,
    paid30,
    paidPrev30,
    pending,
    methodGroups,
    statusGroups,
    topProducts,
    daily,
    visitsCount,
    pixGenerated30,
    pixPaid30,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { balanceCents: true, pendingBalanceCents: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, provider: { not: "test" }, divertedToAcquirer: false, divertedToReferrer: false, status: "PAID", paidAt: { gte: since30 } },
      _sum: { amountCents: true, netCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        provider: { not: "test" },
        divertedToAcquirer: false,
        divertedToReferrer: false,
        status: "PAID",
        paidAt: { gte: since60, lt: since30 },
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, provider: { not: "test" }, divertedToAcquirer: false, divertedToReferrer: false, status: "PENDING", createdAt: { gte: since30 } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["method"],
      where: { userId, provider: { not: "test" }, divertedToAcquirer: false, divertedToReferrer: false, status: "PAID", paidAt: { gte: since30 } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["status"],
      where: { userId, provider: { not: "test" }, divertedToAcquirer: false, divertedToReferrer: false, createdAt: { gte: since30 } },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["productId"],
      where: { userId, provider: { not: "test" }, divertedToAcquirer: false, divertedToReferrer: false, status: "PAID", paidAt: { gte: since30 } },
      _sum: { amountCents: true },
      _count: { _all: true },
      orderBy: { _sum: { amountCents: "desc" } },
      take: 5,
    }),
    prisma.$queryRaw<Array<{ day: Date; gross: bigint; count: bigint }>>`
      SELECT
        date_trunc('day', "paidAt") AS day,
        SUM("amountCents")::bigint AS gross,
        COUNT(*)::bigint AS count
      FROM "Transaction"
      WHERE "userId" = ${userId}
        AND "status" = 'PAID'
        AND "provider" <> 'test'
        AND "divertedToAcquirer" = false
        AND "divertedToReferrer" = false
        AND "paidAt" >= ${since30}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.checkout.findMany({
      where: { userId },
      select: { variants: { select: { visits: true } } },
    }),
    /// Pix gerados nos últimos 30d (independente de status)
    prisma.transaction.count({
      where: {
        userId,
        provider: { not: "test" },
        divertedToAcquirer: false,
        divertedToReferrer: false,
        method: "PIX",
        createdAt: { gte: since30 },
      },
    }),
    /// Pix gerados e pagos nos últimos 30d
    prisma.transaction.count({
      where: {
        userId,
        provider: { not: "test" },
        divertedToAcquirer: false,
        divertedToReferrer: false,
        method: "PIX",
        status: "PAID",
        createdAt: { gte: since30 },
      },
    }),
  ]);

  const totalVisits = visitsCount.reduce(
    (acc, c) => acc + c.variants.reduce((s, v) => s + v.visits, 0),
    0,
  );

  const dailyMap = new Map<string, { gross: number; count: number }>();
  daily.forEach((row) => {
    const k = row.day.toISOString().slice(0, 10);
    dailyMap.set(k, {
      gross: Number(row.gross ?? 0),
      count: Number(row.count ?? 0),
    });
  });

  const series: Array<{ date: string; label: string; revenueCents: number; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const k = d.toISOString().slice(0, 10);
    const row = dailyMap.get(k) ?? { gross: 0, count: 0 };
    series.push({
      date: k,
      label: `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      revenueCents: row.gross,
      count: row.count,
    });
  }

  const productIds = topProducts.map((t) => t.productId);
  const products =
    productIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
  const productNameMap = new Map(products.map((p) => [p.id, p.name]));

  const grossNow = paid30._sum.amountCents ?? 0;
  const grossPrev = paidPrev30._sum.amountCents ?? 0;
  const growthPct =
    grossPrev > 0 ? ((grossNow - grossPrev) / grossPrev) * 100 : null;

  const conversionRate =
    totalVisits > 0 ? (paid30._count._all / totalVisits) * 100 : null;

  /// Conversão do Pix: dos Pix gerados, quantos % foram pagos?
  const pixConversionRate =
    pixGenerated30 > 0 ? (pixPaid30 / pixGenerated30) * 100 : null;

  return {
    balanceCents: user?.balanceCents ?? 0,
    pendingBalanceCents: user?.pendingBalanceCents ?? 0,
    grossCents: grossNow,
    netCents: paid30._sum.netCents ?? 0,
    salesCount: paid30._count._all,
    pendingCount: pending._count._all,
    pendingValueCents: pending._sum.amountCents ?? 0,
    growthPct,
    conversionRate,
    pixGenerated: pixGenerated30,
    pixPaid: pixPaid30,
    pixConversionRate,
    visits: totalVisits,
    methodBreakdown: methodGroups.map((m) => ({
      method: m.method,
      amountCents: m._sum.amountCents ?? 0,
      count: m._count._all,
    })),
    statusBreakdown: statusGroups.map((s) => ({
      status: s.status,
      count: s._count._all,
    })),
    topProducts: topProducts.map((t) => ({
      productId: t.productId,
      name: productNameMap.get(t.productId) ?? "—",
      amountCents: t._sum.amountCents ?? 0,
      count: t._count._all,
    })),
    series,
  };
}

export type DashboardMetrics = Awaited<ReturnType<typeof getDashboardMetrics>>;
