"use client";

import { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  CreditCard,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatBRL } from "@/lib/utils";

type Release = {
  txId: string;
  date: string;
  cents: number;
  kind: "pix_release" | "card_release" | "card_retention";
  method: string;
};

/**
 * Calendário de releases — agrupa por DATA (dia) os valores que vão
 * cair no balanceCents do seller.
 *
 * Visualização: lista vertical com dias agrupados, expandable pra ver
 * cada tx individual do dia.
 */
export function ReleaseCalendar({ releases }: { releases: Release[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleDay(dayKey: string) {
    const next = new Set(expanded);
    if (next.has(dayKey)) next.delete(dayKey);
    else next.add(dayKey);
    setExpanded(next);
  }

  // Agrupa por dia (YYYY-MM-DD)
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        date: Date;
        totalCents: number;
        pixCount: number;
        cardCount: number;
        retentionCount: number;
        items: Release[];
      }
    >();
    for (const r of releases) {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalCents += r.cents;
        existing.items.push(r);
        if (r.kind === "pix_release") existing.pixCount++;
        else if (r.kind === "card_release") existing.cardCount++;
        else if (r.kind === "card_retention") existing.retentionCount++;
      } else {
        map.set(key, {
          date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
          totalCents: r.cents,
          pixCount: r.kind === "pix_release" ? 1 : 0,
          cardCount: r.kind === "card_release" ? 1 : 0,
          retentionCount: r.kind === "card_retention" ? 1 : 0,
          items: [r],
        });
      }
    }
    return Array.from(map.entries())
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [releases]);

  const totalUpcoming = releases.reduce((sum, r) => sum + r.cents, 0);

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <header className="border-b border-white/[0.06] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="size-4 text-zinc-400" />
          <h2 className="text-sm font-medium text-white">
            Próximos releases ({releases.length})
          </h2>
        </div>
        <p className="text-xs text-zinc-400">
          Total: <strong className="text-white">{formatBRL(totalUpcoming)}</strong>
        </p>
      </header>

      <div className="divide-y divide-white/[0.04]">
        {grouped.map((day) => {
          const isExpanded = expanded.has(day.key);
          const todayKey = (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          })();
          const isToday = day.key === todayKey;
          return (
            <div key={day.key} className="px-5">
              <button
                type="button"
                onClick={() => toggleDay(day.key)}
                className="w-full flex items-center gap-3 py-3 text-left hover:bg-white/[0.02] transition rounded"
              >
                <div className="text-center shrink-0 w-12">
                  <p
                    className={`text-[9px] uppercase tracking-wider ${isToday ? "text-cyan-300" : "text-zinc-500"} font-bold`}
                  >
                    {day.date.toLocaleString("pt-BR", { month: "short" })}
                  </p>
                  <p
                    className={`text-xl font-bold tabular-nums ${isToday ? "text-cyan-300" : "text-white"}`}
                  >
                    {day.date.getDate()}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white tabular-nums">
                    {formatBRL(day.totalCents)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px]">
                    {day.pixCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-blue-300">
                        <Clock className="size-2.5" />
                        {day.pixCount} PIX
                      </span>
                    )}
                    {day.cardCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <CreditCard className="size-2.5" />
                        {day.cardCount} cartão (D+30)
                      </span>
                    )}
                    {day.retentionCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-purple-300">
                        <ShieldCheck className="size-2.5" />
                        {day.retentionCount} retenção 90d
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-zinc-500">
                  {day.date.toLocaleString("pt-BR", {
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {isExpanded ? (
                  <ChevronUp className="size-4 text-zinc-500" />
                ) : (
                  <ChevronDown className="size-4 text-zinc-500" />
                )}
              </button>

              {isExpanded && (
                <div className="pb-3 pl-15 space-y-1.5">
                  {day.items.map((item) => (
                    <div
                      key={item.txId + item.kind}
                      className="flex items-center justify-between gap-3 rounded-lg bg-black/30 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {item.kind === "pix_release" && (
                          <Clock className="size-3 text-blue-300" />
                        )}
                        {item.kind === "card_release" && (
                          <CreditCard className="size-3 text-amber-300" />
                        )}
                        {item.kind === "card_retention" && (
                          <ShieldCheck className="size-3 text-purple-300" />
                        )}
                        <span className="text-zinc-400">
                          {item.kind === "pix_release" && "PIX (1min)"}
                          {item.kind === "card_release" &&
                            `${item.method} (D+30)`}
                          {item.kind === "card_retention" &&
                            `${item.method} (retenção 90d)`}
                        </span>
                        <span className="text-zinc-600 font-mono text-[10px]">
                          #{item.txId.slice(0, 8)}
                        </span>
                      </div>
                      <span className="font-bold text-white tabular-nums">
                        {formatBRL(item.cents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="px-5 py-2 text-[10px] text-zinc-500 text-center border-t border-white/[0.04]">
        Atualizado em tempo real · cron processa releases a cada minuto
      </p>
    </section>
  );
}
