/**
 * Teste A/B de template — atribuição determinística por visitante.
 *
 * Reusa o cookie `tp_vid` (setado pelo middleware, sticky por visitante) como
 * semente, então o MESMO visitante sempre cai no mesmo braço (A ou B) — tanto
 * na renderização (page.tsx) quanto na hora da cobrança (pix/card routes), sem
 * precisar de cookie novo. A config fica no theme do checkout (theme.abTest).
 */

export type AbTestConfig = {
  /** Liga/desliga o teste. */
  enabled?: boolean;
  /** Template do braço B (o A é o template atual do checkout). */
  templateB?: string;
  /** % do tráfego que vai pro braço B (1–99). Default 50. */
  splitPercent?: number;
};

/** FNV-1a 32-bit → bucket 0..99. Estável e rápido (sem deps). */
function hashBucket(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

/**
 * Resolve o braço A/B pra um visitante. Determinístico por `seed`
 * (ex: `${checkoutId}:${visitorId}`). Quando o teste está off, sem templateB,
 * ou templateB === templateA, devolve sempre A (no-op seguro).
 */
export function resolveAbVariant(
  ab: AbTestConfig | null | undefined,
  templateA: string,
  seed: string,
): { template: string; variant: "A" | "B" } {
  if (!ab?.enabled || !ab.templateB || ab.templateB === templateA) {
    return { template: templateA, variant: "A" };
  }
  const split = Math.max(1, Math.min(99, Math.round(ab.splitPercent ?? 50)));
  const variant = hashBucket(`${seed}:abtpl`) < split ? "B" : "A";
  return { template: variant === "B" ? ab.templateB : templateA, variant };
}

/** Lê um cookie do header bruto de uma Request (route handlers). */
export function getCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}
