/**
 * Helper centralizado pra gerar URLs públicas de checkout.
 *
 * SAO DOIS DOMINIOS, com papeis separados (10/08/2026, davi):
 *
 *  - MAIN_HOST      trilhopag.com     institucional: dashboard, admin, docs,
 *                                     emails, termos. NAO serve checkout.
 *  - CHECKOUT_HOST  paytrilhopag.com  so checkout publico. /c/{slug} carrega
 *                                     AQUI e so aqui.
 *
 * Quem abre /c/{slug} no trilhopag.com leva 308 pro CHECKOUT_HOST (proxy.ts,
 * com FORCE_CHECKOUT_HOST_REDIRECT=1; o page.tsx repete a checagem como
 * segunda camada). Separar os dois protege o institucional: denuncia
 * fraudulenta contra um checkout nao derruba o dominio do painel junto.
 *
 * Tudo que aponta pra /c/{slug} (links copiados pelo seller, URLs em
 * emails, redirects de cartao, URLs da API publica) DEVE usar este helper.
 *
 * Setup:
 *  - NEXT_PUBLIC_CHECKOUT_DOMAIN (env, opcional): override do dominio.
 *    Sem prefixo de protocolo.
 *  - Default: "trilhopag.com"
 */

/** Dominio publico pra checkouts (sem protocolo) — configuravel via env.
 *  IMPORTANTE: usa fallback explicito tambem pra string vazia "".
 *  ?? so cobre null/undefined; se Vercel tiver env=""  os links virariam
 *  "https:///c/<slug>" (3 barras) e quebrariam tudo.
 *
 *  ANTI-BAD-DEFAULT: bloqueia dominios sabidamente quebrados/expirados. */
const ENV_CHECKOUT = (process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN ?? "")
  .trim()
  .toLowerCase();
const BLOCKED_ENV_HOSTS = new Set<string>([]);
const envIsUsable =
  ENV_CHECKOUT.length > 0 && !BLOCKED_ENV_HOSTS.has(ENV_CHECKOUT);
export const CHECKOUT_HOST: string = envIsUsable
  ? ENV_CHECKOUT
  : "trilhopag.com";

/** URL completa do dominio publico (com protocolo). */
export const CHECKOUT_DOMAIN = `https://${CHECKOUT_HOST}`;

/**
 * Dominio principal da plataforma (gateway/dashboard): trilhopag.com
 * (Cloudflare Registrar).
 *
 * Use isto em emails, links institucionais, terms/privacy, etc. — TUDO
 * que nao seja URL de checkout (esses usam CHECKOUT_HOST).
 */
export const MAIN_HOST = "trilhopag.com";
export const MAIN_DOMAIN = `https://${MAIN_HOST}`;

/** Retorna URL completa de um checkout pelo slug, com query params opcionais.
 *  `hostOverride` (opcional): forca um host customizado (ex: dominio
 *  verificado do seller). Quando passado, ignora CHECKOUT_HOST. */
export function getCheckoutUrl(
  slug: string,
  params?: Record<string, string>,
  hostOverride?: string | null,
): string {
  const host = (hostOverride ?? CHECKOUT_HOST).toLowerCase();
  const base = `https://${host}/c/${slug}`;
  if (!params || Object.keys(params).length === 0) return base;
  const qs = new URLSearchParams(params).toString();
  return `${base}?${qs}`;
}

/** Retorna URL completa do cloaker pelo slug. */
export function getCloakerUrl(slug: string, hostOverride?: string | null): string {
  const host = (hostOverride ?? CHECKOUT_HOST).toLowerCase();
  return `https://${host}/cl/${slug}`;
}

/** Placeholder pra inputs/tooltips. */
export const CHECKOUT_URL_EXAMPLE = `${CHECKOUT_DOMAIN}/c/seu-checkout`;

/**
 * Hosts considerados "internos" do gateway (NAO devem servir checkouts).
 * Quando o middleware detecta requisicao em /c/* nesses hosts, redireciona
 * pro dominio de checkout.
 */
export const INTERNAL_GATEWAY_HOSTS: ReadonlySet<string> = new Set([
  "trilhopag.com", // PRIMARIO (Cloudflare)
  "www.trilhopag.com",
  "trilhopag.vercel.app",
]);

/**
 * Hosts da plataforma que DEVEM redirecionar pro MAIN_HOST oficial.
 * O Trilho tem dominio unico, entao esta lista fica vazia. Se um dia
 * entrar um alias, adicionar aqui — NUNCA incluir o MAIN_HOST (loop).
 */
export const PLATFORM_ALIAS_HOSTS: ReadonlySet<string> = new Set<string>([]);

/** Normaliza host removendo porta + lowercase. */
function normalizeHost(host: string): string {
  return host.toLowerCase().split(":")[0];
}

/** Retorna true se o host eh do gateway interno (trilhopag.com etc). */
export function isInternalGatewayHost(host: string): boolean {
  return INTERNAL_GATEWAY_HOSTS.has(normalizeHost(host));
}

/** Retorna true se o host eh o dominio de checkout configurado. */
export function isCheckoutHost(host: string): boolean {
  return normalizeHost(host) === CHECKOUT_HOST;
}
