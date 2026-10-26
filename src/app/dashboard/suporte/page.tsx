import Link from "next/link";
import {
  MessageCircle,
  Clock,
  Headphones,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const SUPPORT_WHATSAPP_NUMBER = "5511977700227"; // 55 + DDD + número

function buildWhatsAppLink(userEmail: string, userName: string | null) {
  const greeting = userName ? `Oi! Sou ${userName}` : "Oi!";
  const msg = `${greeting} (${userEmail}) — preciso de ajuda com o Trilho.`;
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

export default async function SuportePage() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  const link = buildWhatsAppLink(user?.email ?? "", user?.name ?? null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-400">
          Suporte
        </p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight">
          <Headphones className="size-6 text-cyan-400" /> Como podemos ajudar?
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Qualquer dúvida, problema ou pedido — fala com a gente direto no WhatsApp.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/[0.08] via-emerald-500/[0.04] to-transparent p-8">
        {/* WhatsApp icon decorativo no fundo */}
        <div className="pointer-events-none absolute -right-6 -top-6 opacity-10">
          <MessageCircle className="size-48 text-emerald-400" strokeWidth={1} />
        </div>

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
            Online agora
          </div>
          <h2 className="mt-4 text-2xl font-bold text-white">
            Fale com o time Trilho
          </h2>
          <p className="mt-2 text-sm text-zinc-300">
            Respondemos em poucos minutos no horário comercial (seg-sex, 9h-18h).
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-4 text-base font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-emerald-500/50"
            >
              <MessageCircle className="size-5" />
              Abrir WhatsApp
              <ExternalLink className="size-4 opacity-70 transition group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Cards informativos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <Clock className="size-5 text-cyan-400" />
          <h3 className="mt-3 text-sm font-semibold text-white">Resposta rápida</h3>
          <p className="mt-1 text-xs text-zinc-400">
            Atendimento em até 15min nos horários comerciais.
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <ShieldCheck className="size-5 text-cyan-400" />
          <h3 className="mt-3 text-sm font-semibold text-white">Conversa segura</h3>
          <p className="mt-1 text-xs text-zinc-400">
            Sempre via WhatsApp oficial. Nunca peça senha por email.
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <Headphones className="size-5 text-cyan-400" />
          <h3 className="mt-3 text-sm font-semibold text-white">Quem atende</h3>
          <p className="mt-1 text-xs text-zinc-400">
            Time interno Trilho — não terceirizamos.
          </p>
        </div>
      </div>

      {/* Tópicos comuns */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <h3 className="text-sm font-semibold text-white">Sobre o que podemos ajudar</h3>
        <ul className="mt-4 grid grid-cols-1 gap-2 text-xs text-zinc-300 sm:grid-cols-2">
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-cyan-400" />
            Saque atrasado ou bloqueado
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-cyan-400" />
            Verificação de documentos (KYC)
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-cyan-400" />
            Integração com adquirentes
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-cyan-400" />
            Configuração de checkout
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-cyan-400" />
            Cobranças contestadas
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-cyan-400" />
            Dúvidas sobre taxas e prazos
          </li>
        </ul>
      </div>
    </div>
  );
}
