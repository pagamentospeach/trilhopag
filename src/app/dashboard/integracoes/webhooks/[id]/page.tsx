import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Copy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatDate } from "@/lib/utils";
import { WebhookForm } from "@/components/dashboard/webhook-form";
import { updateWebhook } from "../actions";
import { CopyButton } from "./copy-button";
import { Deliveries } from "./deliveries";

export default async function EditarWebhookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const webhook = await prisma.webhook.findFirst({
    where: { id, userId },
    include: {
      // 100 e nao 25: o client agora filtra por sucesso/falha e pagina, entao
      // cortar em 25 esconderia justamente a falha antiga que o dev procura.
      deliveries: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!webhook) notFound();

  const updateAction = updateWebhook.bind(null, webhook.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <Link
          href="/dashboard/integracoes/webhooks"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
        >
          <ChevronLeft className="size-3" /> Voltar
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight truncate">{webhook.url}</h1>
      </header>

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <h2 className="text-sm font-medium text-white mb-1">Segredo de assinatura</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Use pra verificar o header <code className="font-mono text-cyan-300">Trilho-Signature</code> com HMAC-SHA256.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-cyan-300">
          <span className="flex-1 break-all">{webhook.secret}</span>
          <CopyButton value={webhook.secret} />
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
        <h2 className="text-sm font-medium text-white mb-5">Configuração</h2>
        <WebhookForm
          action={updateAction}
          submitLabel="Salvar"
          defaults={{
            url: webhook.url,
            events: webhook.events,
            active: webhook.active,
          }}
        />
      </section>

      <Deliveries
        webhookId={webhook.id}
        ativo={webhook.active}
        entregas={webhook.deliveries.map((d) => ({
          id: d.id,
          event: d.event,
          statusCode: d.statusCode,
          succeeded: d.succeeded,
          attempts: d.attempts,
          createdAt: formatDate(d.createdAt),
          // Serializado AQUI, no servidor: `payload` é Json do Prisma e a
          // indentação é o que torna o bloco legível no diagnóstico. Mandar o
          // objeto cru faria o client formatar a cada render.
          payload: JSON.stringify(d.payload, null, 2),
          responseBody: d.responseBody,
        }))}
      />
    </div>
  );
}
