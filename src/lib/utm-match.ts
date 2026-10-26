/**
 * Atribuição de venda → campanha/conjunto/anúncio a partir do UTM.
 *
 * Sellers usam formatos diferentes de UTM:
 *  - TikTok `__CAMPAIGN_NAME__` → o NOME puro da campanha ("AZZI & BLAME ... - 123")
 *  - UTMify / Meta dinâmico     → "nome|id" (id no fim, após "|")
 *  - alguns mandam só o ID
 *
 * Antes, a aba Campanhas só tentava o formato "nome|id" (extractUtmId) e
 * IGNORAVA o nome puro — então venda de TikTok (nome puro) não casava com
 * NENHUMA campanha. Este resolver tenta as 3 formas → casa em qualquer formato.
 */

export function normUtm(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase();
}

/** Extrai o id embutido em "nome|id" (parte após o último "|"). */
export function extractUtmId(s: string | null | undefined): string | null {
  if (!s) return null;
  const parts = s.split("|");
  return parts.length > 1 ? parts[parts.length - 1].trim() : null;
}

/**
 * Resolve um valor de UTM para o externalId de um objeto sincronizado.
 * Tenta, em ordem: id embutido "nome|id" → nome exato → valor inteiro como id.
 * Retorna o externalId casado, ou null.
 */
export function resolveUtmToExternalId(
  utm: string | null | undefined,
  externalIds: Set<string>,
  byName: Map<string, string>,
): string | null {
  if (!utm) return null;
  const id = extractUtmId(utm);
  if (id && externalIds.has(id)) return id;
  const nk = normUtm(utm);
  if (nk && byName.has(nk)) return byName.get(nk) ?? null;
  const whole = utm.trim();
  if (whole && externalIds.has(whole)) return whole;
  return null;
}
