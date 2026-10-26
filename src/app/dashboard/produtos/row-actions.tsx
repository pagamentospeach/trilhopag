"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, Copy, Loader2 } from "lucide-react";
import { deleteProduct, duplicateProduct } from "./actions";

export function ProductRowActions({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Excluir "${productName}"? Esta ação não pode ser desfeita e remove checkouts vinculados.`,
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteProduct(productId);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  function handleDuplicate() {
    if (
      !confirm(
        `Duplicar "${productName}"? Sera criado um novo produto + cópias de todos os checkouts (todos inativos por seguranca). Você ajusta antes de ativar.`,
      )
    )
      return;
    startTransition(async () => {
      const r = await duplicateProduct(productId);
      if (r.ok) {
        if (r.newProductId) {
          router.push(`/dashboard/produtos/${r.newProductId}/editar`);
        } else {
          router.refresh();
        }
      } else {
        alert(r.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
      <Link
        href={`/dashboard/produtos/${productId}`}
        className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
        aria-label="Editar"
      >
        <Pencil className="size-3.5" />
      </Link>
      <button
        type="button"
        disabled={isPending}
        onClick={handleDuplicate}
        className="rounded p-1.5 text-zinc-400 hover:bg-blue-500/10 hover:text-blue-300 disabled:opacity-50"
        aria-label="Duplicar"
        title="Duplicar produto + checkouts"
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={handleDelete}
        className="rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
        aria-label="Excluir"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
