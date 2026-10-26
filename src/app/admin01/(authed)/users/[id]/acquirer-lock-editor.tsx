"use client";

import { useState, useTransition } from "react";
import { adminLockUserAcquirer } from "@/app/admin01/actions";
import { Lock, Unlock, Loader2 } from "lucide-react";
import {
  acquirerModesFor,
  OPS_MODE_LABEL,
  OPS_MODES,
  type OpsMode,
} from "@/lib/ops-modes";

/**
 * Editor de TRAVA de adquirente PIX por modo (um card por OPS_MODES) — admin only.
 *
 * A trava (User.lockedPixAcquirerByMode) faz o dispatcher usar a adquirente
 * escolhida como BATCH SOLO no topo do plano. So cai pras outras (fanout
 * exaustivo) se ela falhar. Diferente de `pixPriority` (que so ordena o
 * fanout paralelo — todas correm juntas), a trava GARANTE que essa e a
 * primeira a ser tentada isoladamente.
 *
 * Usado quando david quer forcar tx do seller X a rodar SEMPRE na Caju
 * Pagar.me (nominal preferida) — sem risco da RapidPag/outra vencer a
 * corrida do fanout.
 */
type Acquirer = {
  id: string;
  code: string;
  nominalName: string;
  mode: string;
};

const MODE_COLOR: Record<OpsMode, string> = {
  black: "bg-zinc-800 border-zinc-700",
  white: "bg-slate-800 border-slate-700",
  hot: "bg-orange-900/30 border-orange-700/50",
  sag: "bg-cyan-900/30 border-cyan-700/50",
};

const MODES = OPS_MODES.map((key) => ({
  key,
  label: OPS_MODE_LABEL[key].toUpperCase(),
  color: MODE_COLOR[key],
}));

export function AcquirerLockEditor({
  userId,
  eligibleAcquirers,
  initialLocks,
}: {
  userId: string;
  /** Adquirentes elegiveis pra PIX (active + supportsPix), sem filtro de modo. */
  eligibleAcquirers: Acquirer[];
  /** Mapa atual de travas: { black: acquirerId | null, ... } */
  initialLocks: Record<string, string | null>;
}) {
  const [locks, setLocks] = useState(initialLocks);
  const [pending, startTransition] = useTransition();
  const [pendingMode, setPendingMode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    mode: string;
    msg: string;
    ok: boolean;
  } | null>(null);

  function acquirersForMode(m: string) {
    // Filtro espelha o do dispatcher (acquirers.ts) — mesma tabela.
    const allowed = acquirerModesFor(m) as string[];
    return eligibleAcquirers.filter((a) => allowed.includes(a.mode));
  }

  function handleChange(mode: string, acquirerId: string) {
    setPendingMode(mode);
    setFeedback(null);
    startTransition(async () => {
      const finalId = acquirerId === "" ? null : acquirerId;
      const r = await adminLockUserAcquirer(
        userId,
        mode as OpsMode,
        finalId,
      );
      if (!r.ok) {
        setFeedback({ mode, msg: r.error, ok: false });
      } else {
        setLocks((prev) => ({ ...prev, [mode]: finalId }));
        setFeedback({
          mode,
          msg: finalId ? "Travado ✓" : "Destravado ✓",
          ok: true,
        });
      }
      setPendingMode(null);
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <header className="mb-3 flex items-center gap-2">
        <Lock className="size-4 text-orange-300" />
        <h3 className="text-sm font-semibold text-white">
          Travar adquirente PIX por modo
        </h3>
      </header>
      <p className="mb-4 text-[11px] text-zinc-500">
        Trava = dispatcher usa SO essa adquirente como 1a tentativa (batch
        solo). Cai pras outras (fanout exaustivo) so se ela falhar. Sem trava,
        todas as elegíveis correm em paralelo e a MAIS RAPIDA vence — o que
        pode fazer nominal indesejada aparecer no extrato do cliente.
      </p>

      <div className="space-y-3">
        {MODES.map((m) => {
          const options = acquirersForMode(m.key);
          const current = locks[m.key] ?? "";
          const isPending = pendingMode === m.key;
          const fb = feedback?.mode === m.key ? feedback : null;
          return (
            <div key={m.key} className={`rounded-xl border ${m.color} p-3`}>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                    {m.label}
                  </span>
                  {current ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-400/15 px-2 py-0.5 text-[10px] font-semibold text-orange-300">
                      <Lock className="size-2.5" /> travada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-400">
                      <Unlock className="size-2.5" /> fanout normal
                    </span>
                  )}
                </div>
                {isPending && <Loader2 className="size-3.5 animate-spin text-zinc-400" />}
                {fb && (
                  <span
                    className={`text-[10px] font-medium ${fb.ok ? "text-cyan-300" : "text-red-300"}`}
                  >
                    {fb.msg}
                  </span>
                )}
              </div>
              <select
                disabled={pending || options.length === 0}
                value={current}
                onChange={(e) => handleChange(m.key, e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-zinc-200 focus:border-orange-400/40 focus:outline-none disabled:opacity-50"
              >
                <option value="">— sem trava (fanout paralelo) —</option>
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nominalName} ({a.code})
                  </option>
                ))}
              </select>
              {options.length === 0 && (
                <p className="mt-1 text-[10px] text-zinc-500">
                  Sem adquirentes elegíveis no modo {m.label}.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
