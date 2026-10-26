import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { WebhookForm } from "@/components/dashboard/webhook-form";
import { createWebhook } from "../actions";

export default function NovoWebhookPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <Link
          href="/dashboard/integracoes/webhooks"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
        >
          <ChevronLeft className="size-3" /> Voltar
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Novo webhook</h1>
        <p className="text-sm text-zinc-400">
          Vamos enviar uma requisição POST com assinatura HMAC pra essa URL quando o evento acontecer.
        </p>
      </header>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
        <WebhookForm action={createWebhook} submitLabel="Criar webhook" />
      </div>
    </div>
  );
}
