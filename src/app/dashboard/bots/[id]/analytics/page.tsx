import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, BarChart3, TrendingDown, TrendingUp, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * 22/07/2026 (davi fase 3): dashboard drop-off do funil de bot. Mostra
 * quantos clientes entram em cada nó e onde o funil perde gente. Alimentado
 * por BotAnalyticsEvent (emitido pelo runtime a cada nó executado).
 * Janela padrão: últimos 7 dias.
 */
export default async function BotAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: botId } = await params;
  const userId = await requireUserId();

  const bot = await prisma.saleBot.findFirst({
    where: { id: botId, userId, type: "telegram" },
    select: { id: true, name: true },
  });
  if (!bot) notFound();

  const funnel = await prisma.funnel.findFirst({
    where: { userId, kind: "bot", botId: bot.id, active: true },
    select: { id: true, name: true, graph: true },
  });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Agrega eventos por nó (janela 7 dias)
  type Row = { nodeId: string; nodeType: string | null; enters: bigint; converts: bigint; clicks: bigint; answers: bigint };
  const rows = funnel
    ? await prisma.$queryRaw<Row[]>`
        SELECT
          "nodeId",
          MAX("nodeType") as "nodeType",
          COUNT(*) FILTER (WHERE event = 'enter')::bigint as enters,
          COUNT(*) FILTER (WHERE event = 'convert')::bigint as converts,
          COUNT(*) FILTER (WHERE event = 'click')::bigint as clicks,
          COUNT(*) FILTER (WHERE event = 'answer')::bigint as answers
        FROM "BotAnalyticsEvent"
        WHERE "botId" = ${bot.id}
          AND "funnelId" = ${funnel.id}
          AND "createdAt" >= ${since}
        GROUP BY "nodeId"
      `
    : [];

  // Métricas gerais
  const [uniqueChats7d, converts7d, activeConversations] = await Promise.all([
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(DISTINCT "chatId")::bigint as n
      FROM "BotAnalyticsEvent"
      WHERE "botId" = ${bot.id}
        AND event = 'enter'
        AND "createdAt" >= ${since}
    `.then((r) => Number(r[0]?.n ?? 0)),
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint as n
      FROM "BotAnalyticsEvent"
      WHERE "botId" = ${bot.id}
        AND event = 'convert'
        AND "createdAt" >= ${since}
    `.then((r) => Number(r[0]?.n ?? 0)),
    prisma.botConversation.count({
      where: { botId: bot.id, status: { in: ["waiting_payment", "waiting_callback", "waiting_input", "sleeping"] } },
    }),
  ]);

  // Enriquece cada nó com label (a partir do graph)
  const nodeLabels = new Map<string, { label: string; type: string }>();
  if (funnel?.graph && typeof funnel.graph === "object") {
    const g = funnel.graph as { nodes?: Array<Record<string, unknown>> };
    const gn = Array.isArray(g.nodes) ? g.nodes : [];
    for (const n of gn) {
      const nid = String(n.id ?? "");
      const type = String(n.type ?? "");
      const d = (n.data ?? {}) as Record<string, unknown>;
      let label = type;
      if (type === "message") label = `💬 ${String(d.text ?? "").slice(0, 40)}`;
      else if (type === "payment") label = `💳 ${String(d.checkoutName ?? d.productName ?? "?")}`;
      else if (type === "botproduct") label = `🛒 ${String(d.name ?? "?")}`;
      else if (type === "input") label = `❓ ${String(d.prompt ?? "").slice(0, 40)}`;
      else if (type === "buttons") label = `🔘 ${String(d.text ?? "").slice(0, 40)}`;
      else if (type === "poll") label = `🗳 ${String(d.question ?? "").slice(0, 40)}`;
      else if (type === "reengage" || type === "wait") {
        // `wait` é o bloco antigo — funil salvo antes de 29/07/2026 ainda tem.
        const every = Number(d.intervalMinutes ?? d.minutes ?? 360);
        const n = Array.isArray(d.messages) ? d.messages.length : 0;
        label = `🔁 reengajar ${n} msg · a cada ${every} min`;
      }
      else if (type === "coupon") label = `🎟 cupom ({{${d.varName ?? "cupom"}}})`;
      else if (type === "condition") label = `🔀 condição ${d.kind}`;
      else if (type === "random") label = "🎲 random";
      else if (type === "image" || type === "video" || type === "gif" || type === "audio") label = `📎 ${type}`;
      else if (type === "delay") label = `⏳ delay ${d.seconds ?? 2}s`;
      else if (type === "location") label = `📍 localização`;
      nodeLabels.set(nid, { label, type });
    }
  }

  // Ordena por enters DESC pra mostrar quem tem mais tráfego
  const rowsSorted = [...rows].sort((a, b) => Number(b.enters) - Number(a.enters));
  const totalEnters = rowsSorted.reduce((s, r) => s + Number(r.enters), 0);
  const maxEnters = Math.max(...rowsSorted.map((r) => Number(r.enters)), 1);

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <header>
        <Link
          href={`/dashboard/bots/${bot.id}`}
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
        >
          <ChevronLeft className="size-3" /> Voltar
        </Link>
        <div className="mt-3 flex items-center gap-3 min-w-0">
          <div className="flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-300">
            <BarChart3 className="size-5 sm:size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg sm:text-2xl font-semibold text-white">
              Analytics · <span className="text-emerald-200">{bot.name}</span>
            </h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Últimos 7 dias · onde o funil perde gente
            </p>
          </div>
        </div>
      </header>

      {/* KPIs — 3 colunas sempre (compactas em mobile) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Kpi label="Iniciaram" value={uniqueChats7d} icon={<Users className="size-4" />} tint="text-sky-300" />
        <Kpi label="Pagaram" value={converts7d} icon={<TrendingUp className="size-4" />} tint="text-cyan-300" />
        <Kpi label="Ativas" value={activeConversations} icon={<TrendingDown className="size-4" />} tint="text-amber-300" />
      </div>

      {/* Funil por nó */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-6">
        <p className="text-base font-semibold text-white">Passos do funil</p>
        <p className="text-[11px] text-zinc-500 mt-0.5 mb-4 leading-snug">
          {funnel
            ? `Ordenado por volume. Barra = ${totalEnters} enters totais em 7 dias.`
            : "Nenhum funil ativo neste bot."}
        </p>

        {rowsSorted.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Nenhum evento nos últimos 7 dias. Analytics só começa a aparecer
            quando clientes disparam <code>/start</code>.
          </p>
        ) : (
          <div className="space-y-2">
            {rowsSorted.map((r) => {
              const label = nodeLabels.get(r.nodeId)?.label ?? `(node apagado) ${r.nodeId.slice(0, 6)}...`;
              const enters = Number(r.enters);
              const converts = Number(r.converts);
              const clicks = Number(r.clicks);
              const answers = Number(r.answers);
              const width = (enters / maxEnters) * 100;
              const convertRate = enters > 0 ? (converts / enters) * 100 : 0;
              return (
                <div
                  key={r.nodeId}
                  className="rounded-lg border border-white/[0.06] bg-black/20 p-3"
                >
                  <p className="truncate text-xs text-zinc-200" title={label}>
                    {label}
                  </p>
                  <div className="mt-1 flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[10px]">
                    <span className="text-zinc-500">enters</span>
                    <span className="font-mono font-semibold text-white">{enters}</span>
                    {converts > 0 && (
                      <>
                        <span className="hidden sm:inline text-zinc-600">·</span>
                        <span className="text-cyan-300">💳 {converts}</span>
                      </>
                    )}
                    {clicks > 0 && (
                      <>
                        <span className="hidden sm:inline text-zinc-600">·</span>
                        <span className="text-sky-300">🔘 {clicks}</span>
                      </>
                    )}
                    {answers > 0 && (
                      <>
                        <span className="hidden sm:inline text-zinc-600">·</span>
                        <span className="text-teal-300">💬 {answers}</span>
                      </>
                    )}
                    {converts > 0 && (
                      <>
                        <span className="hidden sm:inline text-zinc-600">·</span>
                        <span
                          className={
                            convertRate >= 20
                              ? "font-semibold text-cyan-300"
                              : "text-zinc-400"
                          }
                        >
                          {convertRate.toFixed(1)}%
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, tint }: { label: string; value: number; icon: React.ReactNode; tint: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
      <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-500 truncate">{label}</p>
      <p className={`mt-1 text-lg sm:text-2xl font-semibold text-white flex items-center gap-1.5 sm:gap-2`}>
        <span className={`${tint} shrink-0`}>{icon}</span>
        <span className="truncate">{value.toLocaleString("pt-BR")}</span>
      </p>
    </div>
  );
}
