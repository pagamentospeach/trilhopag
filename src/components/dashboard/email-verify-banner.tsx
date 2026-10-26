"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Mail, X, Loader2 } from "lucide-react";

/**
 * Banner de aviso persistente exibido no topo do dashboard quando o seller
 * escolheu "verificar depois" no signup e ainda não confirmou o email.
 * Sumir só quando `emailVerified=true`.
 */
export function EmailVerifyBanner({ email }: { email: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (dismissed) return null;

  async function handleResend() {
    if (resending) return;
    setResending(true);
    startTransition(async () => {
      try {
        await fetch("/api/signup/send-verification-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setResent(true);
        setTimeout(() => setResent(false), 5000);
      } catch {
        // silencioso
      } finally {
        setResending(false);
      }
    });
  }

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-amber-500/25 bg-amber-500/[0.08] px-4 py-2 text-xs backdrop-blur">
      <div className="flex items-center gap-2 text-amber-100">
        <Mail className="size-3.5 shrink-0" />
        <span className="font-medium">
          {resent
            ? `Código reenviado pra ${email}. Confira sua caixa de entrada.`
            : `Confirme seu email (${email}) pra habilitar todas as funcionalidades da conta.`}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || isPending}
          className="hidden sm:inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-400/20 disabled:opacity-50 transition"
        >
          {resending && <Loader2 className="size-3 animate-spin" />}
          {resending ? "Enviando…" : "Reenviar código"}
        </button>
        <Link
          href={`/verify-email?email=${encodeURIComponent(email)}&fresh=1`}
          className="inline-flex items-center rounded-full bg-amber-400 hover:bg-amber-300 px-3 py-1 text-[11px] font-medium text-black transition"
        >
          Verificar agora →
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Esconder"
          className="inline-flex items-center justify-center size-6 rounded-full text-amber-200/70 hover:text-amber-100 hover:bg-amber-500/10"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
