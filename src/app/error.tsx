"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Error boundary global do Trilho. Captura qualquer exceção lançada
 * por componentes do app E mostra uma tela amigável em vez da página
 * default da Vercel.
 *
 * Roda no client (use client) — Next.js requirement pra error boundaries.
 * Inclui collapse com detalhes técnicos pra debug.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("[error.tsx] caught:", error);
    if (error.stack) console.error("stack:", error.stack);
  }, [error]);

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden bg-black">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 size-[600px] rounded-full bg-red-500/[0.06] blur-3xl pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(239,68,68,0.5) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/trilhopag-logo2.png"
            alt="Trilho"
            className="size-14 rounded-full object-contain"
          />
        </div>

        <div className="text-center">
          <div className="inline-flex size-16 items-center justify-center rounded-2xl bg-red-500/15 text-red-300 mb-5">
            <AlertTriangle className="size-8" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Algo deu errado
          </h1>
          <p className="mt-3 text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
            Tivemos um problema inesperado ao carregar essa página. Já fomos
            notificados e estamos investigando.
          </p>

          {error.digest && (
            <p className="mt-3 text-[10px] text-zinc-600 font-mono">
              ID: {error.digest}
            </p>
          )}

          <div className="mt-7 flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-bold text-black hover:bg-cyan-300 transition shadow-lg shadow-cyan-400/20"
            >
              <RefreshCw className="size-4" />
              Tentar novamente
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/[0.05] hover:text-white transition"
            >
              <Home className="size-4" />
              Voltar pro Dashboard
            </Link>
          </div>

          {/* Detalhes técnicos collapsable */}
          <div className="mt-8 text-left">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition"
            >
              {showDetails ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {showDetails ? "Esconder detalhes técnicos" : "Mostrar detalhes técnicos"}
            </button>
            {showDetails && (
              <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/40 p-3 text-[10px] font-mono text-zinc-400 overflow-auto max-h-60">
                <p className="text-red-300 break-all">
                  {error.name}: {error.message}
                </p>
                {error.stack && (
                  <pre className="mt-2 whitespace-pre-wrap break-all">
                    {error.stack.slice(0, 1500)}
                  </pre>
                )}
              </div>
            )}
          </div>

          <p className="mt-12 text-[10px] uppercase tracking-[0.3em] text-zinc-600">
            Trilho · Gateway de Pagamentos
          </p>
        </div>
      </div>
    </div>
  );
}
