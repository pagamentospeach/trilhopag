"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { Target, Trophy, Sparkles } from "lucide-react";
import { formatBRL } from "@/lib/utils";

export function GoalTracker({
  earnedCents,
  goalCents,
  daysLeft,
}: {
  earnedCents: number;
  goalCents: number;
  daysLeft: number;
}) {
  if (goalCents === 0) {
    return (
      <Link
        href="/dashboard/aparencia"
        className="block rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-5 transition hover:border-cyan-400/30 hover:bg-white/[0.04]"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
            <Target className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-white">
              Defina sua meta mensal
            </p>
            <p className="text-xs text-zinc-400">
              Veja o progresso em tempo real. Configure em Aparência.
            </p>
          </div>
        </div>
      </Link>
    );
  }

  const pct = Math.min((earnedCents / goalCents) * 100, 100);
  const reached = earnedCents >= goalCents;
  const ahead = pct > (((30 - daysLeft) / 30) * 100);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.06] to-transparent p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
            {reached ? <Trophy className="size-4" /> : <Target className="size-4" />}
          </span>
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Meta de {new Date().toLocaleDateString("pt-BR", { month: "long" })}
            </p>
            <p className="text-sm font-medium text-white">
              {reached ? (
                <span className="inline-flex items-center gap-1.5 text-cyan-300">
                  Meta batida! <Sparkles className="size-3.5" />
                </span>
              ) : (
                <>
                  <span className="text-cyan-300 tabular-nums">
                    {formatBRL(earnedCents)}
                  </span>{" "}
                  de{" "}
                  <span className="text-zinc-400 tabular-nums">
                    {formatBRL(goalCents)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-white">
            {pct.toFixed(0)}%
          </p>
          <p className="text-[10px] text-zinc-500">
            {daysLeft} {daysLeft === 1 ? "dia" : "dias"} restantes
          </p>
        </div>
      </div>

      <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-white/[0.04]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300"
        />
        <motion.div
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
        {ahead && !reached ? (
          <span className="text-cyan-300">
            🚀 Você tá adiantado! Continua nesse ritmo.
          </span>
        ) : reached ? (
          <span className="text-cyan-300">
            🏆 Meta batida. Pode dobrar pro mês que vem.
          </span>
        ) : (
          <span>
            Faltam {formatBRL(Math.max(0, goalCents - earnedCents))} pra bater
          </span>
        )}
      </div>
    </div>
  );
}
