"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  RefreshCw,
  Home,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/**
 * Error boundary do /dashboard. Captura exceções em qualquer rota do
 * dashboard sem quebrar a sidebar/layout.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("[dashboard/error.tsx] caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-300 mb-4">
          <AlertTriangle className="size-7" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">
          Erro ao carregar essa página
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Algo deu errado por aqui. Tenta recarregar ou volta pro início do
          dashboard.
        </p>
        {error.digest && (
          <p className="mt-2 text-[10px] text-zinc-600 font-mono">
            ID: {error.digest}
          </p>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-300"
          >
            <RefreshCw className="size-3.5" />
            Tentar de novo
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
          >
            <Home className="size-3.5" />
            Início do Dashboard
          </Link>
        </div>

        {(error.message || error.stack) && (
          <div className="mt-6 text-left">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              {showDetails ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {showDetails ? "Esconder detalhes" : "Mostrar detalhes técnicos"}
            </button>
            {showDetails && (
              <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/40 p-2 text-[10px] font-mono text-zinc-400 overflow-auto max-h-48">
                <p className="text-red-300 break-all">{error.message}</p>
                {error.stack && (
                  <pre className="mt-2 whitespace-pre-wrap break-all">
                    {error.stack.slice(0, 1200)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
