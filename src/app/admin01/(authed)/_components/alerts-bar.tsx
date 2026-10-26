"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, AlertOctagon, Info, X, Loader2 } from "lucide-react";
import { adminResolveSafepixDriftOne } from "../../actions";

/** Prefixo dos alertas de drift de saldo SafePix (id = safepix-drift-<notifId>). */
const DRIFT_PREFIX = "safepix-drift-";

type Alert = {
  id: string;
  level: "crit" | "warn" | "info";
  text: string;
  href?: string;
};

const STYLES = {
  crit: {
    box: "border-red-500/40 bg-red-500/[0.08] text-red-200",
    Icon: AlertOctagon,
    iconCls: "text-red-400",
  },
  warn: {
    box: "border-amber-500/40 bg-amber-500/[0.07] text-amber-100",
    Icon: AlertTriangle,
    iconCls: "text-amber-400",
  },
  info: {
    box: "border-white/[0.1] bg-white/[0.03] text-zinc-300",
    Icon: Info,
    iconCls: "text-zinc-400",
  },
} as const;

export function AlertsBar() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<string | null>(null);

  /**
   * X do alerta. Pros avisos de DRIFT de saldo SafePix, dispensar = RESOLVER
   * de verdade (some pra sempre), exigindo um motivo. Os outros alertas são
   * derivados do estado live (contadores), então o X só esconde na sessão.
   */
  async function handleDismiss(a: Alert) {
    if (a.id.startsWith(DRIFT_PREFIX)) {
      const reason = window.prompt(
        "Tirar este aviso permanentemente. Por quê? (ex: saque manual via app, transferência interna, já investiguei)",
      );
      if (reason === null) return; // cancelou
      if (!reason.trim()) {
        window.alert("Motivo obrigatório pra remover o aviso.");
        return;
      }
      const notifId = a.id.slice(DRIFT_PREFIX.length);
      setResolving(a.id);
      try {
        const r = await adminResolveSafepixDriftOne(notifId, reason);
        if (r.ok) {
          setDismissed((prev) => new Set(prev).add(a.id));
          setAlerts((prev) => prev.filter((x) => x.id !== a.id));
        } else {
          window.alert(r.error ?? "Erro ao remover o aviso.");
        }
      } finally {
        setResolving(null);
      }
      return;
    }
    // alerta derivado — só esconde nesta sessão
    setDismissed((prev) => new Set(prev).add(a.id));
  }

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/alerts", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { alerts: Alert[] };
        if (!stop && data.alerts) setAlerts(data.alerts);
      } catch {
        // silencioso
      }
    };
    load();
    const i = setInterval(load, 30000);
    return () => {
      stop = true;
      clearInterval(i);
    };
  }, []);

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="mb-4 space-y-1.5">
      {visible.map((a) => {
        const s = STYLES[a.level];
        const Icon = s.Icon;
        const inner = (
          <div
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] ${s.box}`}
          >
            <Icon className={`size-4 shrink-0 ${s.iconCls}`} />
            <span className="flex-1 min-w-0">{a.text}</span>
            {a.href && (
              <span className="text-[11px] underline opacity-70 shrink-0">
                ver →
              </span>
            )}
            <button
              type="button"
              disabled={resolving === a.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleDismiss(a);
              }}
              className="shrink-0 opacity-50 hover:opacity-100 disabled:opacity-30"
              title={
                a.id.startsWith(DRIFT_PREFIX)
                  ? "Remover permanentemente (pede motivo)"
                  : "Dispensar"
              }
            >
              {resolving === a.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
            </button>
          </div>
        );
        return a.href ? (
          <Link key={a.id} href={a.href} className="block">
            {inner}
          </Link>
        ) : (
          <div key={a.id}>{inner}</div>
        );
      })}
    </div>
  );
}
