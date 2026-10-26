"use client";

import { useEffect } from "react";

/**
 * Grava UTMs e click IDs em cookie persistente quando aparecem na URL.
 *
 * Persistência: 90 dias (cobre janela de atribuição padrão Meta/Google).
 *
 * Cookie name: `tp_utm` (JSON URL-encoded)
 *
 * Comportamento:
 *  - Se a URL tem QUALQUER param utm_* ou fbclid/gclid/ttclid → grava cookie
 *  - SOBRESCREVE valores antigos pra refletir a campanha mais recente
 *  - Se a URL não tem nada, mantém o cookie existente intacto
 *
 * Server-side (`/c/[slug]/page.tsx`) lê o cookie como fallback se a URL
 * não tiver UTMs (cliente clica em link interno ou refresh).
 *
 * Esse componente é montado UMA VEZ no topo de todos os templates.
 */
export function UtmCookieWriter() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const interesting = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "fbclid",
      "gclid",
      "ttclid",
      "kwai_id",
    ];

    const incoming: Record<string, string> = {};
    let hasAny = false;
    for (const k of interesting) {
      const v = params.get(k);
      if (v) {
        incoming[k] = v;
        hasAny = true;
      }
    }

    if (!hasAny) return; // Sem UTMs na URL — não sobrescreve cookie

    // Mescla com cookie existente (mantém keys antigas se não foram passadas)
    let existing: Record<string, string> = {};
    const cookieMatch = document.cookie.match(/(?:^|; )tp_utm=([^;]+)/);
    if (cookieMatch) {
      try {
        existing = JSON.parse(decodeURIComponent(cookieMatch[1]));
      } catch {
        // ignore
      }
    }

    const merged = { ...existing, ...incoming };
    const encoded = encodeURIComponent(JSON.stringify(merged));
    // 90 dias, SameSite=Lax pra funcionar em redirects de ads
    document.cookie = `tp_utm=${encoded}; path=/; max-age=${90 * 24 * 60 * 60}; samesite=lax`;
  }, []);

  return null;
}
