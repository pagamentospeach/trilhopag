"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Mascote/ícone por tema — usado tanto no logo da intro quanto pra decoração de fundo.
 */
const THEME_LOGOS: Record<string, { emoji?: string; letter?: string }> = {
  freefire: { emoji: "🔥" },
  fortnite: { emoji: "🎯" },
  simpsons: { emoji: "🍩" },
  bobesponja: { emoji: "🍍" },
  valorant: { emoji: "💀" },
  steven: { emoji: "💎" },
  mariobros: { emoji: "🍄" },
  naruto: { emoji: "🍥" },
};

function getThemeFromDOM(): string {
  if (typeof document === "undefined") return "midnight";
  const wrapper = document.querySelector<HTMLElement>("[data-theme]");
  return wrapper?.getAttribute("data-theme") ?? "midnight";
}

/**
 * Intro minimalista — toca em todo full-reload de página do gateway.
 * - Cores se adaptam ao tema (via CSS var --tp-accent)
 * - Logo se adapta ao tema cultural (rosquinha pra Simpsons, etc)
 * - Skippable com clique
 * - Duração ~1.5s
 */
export function IntroAnimation() {
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0);
  const [hidden, setHidden] = useState(false);
  const [themeKey, setThemeKey] = useState<string>("midnight");
  const doneRef = useRef(false);

  function complete() {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase(3);
    setTimeout(() => setHidden(true), 500);
  }

  useEffect(() => {
    setThemeKey(getThemeFromDOM());
    // PERF: respeita prefers-reduced-motion. Sessao por sessao a animacao
    // duplicava (todo full reload toca de novo); em PC fraco isso adicionava
    // 1.6s de overlay+fade+rerenders. User que pediu reduce nao quer
    // animacao decorativa.
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // PERF: tambem pula apos sessionStorage flag — toca SO uma vez por
    // sessao do browser (em vez de toda navegacao SPA cheia, que ja eh
    // protegida pelo App Router, mas full reloads disparavam de novo).
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem("tp_intro_seen") === "1";
    } catch {}
    if (reduced || alreadyShown) {
      setHidden(true);
      return;
    }
    try {
      sessionStorage.setItem("tp_intro_seen", "1");
    } catch {}
    const t1 = setTimeout(() => setPhase(1), 50);
    const t2 = setTimeout(() => setPhase(2), 500);
    const t3 = setTimeout(() => setPhase(3), 1100);
    const t4 = setTimeout(() => setHidden(true), 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  if (hidden) return null;

  const themeLogo = THEME_LOGOS[themeKey];

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black cursor-pointer transition-opacity duration-500 ${
        phase === 3 ? "opacity-0" : "opacity-100"
      }`}
      onClick={complete}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Logo — emoji do tema OU logo circular do Trilho (com olho) */}
        <div
          className={`relative size-24 rounded-full flex items-center justify-center transition-all duration-700 ease-out ${
            phase >= 1
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 translate-y-2 scale-95"
          }`}
        >
          {themeLogo?.emoji ? (
            <div
              className="size-full rounded-full flex items-center justify-center"
              style={{ background: "var(--tp-accent, #06b6d4)" }}
            >
              <span className="text-6xl">{themeLogo.emoji}</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/trilhopag-logo2.png"
              alt="Trilho"
              className="size-full rounded-full object-contain"
            />
          )}
        </div>

        {/* Linha-acento decorativa — sem wordmark (logo do olho ja é suficiente) */}
        <div
          className={`h-px w-20 transition-all duration-700 ease-out ${
            phase >= 2 ? "opacity-70" : "opacity-0"
          }`}
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--tp-accent, #06b6d4) 50%, transparent)",
          }}
        />
      </div>
    </div>
  );
}
