"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save,
  Loader2,
  ChevronLeft,
  Eye,
  Plus,
  X,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { formatBRL } from "@/lib/utils";
import { saveDivulgadorAccount } from "../actions";

type FeedRow = {
  id: string;
  amount_cents: number;
  net_cents: number;
  product: string;
  customer_name: string | null;
  method: string;
  paid_at: string;
};

type WithdrawalRow = {
  id: string;
  amount_cents: number;
  method: string;
  status: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  paid_at: string;
  pix_key?: string | null;
};

type NotificationRow = {
  id: string;
  kind: "paid" | "pending" | "withdrawal";
  title: string;
  body: string;
  /** Valor SO USADO neste card de notif. NUNCA toca em produto/feed.
   *  Fix do bug antigo "preco da notif vazando no preco do produto". */
  amount_cents: number;
  at: string;
};

type DivulgadorInitial = {
  id?: string;
  name: string;
  email: string;
  avatarUrl: string;
  theme: string;
  accentColor: string;
  balanceCents: number;
  pendingBalanceCents: number;
  todayRevenueCents: number;
  todaySalesCount: number;
  last30dRevenueCents: number;
  last30dSalesCount: number;
  lifetimeRevenueCents: number;
  lifetimeNetCents: number;
  monthlyGoalCents: number;
  metricsJson: Record<string, { value: string; sub?: string | null }>;
  seriesJson: number[];
  feedJson: FeedRow[];
  withdrawalsJson: WithdrawalRow[];
  notificationsJson: NotificationRow[];
};

const EDITABLE_METRIC_KEYS = [
  { key: "faturamento_bruto", label: "Faturamento Bruto" },
  { key: "faturamento_liquido", label: "Faturamento Líquido" },
  { key: "vendas_pagas", label: "Vendas Pagas" },
  { key: "vendas_pendentes", label: "Vendas Pendentes" },
  { key: "gasto_ads", label: "Gasto em Ads" },
  { key: "lucro", label: "Lucro" },
  { key: "roas", label: "ROAS" },
  { key: "cpa", label: "CPA" },
  { key: "taxa_aprovacao_pix", label: "Taxa Aprovação PIX" },
  { key: "arpu", label: "ARPU" },
  { key: "ticket_medio", label: "Ticket Médio" },
];

const METHOD_OPTIONS = ["PIX", "CARD", "APPLE_PAY", "GOOGLE_PAY", "BOLETO"];

const EMPTY: DivulgadorInitial = {
  name: "",
  email: "",
  avatarUrl: "",
  theme: "midnight",
  accentColor: "",
  balanceCents: 0,
  pendingBalanceCents: 0,
  todayRevenueCents: 0,
  todaySalesCount: 0,
  last30dRevenueCents: 0,
  last30dSalesCount: 0,
  lifetimeRevenueCents: 0,
  lifetimeNetCents: 0,
  monthlyGoalCents: 0,
  metricsJson: {},
  seriesJson: [],
  feedJson: [],
  withdrawalsJson: [],
  notificationsJson: [],
};

/**
 * Editor de uma sub-conta divulgador. Cada campo numérico aceita reais
 * (string com vírgula ou ponto) e converte em centavos no submit.
 */
export function DivulgadorEditorClient({
  initial,
}: {
  initial: DivulgadorInitial | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const isCreating = !initial?.id;
  const init = initial ?? EMPTY;

  // Estado local (forms simples). Strings pra inputs.
  const [name, setName] = useState(init.name);
  const [email, setEmail] = useState(init.email);
  const [avatarUrl, setAvatarUrl] = useState(init.avatarUrl);
  const [theme, setTheme] = useState(init.theme);
  const [accentColor, setAccentColor] = useState(init.accentColor);
  const [balanceR, setBalanceR] = useState(toReals(init.balanceCents));
  const [pendingR, setPendingR] = useState(toReals(init.pendingBalanceCents));
  const [todayR, setTodayR] = useState(toReals(init.todayRevenueCents));
  const [todaySales, setTodaySales] = useState(String(init.todaySalesCount));
  const [last30dR, setLast30dR] = useState(toReals(init.last30dRevenueCents));
  const [last30dSales, setLast30dSales] = useState(
    String(init.last30dSalesCount),
  );
  const [lifetimeRevR, setLifetimeRevR] = useState(
    toReals(init.lifetimeRevenueCents),
  );
  const [lifetimeNetR, setLifetimeNetR] = useState(
    toReals(init.lifetimeNetCents),
  );
  const [goalR, setGoalR] = useState(toReals(init.monthlyGoalCents));

  const [seriesR, setSeriesR] = useState<string[]>(
    init.seriesJson.length === 30
      ? init.seriesJson.map((c) => toReals(c))
      : Array.from({ length: 30 }, () => ""),
  );

  const [metrics, setMetrics] = useState<
    Record<string, { value: string; sub: string }>
  >(() => {
    const out: Record<string, { value: string; sub: string }> = {};
    for (const [k, v] of Object.entries(init.metricsJson ?? {})) {
      out[k] = { value: v.value, sub: v.sub ?? "" };
    }
    return out;
  });

  const [feed, setFeed] = useState<FeedRow[]>(init.feedJson ?? []);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>(
    init.withdrawalsJson ?? [],
  );
  const [notifications, setNotifications] = useState<NotificationRow[]>(
    init.notificationsJson ?? [],
  );

  function save(redirectAfter?: "list" | "view") {
    const seriesCents = seriesR.map((s) =>
      Math.max(0, Math.round(Number(s.replace(",", ".") || "0") * 100)),
    );
    const hasSeries = seriesCents.some((c) => c > 0);

    const filteredMetrics: Record<string, { value: string; sub?: string }> = {};
    for (const [key, m] of Object.entries(metrics)) {
      if (m.value.trim().length > 0) {
        filteredMetrics[key] = {
          value: m.value.trim(),
          sub: m.sub.trim() || undefined,
        };
      }
    }

    startTransition(async () => {
      const r = await saveDivulgadorAccount({
        id: init.id,
        name: name.trim(),
        email: email.trim(),
        avatarUrl: avatarUrl.trim() || null,
        theme,
        accentColor: accentColor.trim() || null,
        balanceCents: toCents(balanceR),
        pendingBalanceCents: toCents(pendingR),
        todayRevenueCents: toCents(todayR),
        todaySalesCount: Math.max(0, Math.floor(Number(todaySales) || 0)),
        last30dRevenueCents: toCents(last30dR),
        last30dSalesCount: Math.max(0, Math.floor(Number(last30dSales) || 0)),
        lifetimeRevenueCents: toCents(lifetimeRevR),
        lifetimeNetCents: toCents(lifetimeNetR),
        monthlyGoalCents: toCents(goalR),
        metricsJson:
          Object.keys(filteredMetrics).length > 0
            ? filteredMetrics
            : undefined,
        seriesJson: hasSeries ? seriesCents : undefined,
        feedJson: feed.length > 0 ? feed : undefined,
        withdrawalsJson: withdrawals.length > 0 ? withdrawals : undefined,
        notificationsJson:
          notifications.length > 0 ? notifications : undefined,
      });
      if (r.ok) {
        setMsg("Salvo!");
        setTimeout(() => setMsg(null), 2500);
        if (redirectAfter === "list") {
          router.push("/dashboard/divulgador");
        } else if (redirectAfter === "view") {
          router.push(`/dashboard/divulgador/${r.id}/view`);
        } else {
          router.refresh();
        }
      } else {
        setMsg(r.error);
      }
    });
  }

  function addFakeFeedRow() {
    const id = `pl_${Math.random().toString(36).slice(2, 10)}`;
    setFeed((f) => [
      ...f,
      {
        id,
        amount_cents: 9700,
        net_cents: 8980,
        product: "Produto X",
        customer_name: "Cliente Y",
        method: "PIX",
        paid_at: new Date().toISOString(),
      },
    ]);
  }

  function presetSeries(kind: "growth" | "stable" | "spike") {
    if (kind === "growth") {
      setSeriesR(
        Array.from({ length: 30 }, (_, i) => (100 + i * 50).toFixed(2)),
      );
    } else if (kind === "stable") {
      setSeriesR(
        Array.from({ length: 30 }, () => (500 + Math.random() * 700).toFixed(2)),
      );
    } else {
      setSeriesR(
        Array.from({ length: 30 }, (_, i) => {
          const base = 800 + Math.random() * 400;
          const spike = i % 7 === 0 ? base * 2.2 : base;
          return spike.toFixed(2);
        }),
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Topbar sticky */}
      <div className="sticky top-0 z-10 -mx-2 px-2 py-3 backdrop-blur bg-black/40 border-b border-white/[0.08] flex items-center gap-3">
        <Link
          href="/dashboard/divulgador"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
        >
          <ChevronLeft className="size-3" /> Voltar
        </Link>
        <h1 className="text-base font-semibold text-white">
          {isCreating ? "Nova sub-conta divulgador" : `Editar — ${name || "Sub-conta"}`}
        </h1>
        <div className="flex-1" />
        {msg && (
          <span className="text-xs text-cyan-300 font-mono">{msg}</span>
        )}
        {!isCreating && init.id && (
          <Link
            href={`/dashboard/divulgador/${init.id}/view`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-400/[0.06] px-3 py-1.5 text-xs text-purple-200 hover:bg-purple-400/[0.12]"
          >
            <Eye className="size-3" /> Visualizar <ExternalLink className="size-3 opacity-60" />
          </Link>
        )}
        <button
          type="button"
          onClick={() => save("list")}
          disabled={isPending || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-purple-500 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-400 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Save className="size-3" />
          )}
          Salvar
        </button>
      </div>

      {/* IDENTIDADE */}
      <Section title="Identidade" subtitle="Como a sub-conta aparece no dashboard fake">
        <Grid2>
          <Field
            label="Nome de exibição"
            value={name}
            onChange={setName}
            placeholder="Ex: João Silva"
            required
          />
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="joao@exemplo.com"
            mono
          />
        </Grid2>
        <Field
          label="URL do avatar (opcional)"
          value={avatarUrl}
          onChange={setAvatarUrl}
          placeholder="https://cdn.example.com/avatar.png"
          mono
        />
        <Grid2>
          <SelectField
            label="Tema visual"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "midnight", label: "Midnight (escuro)" },
              { value: "daylight", label: "Daylight (claro)" },
              { value: "ocean", label: "Ocean" },
              { value: "sunset", label: "Sunset" },
              { value: "gamer", label: "Gamer" },
              { value: "glass", label: "Glass" },
              { value: "matrix", label: "Matrix" },
            ]}
          />
          <Field
            label="Cor de destaque (#hex, opcional)"
            value={accentColor}
            onChange={setAccentColor}
            placeholder="#a855f7"
            mono
          />
        </Grid2>
      </Section>

      {/* SALDO */}
      <Section title="💰 Saldo" subtitle="Aparece no topbar e cards do dashboard fake">
        <Grid2>
          <MoneyField label="Saldo disponível (R$)" value={balanceR} onChange={setBalanceR} />
          <MoneyField label="Saldo pendente (R$)" value={pendingR} onChange={setPendingR} />
        </Grid2>
      </Section>

      {/* HOJE */}
      <Section title="📅 Hoje" subtitle="Faturamento do dia">
        <Grid2>
          <MoneyField label="Faturamento de hoje (R$)" value={todayR} onChange={setTodayR} />
          <Field
            label="Vendas hoje"
            value={todaySales}
            onChange={setTodaySales}
            type="number"
          />
        </Grid2>
      </Section>

      {/* 30D */}
      <Section title="📈 Últimos 30 dias">
        <Grid2>
          <MoneyField label="Faturamento 30d (R$)" value={last30dR} onChange={setLast30dR} />
          <Field
            label="Vendas 30d"
            value={last30dSales}
            onChange={setLast30dSales}
            type="number"
          />
        </Grid2>
      </Section>

      {/* LIFETIME + META */}
      <Section title="🏆 Lifetime + Meta">
        <Grid2>
          <MoneyField label="GMV total (R$)" value={lifetimeRevR} onChange={setLifetimeRevR} />
          <MoneyField label="Net total (R$)" value={lifetimeNetR} onChange={setLifetimeNetR} />
        </Grid2>
        <MoneyField label="Meta mensal (R$)" value={goalR} onChange={setGoalR} />
      </Section>

      {/* SÉRIE 30 DIAS */}
      <Section title="📊 Gráfico — Série 30 dias" subtitle="1 valor por dia em R$">
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => presetSeries("growth")}
            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.08]"
          >
            Preset: crescente
          </button>
          <button
            type="button"
            onClick={() => presetSeries("stable")}
            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.08]"
          >
            Preset: estável
          </button>
          <button
            type="button"
            onClick={() => presetSeries("spike")}
            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.08]"
          >
            Preset: picos
          </button>
          <button
            type="button"
            onClick={() => setSeriesR(Array.from({ length: 30 }, () => ""))}
            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.08]"
          >
            Limpar
          </button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
          {seriesR.map((v, i) => (
            <div key={i}>
              <label className="block text-[9px] text-zinc-500 mb-0.5">
                Dia {i + 1}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={v}
                onChange={(e) => {
                  const next = [...seriesR];
                  next[i] = e.target.value;
                  setSeriesR(next);
                }}
                placeholder="0,00"
                className="w-full rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1.5 text-xs text-white tabular-nums"
              />
            </div>
          ))}
        </div>
      </Section>

      {/* MÉTRICAS DO WIDGET CATALOG */}
      <Section
        title="📊 Métricas dos widgets"
        subtitle="Sobrescreve cada card do dashboard. Texto livre (ex: R$ 12.345,67, 2.5x, 87%)"
      >
        <div className="space-y-2">
          {Object.entries(metrics).map(([key, m]) => {
            const label =
              EDITABLE_METRIC_KEYS.find((mk) => mk.key === key)?.label ?? key;
            return (
              <div
                key={key}
                className="grid grid-cols-[200px_1fr_1fr_auto] gap-2 items-center"
              >
                <span className="text-xs text-zinc-400 truncate">{label}</span>
                <input
                  type="text"
                  value={m.value}
                  onChange={(e) =>
                    setMetrics({
                      ...metrics,
                      [key]: { ...m, value: e.target.value },
                    })
                  }
                  placeholder="Valor (ex: R$ 12.345,67)"
                  className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  value={m.sub}
                  onChange={(e) =>
                    setMetrics({
                      ...metrics,
                      [key]: { ...m, sub: e.target.value },
                    })
                  }
                  placeholder="Subtexto (opcional)"
                  className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const { [key]: _, ...rest } = metrics;
                    void _;
                    setMetrics(rest);
                  }}
                  className="rounded-full bg-white/[0.04] hover:bg-red-400/[0.15] p-1.5 text-zinc-500 hover:text-red-300"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
        {EDITABLE_METRIC_KEYS.filter((mk) => !metrics[mk.key]).length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
              Adicionar métrica:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EDITABLE_METRIC_KEYS.filter((mk) => !metrics[mk.key]).map(
                (mk) => (
                  <button
                    key={mk.key}
                    type="button"
                    onClick={() =>
                      setMetrics({
                        ...metrics,
                        [mk.key]: { value: "", sub: "" },
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.08]"
                  >
                    <Plus className="size-2.5" /> {mk.label}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
      </Section>

      {/* FEED DE VENDAS */}
      <Section
        title="🛒 Feed de vendas (LiveFeed)"
        subtitle="Cada linha aparece como uma venda fake no widget do dashboard"
      >
        <div className="space-y-2">
          {feed.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-1 sm:grid-cols-[100px_100px_1fr_1fr_110px_auto] gap-2 items-center rounded-lg border border-white/[0.06] bg-white/[0.02] p-2"
            >
              <input
                type="text"
                inputMode="decimal"
                value={(row.amount_cents / 100).toFixed(2)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  if (Number.isFinite(n)) {
                    setFeed((f) =>
                      f.map((r) =>
                        r.id === row.id
                          ? { ...r, amount_cents: Math.round(n * 100) }
                          : r,
                      ),
                    );
                  }
                }}
                placeholder="Valor"
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                inputMode="decimal"
                value={(row.net_cents / 100).toFixed(2)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  if (Number.isFinite(n)) {
                    setFeed((f) =>
                      f.map((r) =>
                        r.id === row.id
                          ? { ...r, net_cents: Math.round(n * 100) }
                          : r,
                      ),
                    );
                  }
                }}
                placeholder="Líquido"
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                value={row.product}
                onChange={(e) =>
                  setFeed((f) =>
                    f.map((r) =>
                      r.id === row.id ? { ...r, product: e.target.value } : r,
                    ),
                  )
                }
                placeholder="Produto"
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                value={row.customer_name ?? ""}
                onChange={(e) =>
                  setFeed((f) =>
                    f.map((r) =>
                      r.id === row.id
                        ? { ...r, customer_name: e.target.value || null }
                        : r,
                    ),
                  )
                }
                placeholder="Cliente"
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              />
              <select
                value={row.method}
                onChange={(e) =>
                  setFeed((f) =>
                    f.map((r) =>
                      r.id === row.id ? { ...r, method: e.target.value } : r,
                    ),
                  )
                }
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              >
                {METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m} className="bg-zinc-900">
                    {m}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setFeed((f) => f.filter((r) => r.id !== row.id))}
                className="rounded-full bg-white/[0.04] hover:bg-red-400/[0.15] p-1.5 text-zinc-500 hover:text-red-300"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addFakeFeedRow}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.08]"
        >
          <Plus className="size-3" /> Adicionar venda fake
        </button>
      </Section>

      {/* SAQUES FAKES */}
      <Section
        title="🏦 Saques pagos (fake)"
        subtitle="Aparecem como histórico de saques na view do dashboard fake. NÃO afeta produtos nem feed."
      >
        <div className="space-y-2">
          {withdrawals.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-1 sm:grid-cols-[100px_90px_110px_1fr_auto] gap-2 items-center rounded-lg border border-white/[0.06] bg-white/[0.02] p-2"
            >
              <input
                type="text"
                inputMode="decimal"
                value={(row.amount_cents / 100).toFixed(2)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  if (Number.isFinite(n)) {
                    setWithdrawals((arr) =>
                      arr.map((r) =>
                        r.id === row.id
                          ? { ...r, amount_cents: Math.round(n * 100) }
                          : r,
                      ),
                    );
                  }
                }}
                placeholder="Valor"
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              />
              <select
                value={row.method}
                onChange={(e) =>
                  setWithdrawals((arr) =>
                    arr.map((r) =>
                      r.id === row.id ? { ...r, method: e.target.value } : r,
                    ),
                  )
                }
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              >
                {["PIX", "TED", "USDT"].map((m) => (
                  <option key={m} value={m} className="bg-zinc-900">
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={row.status}
                onChange={(e) =>
                  setWithdrawals((arr) =>
                    arr.map((r) =>
                      r.id === row.id
                        ? { ...r, status: e.target.value as WithdrawalRow["status"] }
                        : r,
                    ),
                  )
                }
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              >
                {(
                  ["PAID", "PENDING", "PROCESSING", "FAILED"] as const
                ).map((m) => (
                  <option key={m} value={m} className="bg-zinc-900">
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={row.pix_key ?? ""}
                onChange={(e) =>
                  setWithdrawals((arr) =>
                    arr.map((r) =>
                      r.id === row.id
                        ? { ...r, pix_key: e.target.value || null }
                        : r,
                    ),
                  )
                }
                placeholder="Chave PIX (opcional)"
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={() =>
                  setWithdrawals((arr) => arr.filter((r) => r.id !== row.id))
                }
                className="rounded-full bg-white/[0.04] hover:bg-red-400/[0.15] p-1.5 text-zinc-500 hover:text-red-300"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const id = `pl_w_${Math.random().toString(36).slice(2, 10)}`;
            setWithdrawals((arr) => [
              ...arr,
              {
                id,
                amount_cents: 50000,
                method: "PIX",
                status: "PAID",
                paid_at: new Date().toISOString(),
                pix_key: null,
              },
            ]);
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.08]"
        >
          <Plus className="size-3" /> Adicionar saque fake
        </button>
      </Section>

      {/* NOTIFICAÇÕES FAKES */}
      <Section
        title="🔔 Notificações (fake)"
        subtitle="Lista de notifs aparece num card na view. Valor amount_cents é EXCLUSIVO desta tabela — não afeta preço de produto/feed/saque."
      >
        <div className="space-y-2">
          {notifications.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-1 sm:grid-cols-[100px_100px_1fr_1fr_auto] gap-2 items-center rounded-lg border border-white/[0.06] bg-white/[0.02] p-2"
            >
              <select
                value={row.kind}
                onChange={(e) =>
                  setNotifications((arr) =>
                    arr.map((r) =>
                      r.id === row.id
                        ? { ...r, kind: e.target.value as NotificationRow["kind"] }
                        : r,
                    ),
                  )
                }
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              >
                <option value="paid" className="bg-zinc-900">
                  💰 paid
                </option>
                <option value="pending" className="bg-zinc-900">
                  🕐 pending
                </option>
                <option value="withdrawal" className="bg-zinc-900">
                  🏦 withdraw
                </option>
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={(row.amount_cents / 100).toFixed(2)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  if (Number.isFinite(n)) {
                    setNotifications((arr) =>
                      arr.map((r) =>
                        r.id === row.id
                          ? { ...r, amount_cents: Math.round(n * 100) }
                          : r,
                      ),
                    );
                  }
                }}
                placeholder="Valor (só notif)"
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                value={row.title}
                onChange={(e) =>
                  setNotifications((arr) =>
                    arr.map((r) =>
                      r.id === row.id ? { ...r, title: e.target.value } : r,
                    ),
                  )
                }
                placeholder="Título"
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                value={row.body}
                onChange={(e) =>
                  setNotifications((arr) =>
                    arr.map((r) =>
                      r.id === row.id ? { ...r, body: e.target.value } : r,
                    ),
                  )
                }
                placeholder="Corpo"
                className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={() =>
                  setNotifications((arr) => arr.filter((r) => r.id !== row.id))
                }
                className="rounded-full bg-white/[0.04] hover:bg-red-400/[0.15] p-1.5 text-zinc-500 hover:text-red-300"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const id = `pl_n_${Math.random().toString(36).slice(2, 10)}`;
            setNotifications((arr) => [
              ...arr,
              {
                id,
                kind: "paid",
                title: "💰 +R$ 97,00!",
                body: "Venda aprovada — Maria S. pagou Mentoria",
                amount_cents: 9700,
                at: new Date().toISOString(),
              },
            ]);
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.08]"
        >
          <Plus className="size-3" /> Adicionar notificação fake
        </button>
      </Section>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => save("view")}
          disabled={isPending || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-purple-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-400 disabled:opacity-50"
        >
          <Sparkles className="size-3" />
          Salvar e visualizar
        </button>
      </div>
    </div>
  );
}

function toReals(cents: number): string {
  return (cents / 100).toFixed(2);
}
function toCents(reals: string): number {
  const n = Number(String(reals).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {subtitle && (
          <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-400">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-zinc-900">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const cents = toCents(value);
  return (
    <label className="block">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white tabular-nums"
        />
        <span className="text-[10px] text-zinc-500 font-mono tabular-nums">
          {formatBRL(cents)}
        </span>
      </div>
    </label>
  );
}
