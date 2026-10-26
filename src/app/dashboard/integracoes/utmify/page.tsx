import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { UtmifyForm } from "./form";

export default async function UtmifyPage() {
  const userId = await requireUserId();
  const [config, products] = await Promise.all([
    prisma.utmifyConfig.findUnique({ where: { userId } }),
    prisma.product.findMany({
      where: { userId },
      select: { id: true, name: true, active: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <Link
          href="/dashboard/integracoes"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
        >
          <ChevronLeft className="size-3" /> Voltar
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">UTMify</h1>
        <p className="text-sm text-zinc-400">
          Escolha quais produtos enviam vendas pra UTMify. Vendas geradas, pagas e
          reembolsadas vão automaticamente com os UTMs do checkout.
        </p>
      </header>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
        <UtmifyForm
          products={products}
          defaults={
            config
              ? {
                  apiToken: config.apiToken,
                  platform: config.platform,
                  active: config.active,
                  enabledProductIds: config.enabledProductIds,
                }
              : undefined
          }
        />
      </div>

      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4 text-xs text-cyan-100/80">
        <p>
          <strong>Como pegar a credencial:</strong> acesse{" "}
          <a
            href="https://app.utmify.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            app.utmify.com.br
          </a>{" "}
          → Integrações → Webhooks → Credenciais de API → Adicionar Credencial → copie
          o token.
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-zinc-400 leading-relaxed">
        <p className="text-white font-medium mb-2">Eventos disparados</p>
        <ul className="space-y-1">
          <li>
            • <code className="font-mono text-zinc-300">waiting_payment</code> — quando
            o cliente gera o Pix
          </li>
          <li>
            • <code className="font-mono text-zinc-300">paid</code> — quando o webhook
            do PSP confirma o pagamento
          </li>
          <li>
            • <code className="font-mono text-zinc-300">refunded</code> — em caso de
            estorno
          </li>
          <li>
            • <code className="font-mono text-zinc-300">refused</code> — quando expira
            ou falha
          </li>
        </ul>
      </div>
    </div>
  );
}
