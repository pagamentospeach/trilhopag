"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Error boundary do checkout público. Captura qualquer exceção lançada
 * por componentes da página de checkout e mostra uma tela amigável em
 * vez de quebrar tudo / mostrar "this page couldn't load".
 *
 * Mostra também o erro técnico em modo "detalhes" (collapsed) — útil pra
 * o admin reportar e a gente debugar sem precisar ler logs.
 */
export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("[/c/[slug]] error caught:", error);
    console.error("stack:", error.stack);
    // Envia pro Vercel logs via fetch (vai aparecer em vercel logs)
    fetch("/api/log-checkout-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 2000),
        digest: error.digest,
        url: typeof window !== "undefined" ? window.location.href : null,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      }),
    }).catch(() => {
      // ignore — log endpoint pode não existir ainda
    });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-zinc-950 p-6 text-center">
        <AlertTriangle className="mx-auto size-10 text-red-400" />
        <h2 className="mt-4 text-xl font-bold text-white">
          Erro ao gerar pagamento
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Algo deu errado por aqui. Tenta novamente — geralmente é
          temporário.
        </p>
        {error.digest && (
          <p className="mt-2 text-[10px] font-mono text-zinc-600">
            ref: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-cyan-300 transition"
        >
          <RefreshCw className="size-4" />
          Tentar de novo
        </button>

        {/* Detalhes técnicos — collapsed por padrão pra debug rápido */}
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="mt-4 inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          {showDetails ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          {showDetails ? "Esconder detalhes" : "Ver detalhes técnicos"}
        </button>
        {showDetails && (
          <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/50 p-3 text-left">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Mensagem
            </p>
            <p className="text-[11px] font-mono text-red-300 break-words">
              {error.message || "(sem mensagem)"}
            </p>
            {error.stack && (
              <>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Stack
                </p>
                <pre className="text-[9px] font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all">
                  {error.stack.split("\n").slice(0, 8).join("\n")}
                </pre>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
