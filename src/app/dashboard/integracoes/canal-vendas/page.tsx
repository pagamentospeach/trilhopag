import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { ChannelPanel } from "./panel";

export default async function CanalVendasPage() {
  const userId = await requireUserId();

  const channels = await prisma.salesChannel.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      botToken: true,
      chatId: true,
      modes: true,
      showCustomer: true,
      showTotals: true,
      active: true,
      totalSent: true,
      totalFailed: true,
      lastSentAt: true,
      lastError: true,
    },
  });

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
          Canal de vendas no Telegram
        </h1>
        <p className="text-sm text-zinc-400">
          Cada venda <strong>aprovada</strong> cai como mensagem num canal seu do
          Telegram — produto, valor, líquido, tempo de conversão e campanha. É um
          canal <strong>separado</strong>, não tem nada a ver com o bot do funil.
        </p>
      </header>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
        <ChannelPanel
          channels={channels.map((c) => ({
            ...c,
            lastSentAt: c.lastSentAt ? c.lastSentAt.toISOString() : null,
          }))}
        />
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4 text-xs leading-relaxed text-cyan-100/80">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-cyan-300" />
        <p>
          O envio é <strong>best-effort</strong>: se o Telegram cair ou o bot for
          removido do canal, a venda continua sendo creditada normalmente no seu
          saldo. A gente só marca a falha aqui pra você ver.
        </p>
      </div>

      {/* Passo a passo — sem isso o seller trava no "bot precisa ser admin",
          que é de longe o erro nº1 de quem configura canal do Telegram. */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs leading-relaxed text-zinc-400">
        <p className="mb-2 font-medium text-white">Como configurar (3 minutos)</p>
        <ol className="space-y-2">
          <li>
            <strong className="text-zinc-300">1.</strong> No Telegram, fale com{" "}
            <strong className="text-zinc-300">@BotFather</strong> →{" "}
            <code className="rounded bg-white/[0.06] px-1">/newbot</code>. Ele
            devolve um token tipo{" "}
            <code className="rounded bg-white/[0.06] px-1">
              8123456789:AAF…
            </code>
            .
          </li>
          <li>
            <strong className="text-zinc-300">2.</strong> Crie o canal (ou use um
            existente) e adicione o seu bot como{" "}
            <strong className="text-zinc-300">ADMINISTRADOR</strong> com permissão
            de <strong className="text-zinc-300">publicar mensagens</strong>. Sem
            ser admin o Telegram recusa o envio.
          </li>
          <li>
            <strong className="text-zinc-300">3.</strong> O{" "}
            <strong className="text-zinc-300">chat_id</strong>: se o canal for
            público, use{" "}
            <code className="rounded bg-white/[0.06] px-1">@nomedocanal</code>. Se
            for privado, encaminhe qualquer mensagem do canal pro{" "}
            <strong className="text-zinc-300">@userinfobot</strong> — ele mostra o
            id no formato{" "}
            <code className="rounded bg-white/[0.06] px-1">-1001234567890</code>.
          </li>
        </ol>
        <p className="mt-3 text-[11px] text-zinc-500">
          Ao salvar, a gente já dispara uma mensagem de teste no canal. Se o
          Telegram recusar, o canal <strong>não é criado</strong> e você vê o
          motivo exato — assim ninguém fica com canal mudo achando que está
          funcionando.
        </p>
      </div>
    </div>
  );
}
