"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Moon, Sun, Flame, Network, Eraser, ShieldAlert } from "lucide-react";
import { adminSetUserDeviationByMode } from "@/app/admin01/actions";
import { modeHasCard, OPS_MODES, type OpsMode } from "@/lib/ops-modes";

export type DeviationModePix = { pix: number | null };
export type DeviationModeWhite = DeviationModePix & { card: number | null };
export type DeviationByMode = {
  black: DeviationModePix;
  white: DeviationModeWhite;
  hot: DeviationModePix;
  // SAG movimenta PIX e cartão (como o white), então tem as duas colunas.
  sag: DeviationModeWhite;
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

/**
 * Editor do DESVIO DE WEBHOOK por modo de adquirente × método (interno) —
 * visual premium. % nullable: vazio = cai no per-method legado / global. PIX
 * usa o pixOpsMode do seller; cartão usa o cardOpsMode. Black/Hot só PIX;
 * White PIX + cartão. Dinheiro real — NUNCA exposto ao seller.
 */
export function DeviationByModeEditor({
  userId,
  initial,
  globalPercent,
  pixMode,
  cardMode,
}: {
  userId: string;
  initial: DeviationByMode;
  /** % global do seller — mostrado como placeholder ("global X%"). */
  globalPercent: number;
  /** Modo PIX atual do seller (badge "ativo"). */
  pixMode: string;
  /** Modo cartão atual do seller (badge "ativo"). */
  cardMode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [d, setD] = useState<DeviationByMode>(initial);

  function setMode<M extends OpsMode>(
    mode: M,
    patch: Partial<DeviationByMode[M]>,
  ) {
    setD((s) => ({ ...s, [mode]: { ...s[mode], ...patch } }));
  }

  function clearAll() {
    setD({
      black: { pix: null },
      white: { pix: null, card: null },
      hot: { pix: null },
      sag: { pix: null, card: null },
    });
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await adminSetUserDeviationByMode(userId, d);
      if (r.ok) {
        setMsg("Salvo");
        setTimeout(() => setMsg(null), 1500);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  const ph = `${globalPercent}`;

  return (
    <section className="relative rounded-3xl">
      {/* Glow vermelho ambiente — wash sutil no topo direito */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-3xl"
        style={{
          background:
            "radial-gradient(140% 110% at 100% 0%, rgba(239,68,68,0.07), transparent 55%)",
        }}
      />

      <div className="relative space-y-6">
        {/* Aviso interno */}
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-300">
            <ShieldAlert className="size-3.5" />
          </span>
          <p className="text-[13px] leading-relaxed text-red-100/85">
            <strong className="text-red-200">Desvio por modo × método.</strong>{" "}
            PIX usa o modo PIX do seller (
            <span className="font-mono text-red-300">{pixMode}</span> ativo);
            cartão usa o modo cartão (
            <span className="font-mono text-red-300">{cardMode}</span> ativo).
            Vazio = cai no override por método legado / no global. Precedência:{" "}
            <strong>modo×método &gt; método &gt; global ({globalPercent}%)</strong>.
          </p>
        </div>

        {/* Cards de modo — derivados de OPS_MODES, não copiados por modo. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OPS_MODES.map((m) => {
            const cardOn = modeHasCard(m);
            // Modos PIX-only não têm `card` no tipo; o cast só é lido no ramo
            // cardOn, onde o modo de fato tem o campo.
            const dm = d[m] as DeviationModeWhite;
            const set = setMode as (
              mode: OpsMode,
              patch: Partial<DeviationModeWhite>,
            ) => void;
            return (
              <ModeCard
                key={m}
                mode={m}
                active={pixMode === m || (cardOn && cardMode === m)}
              >
                <MethodGroup label="PIX">
                  <PctField value={dm.pix} placeholder={ph} onChange={(v) => set(m, { pix: v })} />
                </MethodGroup>
                {cardOn ? (
                  <MethodGroup label="Cartão">
                    <PctField value={dm.card} placeholder={ph} onChange={(v) => set(m, { card: v })} />
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

        {/* Limpar + Salvar */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.07]"
          >
            <Eraser className="size-3.5" /> Limpar tudo (usar global)
          </button>
          <div className="flex items-center gap-3">
            {msg && msg !== "Salvo" && (
              <span className="text-xs text-red-300">{msg}</span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full bg-red-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(239,68,68,0.4),0_10px_30px_-10px_rgba(239,68,68,0.55)] transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {msg === "Salvo" ? "Salvo!" : "Salvar desvio por modo"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModeCard({
  mode,
  active,
  children,
}: {
  mode: OpsMode;
  active?: boolean;
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
        {active && (
          <span className="rounded-full bg-red-500/20 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-red-300">
            ativo
          </span>
        )}
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
      {children}
    </div>
  );
}

/** Campo % nullable premium (vazio = null = usa global/legado). */
function PctField({
  value,
  placeholder,
  onChange,
}: {
  value: number | null;
  placeholder?: string;
  onChange: (v: number | null) => void;
}) {
  const overriding = value != null;
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-zinc-400">% desvio</span>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
          %
        </span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={value == null ? "" : String(value)}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (raw === "") {
              onChange(null);
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n)) onChange(n);
          }}
          className={`h-11 w-full rounded-xl border bg-white/[0.03] pl-8 pr-3 text-sm tabular-nums text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-red-400/15 ${
            overriding ? "border-red-400/40" : "border-white/[0.08] hover:border-white/[0.16]"
          }`}
        />
      </div>
      <p className={`mt-1 text-[10px] ${overriding ? "text-red-300/70" : "text-zinc-600"}`}>
        {overriding ? "Override deste modo" : `Usa global (${placeholder}%)`}
      </p>
    </label>
  );
}
