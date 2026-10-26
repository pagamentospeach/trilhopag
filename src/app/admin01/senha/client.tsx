"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Check } from "lucide-react";
import {
  changeOwnAdminPassword,
  skipAdminPasswordChange,
} from "../actions";

/** Mesmas regras que a Server Action aplica — aqui só pra dar feedback vivo. */
const RULES = [
  { label: "10+ caracteres", test: (v: string) => v.length >= 10 },
  { label: "letra maiúscula", test: (v: string) => /[A-Z]/.test(v) },
  { label: "letra minúscula", test: (v: string) => /[a-z]/.test(v) },
  { label: "número", test: (v: string) => /[0-9]/.test(v) },
  { label: "símbolo", test: (v: string) => /[^a-zA-Z0-9]/.test(v) },
];

export function PasswordPromptClient({ name }: { name: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"ask" | "form">("ask");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allOk = RULES.every((r) => r.test(next)) && next === confirm;

  function decline() {
    setError(null);
    startTransition(async () => {
      const r = await skipAdminPasswordChange();
      if (r.ok) router.replace("/admin01/dashboard");
      else setError(r.error ?? "Falhou.");
    });
  }

  function save() {
    setError(null);
    if (next !== confirm) return setError("As duas senhas não batem.");
    startTransition(async () => {
      const r = await changeOwnAdminPassword(current, next);
      if (r.ok) router.replace("/admin01/dashboard");
      else setError(r.error ?? "Falhou.");
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-950 via-black to-zinc-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 shadow-[0_0_40px_rgba(239,68,68,0.4)]">
            <KeyRound className="size-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">Olá, {name}</h1>
          <p className="mt-1 text-center text-xs text-zinc-400">
            {mode === "ask"
              ? "Você está usando a senha inicial. Quer definir a sua?"
              : "Escolha uma senha só sua."}
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-zinc-950 p-6">
          {mode === "ask" ? (
            <>
              <p className="text-[13px] leading-relaxed text-zinc-400">
                A senha que você recebeu foi criada por outra pessoa. Trocando
                agora, ela passa a ser conhecida só por você — e todas as
                outras sessões desta conta são desconectadas.
              </p>
              <button
                type="button"
                onClick={() => setMode("form")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:shadow-[0_0_25px_rgba(239,68,68,0.4)]"
              >
                Sim, criar minha senha
              </button>
              <button
                type="button"
                onClick={decline}
                disabled={isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/[0.08] px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/[0.04] disabled:opacity-50"
              >
                {isPending && <Loader2 className="size-4 animate-spin" />}
                Agora não, manter a senha atual
              </button>
            </>
          ) : (
            <>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="Senha atual"
                autoComplete="current-password"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-400/40"
              />
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="Nova senha"
                autoComplete="new-password"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-400/40"
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && allOk && save()}
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-400/40"
              />

              <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                {RULES.map((r) => {
                  const ok = r.test(next);
                  return (
                    <li
                      key={r.label}
                      className={`flex items-center gap-1.5 text-[11px] ${
                        ok ? "text-emerald-400" : "text-zinc-600"
                      }`}
                    >
                      <Check className="size-3 shrink-0" />
                      {r.label}
                    </li>
                  );
                })}
              </ul>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={save}
                disabled={isPending || !allOk || !current}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:shadow-[0_0_25px_rgba(239,68,68,0.4)] disabled:opacity-50"
              >
                {isPending && <Loader2 className="size-4 animate-spin" />}
                Salvar nova senha
              </button>
              <button
                type="button"
                onClick={() => setMode("ask")}
                className="w-full text-center text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                voltar
              </button>
            </>
          )}

          {mode === "ask" && error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
