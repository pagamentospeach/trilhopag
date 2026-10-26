"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeInternalPath } from "@/lib/safe-redirect";
import { SocialAuthBlock } from "@/components/auth/social-buttons";
import {
  AuthButton,
  AuthCard,
  AuthErrorBox,
  AuthField,
  AuthHeader,
  AuthInput,
} from "@/components/auth/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // NUNCA usar `params.get("from")` cru aqui. Ele vem do endereço, e caía
  // direto em `router.push()` e no `callbackURL` do login social — um
  // `?from=https://site-falso.com` fazia o login legítimo do trilhopag.com
  // cuspir a pessoa no site do atacante logo depois de ela digitar a senha.
  // Ver lib/safe-redirect.ts.
  const destination = safeInternalPath(params.get("from"));
  const oauthError =
    params.get("error") === "oauth"
      ? "Não foi possível entrar com essa conta. Tente de novo."
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: err } = await authClient.signIn.email({
      email,
      password,
      callbackURL: destination,
    });

    if (err) {
      setError(err.message ?? "Não foi possível entrar.");
      setLoading(false);
      return;
    }
    router.push(destination);
  }

  return (
    <div className="space-y-6">
      <SocialAuthBlock
        callbackURL={destination}
        dividerLabel="ou entre com email"
        oauthError={oauthError}
      />

      <form onSubmit={onSubmit} className="space-y-4">
        <AuthField label="Email" htmlFor="email">
          <AuthInput
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </AuthField>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Senha
            </span>
            <Link
              href="/forgot-password"
              className="text-xs text-slate-400 hover:text-brand"
            >
              Esqueci a senha
            </Link>
          </div>
          <AuthInput
            id="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <AuthErrorBox>{error}</AuthErrorBox>

        <AuthButton type="submit" loading={loading}>
          Entrar
        </AuthButton>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="w-full max-w-md">
      <AuthHeader
        title="Entrar"
        subtitle="Acesse sua conta Trilho pra continuar."
      />

      <AuthCard className="mt-7">
        <Suspense fallback={<div className="h-96" />}>
          <LoginForm />
        </Suspense>
      </AuthCard>

      <p className="mt-6 text-center text-sm text-slate-500">
        Não tem conta?{" "}
        <Link href="/signup" className="font-medium text-ink hover:text-brand">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
