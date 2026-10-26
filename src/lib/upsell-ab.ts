/**
 * Teste A/B de upsell — resolução de variante no redirect pós-pagamento.
 *
 * O funil grava em `Checkout.upsellAbTest` um JSON com 2+ variantes e pesos.
 * Quando o cliente paga, o redirect (polling /status ou página /obrigado)
 * precisa escolher UMA variante. A escolha é DETERMINÍSTICA pelo id da
 * transação: assim, todo poll da mesma transação devolve a MESMA URL (sem
 * "trocar" o upsell entre requisições) e, no agregado, o tráfego se divide
 * pelos pesos configurados.
 *
 * Sem id de transação (caso raro), cai na 1ª variante.
 */

export type UpsellVariant = {
  url: string;
  weight: number;
  label?: string;
  /** Checkout de destino (quando o upsell é oferta→oferta) — usado pra
   *  atribuição/medição de conversão. Ausente em links externos. */
  checkoutId?: string;
};
export type UpsellAbTest = { variants: UpsellVariant[] };

/** Lê/valida o JSON do banco. Retorna null se não for um A/B válido (precisa
 *  de pelo menos 2 variantes com URL http(s)). */
export function parseUpsellAbTest(raw: unknown): UpsellAbTest | null {
  if (!raw || typeof raw !== "object") return null;
  const arr = (raw as { variants?: unknown }).variants;
  if (!Array.isArray(arr)) return null;
  const variants: UpsellVariant[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const url = (x as { url?: unknown }).url;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
    const wRaw = Number((x as { weight?: unknown }).weight);
    const weight = Number.isFinite(wRaw) ? Math.max(0, Math.round(wRaw)) : 0;
    const labelRaw = (x as { label?: unknown }).label;
    const cidRaw = (x as { checkoutId?: unknown }).checkoutId;
    variants.push({
      url,
      weight,
      label: typeof labelRaw === "string" ? labelRaw : undefined,
      checkoutId: typeof cidRaw === "string" ? cidRaw : undefined,
    });
  }
  if (variants.length < 2) return null;
  return { variants };
}

/** Hash FNV-1a 32-bit estável (mesmo resultado em qualquer runtime/Node). */
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Escolhe a VARIANTE por peso, de forma determinística pelo seed. */
export function pickUpsellVariant(
  ab: UpsellAbTest,
  seed: string | null | undefined,
): UpsellVariant | null {
  const variants = ab.variants;
  if (variants.length === 0) return null;
  const total = variants.reduce((s, v) => s + (v.weight > 0 ? v.weight : 0), 0);
  if (total <= 0) return variants[0]; // pesos zerados → 1ª
  let pos = hash32(seed && seed.length > 0 ? seed : "default") % total;
  for (const v of variants) {
    const w = v.weight > 0 ? v.weight : 0;
    if (pos < w) return v;
    pos -= w;
  }
  return variants[variants.length - 1];
}

/** Compat: só a URL escolhida. */
export function pickUpsellUrl(ab: UpsellAbTest, seed: string | null | undefined): string | null {
  return pickUpsellVariant(ab, seed)?.url ?? null;
}

export type UpsellChoice = {
  url: string;
  /** Rótulo da variante A/B (A, B…) ou null pra upsell único. */
  variantLabel: string | null;
  /** Checkout de destino, quando conhecido (oferta→oferta). */
  targetCheckoutId: string | null;
};

/* ----------------------- roteamento condicional ------------------------- */

export type UpsellRoutingBranch = { url: string; checkoutId?: string };
export type UpsellRouting = {
  type: "method" | "amount" | "uf";
  value: string; // método (CARD/PIX), valor em REAIS, ou UF (SP)
  match: UpsellRoutingBranch; // quando a condição é verdadeira (variante A)
  fallback: UpsellRoutingBranch; // senão (variante B)
};

/** Dados da transação usados pra avaliar a condição (no redirect). */
export type TxAttrs = {
  method?: string | null;
  amountCents?: number | null;
  customerState?: string | null;
};

export function parseUpsellRouting(raw: unknown): UpsellRouting | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== "method" && r.type !== "amount" && r.type !== "uf") return null;
  const value = typeof r.value === "string" ? r.value : "";
  const br = (b: unknown): UpsellRoutingBranch | null => {
    if (!b || typeof b !== "object") return null;
    const o = b as Record<string, unknown>;
    if (typeof o.url !== "string" || !/^https?:\/\//i.test(o.url)) return null;
    return { url: o.url, checkoutId: typeof o.checkoutId === "string" ? o.checkoutId : undefined };
  };
  const match = br(r.match);
  const fallback = br(r.fallback);
  if (!match || !fallback) return null;
  return { type: r.type, value, match, fallback };
}

function routingMatches(routing: UpsellRouting, tx: TxAttrs | undefined): boolean {
  if (!tx) return false; // sem dados da tx → usa o fallback
  if (routing.type === "method") {
    return (tx.method ?? "").toUpperCase() === routing.value.toUpperCase();
  }
  if (routing.type === "amount") {
    const reais = Number(routing.value);
    if (!Number.isFinite(reais)) return false;
    return (tx.amountCents ?? 0) >= Math.round(reais * 100);
  }
  // uf
  return (tx.customerState ?? "").toUpperCase() === routing.value.toUpperCase();
}

/**
 * Resolve a escolha de upsell de um checkout (URL + variante + alvo):
 *  - A/B válido → sorteia a variante pelo id da transação;
 *  - senão → upsellUrl único (variante null).
 */
export function resolveUpsellChoice(
  checkout: {
    upsellUrl: string | null;
    upsellAbTest?: unknown;
    upsellTargetCheckoutId?: string | null;
    upsellRouting?: unknown;
  },
  txId: string | null | undefined,
  tx?: TxAttrs,
): UpsellChoice | null {
  // 1) Roteamento condicional (método/valor/UF) tem prioridade.
  const routing = parseUpsellRouting(checkout.upsellRouting);
  if (routing) {
    const isMatch = routingMatches(routing, tx);
    const branch = isMatch ? routing.match : routing.fallback;
    return {
      url: branch.url,
      variantLabel: isMatch ? "A" : "B",
      targetCheckoutId: branch.checkoutId ?? null,
    };
  }
  const ab = parseUpsellAbTest(checkout.upsellAbTest);
  if (ab) {
    const v = pickUpsellVariant(ab, txId);
    if (v) return { url: v.url, variantLabel: v.label ?? null, targetCheckoutId: v.checkoutId ?? null };
  }
  if (checkout.upsellUrl) {
    return {
      url: checkout.upsellUrl,
      variantLabel: null,
      targetCheckoutId: checkout.upsellTargetCheckoutId ?? null,
    };
  }
  return null;
}

/**
 * Resolve só a URL final de upsell (comportamento legado, inalterado).
 */
export function resolveUpsellUrl(
  checkout: { upsellUrl: string | null; upsellAbTest?: unknown },
  txId: string | null | undefined,
): string | null {
  return resolveUpsellChoice(checkout, txId)?.url ?? null;
}
