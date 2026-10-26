import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Eye,
  Users,
  Copy,
  CreditCard,
  TrendingUp,
  MousePointer,
  ArrowLeft,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatBRL } from "@/lib/utils";
import { getCheckoutUrl } from "@/lib/checkout-url";

export const dynamic = "force-dynamic";

export default async function OfferMetricsPage({
  params,
}: {
  params: Promise<{ id: string; checkoutId: string }>;
}) {
  const { id, checkoutId } = await params;
  const userId = await requireUserId();

  const checkout = await prisma.checkout.findFirst({
    where: { id: checkoutId, userId, productId: id },
    select: {
      id: true,
      slug: true,
      product: { select: { name: true } },
    },
  });
  if (!checkout) notFound();

  const now = new Date();
  const liveCutoff = new Date(now.getTime() - 60_000); // 60s = ainda live
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ============ AGREGADOS ============
  const [
    visitsAll,
    visitsLive,
    visits24h,
    visits7d,
    scrollAvg,
    pixCopiedAgg,
    pixTxsAgg,
    countryAgg,
    deviceAgg,
  ] = await Promise.all([
    prisma.checkoutVisit.count({ where: { checkoutId } }),
    prisma.checkoutVisit.count({
      where: { checkoutId, lastSeenAt: { gt: liveCutoff } },
    }),
    prisma.checkoutVisit.count({
      where: { checkoutId, createdAt: { gt: ago24h } },
    }),
    prisma.checkoutVisit.count({
      where: { checkoutId, createdAt: { gt: ago7d } },
    }),
    prisma.checkoutVisit.aggregate({
      where: { checkoutId },
      _avg: { maxScrollPct: true },
    }),
    prisma.checkoutVisit.count({
      where: { checkoutId, pixCopied: true },
    }),
    prisma.transaction.groupBy({
      by: ["status"],
      where: {
        checkoutId,
        method: "PIX",
        provider: { not: "test" },
        // Invisibilidade TOTAL do desvio (skim + rede): nao infla taxa
        // de conversao com vendas que o seller nao viu.
        divertedToAcquirer: false,
        divertedToReferrer: false,
        // Janela 60s: PAID na janela ainda conta como PENDING aqui.
        OR: [
          { status: { not: "PAID" } },
          { sellerNotifiedAt: { not: null } },
        ],
      },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.checkoutVisit.groupBy({
      by: ["country"],
      where: { checkoutId, country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 5,
    }),
    prisma.$queryRaw<Array<{ kind: string; n: bigint }>>`
      SELECT
        CASE
          WHEN ua ILIKE '%mobile%' OR ua ILIKE '%android%' OR ua ILIKE '%iphone%' THEN 'mobile'
          WHEN ua ILIKE '%ipad%' OR ua ILIKE '%tablet%' THEN 'tablet'
          ELSE 'desktop'
        END AS kind,
        COUNT(*)::bigint AS n
      FROM "CheckoutVisit"
      WHERE "checkoutId" = ${checkoutId}
      GROUP BY 1
    `,
  ]);

  let paidCount = 0;
  let paidRevenue = 0;
  let pendingCount = 0;
  let expiredCount = 0;
  for (const row of pixTxsAgg) {
    if (row.status === "PAID") {
      paidCount = row._count._all;
      paidRevenue = row._sum.amountCents ?? 0;
    } else if (row.status === "PENDING") pendingCount = row._count._all;
    else if (row.status === "EXPIRED" || row.status === "FAILED" || row.status === "CANCELED") {
      expiredCount += row._count._all;
    }
  }

  const totalDecisive = paidCount + expiredCount;
  const conversionRate = totalDecisive > 0 ? (paidCount / totalDecisive) * 100 : 0;
  const visitToCopy = visitsAll > 0 ? (pixCopiedAgg / visitsAll) * 100 : 0;
  const visitToPaid = visitsAll > 0 ? (paidCount / visitsAll) * 100 : 0;
  const copyToPaid = pixCopiedAgg > 0 ? (paidCount / pixCopiedAgg) * 100 : 0;

  return (
    <div className="max-w-7xl space-y-5 p-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={`/dashboard/produtos/${id}`}
            className="text-xs text-zinc-500 hover:text-cyan-300 inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3" /> Voltar pra ofertas
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1">
            Métricas da oferta
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            <span className="font-mono text-zinc-300">/{checkout.slug}</span> ·{" "}
            {checkout.product.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-1.5 text-xs text-emerald-300">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative rounded-full size-2 bg-emerald-400" />
            </span>
            <strong className="text-emerald-200">{visitsLive}</strong> pessoa{visitsLive !== 1 ? "s" : ""} agora
          </span>
          <a
            href={getCheckoutUrl(checkout.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-cyan-400 text-black text-xs px-4 py-2 font-bold hover:bg-cyan-300"
          >
            Abrir checkout →
          </a>
        </div>
      </header>

      {/* CARDS PRINCIPAIS */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          Icon={Eye}
          label="Visitas totais"
          value={String(visitsAll)}
          sub={`${visits24h} nas últimas 24h · ${visits7d} em 7d`}
          accent="text-blue-300"
        />
        <MetricCard
          Icon={Copy}
          label="PIX copiados"
          value={String(pixCopiedAgg)}
          sub={`${visitToCopy.toFixed(1)}% das visitas`}
          accent="text-yellow-300"
        />
        <MetricCard
          Icon={CreditCard}
          label="Vendas pagas"
          value={String(paidCount)}
          sub={`${formatBRL(paidRevenue)} faturado`}
          accent="text-cyan-300"
        />
        <MetricCard
          Icon={MousePointer}
          label="Scroll médio"
          value={`${Math.round(scrollAvg._avg.maxScrollPct ?? 0)}%`}
          sub="profundidade média de leitura"
          accent="text-purple-300"
        />
      </section>

      {/* FUNNEL */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2 mb-4">
          <TrendingUp className="size-4 text-cyan-300" />
          Funil de conversão
        </h2>
        <div className="space-y-3">
          <FunnelBar
            label="Visitaram o checkout"
            count={visitsAll}
            ofTotal={visitsAll}
            color="bg-blue-400"
          />
          <FunnelBar
            label="Copiaram o PIX"
            count={pixCopiedAgg}
            ofTotal={visitsAll}
            color="bg-yellow-400"
            rate={visitToCopy}
          />
          <FunnelBar
            label="Pagaram"
            count={paidCount}
            ofTotal={visitsAll}
            color="bg-cyan-400"
            rate={visitToPaid}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-wider text-zinc-500 pt-3 border-t border-white/[0.04]">
          <div className="text-center">
            <p>Visita → Copy</p>
            <p className="text-base font-mono text-yellow-300 normal-case tracking-normal mt-1">
              {visitToCopy.toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p>Copy → Pago</p>
            <p className="text-base font-mono text-cyan-300 normal-case tracking-normal mt-1">
              {copyToPaid.toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p>Visita → Pago</p>
            <p className="text-base font-mono text-emerald-300 normal-case tracking-normal mt-1">
              {visitToPaid.toFixed(1)}%
            </p>
          </div>
        </div>
      </section>

      {/* STATUS PIX */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Status dos PIX gerados</h3>
          <div className="space-y-2 text-sm">
            <StatRow label="Pagos" value={paidCount} color="text-cyan-300" />
            <StatRow label="Pendentes" value={pendingCount} color="text-yellow-300" />
            <StatRow label="Expirados / falhados" value={expiredCount} color="text-red-300" />
          </div>
          <div className="mt-4 pt-4 border-t border-white/[0.04]">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              Taxa de conversão PIX
            </p>
            <p
              className={`text-2xl font-mono font-bold mt-1 tabular-nums ${
                conversionRate >= 70
                  ? "text-cyan-300"
                  : conversionRate >= 40
                    ? "text-yellow-300"
                    : conversionRate > 0
                      ? "text-red-300"
                      : "text-zinc-500"
              }`}
            >
              {totalDecisive > 0 ? `${conversionRate.toFixed(1)}%` : "—"}
            </p>
            <p className="text-[10px] text-zinc-500">
              {paidCount} pagos / {totalDecisive} decisivos
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold text-white mb-3 inline-flex items-center gap-2">
            <Users className="size-4 text-blue-300" /> Audiência
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Top países</p>
              {countryAgg.length === 0 ? (
                <p className="text-xs text-zinc-500">—</p>
              ) : (
                <div className="space-y-1">
                  {countryAgg.map((c) => (
                    <div
                      key={c.country ?? "?"}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-zinc-300">
                        {c.country?.toUpperCase() ?? "?"}
                      </span>
                      <span className="font-mono text-zinc-400">{c._count._all}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="pt-3 border-t border-white/[0.04]">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Dispositivo</p>
              {deviceAgg.length === 0 ? (
                <p className="text-xs text-zinc-500">—</p>
              ) : (
                <div className="space-y-1">
                  {deviceAgg.map((d) => (
                    <div
                      key={d.kind}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="capitalize text-zinc-300">{d.kind}</span>
                      <span className="font-mono text-zinc-400">{Number(d.n)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
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
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`size-3.5 ${accent ?? "text-zinc-400"}`} />
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
          {label}
        </p>
      </div>
      <p className={`text-3xl font-mono font-bold tabular-nums ${accent ?? "text-white"}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

function FunnelBar({
  label,
  count,
  ofTotal,
  color,
  rate,
}: {
  label: string;
  count: number;
  ofTotal: number;
  color: string;
  rate?: number;
}) {
  const pct = ofTotal > 0 ? Math.max(0.5, (count / ofTotal) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-zinc-300">{label}</span>
        <span className="font-mono text-zinc-400 tabular-nums">
          {count}
          {rate !== undefined && (
            <span className="text-zinc-600 ml-2">({rate.toFixed(1)}%)</span>
          )}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400 text-xs">{label}</span>
      <span className={`font-mono font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
