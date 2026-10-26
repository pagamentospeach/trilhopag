"use client";

import { useEffect, useRef } from "react";

/**
 * Glow suave que segue o mouse (spotlight). Injeta div fixa full-screen
 * com radial-gradient posicionado onde o cursor tá. Só renderiza em
 * telas com pointer fino (desktop). Zero JS-in-render — usa CSS var
 * atualizada via style.setProperty pra evitar re-render do React.
 *
 * 17/07/2026 (davi): "crie um glow em volta de onde a pessoa vai passando
 * o mouse, algo bem clean pelo gateway inteiro".
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Skip em touch (dá overhead sem uso real)
    if (!window.matchMedia("(pointer: fine)").matches) return;
    // Skip se prefers-reduced-motion (respeita acessibilidade)
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let visible = false;

    function onMove(e: MouseEvent) {
      x = e.clientX;
      y = e.clientY;
      if (!visible) {
        visible = true;
        ref.current?.style.setProperty("opacity", "1");
      }
      if (!raf) {
        raf = requestAnimationFrame(apply);
      }
    }
    function onLeave() {
      visible = false;
      ref.current?.style.setProperty("opacity", "0");
    }
    function apply() {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      el.style.setProperty("--cx", `${x}px`);
      el.style.setProperty("--cy", `${y}px`);
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9999] opacity-0 transition-opacity duration-300"
      style={{
        background:
          "radial-gradient(360px circle at var(--cx, 50%) var(--cy, 50%), rgba(34, 211, 238,0.06), transparent 60%)",
        mixBlendMode: "screen",
      }}
    />
  );
}
