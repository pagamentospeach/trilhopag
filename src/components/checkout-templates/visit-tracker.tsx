"use client";

import { useEffect, useRef } from "react";

/**
 * Tracker silencioso de visitas + heartbeat + scroll.
 *
 * - sessionId: gerado no client (crypto.randomUUID), salvo em sessionStorage
 *   (persistente em reloads mas nao entre tabs/dias)
 * - Ao montar: POST visit
 * - A cada 15s enquanto a aba esta ativa: POST heartbeat com scroll atual
 * - Quando aba vai pra background: para de pingar
 *
 * Salva em CheckoutVisit:
 *  - createdAt (1a vez)
 *  - lastSeenAt (heartbeat)
 *  - maxScrollPct (maior scroll observado nesta sessao)
 *
 * Usado pra tela de metricas em /dashboard/produtos/[id]/ofertas/[checkoutId]/metricas
 */
export function VisitTracker({ slug }: { slug: string }) {
  const maxScrollRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Gera ou recupera sessionId
    const KEY = `bp-cv-${slug}`;
    let sessionId = "";
    try {
      sessionId = sessionStorage.getItem(KEY) ?? "";
    } catch {
      // sessionStorage pode falhar (modo privado / cookies bloqueados)
    }
    if (!sessionId) {
      sessionId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now();
      try {
        sessionStorage.setItem(KEY, sessionId);
      } catch {
        // ignore
      }
    }

    let cancelled = false;

    async function send(scrollPct: number) {
      if (cancelled) return;
      try {
        await fetch(`/api/checkouts/${slug}/visit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, maxScrollPct: scrollPct }),
          keepalive: true,
        });
      } catch {
        // silencioso
      }
    }

    // 1. Visit inicial
    send(0);

    // 2. Scroll listener (atualiza maxScrollRef)
    function onScroll() {
      const h = document.documentElement;
      const total = (h.scrollHeight - h.clientHeight) || 1;
      const pct = Math.round(((h.scrollTop || window.scrollY) / total) * 100);
      if (pct > maxScrollRef.current) maxScrollRef.current = pct;
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    // 3. Heartbeat a cada 15s
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        send(maxScrollRef.current);
      }
    }, 15_000);

    // 4. Quando aba some, manda um update final
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        // Beacon (mais confiavel que fetch on unload)
        try {
          const data = JSON.stringify({
            sessionId,
            maxScrollPct: maxScrollRef.current,
          });
          navigator.sendBeacon(
            `/api/checkouts/${slug}/visit`,
            new Blob([data], { type: "application/json" }),
          );
        } catch {
          // ignore
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [slug]);

  return null;
}
