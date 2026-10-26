"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, X, ShieldAlert } from "lucide-react";
import { formatBRL } from "@/lib/utils";

/**
 * Popup que alerta o seller pra sacar quando o saldo ultrapassa R$ 2.000
 * (davi 22/07/2026: "Quando algum seller estiver com mais de 2000 em
 * saldo aparece um aviso na dashboard dele pedindo pra ele sacar o
 * dinheiro"). Era R$ 3.000 antes.
 *
 * Aparece UMA VEZ por sessão (depois fica oculto via sessionStorage até
 * o user voltar a entrar). Localizado bottom-right pra não atrapalhar o
 * fluxo principal.
 */
const THRESHOLD_CENTS = 2 * 100_000; // R$ 2.000,00
const DISMISS_KEY = "tp_withdraw_nudge_dismissed_v1";

export function WithdrawNudge({ balanceCents }: { balanceCents: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (balanceCents < THRESHOLD_CENTS) {
      setVisible(false);
      return;
    }
    // Já dismissed nessa sessão?
    if (
      typeof window !== "undefined" &&
      sessionStorage.getItem(DISMISS_KEY) === "1"
    ) {
      return;
    }
    // Pequeno delay pra não bater no instant de entrada
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, [balanceCents]);

  function dismiss() {
    setVisible(false);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(DISMISS_KEY, "1");
    }
  }

  if (!visible) return null;

  return (
    // bottom-28 (não bottom-6): o SupportFab (06/08/2026, davi) mora fixo no
    // canto inferior direito. Com bottom-6 este card sentava exatamente em
    // cima dele e escondia o suporte justo pra quem tem saldo parado.
    //
    // 08/08/2026: no celular a pilha do canto cresceu — barra de abas (64px +
    // safe area), e o SupportFab subiu pra `bottom-24` pra não sentar nela,
    // ocupando de 96px a 176px do rodapé. `bottom-28` (112px) cai no meio
    // dele, então abaixo de `md` este card vai pra `bottom-48` (192px), logo
    // acima do botão. Em `md` a barra some, o FAB volta pro canto e o valor
    // antigo continua valendo.
    <div className="fixed bottom-48 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-4 duration-300 md:bottom-28">
      <div className="rounded-2xl border border-yellow-400/30 bg-gradient-to-br from-yellow-400/[0.08] via-yellow-400/[0.04] to-transparent backdrop-blur-md p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-yellow-400/15 text-yellow-300">
            <ShieldAlert className="size-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              Saldo acumulando: {formatBRL(balanceCents)}
            </p>
            <p className="mt-1 text-xs text-zinc-300/90 leading-snug">
              Recomendamos sacar com frequência. Deixar valores altos parados
              na conta aumenta o risco de bloqueios e MED PIX.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/dashboard/financeiro?tab=saidas"
                onClick={dismiss}
                className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-yellow-300 transition"
              >
                <Banknote className="size-3" />
                Sacar agora
              </Link>
              <button
                type="button"
                onClick={dismiss}
                className="text-[11px] text-zinc-400 hover:text-white"
              >
                Depois
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
            title="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
