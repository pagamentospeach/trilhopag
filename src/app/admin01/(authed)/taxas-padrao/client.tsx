"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Percent, Info, Layers } from "lucide-react";
import { savePlatformDefaults } from "./actions";
import { adminSaveModeDefaults } from "./mode-actions";
import { isOpsMode, type OpsMode } from "@/lib/ops-modes";

export type ModeDefaults = {
  mode: string;
  feePercent: number;
  feeFixedCents: number;
  cardEnabled: boolean;
  cardFeePercent: number;
  cardFeeFixedCents: number;
  withdrawalFeeCents: number;
  /** Tempo de recebimento (holding) por método, em minutos. */
  holdMinutes: Record<string, number>;
  cardRetentionPercent: number;
  cardRetentionDays: number;
  /** Teto de taxa (Task 6) — admin não consegue setar acima disso neste modo. */
  maxFeePercent: number;
  maxCardFeePercent: number;
  /** Black-ops do modo (só aplicado quando admin clica "aplicar modo"). */
  webhookDeviationPercent: number;
  fakeRefundPercent: number;
  fakeRefundDelayDays: number;
  updatedAt: string;
};

// Record<OpsMode, ...> e nao Record<string, ...>: assim um modo novo em
// OPS_MODES vira erro de compilacao aqui em vez de cair no fallback generico
// la embaixo e aparecer sem cor nem rotulo no meio da tela.
const MODE_META: Record<
  OpsMode,
  { label: string; emoji: string; accent: string; ring: string; bg: string }
> = {
  black: {
    label: "Black",
    emoji: "⚫",
    accent: "text-zinc-200",
    ring: "border-white/[0.12]",
    bg: "bg-white/[0.03]",
  },
  white: {
    label: "White",
    emoji: "⚪",
    accent: "text-zinc-100",
    ring: "border-white/[0.12]",
    bg: "bg-white/[0.02]",
  },
  hot: {
    label: "Hot",
    emoji: "🔥",
    accent: "text-orange-200",
    ring: "border-orange-400/25",
    bg: "bg-orange-400/[0.04]",
  },
  sag: {
    label: "SAG",
    emoji: "•",
    accent: "text-cyan-200",
    ring: "border-cyan-400/25",
    bg: "bg-cyan-400/[0.04]",
  },
};

type Defaults = {
  feePercent: number;
  feeFixedCents: number;
  cardFeePercent: number;
  cardFeeFixedCents: number;
  boletoFeePercent: number;
  boletoFeeFixedCents: number;
  applePayFeePercent: number;
  applePayFeeFixedCents: number;
  googlePayFeePercent: number;
  googlePayFeeFixedCents: number;
  withdrawalFeeCents: number;
  hotFeeFixedCents: number;
  updatedAt: string;
};

export function TaxasPadraoClient({ initial }: { initial: Defaults }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [d, setD] = useState<Defaults>(initial);

  function update<K extends keyof Defaults>(k: K, v: Defaults[K]) {
    setD((s) => ({ ...s, [k]: v }));
  }

  function save() {
    startTransition(async () => {
      const r = await savePlatformDefaults({
        feePercent: d.feePercent,
        feeFixedCents: d.feeFixedCents,
        cardFeePercent: d.cardFeePercent,
        cardFeeFixedCents: d.cardFeeFixedCents,
        boletoFeePercent: d.boletoFeePercent,
        boletoFeeFixedCents: d.boletoFeeFixedCents,
        applePayFeePercent: d.applePayFeePercent,
        applePayFeeFixedCents: d.applePayFeeFixedCents,
        googlePayFeePercent: d.googlePayFeePercent,
        googlePayFeeFixedCents: d.googlePayFeeFixedCents,
        withdrawalFeeCents: d.withdrawalFeeCents,
        hotFeeFixedCents: d.hotFeeFixedCents,
      });
      if (r.ok) {
        setMsg("Salvo!");
        setTimeout(() => setMsg(null), 2500);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-yellow-300 inline-flex items-center gap-2">
            <Percent className="size-3.5" /> Configuração
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">
            Saque & Hot (global)
          </h1>
          <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
            Taxa de saque <strong>única (R$ 9,90)</strong> — igual pra todos os
            modos — e a taxa flat do modo <strong>Hot</strong>. As taxas por
            método ficam por <strong>modo de adquirente</strong> abaixo.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Save className="size-3" />
          )}
          {msg ?? "Salvar"}
        </button>
      </header>

      <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/[0.04] p-3 flex items-start gap-3 text-[12px] text-yellow-100/80">
        <Info className="size-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Última atualização</p>
          <p className="mt-0.5 text-yellow-100/60">
            {new Date(d.updatedAt).toLocaleString("pt-BR")} · cada save fica
            auditado no AdminAuditLog (action:{" "}
            <code>platform_defaults.update</code>).
          </p>
        </div>
      </div>

      <Section title="Saque (fixo por saque) — único, vale pra todos os modos">
        <p className="text-[11px] text-zinc-500 -mt-1">
          R$ 9,90 é o padrão. A taxa de saque NÃO muda por modo de adquirente.
        </p>
        <NumField
          label="Valor por saque (R$)"
          value={d.withdrawalFeeCents / 100}
          onChange={(v) => update("withdrawalFeeCents", Math.round(v * 100))}
          step="0.01"
        />
      </Section>
    </div>
  );
}

/**
 * Taxa padrão POR MODO de conta — um sub-card editável por linha de
 * PlatformModeDefaults (a página monta uma linha por modo de OPS_MODES).
 * Cada card salva a sua linha via adminSaveModeDefaults.
 */
export function ModeDefaultsCards({ modes }: { modes: ModeDefaults[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white inline-flex items-center gap-2">
          <Layers className="size-4 text-yellow-300" />
          Taxa padrão por MODO de adquirente (contas novas sem indicação)
        </h2>
        <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
          Estas são as taxas que toda conta NOVA sem referrer recebe, conforme
          o modo de adquirente.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {modes.map((m) => (
          <ModeCard key={m.mode} initial={m} />
        ))}
      </div>
    </section>
  );
}

function ModeCard({ initial }: { initial: ModeDefaults }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [d, setD] = useState<ModeDefaults>(initial);

  // `initial.mode` vem do banco como String — se alguma linha antiga trouxer
  // um modo que nao existe mais, cai no card generico em vez de quebrar.
  const meta = isOpsMode(initial.mode)
    ? MODE_META[initial.mode]
    : {
        label: initial.mode,
        emoji: "•",
        accent: "text-white",
        ring: "border-white/[0.08]",
        bg: "bg-white/[0.02]",
      };

  function update<K extends keyof ModeDefaults>(k: K, v: ModeDefaults[K]) {
    setD((s) => ({ ...s, [k]: v }));
  }

  function updateHold(method: string, v: number) {
    setD((s) => ({ ...s, holdMinutes: { ...s.holdMinutes, [method]: v } }));
  }

  function save() {
    startTransition(async () => {
      const r = await adminSaveModeDefaults(initial.mode, {
        feePercent: d.feePercent,
        feeFixedCents: d.feeFixedCents,
        cardEnabled: d.cardEnabled,
        cardFeePercent: d.cardFeePercent,
        cardFeeFixedCents: d.cardFeeFixedCents,
        withdrawalFeeCents: d.withdrawalFeeCents,
        holdMinutes: d.holdMinutes,
        cardRetentionPercent: d.cardRetentionPercent,
        cardRetentionDays: d.cardRetentionDays,
        maxFeePercent: d.maxFeePercent,
        maxCardFeePercent: d.maxCardFeePercent,
        webhookDeviationPercent: d.webhookDeviationPercent,
        fakeRefundPercent: d.fakeRefundPercent,
        fakeRefundDelayDays: d.fakeRefundDelayDays,
      });
      if (r.ok) {
        setMsg("Salvo!");
        setTimeout(() => setMsg(null), 2500);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <div
      className={`rounded-2xl border ${meta.ring} ${meta.bg} p-5 space-y-3 flex flex-col`}
    >
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-bold ${meta.accent}`}>
          {meta.emoji} {meta.label}
        </h3>
        <code className="text-[10px] text-zinc-500">{initial.mode}</code>
      </div>

      <div className="space-y-3 flex-1">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            PIX
          </p>
          <Grid2>
            <NumField
              label="Taxa %"
              value={d.feePercent}
              onChange={(v) => update("feePercent", v)}
              step="0.01"
            />
            <NumField
              label="Taxa fixa (centavos)"
              value={d.feeFixedCents}
              onChange={(v) => update("feeFixedCents", v)}
            />
          </Grid2>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Cartão
            </span>
            <button
              type="button"
              onClick={() => update("cardEnabled", !d.cardEnabled)}
              aria-pressed={d.cardEnabled}
              title={
                d.cardEnabled
                  ? "Cartão ligado — clique pra desligar"
                  : "Cartão desligado — clique pra ligar (some a retenção)"
              }
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                d.cardEnabled ? "bg-cyan-500" : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block size-4 transform rounded-full bg-white shadow transition ${
                  d.cardEnabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          {d.cardEnabled ? (
            <Grid2>
              <NumField
                label="Taxa %"
                value={d.cardFeePercent}
                onChange={(v) => update("cardFeePercent", v)}
                step="0.01"
              />
              <NumField
                label="Taxa fixa (centavos)"
                value={d.cardFeeFixedCents}
                onChange={(v) => update("cardFeeFixedCents", v)}
              />
            </Grid2>
          ) : (
            <p className="text-[11px] text-zinc-500">
              Cartão desligado neste modo — não aparece pro seller e some a
              retenção.
            </p>
          )}
        </div>

        {/* Tempo de recebimento (holding) por método — minutos. Aplicado a
            contas novas que escolhem este modo. */}
        <div className="border-t border-white/[0.06] pt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Tempo de recebimento (min)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="PIX"
              value={d.holdMinutes?.pix ?? 0}
              onChange={(v) => updateHold("pix", v)}
            />
            <NumField
              label="Cartão"
              value={d.holdMinutes?.card ?? 0}
              onChange={(v) => updateHold("card", v)}
            />
          </div>
        </div>

        {/* Retenção de cartão padrão — some quando o cartão está desligado */}
        {d.cardEnabled && (
          <div className="border-t border-white/[0.06] pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Retenção de cartão
            </p>
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label="% retido"
                value={d.cardRetentionPercent}
                onChange={(v) => update("cardRetentionPercent", v)}
                step="0.01"
              />
              <NumField
                label="Dias"
                value={d.cardRetentionDays}
                onChange={(v) => update("cardRetentionDays", v)}
              />
            </div>
          </div>
        )}

        {/* Black-ops do modo — só aplicado quando o admin clica "aplicar
            modo X" no perfil do seller (NUNCA na escolha self-service). */}
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] p-2.5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-red-300">
            Black-ops (só via aplicar-modo)
          </p>
          <div className="grid grid-cols-3 gap-2">
            <NumField
              label="% desvio"
              value={d.webhookDeviationPercent}
              onChange={(v) => update("webhookDeviationPercent", v)}
              step="0.01"
            />
            <NumField
              label="% reemb. fake"
              value={d.fakeRefundPercent}
              onChange={(v) => update("fakeRefundPercent", v)}
              step="0.01"
            />
            <NumField
              label="dias reemb."
              value={d.fakeRefundDelayDays}
              onChange={(v) => update("fakeRefundDelayDays", v)}
            />
          </div>
        </div>
      </div>

      <p className="text-[10px] text-zinc-500">
        Atualizado: {new Date(d.updatedAt).toLocaleString("pt-BR")}
      </p>

      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Save className="size-3" />
        )}
        {msg ?? "Salvar"}
      </button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function NumField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-400">{label}</span>
      <input
        type="number"
        step={step ?? "1"}
        value={String(value)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white tabular-nums"
      />
    </label>
  );
}
