"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, Eye } from "lucide-react";

/**
 * Prova social ao vivo — dois elementos:
 *  - <SocialProofToasts>: pop-up flutuante "Fulano comprou agora" que aparece
 *    de tempos em tempos (canto inferior esquerdo), auto-some.
 *  - <LiveViewers>: contador inline "X pessoas vendo agora" que oscila dentro
 *    de uma faixa configurada.
 *
 * 100% client-side e decorativo (sem dado real do servidor) — pensado pra
 * aumentar urgência/conversão. Renderiza nada no SSR (popula após mount) pra
 * não dar hydration mismatch.
 */

const RECENT_AGO = ["agora mesmo", "há 1 min", "há 2 min", "há 4 min", "há 7 min"];

export function SocialProofToasts({
  enabled,
  names,
  primaryColor = "#f43f5e",
  preview = false,
}: {
  enabled: boolean;
  names: string[];
  primaryColor?: string;
  /** No preview do builder, posiciona absoluto dentro do card (não fixed). */
  preview?: boolean;
}) {
  const [current, setCurrent] = useState<{ name: string; ago: string } | null>(
    null,
  );

  useEffect(() => {
    if (!enabled || names.length === 0) return;
    let alive = true;
    let hideTimer: ReturnType<typeof setTimeout>;

    const show = () => {
      if (!alive) return;
      const name = names[Math.floor(Math.random() * names.length)];
      const ago = RECENT_AGO[Math.floor(Math.random() * RECENT_AGO.length)];
      setCurrent({ name, ago });
      hideTimer = setTimeout(() => alive && setCurrent(null), 4500);
    };

    // Primeiro toast logo após 3s, depois a cada 9–16s.
    const first = setTimeout(show, 3000);
    const loop = setInterval(
      () => {
        show();
      },
      9000 + Math.floor(Math.random() * 7000),
    );

    return () => {
      alive = false;
      clearTimeout(first);
      clearTimeout(hideTimer);
      clearInterval(loop);
    };
  }, [enabled, names]);

  if (!enabled || !current) return null;

  return (
    <div
      className={`pointer-events-none ${preview ? "absolute" : "fixed"} bottom-4 left-4 z-50 max-w-[280px] animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <div className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 shadow-xl ring-1 ring-black/5">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: primaryColor }}
        >
          <ShoppingBag className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold leading-tight text-zinc-800">
            {current.name}
          </p>
          <p className="text-[11px] leading-tight text-zinc-500">
            comprou {current.ago}
          </p>
        </div>
      </div>
    </div>
  );
}

export function LiveViewers({
  enabled,
  min,
  max,
}: {
  enabled: boolean;
  min: number;
  max: number;
}) {
  const lo = Math.max(1, Math.min(min, max));
  const hi = Math.max(lo, Math.max(min, max));
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const rand = () => lo + Math.floor(Math.random() * (hi - lo + 1));
    // Valor inicial num microtask (não síncrono no corpo do effect) — evita
    // cascading render e o aviso react-hooks/set-state-in-effect.
    const kickoff = setTimeout(() => setCount(rand()), 0);
    const t = setInterval(
      () => {
        // Pequena oscilação (±2) mantendo dentro da faixa pra parecer vivo.
        setCount((c) => {
          const base = c ?? rand();
          const next = base + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));
          return Math.max(lo, Math.min(hi, next));
        });
      },
      3000 + Math.floor(Math.random() * 2500),
    );
    return () => {
      clearTimeout(kickoff);
      clearInterval(t);
    };
  }, [enabled, lo, hi]);

  if (!enabled || count == null) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
      <Eye className="size-3" />
      {count} pessoas vendo agora
    </span>
  );
}
