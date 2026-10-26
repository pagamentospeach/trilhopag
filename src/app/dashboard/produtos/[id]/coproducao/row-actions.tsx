"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { removeCoproducer } from "./actions";

export function CoproducerRowActions({ coproducerId }: { coproducerId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function onDelete() {
    if (!confirm("Remover coprodutor?")) return;
    startTransition(async () => {
      await removeCoproducer(coproducerId);
      router.refresh();
    });
  }
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={onDelete}
      className="rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
