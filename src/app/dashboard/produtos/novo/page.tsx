import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ProductForm } from "@/components/dashboard/product-form";
import { createProduct } from "../actions";

export default function NovoProdutoPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <Link
          href="/dashboard/produtos"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
        >
          <ChevronLeft className="size-3" /> Voltar
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Novo produto</h1>
        <p className="text-sm text-zinc-400">
          Configure o que você vai vender e o preço. Depois você cria um checkout.
        </p>
      </header>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
        <ProductForm action={createProduct} submitLabel="Criar produto" />
      </div>
    </div>
  );
}
