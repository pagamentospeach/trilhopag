/**
 * Lista de hostnames da PLATAFORMA Trilho Pagamentos (servidos pelo nosso app).
 *
 * Regra de ouro: NUNCA usar nenhum desses hostnames em URLs públicas que vão
 * pra anúncio (cloaker, bturb embed) — senão a plataforma de anúncio marca
 * o domínio inteiro como suspeito.
 *
 * Usado em:
 *  - UI: pra esconder/recusar a URL gerada
 *  - Actions: pra rejeitar customDomain que coincida com a plataforma
 *  - Route handlers (/cl/[slug], /v/[id]): pra retornar 404 quando o request
 *    chega via hostname da plataforma (forçando o seller a usar o domínio
 *    próprio dele)
 */
export const PLATFORM_DOMAINS = [
  "trilhopag.com",
  "www.trilhopag.com",
] as const;

/** Normaliza um hostname pra comparação (lowercase, sem porta, sem protocolo). */
export function normalizeHost(input: string | null | undefined): string {
  if (!input) return "";
  let h = input.trim().toLowerCase();
  // Remove protocolo
  h = h.replace(/^https?:\/\//, "");
  // Pega só a parte do host (antes da primeira /)
  h = h.split("/")[0];
  // Remove porta
  h = h.split(":")[0];
  return h;
}

/** True se o hostname pertence à plataforma. */
export function isPlatformHost(hostInput: string | null | undefined): boolean {
  const h = normalizeHost(hostInput);
  if (!h) return false;
  return (PLATFORM_DOMAINS as readonly string[]).includes(h);
}

/** True se uma URL aponta pra plataforma. */
export function isPlatformUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return isPlatformHost(u.hostname);
  } catch {
    return isPlatformHost(url);
  }
}
