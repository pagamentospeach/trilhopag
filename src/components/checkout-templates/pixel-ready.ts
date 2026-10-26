"use client";

/**
 * 30/07/2026 (davi 'O pixel do tiktok e facebookads nao estao marcando o IC
 * (initiate checkout) quando o lead entra no checkout').
 *
 * CAUSA RAIZ (2 bugs somados):
 *
 * 1) O InitiateCheckout NUNCA disparava na ENTRADA do checkout. Ele só era
 *    disparado dentro do usePixFlow, DEPOIS do cliente preencher o form e o
 *    PIX ser gerado com sucesso. Ou seja: o Meta/TikTok só via IC de quem já
 *    tinha praticamente comprado — o funil ficava "PageView -> Purchase",
 *    sem etapa intermediária, e a campanha não conseguia otimizar.
 *
 * 2) CORRIDA de execução. Os snippets do fbq/ttq são injetados via
 *    <Script strategy="afterInteractive">, que roda DEPOIS da hidratação.
 *    Só que todo o código de disparo estava dentro de useEffect com guarda
 *    `if (window.fbq)`. O useEffect roda NA hidratação — quase sempre ANTES
 *    do script. Resultado: a guarda dava false, o evento era descartado em
 *    silêncio e ninguém percebia. (Por isso o PageView "funcionava": ele está
 *    inline dentro do próprio snippet, não no useEffect.)
 *
 * Este módulo resolve o (2): em vez de checar uma vez e desistir, ESPERA o
 * pixel aparecer no window (poll curto com timeout) e só então dispara.
 *
 * Nota: o stub do fbq/ttq já enfileira chamadas feitas antes do JS remoto
 * carregar, então basta esperar o objeto existir — não precisa esperar o
 * fbevents.js/events.js baixar.
 */

export type FbqFn = (...args: unknown[]) => void;
export type TtqObj = { track: (...args: unknown[]) => void };

/** Intervalo do poll. Curto o bastante pra não atrasar o evento. */
const POLL_MS = 120;
/** Desiste depois disso (ex.: adblock matou o script — nunca vai carregar). */
const DEFAULT_TIMEOUT_MS = 10_000;

function waitFor<T>(
  get: () => T | null,
  cb: (value: T) => void,
  timeoutMs: number,
): () => void {
  if (typeof window === "undefined") return () => {};

  const immediate = get();
  if (immediate) {
    try {
      cb(immediate);
    } catch {
      // pixel é best-effort — nunca quebra o checkout
    }
    return () => {};
  }

  let cancelled = false;
  const startedAt = Date.now();
  const id = window.setInterval(() => {
    if (cancelled) {
      window.clearInterval(id);
      return;
    }
    const value = get();
    if (value) {
      window.clearInterval(id);
      try {
        cb(value);
      } catch {
        // ignora
      }
      return;
    }
    if (Date.now() - startedAt >= timeoutMs) window.clearInterval(id);
  }, POLL_MS);

  return () => {
    cancelled = true;
    window.clearInterval(id);
  };
}

/** Executa `cb` assim que `window.fbq` existir. Retorna função de cancelar. */
export function onFbqReady(
  cb: (fbq: FbqFn) => void,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): () => void {
  return waitFor<FbqFn>(
    () => {
      const w = window as unknown as { fbq?: FbqFn };
      return typeof w.fbq === "function" ? w.fbq : null;
    },
    cb,
    timeoutMs,
  );
}

/** Executa `cb` assim que `window.ttq` existir. Retorna função de cancelar. */
export function onTtqReady(
  cb: (ttq: TtqObj) => void,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): () => void {
  return waitFor<TtqObj>(
    () => {
      const w = window as unknown as { ttq?: TtqObj };
      return w.ttq && typeof w.ttq.track === "function" ? w.ttq : null;
    },
    cb,
    timeoutMs,
  );
}

/* ============================== event ids ============================== */

export function genEventId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * event_id ESTÁVEL por aba/sessão. Se o cliente recarregar a página (muito
 * comum no mobile ao voltar do app do banco), o mesmo id é reusado — aí o
 * Meta/TikTok deduplicam e o seller vê 1 IC por visitante, não 5.
 */
export function sessionEventId(key: string): string {
  const storageKey = `tp_evid_${key}`;
  try {
    const cached = sessionStorage.getItem(storageKey);
    if (cached) return cached;
  } catch {
    // sessionStorage bloqueado (modo privado / iframe)
  }
  const id = genEventId();
  try {
    sessionStorage.setItem(storageKey, id);
  } catch {
    // ignora
  }
  return id;
}

/* ============================ params helpers ============================ */

export type PixelContent = {
  /** Valor na unidade monetária (não em centavos). */
  value: number;
  /** BRL / USD / EUR ... */
  currency: string;
  contentId?: string | null;
  contentName?: string | null;
};

/**
 * Payload padrão do Meta. Antes os eventos iam com `{}` — sem value/currency
 * o Meta não consegue otimizar por valor de conversão nem calcular ROAS.
 */
export function fbParams(c: PixelContent): Record<string, unknown> {
  return {
    value: Number(c.value.toFixed(2)),
    currency: c.currency,
    content_type: "product",
    ...(c.contentId ? { content_ids: [c.contentId] } : {}),
    ...(c.contentName ? { content_name: c.contentName } : {}),
    num_items: 1,
  };
}

/** Payload padrão do TikTok (usa `contents[]` em vez de content_ids). */
export function ttqParams(c: PixelContent): Record<string, unknown> {
  return {
    value: Number(c.value.toFixed(2)),
    currency: c.currency,
    contents: [
      {
        content_id: c.contentId || "checkout",
        content_type: "product",
        content_name: c.contentName || "",
        price: Number(c.value.toFixed(2)),
        quantity: 1,
      },
    ],
  };
}
