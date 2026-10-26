"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, FileText, ArrowRight, ShieldCheck, Clock } from "lucide-react";

/**
 * Overlay full-screen que bloqueia a tela do dashboard quando o usuário
 * ainda não enviou os documentos de KYC.
 *
 * Quando `recentlyApproved` é true (kycStatus mudou pra approved há pouco),
 * mostra animação de "Bem-vindo" + auto-fadeout após 4s, e refresh.
 *
 * Quando `kycStatus` é "not_started" ou "in_review":
 *   - bloqueia visualmente o conteúdo
 *   - mostra CTA pra ir ao perfil
 *
 * Quando "under_review":
 *   - mostra "documentos em análise, aguarde"
 *
 * Quando "rejected":
 *   - mostra motivo + CTA pra reenviar
 */
export function LockedOverlay({
  kycStatus,
  rejectionReason,
  recentlyApproved,
}: {
  kycStatus: string;
  rejectionReason: string | null;
  recentlyApproved: boolean;
}) {
  // FIX 07/07/2026 (david): a animacao "Bem-vindo Conta Aprovada" reaparecia
  // toda vez que o seller trocava algo no perfil/adquirentes — o layout.tsx
  // detecta recentlyApproved via user.updatedAt < 60s, mas updatedAt e
  // atualizado a CADA prisma.user.update (troca de modo, edit taxa, etc).
  // Solucao: guarda no localStorage "kyc_welcome_shown" uma vez que a
  // animacao rodar — nunca mais aparece depois. Isolamento por navegador
  // e aceitavel (usuario nao vai ver a mensagem "acabou de ser aprovado"
  // varias vezes no mesmo browser, e a apps normalmente ficam num navegador
  // so).
  const [showWelcome, setShowWelcome] = useState(() => {
    if (!recentlyApproved) return false;
    if (typeof window === "undefined") return recentlyApproved;
    try {
      if (localStorage.getItem("tp_kyc_welcome_shown") === "1") return false;
    } catch {}
    return true;
  });
  const pathname = usePathname();

  // Páginas onde o gate NÃO bloqueia visualmente (pra que o user POSSA enviar docs
  // e falar com suporte mesmo bloqueado)
  const allowedPaths = ["/dashboard/perfil", "/dashboard/suporte"];
  const isOnAllowedPath = allowedPaths.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (showWelcome) {
      // Marca ja que o welcome apareceu — evita re-render em qualquer futuro
      // updatedAt trigger. Set imediato (nao no timeout) pra rejeitar o
      // caso onde o user recarrega a pagina no meio da animacao (4.5s).
      try {
        localStorage.setItem("tp_kyc_welcome_shown", "1");
      } catch {}
      const t = setTimeout(() => setShowWelcome(false), 4500);
      return () => clearTimeout(t);
    }
  }, [showWelcome]);

  // Animação de bem-vindo (só aparece imediatamente após aprovação)
  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-zinc-950 animate-bp-welcome">
        {/* Glows decorativos — celebração premium, sem o verde berrante */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/15 blur-[130px]" />
        <div className="pointer-events-none absolute -bottom-24 right-0 size-72 rounded-full bg-emerald-400/10 blur-[120px]" />
        <div className="pointer-events-none absolute -top-24 left-0 size-72 rounded-full bg-cyan-400/[0.07] blur-[120px]" />

        <div className="relative px-6 text-center">
          {/* Badge do ícone — gradiente ciano + glow + pulse */}
          <div className="relative mx-auto inline-flex">
            <div className="absolute inset-0 rounded-full bg-cyan-400/40 blur-2xl" />
            <div className="animate-bp-pulse relative inline-flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-emerald-400 shadow-2xl shadow-cyan-500/30 ring-4 ring-cyan-400/15">
              <ShieldCheck className="size-12 text-zinc-950" />
            </div>
          </div>

          <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Conta aprovada
          </p>
          <h1 className="mt-3 text-5xl font-bold tracking-tight text-white sm:text-6xl">
            Bem-vindo!
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-base text-zinc-300 sm:text-lg">
            Tudo liberado. Bora faturar. 🚀
          </p>

          <div className="mx-auto mt-8 h-1 w-44 overflow-hidden rounded-full bg-white/10">
            <div className="h-full animate-bp-progress-fill bg-gradient-to-r from-cyan-400 to-emerald-400" />
          </div>
        </div>
      </div>
    );
  }

  // Não bloqueia nas páginas permitidas (perfil, suporte) — mas mostra banner discreto
  if (isOnAllowedPath && kycStatus !== "approved") {
    // bottom-28: não pode cobrir o SupportFab (canto inferior direito) —
    // conta bloqueada é exatamente quando o seller precisa do suporte.
    // 08/08/2026: mesma conta do withdraw-nudge. No celular a barra de abas
    // empurrou o FAB pra `bottom-24`, que com `h-20` vai até 176px do rodapé;
    // `bottom-48` (192px) passa por cima dele. Em `md` volta pro de sempre.
    return (
      <div className="fixed bottom-48 right-4 z-[50] max-w-sm rounded-2xl border border-amber-400/40 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md md:bottom-28">
        <div className="flex items-start gap-3">
          <Lock className="size-5 shrink-0 text-amber-400" />
          <div className="text-xs">
            <p className="font-semibold text-white">Conta bloqueada</p>
            <p className="mt-1 text-zinc-400">
              {kycStatus === "rejected"
                ? "Documentos rejeitados — reenvie pra liberar."
                : kycStatus === "under_review" || kycStatus === "in_review"
                  ? "Documentos em análise. Aguarde."
                  : "Envie seus documentos pra liberar tudo."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Gate: not_started ou rejected
  if (kycStatus === "not_started" || kycStatus === "rejected") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
        <div className="w-full max-w-lg rounded-3xl border border-amber-400/30 bg-gradient-to-br from-zinc-900 to-black p-8 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-amber-400/15 ring-2 ring-amber-400/30">
              <Lock className="size-7 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Acesso bloqueado</h2>
              <p className="text-xs text-zinc-400">Verificação de identidade pendente</p>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-zinc-300">
            {kycStatus === "rejected" ? (
              <>
                <p>
                  Seus documentos foram <strong className="text-red-300">rejeitados</strong>.
                </p>
                {rejectionReason && (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                    <strong>Motivo:</strong> {rejectionReason}
                  </p>
                )}
                <p>Reenvie os documentos corrigidos para liberar sua conta.</p>
              </>
            ) : (
              <>
                <p>
                  Para usar o Trilho você precisa enviar seus documentos.
                  É rápido e seguro — geralmente aprovamos em poucas horas.
                </p>
                <ul className="space-y-1 text-xs text-zinc-400">
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-amber-400" />
                    Foto do documento (frente)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-amber-400" />
                    Selfie segurando o documento
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-amber-400" />
                    Comprovante de endereço (opcional)
                  </li>
                </ul>
              </>
            )}
          </div>

          <Link
            href="/dashboard/perfil"
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 text-base font-bold text-black hover:bg-amber-300"
          >
            <FileText className="size-5" />
            Enviar documentos
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    );
  }

  // under_review / in_review — aguardando análise
  if (kycStatus === "under_review" || kycStatus === "in_review") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
        <div className="w-full max-w-lg rounded-3xl border border-blue-400/30 bg-gradient-to-br from-zinc-900 to-black p-8 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="relative flex size-14 items-center justify-center rounded-full bg-blue-400/15 ring-2 ring-blue-400/30">
              <Clock className="size-7 text-blue-400" />
              <span className="absolute -right-1 -top-1 flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-blue-400" />
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Documentos em análise</h2>
              <p className="text-xs text-zinc-400">Estamos verificando</p>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-zinc-300">
            <p>
              Recebemos seus documentos. Nossa equipe está revisando — geralmente em
              poucas horas no horário comercial.
            </p>
            <p className="text-xs text-zinc-500">
              Você receberá um email assim que tudo for aprovado.
              Enquanto isso, o dashboard fica bloqueado pra preservar a integridade da sua conta.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/dashboard/perfil"
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-center text-sm text-zinc-300 hover:bg-white/[0.06]"
            >
              Revisar documentos
            </Link>
            <Link
              href="/dashboard/suporte"
              className="flex-1 rounded-xl bg-blue-500 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-blue-400"
            >
              Falar com suporte
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
