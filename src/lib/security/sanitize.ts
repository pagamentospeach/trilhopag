/**
 * HTML sanitization — DOMPurify wrapper.
 *
 * USE em qualquer lugar que vá renderizar HTML provido por usuário/seller
 * via dangerouslySetInnerHTML. Bloqueia XSS stored.
 *
 * Perfis disponíveis:
 *  - "strict": apenas formatação básica (b, i, p, a com href). Sem JS, sem
 *    style inline, sem dataURIs, sem iframe.
 *  - "rich": permite mais (h1-h6, ul, ol, img com http(s)+data url, blockquote,
 *    code, pre, table). Sem JS, sem onclick, sem javascript: links.
 *
 * Server-safe — usa `isomorphic-dompurify` que funciona em Node (com JSDOM)
 * e no browser. Default em SSR.
 */

import DOMPurify from "isomorphic-dompurify";

const STRICT_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: ["b", "i", "em", "strong", "u", "br", "p", "a", "span"],
  ALLOWED_ATTR: ["href", "target", "rel"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/,
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style", "link"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "style"],
};

const RICH_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "b", "i", "em", "strong", "u", "s", "code", "pre", "blockquote",
    "ul", "ol", "li",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "div", "span",
  ],
  ALLOWED_ATTR: ["href", "src", "alt", "title", "target", "rel", "class"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/(?:png|jpeg|jpg|gif|webp);)/,
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style", "link"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "style"],
};

/**
 * Sanitiza HTML pra renderização segura. Sempre adiciona `rel="noopener noreferrer"`
 * em links externos. Bloqueia javascript:, data:text/html, vbscript:, etc.
 */
export function sanitizeHtml(
  dirty: string | null | undefined,
  profile: "strict" | "rich" = "strict",
): string {
  if (!dirty || typeof dirty !== "string") return "";
  if (dirty.length > 50_000) {
    // Limite anti-DoS — HTML rich não precisa ser maior que isso
    dirty = dirty.slice(0, 50_000);
  }
  const config = profile === "rich" ? RICH_CONFIG : STRICT_CONFIG;
  const cleaned = DOMPurify.sanitize(dirty, config);

  // Post-process: força rel="noopener noreferrer" em links com target
  return cleaned.replace(
    /<a\b([^>]*?)target=/gi,
    (match, attrs) => {
      // Se já tem rel, não duplica; senão adiciona
      const hasRel = /\srel\s*=/i.test(attrs);
      return hasRel ? match : `<a${attrs}rel="noopener noreferrer" target=`;
    },
  );
}

/**
 * Escape HTML — para uso em emails/contextos não-HTML onde queremos
 * tratar tudo como texto puro.
 */
export function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
