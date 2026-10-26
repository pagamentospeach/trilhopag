/**
 * Produto "ghost" interno usado pela API publica quando o seller chama
 * POST /api/v1/transactions sem informar product_id.
 *
 * Cada user tem 1 ghost product (slug `__api_default_<userId>`) que serve
 * como container das transações criadas direto via API. NUNCA aparece
 * na UI do dashboard (filtrado por hidden=true ou slug prefix) e nao
 * pode ser editado/deletado pelo seller.
 *
 * Lazy-created na primeira chamada de API sem product_id.
 */
import { prisma } from "./prisma";

const GHOST_SLUG_PREFIX = "__api_default_";

export function ghostSlugFor(userId: string): string {
  // Cuid e safe para slug, lowercased pra evitar conflito
  return `${GHOST_SLUG_PREFIX}${userId.toLowerCase()}`;
}

export function isGhostProductSlug(slug: string | null | undefined): boolean {
  return !!slug && slug.startsWith(GHOST_SLUG_PREFIX);
}

export async function getOrCreateApiGhostProduct(
  userId: string,
  override?: { name?: string; description?: string | null; priceCents?: number },
) {
  const slug = ghostSlugFor(userId);
  const existing = await prisma.product.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma.product.create({
    data: {
      userId,
      name: override?.name ?? "API Charge (sem produto)",
      description:
        override?.description ??
        "Produto interno criado automaticamente para cobranças via API sem product_id.",
      type: "DIGITAL",
      // Default 500 cents (R$5) — bate com o minimo geral. A transacao usa
      // amount_cents do body, esse valor e so o "preco de referencia" do
      // produto ghost.
      priceCents: override?.priceCents ?? 500,
      currency: "BRL",
      slug,
      active: true,
    },
  });
}
