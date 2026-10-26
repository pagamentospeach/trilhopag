import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatBRL } from "@/lib/utils";
import { VariantsClient } from "./client";

export default async function VariantesPage({
  params,
}: {
  params: Promise<{ id: string; checkoutId: string }>;
}) {
  const { id: productId, checkoutId } = await params;
  const userId = await requireUserId();
  const checkout = await prisma.checkout.findFirst({
    where: { id: checkoutId, userId, productId },
    include: {
      product: { select: { name: true, priceCents: true } },
      variants: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!checkout) notFound();

  return (
    <div className="space-y-5">
      <Link
        href={`/dashboard/produtos/${productId}/ofertas/${checkoutId}`}
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
      >
        <ChevronLeft className="size-3" /> Voltar pra oferta
      </Link>
      <div>
        <h2 className="text-lg font-semibold text-yellow-300">A/B Test</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Crie variantes de <span className="text-white">/{checkout.slug}</span>{" "}
          (produto base:{" "}
          <span className="text-white">{checkout.product.name}</span>, preço{" "}
          <span className="text-cyan-300">
            {formatBRL(checkout.product.priceCents)}
          </span>
          ). Visitantes são atribuídos deterministicamente por peso.
        </p>
      </div>

      <VariantsClient
        checkoutId={checkoutId}
        variants={checkout.variants.map((v) => ({
          ...v,
          createdAt: v.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
