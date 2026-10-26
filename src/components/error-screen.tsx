"use client";

import { useState } from "react";

/**
 * TELA DE ERRO ÚNICA DO TRILHO — 08/08/2026 (davi).
 *
 * Dois usos, mesma aparência pixel a pixel (isso é o ponto):
 *
 *  1. `not-found.tsx` — qualquer slug que não existe em trilhopag.com.
 *  2. Porta do admin (`gate`) — quem abre /admin01 recebe ESTA tela, como se
 *     a rota não existisse. Só some depois de 3 cliques no ícone de X.
 *
 * A graça é que as duas são indistinguíveis: um scanner que varre o domínio
 * vê "404" no /admin01 igualzinho ao que vê em /qualquer-coisa e vai embora.
 * Nada do painel real é enviado pro browser antes do gate passar — o
 * `proxy.ts` reescreve o request ANTES de qualquer render, então não existe
 * markup escondido pra achar no view-source.
 *
 * Isto é camuflagem, não autenticação. A segurança de verdade continua sendo
 * senha + TOTP + trava por tentativas.
 */
export function ErrorScreen({ gate = false }: { gate?: boolean }) {
  const [clicks, setClicks] = useState(0);
  const [opening, setOpening] = useState(false);

  async function hitIcon() {
    if (!gate || opening) return;
    const n = clicks + 1;
    setClicks(n);
    if (n < 3) return;
    setOpening(true);
    try {
      const res = await fetch("/api/gate", { method: "POST" });
      if (!res.ok) throw new Error();
      // Reload duro (não router.push): o proxy precisa reavaliar o cookie
      // no servidor, e o cache do router client não sabe disso.
      window.location.href = "/admin01";
    } catch {
      setOpening(false);
      setClicks(0);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md text-center">
        <button
          type="button"
          onClick={hitIcon}
          // Sem `gate` é puramente decorativo — mas continua sendo <button>
          // pros dois casos ficarem idênticos até no DOM.
          aria-label="Erro"
          className="mx-auto flex size-16 cursor-default items-center justify-center rounded-full bg-[#FDECEC] focus:outline-none"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#D93838"
            strokeWidth={2.2}
            strokeLinecap="round"
            className="size-8"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <h1 className="mt-6 text-[22px] font-semibold tracking-tight text-[#071A33]">
          Esta página não existe
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-[#5A6B80]">
          O endereço que você tentou abrir não foi encontrado. Confira o link
          ou volte para a página inicial.
        </p>

        <a
          href="/"
          className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-[#33D2D9] px-6 text-[15px] font-medium text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#33D2D9]/25"
        >
          Ir para a página inicial
        </a>

        <p className="mt-10 text-[11px] uppercase tracking-[0.22em] text-[#9BAAB9]">
          Erro 404
        </p>
      </div>
    </div>
  );
}
