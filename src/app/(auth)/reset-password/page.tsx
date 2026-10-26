"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import {
  AuthButton,
  AuthCard,
  AuthErrorBox,
  AuthField,
  AuthInput,
} from "@/components/auth/ui";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthCard>
        <div className="inline-flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
          Link inválido
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
          Este link de recuperação está incompleto ou expirou. Peça um novo em
          &quot;esqueci a senha&quot;.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/forgot-password"
            className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/90"
          >
            Pedir novo link
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-slate-50"
          >
            Voltar ao login
          </Link>
        </div>
      </AuthCard>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha precisa ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await authClient.resetPassword({
        newPassword: password,
        token: token!,
      });
      if (err) {
        const msg =
          err.message?.toLowerCase().includes("token") || err.status === 400
            ? "Link expirado ou já usado. Peça um novo em 'esqueci a senha'."
            : (err.message ?? "Não foi possível redefinir. Tente de novo.");
        setError(msg);
        setLoading(false);
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Erro de rede. Tente de novo.");
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthCard>
        <div className="inline-flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand">
          <CheckCircle2 className="size-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
          Senha redefinida
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          Sua nova senha foi salva. Você já pode entrar com ela.
        </p>
        <p className="mt-4 text-xs text-slate-400">Redirecionando pro login…</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="inline-flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand">
        <Lock className="size-6" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
        Nova senha
      </h1>
      <p className="mt-2 text-[15px] text-slate-500">
        Escolha uma senha com no mínimo 8 caracteres.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <AuthField label="Nova senha" htmlFor="password">
          <AuthInput
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </AuthField>

        <AuthField label="Confirmar nova senha" htmlFor="confirm">
          <AuthInput
            id="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </AuthField>

        <AuthErrorBox>{error}</AuthErrorBox>

        <AuthButton type="submit" loading={loading}>
          Redefinir senha
        </AuthButton>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <Suspense fallback={<div className="h-96" />}>
        <ResetForm />
      </Suspense>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-slate-500 hover:text-ink">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
