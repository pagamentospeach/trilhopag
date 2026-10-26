import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { updateCheckout } from "@/app/dashboard/checkouts/actions";
import { CheckoutBuilder } from "@/components/dashboard/checkout-builder";

export default async function CheckoutBuilderPage({
  params,
}: {
  params: Promise<{ checkoutId: string }>;
}) {
  const { checkoutId } = await params;
  const userId = await requireUserId();
  const [checkout, products, bumps, shipping] = await Promise.all([
    prisma.checkout.findFirst({
      where: { id: checkoutId, userId },
      include: {
        _count: { select: { variants: true } },
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            priceCents: true,
            image: true,
          },
        },
      },
    }),
    prisma.product.findMany({
      where: { userId },
      select: { id: true, name: true, slug: true, priceCents: true, image: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.orderBump.findMany({
      where: { checkoutId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.shippingOption.findMany({
      where: { checkoutId },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
    }),
  ]);
  if (!checkout) notFound();

  const updateAction = updateCheckout.bind(null, checkout.id);

  return (
    <CheckoutBuilder
      productId={checkout.productId}
      checkoutId={checkout.id}
      slug={checkout.slug}
      variantCount={checkout._count.variants}
      defaults={{
        productId: checkout.productId,
        slug: checkout.slug,
        active: checkout.active,
        paymentMethods: checkout.paymentMethods,
        priceCentsOverride: checkout.priceCentsOverride,
        bumpProductId: checkout.bumpProductId,
        bumpPosition: checkout.bumpPosition,
        upsellUrl: checkout.upsellUrl,
        thankYouUrl: checkout.thankYouUrl,
        backRedirectUrl: checkout.backRedirectUrl,
        facebookPixelId: checkout.facebookPixelId,
        tiktokPixelId: checkout.tiktokPixelId,
        videoUrl: checkout.videoUrl,
        videoHeadline: checkout.videoHeadline,
        theme: (checkout.theme as Record<string, unknown>) ?? {},
      }}
      products={products}
      product={checkout.product}
      action={updateAction}
      orderBumps={bumps.map((b) => ({
        id: b.id,
        title: b.title,
        description: b.description,
        imageUrl: b.imageUrl,
        priceCents: b.priceCents,
        originalPriceCents: b.originalPriceCents,
        active: b.active,
        productId: b.productId,
      }))}
      shippingOptions={shipping.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        imageUrl: s.imageUrl,
        priceCents: s.priceCents,
        estimatedTime: s.estimatedTime,
        isDefault: s.isDefault,
        active: s.active,
      }))}
    />
  );
}
