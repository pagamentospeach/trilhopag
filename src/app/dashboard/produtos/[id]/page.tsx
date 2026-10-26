import Link from "next/link";
import { Plus, Layers } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { getUserVerifiedCheckoutDomain } from "@/lib/seller-checkout-url";
import { OfferRow } from "./offer-row";
import { getProductMetrics } from "@/lib/product-metrics";
import { ProductMetrics } from "./product-metrics";

export default async function OfertasTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const [product, checkouts, sellerDomain, metricas] = await Promise.all([
    prisma.product.findFirst({
      where: { id, userId },
      select: { priceCents: true },
    }),
    prisma.checkout.findMany({
      where: { productId: id, userId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            // Skip desviadas (06/07): contagem de vendas por checkout
            // nao pode incluir skimadas — bate errado com a dashboard.
            transactions: {
              where: {
                provider: { not: "test" },
                status: "PAID",
                divertedToAcquirer: false,
                divertedToReferrer: false,
              },
            },
            variants: true,
          },
        },
      },
    }),
    getUserVerifiedCheckoutDomain(userId),
    // Seção 8 do prompt de revamp. Entra no Promise.all que já existia, então
    // não soma latência em série.
    getProductMetrics(userId, id),
  ]);
  const productPriceCents = product?.priceCents ?? 0;

  return (
    <div className="space-y-4">
      {/* ⚠️ AQUI, e não numa aba "Visão geral" nova.
          A fila do revamp sugeria criar uma aba nova como PRIMEIRA do
          tabs-nav. Isso empurraria "Ofertas" — que hoje é a raiz
          /dashboard/produtos/[id] — pra outra URL, e essa raiz está em link
          salvo, e-mail e no próprio painel. Trocar rota que funciona por
          arrumação de menu é o tipo de coisa que o prompt manda não fazer.
          Os números ficam no topo da tela onde o seller JÁ cai ao abrir o
          produto, que era o objetivo. */}
      <ProductMetrics m={metricas} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Ofertas e Links
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Cada oferta gera um link de checkout. Use variantes A/B pra testar
            preços, headlines e CTAs.
          </p>
        </div>
        <Link
          href={`/dashboard/produtos/${id}/ofertas/nova`}
          className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-300 transition shadow-lg shadow-cyan-400/20"
        >
          <Plus className="size-4" />
          Nova oferta
        </Link>
      </div>

      {/* wrapper: overflow-x-auto como safety net pra telas mais
        * estreitas onde o conteudo da row ainda extrapola. Antes era
        * overflow-hidden, o que CORTAVA os botoes da direita (Metricas,
        * Editar etc) e deixava a tela parecendo bugada. */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-x-auto">
        {checkouts.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="mx-auto mb-3 inline-flex size-12 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300">
              <Layers className="size-5" />
            </div>
            <p className="text-sm font-medium text-white">
              Nenhuma oferta criada ainda
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Crie sua primeira oferta pra gerar um link de checkout público.
            </p>
            <Link
              href={`/dashboard/produtos/${id}/ofertas/nova`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300 transition"
            >
              <Plus className="size-3.5" /> Criar primeira oferta
            </Link>
          </div>
        ) : (
          <div className="min-w-[760px]">
            <div className="grid grid-cols-12 gap-3 border-b border-white/[0.06] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              <span className="col-span-4 min-w-0">Oferta</span>
              <span className="col-span-4 min-w-0">Link público</span>
              <span className="col-span-1 min-w-0">Vendas</span>
              <span className="col-span-3 min-w-0 text-right">Ações</span>
            </div>
            <div>
              {checkouts.map((c) => (
                <OfferRow
                  key={c.id}
                  productId={id}
                  checkoutId={c.id}
                  slug={c.slug}
                  active={c.active}
                  paidCount={c._count.transactions}
                  variantCount={c._count.variants}
                  upsellUrl={c.upsellUrl}
                  backRedirectUrl={c.backRedirectUrl}
                  priceCentsOverride={c.priceCentsOverride}
                  productPriceCents={productPriceCents}
                  sellerDomain={sellerDomain}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
