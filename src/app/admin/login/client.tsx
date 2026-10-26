"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, Loader2, ShieldCheck } from "lucide-react";
import { fakeLoginAction } from "../actions";

export function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await fakeLoginAction(email, password);
      if (r.ok) {
        router.push("/admin/dashboard");
      } else {
        setAttempts((a) => a + 1);
        setError(r.error);
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-zinc-950 via-black to-zinc-950">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="size-14 rounded-2xl bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.4)]">
            <ShieldCheck className="size-7 text-white" />
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-red-400 font-semibold">
            Restricted Access
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Trilho Admin</h1>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] pl-10 pr-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-400/40"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-2">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500 pointer-events-none" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] pl-10 pr-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-400/40"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:shadow-[0_0_25px_rgba(239,68,68,0.4)] disabled:opacity-50 transition-all"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Entrar
            </button>

            {attempts >= 2 && (
              <p className="text-center text-[10px] text-zinc-500">
                Muitas tentativas? Verifique o Caps Lock.
              </p>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] text-zinc-700 uppercase tracking-wider">
          Acesso restrito · todas as ações são auditadas
        </p>
      </div>
    </div>
  );
}
