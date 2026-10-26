"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";

/**
 * Botão de delete genérico pra usar em listagens (Extras: Cloaker, Bturb,
 * Bots, Membros). Recebe a server action já com bind() do id, executa
 * confirm + refresh.
 *
 * Uso (em server component):
 *   <DeleteRowButton
 *     onDelete={deleteCloakerCampaign.bind(null, c.id)}
 *     confirmMessage={`Apagar cloaker "${c.name}"?`}
 *   />
 */
export function DeleteRowButton({
  onDelete,
  confirmMessage,
  className = "",
}: {
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
  confirmMessage: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(confirmMessage)) return;
    startTransition(async () => {
      try {
        const r = await onDelete();
        if (r.ok) {
          router.refresh();
        } else {
          alert(r.error || "Erro ao apagar");
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : "Erro ao apagar");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title="Apagar"
      className={
        className ||
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 transition disabled:opacity-50"
      }
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
    </button>
  );
}
