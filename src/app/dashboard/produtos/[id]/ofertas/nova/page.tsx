import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { CheckoutForm } from "@/components/dashboard/checkout-form";
import { createCheckout } from "@/app/dashboard/checkouts/actions";

export default async function NovaOfertaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const product = await prisma.product.findFirst({
    where: { id, userId },
    select: { id: true, name: true, slug: true, priceCents: true },
  });
  if (!product) notFound();

  return (
    <div>
      <h2 className="text-lg font-semibold text-yellow-300">Nova oferta</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Crie uma página de checkout pública pra este produto.
      </p>
      <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <CheckoutForm
          action={createCheckout}
          products={[product]}
          submitLabel="Criar oferta"
          defaults={{ productId: product.id }}
        />
      </div>
    </div>
  );
}
