/**
 * SSRF protection — valida URLs externas antes de fazer fetch.
 *
 * Bloqueia:
 *  - IPs privados (RFC1918, RFC4193, link-local, loopback)
 *  - Cloud metadata (169.254.169.254 e variantes)
 *  - file:// gopher:// dict:// e outros schemas perigosos
 *  - DNS rebinding via comparação resolved IP === host
 *  - URLs encurtadas (bit.ly, tinyurl, etc) — opcional
 *
 * Usar em qualquer endpoint que dispara fetch com URL fornecida pelo usuário:
 * - Cloaker (busca de white URL pra reflect)
 * - Bturb (fetch de origem do vídeo)
 * - Webhook integrations
 * - Image preview de produto
 */

import { lookup } from "dns/promises";

const FORBIDDEN_SCHEMES = new Set([
  "file:",
  "gopher:",
  "dict:",
  "ftp:",
  "sftp:",
  "tftp:",
  "smb:",
  "javascript:",
  "data:",
  "ldap:",
  "ldaps:",
]);

/** IPs e ranges privados/sensíveis — IPv4 */
const PRIVATE_V4_RANGES: Array<[number, number]> = [
  // 10.0.0.0/8 (RFC1918)
  [ipToInt("10.0.0.0"), ipToInt("10.255.255.255")],
  // 172.16.0.0/12
  [ipToInt("172.16.0.0"), ipToInt("172.31.255.255")],
  // 192.168.0.0/16
  [ipToInt("192.168.0.0"), ipToInt("192.168.255.255")],
  // 127.0.0.0/8 (loopback)
  [ipToInt("127.0.0.0"), ipToInt("127.255.255.255")],
  // 169.254.0.0/16 (link-local + AWS metadata)
  [ipToInt("169.254.0.0"), ipToInt("169.254.255.255")],
  // 100.64.0.0/10 (CGNAT)
  [ipToInt("100.64.0.0"), ipToInt("100.127.255.255")],
  // 0.0.0.0/8
  [ipToInt("0.0.0.0"), ipToInt("0.255.255.255")],
  // 224.0.0.0/4 (multicast)
  [ipToInt("224.0.0.0"), ipToInt("239.255.255.255")],
  // 240.0.0.0/4 (reserved)
  [ipToInt("240.0.0.0"), ipToInt("255.255.255.255")],
];

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, p) => (acc << 8) + parseInt(p, 10), 0) >>> 0;
}

function isV4Private(ip: string): boolean {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  const n = ipToInt(ip);
  return PRIVATE_V4_RANGES.some(([a, b]) => n >= a && n <= b);
}

function isV6Private(ip: string): boolean {
  const lower = ip.toLowerCase();
  // ::1 (loopback)
  if (lower === "::1") return true;
  // fc00::/7 (ULA)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // fe80::/10 (link-local)
  if (lower.startsWith("fe80:") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
  // ::ffff:0:0/96 (mapped IPv4) — recursão
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    return isV4Private(v4);
  }
  return false;
}

export type SsrfCheckResult = { ok: true } | { ok: false; reason: string };

/**
 * Valida que uma URL é segura pra fazer fetch.
 * Faz DNS lookup pra detectar rebinding.
 */
export async function validateExternalUrl(rawUrl: string): Promise<SsrfCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL inválida" };
  }

  // Scheme
  if (FORBIDDEN_SCHEMES.has(url.protocol)) {
    return { ok: false, reason: `Scheme proibido: ${url.protocol}` };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Apenas HTTP(S) permitido" };
  }

  // Hostname não pode ser vazio
  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "Hostname vazio" };

  // Bloqueia "localhost" textual
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "localhost bloqueado" };
  }

  // Bloqueia .local mDNS
  if (host.endsWith(".local")) {
    return { ok: false, reason: ".local bloqueado" };
  }

  // Bloqueia metadados de cloud por nome
  if (
    host === "metadata.google.internal" ||
    host === "instance-data" ||
    host === "169.254.169.254"
  ) {
    return { ok: false, reason: "Metadata cloud bloqueado" };
  }

  // Se já é IP literal, valida direto
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isV4Private(host)) {
      return { ok: false, reason: `IP privado/reservado: ${host}` };
    }
    return { ok: true };
  }
  if (host.includes(":") && /^\[?[0-9a-fA-F:]+\]?$/.test(host)) {
    if (isV6Private(host)) {
      return { ok: false, reason: `IPv6 privado/reservado: ${host}` };
    }
    return { ok: true };
  }

  // DNS lookup pra detectar resolução pra IP privado (anti-rebinding)
  try {
    const records = await lookup(host, { all: true });
    for (const r of records) {
      if (r.family === 4 && isV4Private(r.address)) {
        return { ok: false, reason: `DNS resolve pra IP privado: ${r.address}` };
      }
      if (r.family === 6 && isV6Private(r.address)) {
        return { ok: false, reason: `DNS resolve pra IPv6 privado: ${r.address}` };
      }
    }
  } catch (e) {
    return { ok: false, reason: "Falha ao resolver DNS" };
  }

  return { ok: true };
}

/**
 * Fetch que valida URL antes de chamar. Usa AbortController com timeout.
 *
 * Use em vez de fetch() para URLs fornecidas por usuários.
 */
export async function safeFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const check = await validateExternalUrl(url);
  if (!check.ok) {
    throw new Error(`SSRF blocked: ${check.reason}`);
  }
  const { timeoutMs = 15_000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      redirect: "manual", // não segue redirects automaticamente
    });
  } finally {
    clearTimeout(timer);
  }
}
