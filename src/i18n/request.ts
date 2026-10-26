import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

/**
 * 06/08/2026 (davi): "pode apagar 100% essa opcao de linguas, so vai ter pt br!"
 *
 * Só existe pt-BR. Sumiram: o en-US.json, o seletor de idioma do topbar, a
 * server action setLocale e a leitura do cookie bp-locale — se algum seller
 * ainda tiver "en-US" gravado no navegador, agora cai em pt-BR do mesmo jeito.
 *
 * O next-intl continua montado porque o dashboard inteiro lê string por t(): o
 * que morreu foi a OPÇÃO de trocar de idioma, não a camada de tradução.
 */
export const LOCALES = ["pt-BR"] as const;

export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-BR";

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;

  // HONEYPOT SANITIZATION (16/07/2026): rota /admin/* NÃO carrega o
  // messages.json real (que contém "Adquirentes", "Chargeback", "Reembolsada"
  // etc — todas traduções internas que dariam pistas ao atacante sobre
  // features do sistema). Retorna dict vazio.
  const h = await headers();
  const pathname =
    h.get("x-invoke-path") ??
    h.get("x-matched-path") ??
    h.get("next-url") ??
    "";
  if (pathname.startsWith("/admin/") || pathname === "/admin") {
    return { locale, messages: {} };
  }

  const messages = (await import(`@/messages/${DEFAULT_LOCALE}.json`)).default;
  return { locale, messages };
});
