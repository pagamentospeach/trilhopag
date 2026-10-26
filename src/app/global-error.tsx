"use client";

import { useEffect } from "react";

/**
 * GLOBAL ERROR — última linha de defesa.
 *
 * Esse error boundary roda quando o RootLayout em si falha (raríssimo).
 * Como o RootLayout não tá disponível, precisamos renderizar <html>/<body>
 * próprios E não pode usar nada do app (next-intl, fonts, etc).
 *
 * Mantém CSS inline pra ter zero dependência. Se isso aqui falhar, aí
 * cai realmente na tela da Vercel (mas é praticamente impossível).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error.tsx] catastrophic:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#000",
          color: "#fafafa",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 480,
            textAlign: "center",
          }}
        >
          {/* Logo via img (sem next/image pra não ter dependência) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/trilhopag-logo2.png"
            alt="Trilho"
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              margin: "0 auto 32px",
              display: "block",
              objectFit: "contain",
            }}
          />
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(239, 68, 68, 0.15)",
              color: "#fca5a5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              fontSize: 32,
            }}
            aria-hidden
          >
            !
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.025em",
            }}
          >
            Erro crítico
          </h1>
          <p
            style={{
              marginTop: 12,
              fontSize: 14,
              color: "#a1a1aa",
              lineHeight: 1.6,
            }}
          >
            Tivemos um problema sério ao carregar o aplicativo. Tente
            recarregar; se persistir, entre em contato com o suporte.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 12,
                fontSize: 10,
                color: "#52525b",
                fontFamily: "ui-monospace, SF Mono, monospace",
              }}
            >
              ID: {error.digest}
            </p>
          )}
          <div
            style={{
              marginTop: 28,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#22d3ee",
                color: "#000",
                border: 0,
                padding: "10px 20px",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 8px 32px -8px rgba(34, 211, 238, 0.4)",
              }}
            >
              Tentar de novo
            </button>
            <a
              href="/"
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                color: "#d4d4d8",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "10px 20px",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Página inicial
            </a>
          </div>
          <p
            style={{
              marginTop: 48,
              fontSize: 10,
              color: "#52525b",
              textTransform: "uppercase",
              letterSpacing: "0.3em",
            }}
          >
            Trilho · Gateway de Pagamentos
          </p>
        </div>
      </body>
    </html>
  );
}
