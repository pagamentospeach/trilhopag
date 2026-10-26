"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Moon, Sun, Flame, Network, TrendingUp } from "lucide-react";
import {
  updateLinkDefaultsByMode,
  updateReferralFeesByMode,
  updateReferralFeesByModeBulk,
} from "./referral-fee-actions";
import {
  adminSetUserFeesByMode,
  adminBulkSetUserFeesByMode,
  adminSetUserFeesByModeForAllFilter,
} from "@/app/admin01/actions";
import {
  modeHasCard,
  OPS_MODE_LABEL,
  OPS_MODES,
  type OpsMode,
} from "@/lib/ops-modes";
// O tipo e o builder saíram deste arquivo em 08/08/2026 — ver a explicação em
// lib/link-mode-defaults.ts. Aqui ficou só o que é de fato componente.
import {
  type LinkModeDefaults,
  type ModePix,
  type ModeWhite,
} from "@/lib/link-mode-defaults";

const META: Record<
  OpsMode,
  {
    label: string;
    sub: string;
    Icon: React.ComponentType<{ className?: string }>;
    iconWrap: string;
    iconCls: string;
    ring: string;
    glow: string;
  }
> = {
  black: {
    label: "Black",
    sub: "PIX anônimo",
    Icon: Moon,
    iconWrap: "bg-zinc-800/80 border-white/[0.06]",
    iconCls: "text-zinc-300",
    ring: "border-white/[0.08] hover:border-white/[0.16]",
    glow: "rgba(161,161,170,0.10)",
  },
  white: {
    label: "White",
    sub: "PIX + cartão",
    Icon: Sun,
    iconWrap: "bg-zinc-100/[0.06] border-white/[0.12]",
    iconCls: "text-zinc-100",
    ring: "border-white/[0.10] hover:border-white/[0.20]",
    glow: "rgba(255,255,255,0.10)",
  },
  hot: {
    label: "Hot",
    sub: "Alta conversão",
    Icon: Flame,
    iconWrap: "bg-orange-500/[0.12] border-orange-400/20",
    iconCls: "text-orange-400",
    ring: "border-orange-400/20 hover:border-orange-400/40",
    glow: "rgba(251,146,60,0.12)",
  },
  // SAG: ciano da marca + ícone de topologia. Ver mode-control-editor pro
  // porquê da cor (nem zinco nem laranja, que já são de outros modos).
  sag: {
    label: "SAG",
    sub: "Sub adquirente gateway",
    Icon: Network,
    iconWrap: "bg-cyan-500/[0.12] border-cyan-400/20",
    iconCls: "text-cyan-400",
    ring: "border-cyan-400/20 hover:border-cyan-400/40",
    glow: "rgba(51,210,217,0.12)",
  },
};

const fmtPct = (n: number) => `${(Math.round(n * 100) / 100).toString()}%`;
const fmtReais = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Editor de taxas POR MODO de adquirente que o INDICADOR define pros indicados.
 * Só taxas normais + saque — sem desvio/reembolso/espera/retenção.
 * Black = só PIX · White = PIX + cartão · Hot = só PIX. Valores em R$.
 */
export function LinkModeDefaultsEditor({
  initial,
  referredUserId,
  bulkReferredUserIds,
  adminUserId,
  adminBulkUserIds,
  adminAllFilter,
  adminReason,
  min,
  title = "Configuração de taxas",
  description = "Defina quanto cada pessoa indicada paga em cada método e modo de cobrança. Você ganha a diferença entre a taxa do indicado e a sua.",
  onSaved,
}: {
  initial: LinkModeDefaults;
  referredUserId?: string;
  /** Edição em massa: aplica as mesmas taxas a todos esses indicados. */
  bulkReferredUserIds?: string[];
  adminUserId?: string;
  /** Admin · edição em massa: aplica as mesmas taxas a vários sellers (sem piso). */
  adminBulkUserIds?: string[];
  /** Admin · aplica a TODOS os sellers que batem no filtro atual da lista. */
  adminAllFilter?: { q?: string; mode?: string; kyc?: string; blocked?: string };
  /** Motivo auditado (obrigatório) — usado só no fluxo admin em massa. */
  adminReason?: string;
  min?: {
    pixPct: number;
    pixFix: number;
    cardPct: number;
    cardFix: number;
    withdrawalCents: number;
  };
  title?: string;
  description?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [d, setD] = useState<LinkModeDefaults>(initial);

  // Validação AO VIVO contra o piso (taxa do próprio indicador). null = ok.
  const minError = (() => {
    if (!min) return null;
    // Um par de checagens por modo (mais as de cartão nos modos que têm), em
    // vez da lista escrita à mão — um modo novo entrava aqui sem validação de
    // piso nenhuma, e o indicado acabaria pagando menos que o indicador.
    const checks: Array<[number, number, string]> = [];
    for (const m of OPS_MODES) {
      const label = OPS_MODE_LABEL[m];
      const dm = d[m] as ModeWhite;
      checks.push([dm.pixPct, min.pixPct, `${label} PIX %`]);
      checks.push([dm.pixFix, min.pixFix, `${label} PIX fixa`]);
      if (modeHasCard(m)) {
        checks.push([dm.cardPct, min.cardPct, `${label} Cartão %`]);
        checks.push([dm.cardFix, min.cardFix, `${label} Cartão fixa`]);
      }
    }
    checks.push([d.withdrawalFeeCents, min.withdrawalCents, "Saque"]);
    for (const [v, m, label] of checks) {
      if (v < m) {
        const isPct = label.endsWith("%");
        return `${label} não pode ficar abaixo da sua taxa (${isPct ? fmtPct(m) : fmtReais(m)}). Você lucra na diferença.`;
      }
    }
    return null;
  })();

  function setMode<M extends OpsMode>(
    mode: M,
    patch: Partial<LinkModeDefaults[M]>,
  ) {
    setD((s) => ({ ...s, [mode]: { ...s[mode], ...patch } }));
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r =
        adminAllFilter
          ? await adminSetUserFeesByModeForAllFilter({
              defaults: d,
              reason: adminReason ?? "",
              filter: adminAllFilter,
            })
          : adminBulkUserIds && adminBulkUserIds.length > 0
          ? await adminBulkSetUserFeesByMode(
              adminBulkUserIds,
              d,
              adminReason ?? "",
            )
          : bulkReferredUserIds && bulkReferredUserIds.length > 0
            ? await updateReferralFeesByModeBulk(bulkReferredUserIds, d)
            : adminUserId
              ? await adminSetUserFeesByMode(adminUserId, d)
              : referredUserId
                ? await updateReferralFeesByMode(referredUserId, d)
                : await updateLinkDefaultsByMode(d);
      if (r.ok) {
        setMsg("Salvo");
        setTimeout(() => {
          setMsg(null);
          onSaved?.();
        }, 1200);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <section className="relative rounded-3xl">
      {/* Glow ciano ambiente — wash suave no topo direito (sem clipar texto) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-3xl"
        style={{
          background:
            "radial-gradient(140% 110% at 100% 0%, rgba(34, 211, 238,0.06), transparent 55%)",
        }}
      />

      <div className="relative space-y-6">
        {/* Header */}
        <div className="pr-8">
          <h2 className="pb-0.5 text-xl font-semibold leading-snug tracking-tight text-white">
            {title}
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-400">
            {description}
          </p>
        </div>

        {/* Cards de modo — mesma altura (items-stretch) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OPS_MODES.map((m) => {
            const cardOn = modeHasCard(m);
            // Modos PIX-only não têm as chaves de cartão no tipo; o cast só é
            // lido dentro do ramo cardOn.
            const dm = d[m] as ModeWhite;
            const set = setMode as (
              mode: OpsMode,
              patch: Partial<ModeWhite>,
            ) => void;
            return (
              <ModeCard
                key={m}
                mode={m}
                marginPct={min ? dm.pixPct - min.pixPct : null}
              >
                <MethodGroup label="PIX">
                  <Field label="Taxa" kind="pct" value={dm.pixPct} floor={min?.pixPct} onChange={(v) => set(m, { pixPct: v })} />
                  <Field label="Fixa" kind="reais" value={dm.pixFix} floor={min?.pixFix} onChange={(v) => set(m, { pixFix: v })} />
                </MethodGroup>
                {cardOn ? (
                  <MethodGroup label="Cartão">
                    <Field label="Taxa" kind="pct" value={dm.cardPct} floor={min?.cardPct} onChange={(v) => set(m, { cardPct: v })} />
                    <Field label="Fixa" kind="reais" value={dm.cardFix} floor={min?.cardFix} onChange={(v) => set(m, { cardFix: v })} />
                  </MethodGroup>
                ) : (
                  <p className="mt-auto pt-2 text-[11px] text-zinc-600">
                    Cartão indisponível neste modo.
                  </p>
                )}
              </ModeCard>
            );
          })}
        </div>

        {/* Saque — seção própria */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
            Saque
          </p>
          <p className="mt-0.5 text-sm text-zinc-400">
            Valor cobrado em cada transferência para o indicado.
          </p>
          <div className="mt-3 max-w-[200px]">
            <Field
              label="Valor por saque"
              kind="reais"
              value={d.withdrawalFeeCents}
              floor={min?.withdrawalCents}
              onChange={(v) => setD((s) => ({ ...s, withdrawalFeeCents: v }))}
            />
          </div>
        </div>

        {/* Simulador de margem ao vivo — detalhe sutil (só no contexto de rede) */}
        {min && <MarginSimulator d={d} min={min} />}

        {/* Alerta premium (âmbar) + Salvar — embaixo de tudo */}
        {minError && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3">
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-[11px] font-bold text-amber-300">
              !
            </span>
            <p className="text-[13px] leading-relaxed text-amber-100/90">
              {minError}
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] pt-5">
          {msg && msg !== "Salvo" && !minError && (
            <span className="text-xs text-red-300">{msg}</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending || !!minError}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-8 py-3 text-sm font-semibold text-black shadow-[0_0_0_1px_rgba(34, 211, 238,0.4),0_10px_30px_-10px_rgba(34, 211, 238,0.55)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {msg === "Salvo" ? "Salvo!" : "Salvar taxas"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ModeCard({
  mode,
  marginPct,
  children,
}: {
  mode: OpsMode;
  marginPct: number | null;
  children: React.ReactNode;
}) {
  const m = META[mode];
  return (
    <div
      className={`relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border ${m.ring} bg-white/[0.02] p-5 backdrop-blur-sm transition-colors`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% -20%, ${m.glow}, transparent 60%)` }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex size-9 items-center justify-center rounded-xl border ${m.iconWrap}`}
          >
            <m.Icon className={`size-4 ${m.iconCls}`} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-white">{m.label}</p>
            <p className="text-[11px] text-zinc-500">{m.sub}</p>
          </div>
        </div>
        {marginPct !== null && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums ${
              marginPct > 0
                ? "bg-cyan-400/10 text-cyan-300"
                : "bg-white/[0.04] text-zinc-500"
            }`}
            title="Sua margem no PIX (taxa do indicado − a sua)"
          >
            <TrendingUp className="size-3" />
            {marginPct > 0 ? "+" : ""}
            {fmtPct(marginPct)}
          </span>
        )}
      </div>
      <div className="relative flex flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}

/**
 * Detalhe sutil: simula o ticket e mostra ao vivo quanto o indicador lucra por
 * venda no PIX em cada modo (taxa do indicado − a sua). Cosmético, não salva.
 */
function MarginSimulator({
  d,
  min,
}: {
  d: LinkModeDefaults;
  min: { pixPct: number; pixFix: number };
}) {
  const [ticket, setTicket] = useState("100");
  const cents = (() => {
    const n = Number(ticket.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  })();
  const margin = (m: ModePix) =>
    (m.pixPct / 100) * cents + m.pixFix - ((min.pixPct / 100) * cents + min.pixFix);
  const rows: Array<[string, number]> = OPS_MODES.map((m) => [
    OPS_MODE_LABEL[m],
    margin(d[m]),
  ]);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.015] px-4 py-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-3.5 text-cyan-400/70" />
        <span className="text-[11px] font-medium text-zinc-400">
          Seu ganho num ticket de
        </span>
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500">
            R$
          </span>
          <input
            inputMode="decimal"
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
            className="h-7 w-20 rounded-lg border border-white/[0.08] bg-black/30 pl-7 pr-2 text-xs tabular-nums text-white outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.04]"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {rows.map(([label, m]) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] tabular-nums text-zinc-400"
          >
            {label}
            <span
              className={
                m > 0 ? "font-semibold text-cyan-300" : "text-zinc-600"
              }
            >
              {m > 0 ? "+" : ""}
              {fmtReais(m)}
            </span>
          </span>
        ))}
      </div>
      <span className="text-[10px] text-zinc-600">por venda no PIX</span>
    </div>
  );
}

function MethodGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2.5">{children}</div>
    </div>
  );
}

/**
 * Campo premium estilo Linear. kind="pct" edita o número direto (%);
 * kind="reais" edita em R$ mas guarda/retorna em CENTAVOS. `floor` (opcional)
 * mostra a taxa do próprio seller — o mínimo que ele pode dar.
 */
function Field({
  label,
  kind,
  value,
  floor,
  onChange,
}: {
  label: string;
  kind: "pct" | "reais";
  value: number;
  floor?: number;
  onChange: (v: number) => void;
}) {
  const display = kind === "reais" ? (value / 100).toString() : String(value);
  const below = floor != null && value < floor;
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-zinc-400">{label}</span>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
          {kind === "pct" ? "%" : "R$"}
        </span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={display}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(kind === "reais" ? Math.round(n * 100) : n);
          }}
          className={`h-11 w-full rounded-xl border bg-white/[0.03] pl-8 pr-3 text-sm tabular-nums text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-400/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-cyan-400/15 ${
            below ? "border-amber-400/50" : "border-white/[0.08] hover:border-white/[0.16]"
          }`}
        />
      </div>
      {floor != null && (
        <p className={`mt-1 text-[10px] ${below ? "text-amber-300/80" : "text-zinc-600"}`}>
          Sua taxa: {kind === "pct" ? fmtPct(floor) : fmtReais(floor)}
        </p>
      )}
    </label>
  );
}
