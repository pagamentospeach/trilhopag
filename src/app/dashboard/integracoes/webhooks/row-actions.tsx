"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteWebhook } from "./actions";

export function WebhookRowActions({
  webhookId,
  webhookUrl,
}: {
  webhookId: string;
  webhookUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Excluir webhook ${webhookUrl}?`)) return;
    startTransition(async () => {
      const r = await deleteWebhook(webhookId);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
      <Link
        href={`/dashboard/integracoes/webhooks/${webhookId}`}
        className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
      >
        <Pencil className="size-3.5" />
      </Link>
      <button
        type="button"
        disabled={isPending}
        onClick={handleDelete}
        className="rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
