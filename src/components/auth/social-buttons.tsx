"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { AuthDivider } from "@/components/auth/ui";

type Provider = "google" | "github";

/** Env publica setada na Vercel junto com as credenciais do provider. Quando
 *  falta, o botao continua visivel mas avisa em vez de mandar pro erro. */
const ENABLED: Record<Provider, boolean> = {
  google: process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true",
  github: process.env.NEXT_PUBLIC_GITHUB_ENABLED === "true",
};

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.21 7.21 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .3a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58v-2.2c-3.34.73-4.04-1.42-4.04-1.42-.55-1.4-1.34-1.77-1.34-1.77-1.1-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.13-.3-.54-1.53.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.23 0 4.63-2.8 5.65-5.48 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12 12 0 0 0 12 .3Z"
      />
    </svg>
  );
}

const PROVIDERS: Record<
  Provider,
  { label: string; Icon: (p: { className?: string }) => React.ReactElement }
> = {
  google: { label: "Google", Icon: GoogleIcon },
  github: { label: "GitHub", Icon: GitHubIcon },
};

function SocialButton({
  provider,
  callbackURL,
  newUserCallbackURL,
  onUnavailable,
}: {
  provider: Provider;
  callbackURL: string;
  newUserCallbackURL?: string;
  onUnavailable: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const { label, Icon } = PROVIDERS[provider];

  async function go() {
    if (!ENABLED[provider]) {
      onUnavailable(
        `Login com ${label} ainda não está ativo. Use email e senha por enquanto.`,
      );
      return;
    }
    setLoading(true);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL,
        ...(newUserCallbackURL ? { newUserCallbackURL } : {}),
        errorCallbackURL: "/login?error=oauth",
      });
      // Sucesso → o browser ja foi redirecionado; nao chega aqui.
    } catch {
      setLoading(false);
      onUnavailable(`Não foi possível conectar com ${label}. Tente de novo.`);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={loading}
      aria-label={`Continuar com ${label}`}
      className="group inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-[15px] font-medium text-ink shadow-[0_1px_2px_rgba(7,26,51,0.05)] transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_6px_18px_-10px_rgba(7,26,51,0.35)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15 active:translate-y-px disabled:opacity-60"
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-ink" />
      ) : (
        <Icon className="size-5 shrink-0" />
      )}
      <span>{loading ? "Conectando…" : label}</span>
    </button>
  );
}

/**
 * Bloco de login social: Google + GitHub lado a lado, sempre visiveis
 * (davi 08/08/2026: "ja cria os dois botoes ali").
 */
export function SocialAuthBlock({
  callbackURL = "/dashboard",
  newUserCallbackURL = "/onboarding/documentos",
  dividerLabel = "ou continue com email",
  oauthError,
}: {
  callbackURL?: string;
  newUserCallbackURL?: string;
  dividerLabel?: string;
  oauthError?: string | null;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const message = notice ?? oauthError;

  return (
    <div className="space-y-4">
      {/* grid-cols-2 desde o mobile: o rotulo agora e so "Google"/"GitHub",
       *  entao cabe lado a lado ate em 375px sem quebrar linha. */}
      <div className="grid grid-cols-2 gap-3">
        <SocialButton
          provider="google"
          callbackURL={callbackURL}
          newUserCallbackURL={newUserCallbackURL}
          onUnavailable={setNotice}
        />
        <SocialButton
          provider="github"
          callbackURL={callbackURL}
          newUserCallbackURL={newUserCallbackURL}
          onUnavailable={setNotice}
        />
      </div>

      {message ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {message}
        </div>
      ) : null}

      <AuthDivider label={dividerLabel} />
    </div>
  );
}
