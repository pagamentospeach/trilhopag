"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[(auth)/error.tsx] caught:", error);
  }, [error]);

  return (
    <div className="w-full max-w-md text-center">
      <div className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
        <AlertTriangle className="size-7" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        Erro no login
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Tivemos um problema ao processar essa página. Tenta de novo.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[10px] text-slate-400">
          ID: {error.digest}
        </p>
      )}
      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/90"
        >
          <RefreshCw className="size-4" />
          Tentar novamente
        </button>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-slate-50"
        >
          Login
        </Link>
      </div>
    </div>
  );
}
