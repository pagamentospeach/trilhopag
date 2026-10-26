import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Rótulo da nominal de uma adquirente com a INSTITUIÇÃO/PSP ao lado, no formato
 * "Nominal - instituição" (ex.: "TIKTOK SHOP LTDA - owem", "PAYLUX-LTDA - onlyup").
 * A instituição vem do código PIX (domínio do URL dinâmico) e é salva em
 * Acquirer.institution. Quando não há instituição (chave estática, sem URL),
 * retorna só a nominal.
 */
export function acquirerNominalLabel(
  nominalName: string,
  institution?: string | null,
): string {
  const inst = institution?.trim();
  return inst ? `${nominalName} - ${inst}` : nominalName;
}

export function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/**
 * Formata centavos em USD ("$ 19.90"). Usado por templates internacionais
 * (Gringa) que cobram em dólar.
 */
export function formatUSD(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/**
 * Formata centavos em moeda arbitrária — defaults USD. Usado por
 * templates internacionais que aceitam EUR/GBP também.
 */
export function formatMoney(cents: number, currency: string = "USD") {
  const locale =
    currency === "BRL"
      ? "pt-BR"
      : currency === "EUR"
        ? "en-IE"
        : currency === "GBP"
          ? "en-GB"
          : "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    // Fallback se currency for inválida
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    // Servidor roda em UTC; força o fuso de Brasília pra mostrar a hora local
    // correta (antes mostrava 3h adiantado).
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * FUSO BRASIL (America/Sao_Paulo = UTC-3, sem horário de verão desde 2019).
 *
 * O servidor (Vercel) roda em UTC. Por isso `new Date(y, m, d)` ou
 * `.setHours(0,0,0,0)` davam MEIA-NOITE UTC = 21:00 de Brasília — o "dia"
 * virava às 21h em vez de 00:00. Estes helpers calculam o início do
 * dia/mês/ano NO FUSO DE BRASÍLIA, retornando o instante como Date (UTC).
 */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3

function brtParts(now: Date): { y: number; m: number; d: number } {
  const shifted = new Date(now.getTime() - BRT_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
  };
}

/** Início (00:00 de Brasília) do dia atual, como Date (UTC). */
export function startOfBrtDay(now: Date = new Date()): Date {
  const { y, m, d } = brtParts(now);
  return new Date(Date.UTC(y, m, d, 3, 0, 0, 0));
}

/** Início (dia 1, 00:00 de Brasília) do mês atual, como Date (UTC). */
export function startOfBrtMonth(now: Date = new Date()): Date {
  const { y, m } = brtParts(now);
  return new Date(Date.UTC(y, m, 1, 3, 0, 0, 0));
}

/** Início (1º de janeiro, 00:00 de Brasília) do ano atual, como Date (UTC). */
export function startOfBrtYear(now: Date = new Date()): Date {
  const { y } = brtParts(now);
  return new Date(Date.UTC(y, 0, 1, 3, 0, 0, 0));
}

/**
 * Hora (0–23) NO FUSO DE BRASÍLIA.
 *
 * O servidor roda em UTC, então `new Date().getHours()` devolve a hora de
 * Londres: às 22h de Brasília dava 01h e a saudação virava "Boa madrugada"
 * com o seller ainda acordado vendendo. Usado pela saudação do dashboard.
 */
export function brtHour(now: Date = new Date()): number {
  return new Date(now.getTime() - BRT_OFFSET_MS).getUTCHours();
}
