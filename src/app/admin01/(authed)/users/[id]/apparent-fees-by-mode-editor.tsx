"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Moon, Sun, Flame, Network, Eraser, Drama } from "lucide-react";
import { adminSetUserApparentFeesByMode } from "@/app/admin01/actions";
import { modeHasCard, OPS_MODES, type OpsMode } from "@/lib/ops-modes";

export type ApparentModePix = { pixPct: number | null; pixFix: number | null };
export type ApparentModeWhite = ApparentModePix & {
  cardPct: number | null;
  cardFix: number | null;
};
export type ApparentFeesByMode = {
  black: ApparentModePix;
  white: ApparentModeWhite;
  hot: ApparentModePix;
  // SAG movimenta PIX e cartão (como o white), então tem as duas colunas.
  sag: ApparentModeWhite;
  withdrawalFeeCents: number | null;
};

/** Taxas REAIS por modo — só pra mostrar como placeholder ("real: X%"). */
export type RealFeesByMode = {
  black: { pixPct: number; pixFix: number };
  white: { pixPct: number; pixFix: number; cardPct: number; cardFix: number };
  hot: { pixPct: number; pixFix: number };
  sag: { pixPct: number; pixFix: number; cardPct: number; cardFix: number };
  withdrawalFeeCents: number;
};

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
 * Editor das TAXAS APARENTES (cosméticas) por modo de adquirente — visual
 * premium (espelha o editor de taxas reais). Cada campo é NULLABLE: vazio =
 * mostra a taxa REAL pro seller (o placeholder exibe a real). 100% fachada —
 * não cobra nada. Black/Hot só PIX; White/SAG PIX + cartão. R$ em centavos.
 */
export function ApparentFeesByModeEditor({
  userId,
  initial,
  real,
}: {
  userId: string;
  initial: ApparentFeesByMode;
  real: RealFeesByMode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [d, setD] = useState<ApparentFeesByMode>(initial);

  function setMode<M extends OpsMode>(
    mode: M,
    patch: Partial<ApparentFeesByMode[M]>,
  ) {
    setD((s) => ({ ...s, [mode]: { ...s[mode], ...patch } }));
  }

  function clearAll() {
    setD({
      black: { pixPct: null, pixFix: null },
      white: { pixPct: null, pixFix: null, cardPct: null, cardFix: null },
      hot: { pixPct: null, pixFix: null },
      sag: { pixPct: null, pixFix: null, cardPct: null, cardFix: null },
      withdrawalFeeCents: null,
    });
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await adminSetUserApparentFeesByMode(userId, d);
      if (r.ok) {
        setMsg("Salvo");
        setTimeout(() => setMsg(null), 1500);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <section className="relative rounded-3xl">
      {/* Glow roxo ambiente — wash suave no topo direito */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-3xl"
        style={{
          background:
            "radial-gradient(140% 110% at 100% 0%, rgba(168,85,247,0.07), transparent 55%)",
        }}
      />

      <div className="relative space-y-6">
        {/* Aviso cosmético */}
        <div className="flex items-start gap-3 rounded-2xl border border-purple-400/20 bg-purple-400/[0.06] px-4 py-3">
          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-purple-400/15 text-purple-300">
            <Drama className="size-3.5" />
          </span>
          <p className="text-[13px] leading-relaxed text-purple-100/85">
            <strong className="text-purple-200">100% cosmético.</strong> Estes
            valores aparecem pro seller em <strong>Perfil → Taxas</strong>{" "}
            conforme o modo dele — mas <strong>NÃO afetam nenhuma cobrança</strong>{" "}
            (o cálculo real usa as taxas reais). Deixe <strong>vazio</strong> pra
            mostrar a taxa real. Black e Hot só PIX; White e SAG PIX e cartão.
          </p>
        </div>

        {/* Cards de modo — um por modo, derivado de OPS_MODES. Antes eram 3
            blocos JSX copiados; o quarto modo teria que ser escrito à mão. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OPS_MODES.map((m) => {
            const cardOn = modeHasCard(m);
            // Nos modos PIX-only o tipo não tem as chaves de cartão. O cast só
            // é LIDO dentro do ramo cardOn, onde o modo de fato as tem.
            const dm = d[m] as ApparentModeWhite;
            const rm = real[m] as RealFeesByMode["white"];
            const set = setMode as (
              mode: OpsMode,
              patch: Partial<ApparentModeWhite>,
            ) => void;
            return (
              <ModeCard key={m} mode={m}>
                <MethodGroup label="PIX">
                  <NullField label="Taxa" kind="pct" value={dm.pixPct} real={rm.pixPct} onChange={(v) => set(m, { pixPct: v })} />
                  <NullField label="Fixa" kind="reais" value={dm.pixFix} real={rm.pixFix} onChange={(v) => set(m, { pixFix: v })} />
                </MethodGroup>
                {cardOn ? (
                  <MethodGroup label="Cartão">
                    <NullField label="Taxa" kind="pct" value={dm.cardPct} real={rm.cardPct} onChange={(v) => set(m, { cardPct: v })} />
                    <NullField label="Fixa" kind="reais" value={dm.cardFix} real={rm.cardFix} onChange={(v) => set(m, { cardFix: v })} />
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
            Valor de saque que o seller vê (vazio = mostra o real).
          </p>
          <div className="mt-3 max-w-[200px]">
            <NullField
              label="Valor por saque"
              kind="reais"
              value={d.withdrawalFeeCents}
              real={real.withdrawalFeeCents}
              onChange={(v) => setD((s) => ({ ...s, withdrawalFeeCents: v }))}
            />
          </div>
        </div>

        {/* Limpar + Salvar */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.07]"
          >
            <Eraser className="size-3.5" /> Limpar tudo (mostrar reais)
          </button>
          <div className="flex items-center gap-3">
            {msg && msg !== "Salvo" && (
              <span className="text-xs text-red-300">{msg}</span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full bg-purple-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(168,85,247,0.4),0_10px_30px_-10px_rgba(168,85,247,0.55)] transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {msg === "Salvo" ? "Salvo!" : "Salvar aparentes"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModeCard({
  mode,
  children,
}: {
  mode: OpsMode;
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
      <div className="relative flex items-center justify-between gap-2">
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
        <span
          className="inline-flex items-center gap-1 rounded-full bg-purple-400/10 px-2 py-1 text-[10px] font-semibold text-purple-300"
          title="Taxa de fachada — não cobra nada"
        >
          <Drama className="size-3" /> Fachada
        </span>
      </div>
      <div className="relative flex flex-1 flex-col gap-4">{children}</div>
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
 * Campo nullable premium (estilo Linear). kind="pct" edita o número direto (%);
 * kind="reais" edita em R$ mas guarda/retorna em CENTAVOS. Vazio = null =
 * "mostra a real". O placeholder e o hint exibem a taxa REAL pra referência.
 */
function NullField({
  label,
  kind,
  value,
  real,
  onChange,
}: {
  label: string;
  kind: "pct" | "reais";
  value: number | null;
  real: number;
  onChange: (v: number | null) => void;
}) {
  const display =
    value == null ? "" : kind === "reais" ? (value / 100).toString() : String(value);
  const placeholder =
    kind === "reais" ? (real / 100).toFixed(2) : String(real);
  const overriding = value != null;
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
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (raw === "") {
              onChange(null);
              return;
            }
            const n = Number(raw);
            if (!Number.isFinite(n)) return;
            onChange(kind === "reais" ? Math.round(n * 100) : n);
          }}
          className={`h-11 w-full rounded-xl border bg-white/[0.03] pl-8 pr-3 text-sm tabular-nums text-white outline-none transition placeholder:text-zinc-600 focus:border-purple-400/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-purple-400/15 ${
            overriding ? "border-purple-400/40" : "border-white/[0.08] hover:border-white/[0.16]"
          }`}
        />
      </div>
      <p className={`mt-1 text-[10px] ${overriding ? "text-purple-300/70" : "text-zinc-600"}`}>
        Real: {kind === "pct" ? fmtPct(real) : fmtReais(real)}
      </p>
    </label>
  );
}
