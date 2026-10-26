"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { verify2faLogin } from "../actions";

export function Verify2faClient() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (code.length !== 6) return setError("Código de 6 dígitos.");
    startTransition(async () => {
      const r = await verify2faLogin(code);
      if (r.ok) router.push("/admin01/dashboard");
      else setError(r.error);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-zinc-950 via-black to-zinc-950">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="size-14 rounded-2xl bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.4)]">
            <ShieldCheck className="size-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">Código 2FA</h1>
          <p className="mt-1 text-xs text-zinc-400 text-center">
            Abra seu app autenticador e digite o código atual.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 space-y-4">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="000000"
            autoFocus
            className="w-full text-center text-3xl tracking-[0.4em] font-mono font-bold rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-4 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-red-400/40"
          />

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={isPending || code.length !== 6}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:shadow-[0_0_25px_rgba(239,68,68,0.4)] disabled:opacity-50"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Verificar
          </button>
        </div>
      </div>
    </div>
  );
}
