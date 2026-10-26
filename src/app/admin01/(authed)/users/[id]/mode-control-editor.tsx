"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Moon,
  Sun,
  Flame,
  Network,
  Loader2,
  Check,
  Ban,
  Eye,
} from "lucide-react";
import { adminMoveUserMode, adminSetForbiddenModes } from "@/app/admin01/actions";
import { OPS_MODES, type OpsMode } from "@/lib/ops-modes";

type Mode = OpsMode;

const META: Record<
  Mode,
  {
    label: string;
    sub: string;
    Icon: React.ComponentType<{ className?: string }>;
    iconWrap: string;
    iconCls: string;
    ring: string;
    activeRing: string;
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
    activeRing: "border-zinc-300/40 ring-2 ring-zinc-300/20",
    glow: "rgba(161,161,170,0.12)",
  },
  white: {
    label: "White",
    sub: "PIX + cartão",
    Icon: Sun,
    iconWrap: "bg-zinc-100/[0.06] border-white/[0.12]",
    iconCls: "text-zinc-100",
    ring: "border-white/[0.10] hover:border-white/[0.20]",
    activeRing: "border-zinc-100/40 ring-2 ring-zinc-100/20",
    glow: "rgba(255,255,255,0.12)",
  },
  hot: {
    label: "Hot",
    sub: "Alta conversão",
    Icon: Flame,
    iconWrap: "bg-orange-500/[0.12] border-orange-400/20",
    iconCls: "text-orange-400",
    ring: "border-orange-400/20 hover:border-orange-400/40",
    activeRing: "border-orange-400/50 ring-2 ring-orange-400/25",
    glow: "rgba(251,146,60,0.14)",
  },
  // SAG usa o ciano da marca e o ícone de topologia: é o modo em que a conta
  // opera como sub adquirente, então nem zinco (black/white) nem laranja (hot)
  // serviriam sem confundir com os que já existem.
  sag: {
    label: "SAG",
    sub: "Sub adquirente gateway",
    Icon: Network,
    iconWrap: "bg-cyan-500/[0.12] border-cyan-400/20",
    iconCls: "text-cyan-400",
    ring: "border-cyan-400/20 hover:border-cyan-400/40",
    activeRing: "border-cyan-400/50 ring-2 ring-cyan-400/25",
    glow: "rgba(51,210,217,0.14)",
  },
};

const MODES: readonly Mode[] = OPS_MODES;

/**
 * Controle do MODO de adquirente do seller (dentro de Taxas customizadas):
 *  1. Mover o seller pra outro modo — aplica as taxas do modo.
 *  2. Proibir/liberar modos — modo proibido some da aba Adquirentes do seller
 *     E o dispatch de PIX/cartão recusa gerar cobrança nele.
 * Não dá pra proibir todos (sempre sobra ≥1). Mover pra proibido é bloqueado.
 */
export function ModeControlEditor({
  userId,
  currentMode,
  initialForbidden,
}: {
  userId: string;
  currentMode: string;
  initialForbidden: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [forbidden, setForbidden] = useState<Set<string>>(
    new Set(initialForbidden),
  );
  const [current, setCurrent] = useState<string>(currentMode);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function move(mode: Mode) {
    if (mode === current) return;
    if (forbidden.has(mode)) {
      setMsg("Esse modo está proibido — libere antes de mover.");
      return;
    }
    setMsg(null);
    setBusy(`move:${mode}`);
    startTransition(async () => {
      const r = await adminMoveUserMode(userId, mode);
      setBusy(null);
      if (r.ok) {
        setCurrent(mode);
        setMsg(`Movido pro modo ${META[mode].label} (taxas aplicadas).`);
        setTimeout(() => setMsg(null), 3000);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  function toggleForbid(mode: Mode) {
    const next = new Set(forbidden);
    if (next.has(mode)) next.delete(mode);
    else next.add(mode);
    // Nunca proibir todos (senão o dispatch não teria modo pra cobrar).
    if (next.size >= OPS_MODES.length) {
      setMsg("Não dá pra proibir todos os modos — deixe ao menos 1 liberado.");
      return;
    }
    setMsg(null);
    setBusy(`forbid:${mode}`);
    startTransition(async () => {
      const r = await adminSetForbiddenModes(userId, Array.from(next));
      setBusy(null);
      if (r.ok) {
        setForbidden(new Set(r.forbidden));
        if (r.movedTo) {
          setCurrent(r.movedTo);
          setMsg(
            `Modo proibido era o ativo — seller movido pro ${META[r.movedTo as Mode].label}.`,
          );
        } else {
          setMsg("Modos atualizados.");
        }
        setTimeout(() => setMsg(null), 3000);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.015] p-5">
      <div>
        <h3 className="text-sm font-bold text-white">
          Modo de adquirente do seller
        </h3>
        <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">
          Clique num modo pra <strong className="text-zinc-200">mover</strong> o
          seller (aplica as taxas do modo). Use{" "}
          <strong className="text-zinc-200">Proibir</strong> pra esconder o modo
          da aba Adquirentes dele e bloquear geração de PIX/cartão nesse modo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map((mode) => {
          const m = META[mode];
          const isCurrent = current === mode;
          const isForbidden = forbidden.has(mode);
          const moving = busy === `move:${mode}`;
          const forbidding = busy === `forbid:${mode}`;
          return (
            <div
              key={mode}
              className={`relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-white/[0.02] p-4 transition ${
                isCurrent ? m.activeRing : m.ring
              } ${isForbidden ? "opacity-60" : ""}`}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `radial-gradient(circle at 50% -20%, ${m.glow}, transparent 60%)`,
                }}
              />
              <div className="relative flex items-center justify-between">
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
                {isCurrent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/15 px-2 py-1 text-[10px] font-semibold text-cyan-300">
                    <Check className="size-3" /> Ativo
                  </span>
                )}
              </div>

              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending || isCurrent || isForbidden}
                  onClick={() => move(mode)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-2 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
                  title={
                    isForbidden
                      ? "Modo proibido — libere antes"
                      : isCurrent
                        ? "Já é o modo ativo"
                        : "Mover seller pra este modo"
                  }
                >
                  {moving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : isCurrent ? (
                    "Modo atual"
                  ) : (
                    "Mover aqui"
                  )}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggleForbid(mode)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    isForbidden
                      ? "border-red-400/40 bg-red-500/15 text-red-300 hover:bg-red-500/25"
                      : "border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07]"
                  }`}
                  title={isForbidden ? "Liberar este modo" : "Proibir este modo"}
                >
                  {forbidding ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : isForbidden ? (
                    <>
                      <Ban className="size-3.5" /> Proibido
                    </>
                  ) : (
                    <>
                      <Eye className="size-3.5" /> Liberado
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {msg && (
        <p className="text-[12px] text-zinc-300">{msg}</p>
      )}
    </div>
  );
}
