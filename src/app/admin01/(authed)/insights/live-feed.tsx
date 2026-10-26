"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

type Sale = {
  id: string;
  amountCents: number;
  method: string;
  provider: string;
  paidAt: string | null;
  customerEmail: string | null;
  sellerId: string;
  seller: string;
  diverted: boolean;
};

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function timeAgo(iso: string | null): string {
  // FIX 08/07/2026: null vira "agora" em vez de "—" eterno. Api recent-sales
  // ja usa paidAt ?? createdAt entao null nao deve chegar aqui, mas defesa
  // em profundidade — nunca mostrar "—" na UI de vendas ao vivo.
  if (!iso) return "agora";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function LiveFeed({ initial }: { initial: Sale[] }) {
  const [sales, setSales] = useState<Sale[]>(initial);
  const [live, setLive] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const lastTopId = useRef<string | null>(initial[0]?.id ?? null);

  // Re-render a cada 5s pra atualizar os "timeAgo".
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!live) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/admin/recent-sales", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { sales: Sale[] };
        if (stop || !data.sales) return;
        const newTop = data.sales[0]?.id ?? null;
        if (newTop && newTop !== lastTopId.current) {
          setFlash(newTop);
          lastTopId.current = newTop;
          setTimeout(() => setFlash(null), 1500);
        }
        setSales(data.sales);
      } catch {
        // silencioso — proxima tentativa
      }
    };
    const i = setInterval(poll, 12000);
    return () => {
      stop = true;
      clearInterval(i);
    };
  }, [live]);

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="border-b border-white/[0.06] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            {live && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex size-2 rounded-full ${
                live ? "bg-cyan-400" : "bg-zinc-600"
              }`}
            />
          </span>
          <h2 className="text-sm font-semibold text-white">Vendas ao vivo</h2>
          <span className="text-[10px] text-zinc-500">
            {live ? "atualizando a cada 12s" : "pausado"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-3 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.1]"
        >
          {live ? (
            <>
              <Pause className="size-3" /> pausar
            </>
          ) : (
            <>
              <Play className="size-3" /> retomar
            </>
          )}
        </button>
      </div>
      <div className="max-h-[28rem] overflow-y-auto divide-y divide-white/[0.04]">
        {sales.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">
            Nenhuma venda ainda.
          </p>
        ) : (
          sales.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                flash === s.id ? "bg-cyan-400/[0.08]" : ""
              }`}
            >
              <span className="text-[10px] text-zinc-500 w-10 shrink-0 tabular-nums">
                {timeAgo(s.paidAt)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-zinc-200 truncate">
                  {s.seller}
                  {s.diverted && (
                    <span className="ml-1.5 rounded-full bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 text-[9px] font-bold text-red-300">
                      desviada
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {s.customerEmail ?? "—"} · {s.method} · {s.provider}
                </p>
              </div>
              <span className="shrink-0 font-mono tabular-nums text-cyan-300">
                {brl(s.amountCents)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
