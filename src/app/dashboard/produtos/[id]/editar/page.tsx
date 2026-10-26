import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { centsToBRLInput } from "@/lib/money";
import { ProductForm } from "@/components/dashboard/product-form";
import { updateProduct } from "../../actions";

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const product = await prisma.product.findFirst({
    where: { id, userId },
  });
  if (!product) notFound();

  const updateAction = updateProduct.bind(null, product.id);

  return (
    <div>
      <h2 className="text-lg font-semibold text-yellow-300">
        Editar produto
      </h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Configure nome, preço, descrição e tipo.
      </p>
      <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <ProductForm
          action={updateAction}
          submitLabel="Salvar alterações"
          defaults={{
            id: product.id,
            name: product.name,
            description: product.description,
            image: product.image,
            type: product.type,
            price: centsToBRLInput(product.priceCents),
            intervalDays: product.intervalDays,
            active: product.active,
            slug: product.slug,
            recurrenceEnabled: product.recurrenceEnabled,
            recurrenceInterval: product.recurrenceInterval as
              | "weekly"
              | "monthly"
              | "quarterly"
              | "yearly"
              | null,
            recurrenceTrialDays: product.recurrenceTrialDays,
            recurrenceMaxBillings: product.recurrenceMaxBillings,
          }}
        />
      </div>
    </div>
  );
}
