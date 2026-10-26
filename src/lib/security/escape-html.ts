/**
 * `escapeHtml` standalone — SEM depender de DOMPurify/jsdom.
 *
 * Contexto (16/07/2026): importar `escapeHtml` de `sanitize.ts` puxa
 * `isomorphic-dompurify` no top-level → `jsdom` → `html-encoding-sniffer`
 * → `@exodus/bytes/encoding-lite.js` (ES Module) — quebra com
 * `ERR_REQUIRE_ESM` em Node runtime da Vercel. Isso derrubou os endpoints
 * `/api/signup/*` inteiros porque `src/lib/auth.ts` importa `escapeHtml`
 * pra escapar `user.name` em templates de email.
 *
 * Solução: split. Rotas que só precisam escapar texto puro importam daqui.
 * Rotas que precisam sanitizar HTML rico (dangerouslySetInnerHTML) importam
 * do `sanitize.ts` — essas rotas já rodam em contextos que suportam DOMPurify
 * (SSR de páginas específicas).
 */
export function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
