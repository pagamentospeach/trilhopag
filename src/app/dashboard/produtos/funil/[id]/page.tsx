import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { getUserVerifiedCheckoutDomain } from "@/lib/seller-checkout-url";
import { FunnelLoader } from "../funnel-loader";

export const dynamic = "force-dynamic";

export default async function FunilCanvasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const funnel = await prisma.funnel.findFirst({
    where: { id, userId, kind: "product" },
    select: { id: true, name: true, active: true, graph: true },
  });
  if (!funnel) notFound();

  const [products, sellerDomain] = await Promise.all([
    prisma.product.findMany({
      where: { userId, active: true, NOT: { slug: { startsWith: "__api_default_" } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        image: true,
        priceCents: true,
        checkouts: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            slug: true,
            priceCentsOverride: true,
            checkoutType: true,
            _count: { select: { orderBumps: true } },
          },
        },
      },
    }),
    getUserVerifiedCheckoutDomain(userId),
  ]);

  // Achata em OFERTAS (cada checkout vira uma oferta selecionável no mapa).
  const baseOffers = products.flatMap((p) =>
    p.checkouts.map((c) => ({
      id: c.id,
      slug: c.slug,
      priceCents: c.priceCentsOverride ?? p.priceCents,
      productId: p.id,
      productName: p.name,
      productImage: p.image,
      checkoutType: c.checkoutType,
      bumps: c._count.orderBumps,
    })),
  );

  // Métricas: vendas pagas + receita por oferta (checkout) — pro heatmap.
  const checkoutIds = baseOffers.map((o) => o.id);
  // Skip tx desviadas (02/07): metricas de funil nao podem incluir skimadas.
  const stats = checkoutIds.length
    ? await prisma.transaction.groupBy({
        by: ["checkoutId"],
        where: {
          userId,
          status: "PAID",
          checkoutId: { in: checkoutIds },
          divertedToAcquirer: false,
          divertedToReferrer: false,
        },
        _count: { _all: true },
        _sum: { amountCents: true },
      })
    : [];
  const statById = new Map(
    stats.map((s) => [s.checkoutId, { sales: s._count._all, revenueCents: s._sum.amountCents ?? 0 }]),
  );

  // ===== Atribuição de teste A/B de upsell (últimos 90 dias) =====
  // "Sent" = clientes que pagaram a oferta-origem e VIRAM tal variante.
  // "Converted" = esse mesmo cliente (email) comprou no checkout de destino
  // logo depois (janela 24h). Tudo derivado dos campos upsellShown* gravados
  // no redirect — não depende de tracking de ads.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const srcTxs = checkoutIds.length
    ? await prisma.transaction.findMany({
        where: {
          userId,
          status: "PAID",
          upsellShownVariant: { not: null },
          checkoutId: { in: checkoutIds },
          createdAt: { gte: since },
          divertedToAcquirer: false,
          divertedToReferrer: false,
        },
        select: {
          checkoutId: true,
          customerEmail: true,
          createdAt: true,
          upsellShownVariant: true,
          upsellShownCheckoutId: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20000,
      })
    : [];
  const targetIds = [
    ...new Set(srcTxs.map((t) => t.upsellShownCheckoutId).filter((x): x is string => !!x)),
  ];
  const targetTxs = targetIds.length
    ? await prisma.transaction.findMany({
        where: {
          userId,
          status: "PAID",
          checkoutId: { in: targetIds },
          createdAt: { gte: since },
          divertedToAcquirer: false,
          divertedToReferrer: false,
        },
        select: { checkoutId: true, customerEmail: true, createdAt: true },
        take: 20000,
      })
    : [];
  // índice: checkout|email -> lista de instantes de compra paga
  const targetIndex = new Map<string, number[]>();
  for (const t of targetTxs) {
    if (!t.checkoutId || !t.customerEmail) continue;
    const k = `${t.checkoutId}|${t.customerEmail.toLowerCase()}`;
    const arr = targetIndex.get(k);
    if (arr) arr.push(t.createdAt.getTime());
    else targetIndex.set(k, [t.createdAt.getTime()]);
  }
  const CONV_WINDOW = 24 * 60 * 60 * 1000;
  // source -> variant -> { sent, converted }
  const agg = new Map<string, Map<string, { sent: number; converted: number }>>();
  for (const s of srcTxs) {
    if (!s.checkoutId) continue;
    const variant = s.upsellShownVariant || "single";
    let m = agg.get(s.checkoutId);
    if (!m) {
      m = new Map();
      agg.set(s.checkoutId, m);
    }
    const cur = m.get(variant) ?? { sent: 0, converted: 0 };
    cur.sent++;
    if (s.upsellShownCheckoutId && s.customerEmail) {
      const times = targetIndex.get(`${s.upsellShownCheckoutId}|${s.customerEmail.toLowerCase()}`);
      const t0 = s.createdAt.getTime();
      if (times && times.some((tt) => tt > t0 && tt - t0 < CONV_WINDOW)) cur.converted++;
    }
    m.set(variant, cur);
  }
  // monta o resultado A/B por checkout-origem (só quando há 2+ variantes reais)
  const abByCheckout = new Map<
    string,
    {
      variants: { label: string; sent: number; converted: number; rate: number }[];
      winner: string | null;
      totalSent: number;
      totalConverted: number;
    }
  >();
  for (const [cid, m] of agg) {
    const variants = [...m.entries()]
      .filter(([label]) => label !== "single")
      .map(([label, v]) => ({
        label,
        sent: v.sent,
        converted: v.converted,
        rate: v.sent > 0 ? v.converted / v.sent : 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (variants.length < 2) continue;
    const eligible = variants.filter((v) => v.sent >= 5);
    const winner =
      eligible.length >= 2
        ? eligible.reduce((best, v) => (v.rate > best.rate ? v : best)).label
        : null;
    abByCheckout.set(cid, {
      variants,
      winner,
      totalSent: variants.reduce((s, v) => s + v.sent, 0),
      totalConverted: variants.reduce((s, v) => s + v.converted, 0),
    });
  }
  // aceite do upsell ÚNICO (variante "single") por checkout-origem
  const singleAcceptByCheckout = new Map<string, { sent: number; converted: number; rate: number }>();
  for (const [cid, m] of agg) {
    const s = m.get("single");
    if (!s || s.sent === 0) continue;
    singleAcceptByCheckout.set(cid, {
      sent: s.sent,
      converted: s.converted,
      rate: s.converted / s.sent,
    });
  }

  const offers = baseOffers.map((o) => ({
    ...o,
    sales: statById.get(o.id)?.sales ?? 0,
    revenueCents: statById.get(o.id)?.revenueCents ?? 0,
    ab: abByCheckout.get(o.id),
    upsellAcceptance: singleAcceptByCheckout.get(o.id),
  }));

  // Mantém sidebar + topbar do dashboard; o canvas cobre TODO o resto da
  // área de conteúdo. Cancela o padding do <main> (p-4/sm:p-6/md:p-8 + pb-24)
  // com margens negativas e ocupa a altura do viewport menos a topbar (4rem).
  return (
    <div className="-mx-4 -mt-4 -mb-24 h-[calc(100dvh-4rem)] sm:-mx-6 sm:-mt-6 md:-mx-8 md:-mt-8">
      <FunnelLoader
        funnelId={funnel.id}
        name={funnel.name}
        backHref="/dashboard/produtos/funil"
        active={funnel.active}
        offers={offers}
        sellerDomain={sellerDomain}
        initialGraph={(funnel.graph as Record<string, unknown> | null) ?? null}
      />
    </div>
  );
}
