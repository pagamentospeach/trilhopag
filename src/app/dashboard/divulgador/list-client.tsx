"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Sparkles, Loader2 } from "lucide-react";
import { createExampleDivulgador } from "./actions";

/**
 * Botões "Criar sub-conta vazia" + "Criar exemplo pronto" pra header da
 * lista. Roda transition pra UX limpa.
 */
export function DivulgadorListClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            try {
              await createExampleDivulgador();
            } catch {
              router.refresh();
            }
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-400/[0.06] px-3 py-2 text-xs font-semibold text-purple-200 hover:bg-purple-400/[0.12] disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Sparkles className="size-3" />
        )}
        Criar exemplo pronto
      </button>
      <Link
        href="/dashboard/divulgador/novo"
        className="inline-flex items-center gap-1.5 rounded-full bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
      >
        <Plus className="size-3" /> Nova sub-conta
      </Link>
    </div>
  );
}
