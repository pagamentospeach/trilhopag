import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { WhatsappForm } from "./form";

export default async function WhatsappPage() {
  const userId = await requireUserId();
  const config = await prisma.whatsappConfig.findUnique({ where: { userId } });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <Link
          href="/dashboard/integracoes"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
        >
          <ChevronLeft className="size-3" /> Voltar
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Recuperação por WhatsApp
        </h1>
        <p className="text-sm text-zinc-400">
          Envia mensagem automática pelo WhatsApp Cloud API (oficial Meta) quando
          o cliente abandona o carrinho.
        </p>
      </header>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
        <WhatsappForm
          defaults={
            config
              ? {
                  phoneNumberId: config.phoneNumberId,
                  businessAccountId: config.businessAccountId,
                  accessToken: config.accessToken,
                  recoveryEnabled: config.recoveryEnabled,
                  recoveryDelayMinutes: config.recoveryDelayMinutes,
                  recoveryTemplate: config.recoveryTemplate,
                }
              : undefined
          }
        />
      </div>

      <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/[0.04] p-4 text-xs text-yellow-200">
        <p>
          <strong>Como obter as credenciais:</strong> crie um app no{" "}
          <a
            href="https://developers.facebook.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            developers.facebook.com
          </a>{" "}
          → adicione o produto WhatsApp → registre um número → copie o Phone
          Number ID, o Business Account ID e gere um Access Token de longa
          duração. Crie um template aprovado na Meta com 2 variáveis (nome,
          produto).
        </p>
      </div>
    </div>
  );
}
