"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Error boundary da Área de Membros pública. Mantém branding minimal
 * pra não chocar com a identidade do seller.
 */
export default function MembrosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[m/[slug]/error.tsx] caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-300 mb-4">
          <AlertTriangle className="size-7" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">
          Erro ao carregar
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Tivemos um problema. Tente recarregar a página.
        </p>
        {error.digest && (
          <p className="mt-2 text-[10px] text-zinc-600 font-mono">
            ID: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2 text-sm font-bold text-black hover:bg-cyan-300"
        >
          <RefreshCw className="size-4" />
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
