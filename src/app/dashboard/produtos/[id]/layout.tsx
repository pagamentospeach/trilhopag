import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ExternalLink,
  Mail,
  Phone,
  Pencil,
  Package,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatBRL } from "@/lib/utils";
import { getCheckoutUrl } from "@/lib/checkout-url";
import { getUserVerifiedCheckoutDomain } from "@/lib/seller-checkout-url";
import { ProductTabsNav } from "./tabs-nav";

const typeLabels: Record<string, string> = {
  DIGITAL: "Digital",
  PHYSICAL: "Físico",
  SUBSCRIPTION: "Assinatura",
  SERVICE: "Serviço",
};

export default async function ProductLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const [product, sellerDomain] = await Promise.all([
    prisma.product.findFirst({
      where: { id, userId },
      include: {
        _count: { select: { checkouts: true } },
        checkouts: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { slug: true },
        },
      },
    }),
    getUserVerifiedCheckoutDomain(userId),
  ]);
  if (!product) notFound();

  const firstCheckoutSlug = product.checkouts[0]?.slug;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex items-center gap-2 text-xs">
        <Link
          href="/dashboard/produtos"
          className="inline-flex items-center gap-1 text-zinc-400 hover:text-white transition"
        >
          <ChevronLeft className="size-3.5" /> Voltar pra produtos
        </Link>
      </div>

      {/* 23/07/2026 (davi: 'algumas telas ficam cortadas'): grid usava
          `1fr` = minmax(auto, 1fr), que deixa o track crescer alem da
          viewport quando o conteudo (barra de tabs com 8 itens, forms
          grandes) fica mais largo — cortava a aba "Cupons" e o botao
          SALVAR SMS no lado direito. `minmax(0, 1fr)` forca o track a
          respeitar 1fr (min=0 → aceita encolher e ativar o overflow-x-auto
          das tabs). `min-w-0` no <section> reforca o mesmo pra filhos. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ====== Product Sidebar Card ====== */}
        <aside className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image}
                alt={product.name}
                className="aspect-video w-full object-cover border-b border-white/[0.06]"
              />
            ) : (
              <div className="aspect-video w-full flex items-center justify-center bg-gradient-to-br from-cyan-400/10 to-transparent border-b border-white/[0.06]">
                <Package className="size-10 text-zinc-600" />
              </div>
            )}
            <div className="p-5 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {product.active ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-cyan-300">
                      <span className="size-1.5 rounded-full bg-cyan-400" /> Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
                      <span className="size-1.5 rounded-full bg-zinc-600" /> Pausado
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-600">•</span>
                  <span className="text-[10px] text-zinc-400">
                    {typeLabels[product.type] ?? product.type}
                  </span>
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-white leading-snug">
                  {product.name}
                </h2>
                <p className="mt-2 text-2xl font-bold tabular-nums text-cyan-300">
                  {formatBRL(product.priceCents)}
                </p>
              </div>

              <Link
                href={`/dashboard/produtos/${product.id}/editar`}
                className="flex items-center justify-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-300 transition shadow-lg shadow-cyan-400/20"
              >
                <Pencil className="size-3.5" />
                Editar produto
              </Link>

              <div className="space-y-2 border-t border-white/[0.06] pt-4 text-xs">
                <Row label="Slug">
                  <span className="font-mono text-zinc-300 truncate">/{product.slug}</span>
                </Row>
                <Row label="Código">
                  <span className="font-mono text-zinc-400 truncate">{product.id.slice(0, 12)}</span>
                </Row>
                <Row label="Ofertas">
                  <span className="text-zinc-200 font-medium">{product._count.checkouts}</span>
                </Row>
                {firstCheckoutSlug && sellerDomain && (
                  <Row label="Checkout">
                    <a
                      href={getCheckoutUrl(
                        firstCheckoutSlug,
                        undefined,
                        sellerDomain,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-cyan-300 hover:underline truncate"
                      title={`${sellerDomain}/c/${firstCheckoutSlug}`}
                    >
                      <ExternalLink className="size-3" /> Abrir
                    </a>
                  </Row>
                )}
                {firstCheckoutSlug && !sellerDomain && (
                  <Row label="Checkout">
                    <Link
                      href="/dashboard/dominios"
                      className="inline-flex items-center gap-1 text-amber-300 hover:underline"
                      title="Conecte um dominio pra ativar este checkout"
                    >
                      inativo · conecte dominio
                    </Link>
                  </Row>
                )}
                {product.sacEmail && (
                  <Row label="SAC Email">
                    <span className="text-zinc-300 truncate inline-flex items-center gap-1">
                      <Mail className="size-3" />
                      {product.sacEmail}
                    </span>
                  </Row>
                )}
                {product.sacWhatsapp && (
                  <Row label="WhatsApp">
                    <span className="text-zinc-300 inline-flex items-center gap-1">
                      <Phone className="size-3" />
                      {product.sacWhatsapp}
                    </span>
                  </Row>
                )}
                {product.pageUrl && (
                  <Row label="Página">
                    <a
                      href={product.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
                    >
                      <ExternalLink className="size-3" /> Link
                    </a>
                  </Row>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* ====== Main ====== */}
        <section className="min-w-0">
          <ProductTabsNav productId={product.id} />
          <div className="mt-5">{children}</div>
        </section>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="min-w-0 max-w-[65%] truncate text-right">{children}</span>
    </div>
  );
}
