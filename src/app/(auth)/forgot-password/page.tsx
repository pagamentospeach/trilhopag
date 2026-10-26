"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { CheckCircle2, Mail } from "lucide-react";
import {
  AuthButton,
  AuthCard,
  AuthErrorBox,
  AuthField,
  AuthHeader,
  AuthInput,
} from "@/components/auth/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Better-auth NAO revela se o email existe (proposital anti-enum).
      // Sempre mostramos msg de sucesso, mesmo pra email inexistente.
      const { error: err } = await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: "/reset-password",
      });
      if (err && err.status !== 200) {
        setError(
          err.message ?? "Não foi possível processar agora. Tente de novo.",
        );
        setLoading(false);
        return;
      }
      setSent(true);
    } catch {
      setError("Erro de rede. Tente de novo em alguns segundos.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-md">
        <AuthCard>
          <div className="inline-flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
            Confira seu email
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
            Se existir uma conta Trilho com o email{" "}
            <strong className="text-ink">{email}</strong>, enviamos um link pra
            você redefinir a senha. O link expira em <strong>1 hora</strong>.
          </p>

          <div className="mt-6 rounded-xl border border-slate-200 bg-mist p-4 text-sm text-slate-500">
            <p className="font-medium text-ink">Não recebeu?</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>Cheque a caixa de spam / promoções</li>
              <li>Confirme se digitou o email certo</li>
              <li>Aguarde 1-2 minutos pra chegar</li>
            </ul>
          </div>

          <div className="mt-6 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              className="text-slate-500 hover:text-ink"
            >
              Trocar email
            </button>
            <Link href="/login" className="font-medium text-ink hover:text-brand">
              Voltar ao login
            </Link>
          </div>
        </AuthCard>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-5 inline-flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand">
        <Mail className="size-6" />
      </div>
      <AuthHeader
        title="Esqueci a senha"
        subtitle="Envie seu email e mandamos um link pra criar uma senha nova."
      />

      <AuthCard className="mt-7">
        <form onSubmit={onSubmit} className="space-y-4">
          <AuthField label="Email da conta" htmlFor="email">
            <AuthInput
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </AuthField>

          <AuthErrorBox>{error}</AuthErrorBox>

          <AuthButton type="submit" loading={loading}>
            Enviar link
          </AuthButton>
        </form>
      </AuthCard>

      <p className="mt-6 text-center text-sm text-slate-500">
        Lembrou a senha?{" "}
        <Link href="/login" className="font-medium text-ink hover:text-brand">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
