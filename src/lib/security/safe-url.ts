import { z } from "zod";

/**
 * Validador de URL segura: aceita SÓ http/https.
 *
 * Por que: `z.string().url()` aceita `javascript:alert(1)` e `data:text/html,...`
 * — isso é stored XSS quando renderizado num `<a href>` ou `window.location.href`
 * (ex: Bturb ctaUrl, Cloaker money/whiteUrl).
 *
 * Uso:
 *   import { safeHttpUrl } from "@/lib/security/safe-url";
 *   ctaUrl: safeHttpUrl(),
 *   moneyUrl: safeHttpUrl().nullable().optional(),
 */
export function safeHttpUrl(opts: { maxLength?: number } = {}) {
  const max = opts.maxLength ?? 2000;
  return z
    .string()
    .max(max)
    .refine(
      (v) => {
        if (!v) return false;
        try {
          const u = new URL(v);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "URL precisa ser http(s)://" },
    );
}

/**
 * Hostnames que NUNCA podem ser destino de fetch server-side
 * (anti-SSRF). Bloqueia loopback, link-local, IPv6 loopback, IPs privados.
 */
const PRIVATE_HOST_PATTERNS: RegExp[] = [
  // loopback IPv4
  /^127\./,
  /^localhost$/i,
  // IPv6 loopback / link-local
  /^\[::1\]?$/,
  /^\[fe80:/i,
  // link-local IPv4 (incluindo AWS/Azure/GCP metadata)
  /^169\.254\./,
  // RFC1918 privates
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  // Generic .internal / .local TLDs
  /\.internal$/i,
  /\.local$/i,
  /\.lan$/i,
  // CGNAT
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  // multicast / broadcast
  /^224\./,
  /^255\.255\./,
];

/**
 * Bloqueia URLs que apontam pra hosts internos / metadata endpoints.
 * Use ANTES de qualquer fetch server-side de URL controlada por user.
 *
 * @returns true se segura (URL externa válida), false se deve recusar.
 */
export function isSafeExternalUrl(input: string): boolean {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (!host) return false;
  for (const pat of PRIVATE_HOST_PATTERNS) {
    if (pat.test(host)) return false;
  }
  return true;
}
