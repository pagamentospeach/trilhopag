"use client";

import { useState, useTransition } from "react";
import {
  Sparkles,
  Loader2,
  Check,
  X,
  Bell,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  adminSetNominalDedupAutoEnabled,
  adminResolveNominalDedupNotification,
} from "../../actions";

type Notification = {
  id: string;
  message: string;
  createdAt: string;
  hiddenShortCode: string;
  winnerShortCode: string;
  nominalName: string;
  hiddenRate: number;
  winnerRate: number;
  hiddenCount: number;
  winnerCount: number;
};

type Props = {
  initialEnabled: boolean;
  notifications: Notification[];
};

/**
 * Toggle da OTIMIZACAO AUTOMATICA DE ADQUIRENTES. Quando ligada, o sistema
 * detecta nominal duplicada entre adquirentes e esconde dos sellers a de
 * menor conversao no dia. Notificacoes pendentes aparecem em card abaixo
 * do toggle — cada uma tem "Marcar como tratada" quando o admin ja trocou
 * o nominal na adquirente escondida.
 */
export function NominalDedupToggle({ initialEnabled, notifications }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, start] = useTransition();
  const [items, setItems] = useState(notifications);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // Sempre inicia RECOLHIDO (pedido do david 05/07). Header mostra
  // status + badge de notificacoes pendentes; clica pra expandir.
  const [expanded, setExpanded] = useState(false);

  function toggle() {
    const next = !enabled;
    start(async () => {
      const r = await adminSetNominalDedupAutoEnabled(next);
      if (r.ok) setEnabled(r.enabled);
    });
  }

  function resolve(id: string) {
    setResolvingId(id);
    start(async () => {
      const r = await adminResolveNominalDedupNotification(id);
      if (r.ok) setItems((prev) => prev.filter((n) => n.id !== id));
      setResolvingId(null);
    });
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      {/* Header CLICAVEL — expande/recolhe todo o resto. Sempre inicia
          recolhido. Mostra sinais rapidos (status + badge de pendentes)
          direto no titulo pra o admin nao precisar abrir pra ver. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02] text-left"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="size-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-zinc-500 shrink-0" />
        )}
        <Sparkles className="size-4 text-fuchsia-300 shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
            Otimização de adquirentes automática
            <span
              className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                enabled
                  ? "bg-fuchsia-400/15 text-fuchsia-200 border border-fuchsia-400/25"
                  : "bg-white/[0.06] text-zinc-400 border border-white/10"
              }`}
            >
              {enabled ? (
                <>
                  <Check className="size-3" /> Ativa
                </>
              ) : (
                <>
                  <X className="size-3" /> Desligada
                </>
              )}
            </span>
            {items.length > 0 && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                <Bell className="size-3" /> {items.length} pendente
                {items.length !== 1 ? "s" : ""}
              </span>
            )}
          </h2>
          {!expanded && (
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Clique pra expandir controles e ver notificações.
            </p>
          )}
        </div>
      </button>

      {expanded && (
        <>
          <div className="border-t border-white/[0.06] px-5 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-zinc-500">
                Quando 2+ adquirentes ficam com a mesma nominal (no mesmo modo),
                esconde dos sellers a de menor conversão do dia e te avisa aqui
                pra trocar o nominal dela.
              </p>
            </div>
            <button
              type="button"
              onClick={toggle}
              disabled={pending}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${
                enabled
                  ? "bg-fuchsia-400 text-black hover:bg-fuchsia-300"
                  : "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]"
              }`}
              title={enabled ? "Clique pra desligar" : "Clique pra ligar"}
            >
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {enabled ? "desligando…" : "ligando…"}
                </>
              ) : enabled ? (
                <>
                  <Check className="size-3.5" /> Desligar
                </>
              ) : (
                <>
                  <X className="size-3.5" /> Ligar
                </>
              )}
            </button>
          </div>
        </>
      )}

      {expanded && items.length > 0 && (
        <>
          <div className="px-5 py-2 border-b border-white/[0.04] flex items-center gap-2 text-[11px]">
            <Bell className="size-3 text-amber-300" />
            <span className="text-amber-200 font-semibold">
              {items.length} adquirente{items.length !== 1 ? "s" : ""} escondida
              {items.length !== 1 ? "s" : ""} — troca o nominal e marca como
              tratada
            </span>
          </div>
          <div className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
            {items.map((n) => (
              <div
                key={n.id}
                className="px-5 py-3 flex items-center gap-3 text-sm"
              >
                <span className="shrink-0 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200 flex items-center gap-1">
                  <EyeOff className="size-2.5" />
                  {n.hiddenShortCode}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-200 truncate" title={n.nominalName}>
                    Nominal <span className="text-white font-semibold">"{n.nominalName}"</span>{" "}
                    duplicado com{" "}
                    <span className="rounded-full bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0 text-[10px] font-bold text-cyan-200">
                      {n.winnerShortCode}
                    </span>
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    conv. hoje ·{" "}
                    <span className="text-red-300">
                      {(n.hiddenRate * 100).toFixed(1)}% ({n.hiddenCount} tx)
                    </span>{" "}
                    vs{" "}
                    <span className="text-cyan-300">
                      {(n.winnerRate * 100).toFixed(1)}% ({n.winnerCount} tx)
                    </span>
                    <span className="text-zinc-600 mx-1.5">·</span>
                    {new Date(n.createdAt).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => resolve(n.id)}
                  disabled={pending && resolvingId === n.id}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full border border-white/[0.1] px-3 py-1 text-[10px] font-medium text-zinc-300 hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
                >
                  {pending && resolvingId === n.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  Tratada
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
