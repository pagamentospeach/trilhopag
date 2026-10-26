import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  Edit3,
  ChevronLeft,
  Clapperboard,
  Banknote,
  Bell,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatBRL } from "@/lib/utils";
import { RevenueChart } from "@/components/dashboard/revenue-chart-lazy";
import { GoalTracker } from "@/components/dashboard/goal-tracker";
import { LiveFeed } from "@/components/dashboard/live-feed";

export const dynamic = "force-dynamic";

/**
 * VIEW da sub-conta — renderiza um dashboard 100% fake usando os
 * números salvos. Visualmente espelha o /dashboard real (cards,
 * gráfico, feed) mas SEM nenhum dado real.
 *
 * Acesso: só o owner da sub-conta (com isPlayerDivulgador=true).
 *
 * Ideal pra screen recording / Reels: a URL é estável e a página é
 * estática (nenhuma interação dispara nada real).
 */
export default async function DivulgadorViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlayerDivulgador: true },
  });
  if (!u || !u.isPlayerDivulgador) {
    redirect("/dashboard");
  }

  const a = await prisma.divulgadorAccount.findFirst({
    where: { id, ownerUserId: userId },
  });
  if (!a) notFound();

  // Constrói série pro gráfico (RevenueChart espera { date, label, revenueCents, count })
  const seriesArr = Array.isArray(a.seriesJson)
    ? (a.seriesJson as number[])
    : [];
  const now = new Date();
  const series = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - (29 - i));
    return {
      date: d.toISOString().slice(0, 10),
      label: `${String(d.getUTCDate()).padStart(2, "0")}/${String(
        d.getUTCMonth() + 1,
      ).padStart(2, "0")}`,
      revenueCents: seriesArr[i] ?? 0,
      count: Math.max(0, Math.round((seriesArr[i] ?? 0) / 5000)),
    };
  });

  const feedRows = Array.isArray(a.feedJson)
    ? (a.feedJson as Array<{
        id: string;
        amount_cents: number;
        net_cents: number;
        product: string;
        customer_name: string | null;
        method: string;
        paid_at: string;
      }>)
    : [];

  const withdrawalsRows = Array.isArray(a.withdrawalsJson)
    ? (a.withdrawalsJson as Array<{
        id: string;
        amount_cents: number;
        method: string;
        status: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
        paid_at: string;
        pix_key?: string | null;
      }>)
    : [];

  const notificationsRows = Array.isArray(a.notificationsJson)
    ? (a.notificationsJson as Array<{
        id: string;
        kind: "paid" | "pending" | "withdrawal";
        title: string;
        body: string;
        amount_cents: number;
        at: string;
      }>)
    : [];

  // Métricas individuais (widgets)
  const metricsObj = (a.metricsJson ?? {}) as Record<
    string,
    { value: string; sub?: string | null }
  >;
  // Defaults pra alguns widgets quando user não setou (usa valores diretos)
  const fallbackMetrics: Record<string, { value: string; sub?: string }> = {
    faturamento_bruto: {
      value: formatBRL(a.last30dRevenueCents),
      sub: `${a.last30dSalesCount} venda${a.last30dSalesCount !== 1 ? "s" : ""}`,
    },
    faturamento_liquido: {
      value: formatBRL(a.lifetimeNetCents),
    },
    vendas_pagas: { value: String(a.last30dSalesCount) },
  };
  const widgetValues = { ...fallbackMetrics, ...metricsObj };
  const widgetKeys = Array.from(
    new Set([
      "faturamento_bruto",
      "faturamento_liquido",
      "vendas_pagas",
      "gasto_ads",
      "lucro",
      "roas",
      "cpa",
      "taxa_aprovacao_pix",
      "arpu",
      ...Object.keys(metricsObj),
    ]),
  );

  const grossCents = seriesArr.reduce((s, c) => s + c, 0) || a.last30dRevenueCents;
  const salesCount = a.last30dSalesCount;

  // Days left in month NO FUSO DE BRASÍLIA (UTC-3) pro GoalTracker.
  const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const lastDayOfMonth = new Date(
    Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const daysLeft = Math.max(0, lastDayOfMonth - brtNow.getUTCDate());

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Topbar (só admin/owner vê — não aparece em screenshot se rolar) */}
      <div className="flex items-center gap-3 rounded-2xl border border-purple-400/30 bg-purple-400/[0.06] px-4 py-3 print:hidden">
        <Clapperboard className="size-4 text-purple-300 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-purple-100">
            VIEW DA SUB-CONTA: {a.name}
          </p>
          <p className="text-[11px] text-purple-200/70 truncate">
            Esta página é 100% visual. Nada aqui é real — saldo, vendas,
            métricas tudo são números editados por você.
          </p>
        </div>
        <Link
          href={`/dashboard/divulgador/${a.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.08] shrink-0"
        >
          <Edit3 className="size-3" /> Editar números
        </Link>
        <Link
          href="/dashboard/divulgador"
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.08] shrink-0"
        >
          <ChevronLeft className="size-3" /> Voltar
        </Link>
      </div>

      {/* HEADER FAKE — saudação + nome */}
      <div className="flex items-center gap-4">
        {a.avatarUrl ? (
          <div className="size-12 rounded-full overflow-hidden shrink-0 border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.avatarUrl}
              alt=""
              className="size-full object-cover"
            />
          </div>
        ) : null}
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            {getGreeting()}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Bem-vindo, {a.name} 👋
          </h1>
          <p className="text-sm text-zinc-400">
            Resumo da sua operação nos últimos 30 dias.
          </p>
        </div>
      </div>

      {/* SALDO + HOJE — cards destacados */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BigStat
          label="Saldo disponível"
          value={formatBRL(a.balanceCents)}
          accent="text-cyan-300"
        />
        <BigStat
          label="Saldo pendente"
          value={formatBRL(a.pendingBalanceCents)}
          accent="text-yellow-300"
        />
        <BigStat
          label="Hoje"
          value={formatBRL(a.todayRevenueCents)}
          sub={`${a.todaySalesCount} venda${a.todaySalesCount !== 1 ? "s" : ""}`}
          accent="text-purple-300"
        />
        <BigStat
          label="Últimos 30 dias"
          value={formatBRL(a.last30dRevenueCents)}
          sub={`${a.last30dSalesCount} venda${a.last30dSalesCount !== 1 ? "s" : ""}`}
        />
      </div>

      {/* GOAL TRACKER */}
      {a.monthlyGoalCents > 0 && (
        <GoalTracker
          earnedCents={a.last30dRevenueCents}
          goalCents={a.monthlyGoalCents}
          daysLeft={daysLeft}
        />
      )}

      {/* WIDGET CARDS — métricas customizadas */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {widgetKeys.map((k) => {
          const v = widgetValues[k];
          if (!v) return null;
          return (
            <div
              key={k}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4"
            >
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 truncate">
                {prettyLabel(k)}
              </p>
              <p className="mt-1 text-xl font-bold text-white tabular-nums">
                {v.value}
              </p>
              {v.sub && (
                <p className="mt-0.5 text-[10px] text-zinc-500">{v.sub}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* CHART + FEED */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-white">
                Receita 30 dias
              </h2>
              <p className="text-xs text-zinc-500">
                {formatBRL(grossCents)} bruto · {salesCount} vendas
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
              Vendas <ArrowUpRight className="size-3" />
            </span>
          </div>
          <RevenueChart data={series} />
        </div>

        <LiveFeed initial={feedRows} soundEnabled={false} />
      </div>

      {/* GMV / Lifetime */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <BigStat
          label="GMV lifetime"
          value={formatBRL(a.lifetimeRevenueCents)}
          sub="Faturamento bruto total"
        />
        <BigStat
          label="Net lifetime"
          value={formatBRL(a.lifetimeNetCents)}
          sub="Líquido total"
          accent="text-cyan-300"
        />
      </div>

      {/* SAQUES + NOTIFICAÇÕES — 2 colunas no desktop */}
      {(withdrawalsRows.length > 0 || notificationsRows.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {withdrawalsRows.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <div className="mb-3 flex items-center gap-2">
                <Banknote className="size-4 text-cyan-300" />
                <h2 className="text-sm font-medium text-white">
                  Saques pagos
                </h2>
                <span className="text-[10px] text-zinc-500 ml-auto">
                  Histórico
                </span>
              </div>
              <div className="space-y-2">
                {withdrawalsRows.slice(0, 10).map((w) => {
                  const StatusIcon =
                    w.status === "PAID"
                      ? CheckCircle2
                      : w.status === "FAILED"
                        ? XCircle
                        : Clock;
                  const statusColor =
                    w.status === "PAID"
                      ? "text-cyan-300"
                      : w.status === "FAILED"
                        ? "text-red-400"
                        : "text-yellow-300";
                  return (
                    <div
                      key={w.id}
                      className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.015] px-3 py-2"
                    >
                      <StatusIcon className={`size-4 shrink-0 ${statusColor}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono text-white tabular-nums">
                          {formatBRL(w.amount_cents)}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {w.method}
                          {w.pix_key ? ` · ${w.pix_key}` : ""}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase ${statusColor}`}>
                        {w.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {notificationsRows.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <div className="mb-3 flex items-center gap-2">
                <Bell className="size-4 text-purple-300" />
                <h2 className="text-sm font-medium text-white">
                  Notificações recentes
                </h2>
                <span className="text-[10px] text-zinc-500 ml-auto">Push</span>
              </div>
              <div className="space-y-2">
                {notificationsRows.slice(0, 10).map((n) => {
                  const kindColor =
                    n.kind === "paid"
                      ? "border-cyan-400/30 bg-cyan-400/[0.04]"
                      : n.kind === "withdrawal"
                        ? "border-blue-400/30 bg-blue-400/[0.04]"
                        : "border-yellow-400/30 bg-yellow-400/[0.04]";
                  return (
                    <div
                      key={n.id}
                      className={`rounded-lg border ${kindColor} px-3 py-2`}
                    >
                      <p className="text-sm font-semibold text-white truncate">
                        {n.title}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {n.body}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BigStat({
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
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          accent ?? "text-white"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

function prettyLabel(key: string): string {
  const map: Record<string, string> = {
    faturamento_bruto: "Faturamento Bruto",
    faturamento_liquido: "Faturamento Líquido",
    vendas_pagas: "Vendas Pagas",
    vendas_pendentes: "Vendas Pendentes",
    gasto_ads: "Gasto em Ads",
    lucro: "Lucro",
    roas: "ROAS",
    cpa: "CPA",
    taxa_aprovacao_pix: "Taxa Aprovação PIX",
    arpu: "ARPU",
    ticket_medio: "Ticket Médio",
  };
  return map[key] ?? key.replace(/_/g, " ");
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
