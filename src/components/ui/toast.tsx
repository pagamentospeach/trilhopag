"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

/**
 * Sistema de toast do painel (seção 23 do prompt de revamp).
 *
 * ── POR QUE UM EVENTO E NÃO UM CONTEXT ───────────────────────────────────
 *
 * A API é imperativa e funciona de qualquer lugar, inclusive de dentro de uma
 * server action tratada no client, sem precisar de hook nem de provider
 * embrulhando a árvore:
 *
 *     toast.sucesso("Link copiado.");
 *
 * Por baixo é um CustomEvent no window, o mesmo mecanismo que o painel já usa
 * pra `bp:balance-tick` e `bp:sidebar-open`. Um Context exigiria um
 * `useToast()` em cada componente que quisesse avisar algo — e boa parte dos
 * lugares que precisam disso hoje são funções soltas dentro de handlers, não
 * componentes.
 *
 * ── SOBRE O CANTO DA TELA ────────────────────────────────────────────────
 *
 * O `SalesToastFeed` já ocupa o canto superior direito com a notificação de
 * venda (que tem SOM e é identidade do produto). Este fica embaixo, no canto
 * inferior direito, acima da barra de abas do celular. Dois sistemas de toast
 * na mesma esquina disputariam espaço e o de venda perderia — que é justamente
 * o que ninguém quer perder.
 *
 * ── SEÇÃO 38: ERRO TÉCNICO NÃO VAI PRO TOAST ─────────────────────────────
 *
 * O que chega aqui é frase pra gente ler ("Não deu pra verificar o domínio
 * agora"). Stack, código HTTP e mensagem de exceção ficam no console e nos
 * logs de desenvolvedor, que é onde servem pra alguma coisa.
 */

type Tipo = "sucesso" | "erro" | "info";
type Item = { id: number; tipo: Tipo; texto: string };

const EVENTO = "tp:toast";
/** 4s: tempo de ler uma frase curta sem a mensagem virar mobília. */
const DURACAO_MS = 4000;

function emitir(tipo: Tipo, texto: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { tipo, texto } }));
}

export const toast = {
  sucesso: (texto: string) => emitir("sucesso", texto),
  erro: (texto: string) => emitir("erro", texto),
  info: (texto: string) => emitir("info", texto),
};

const META: Record<
  Tipo,
  { Icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  sucesso: { Icon: CheckCircle2, cls: "text-cyan-300" },
  erro: { Icon: AlertTriangle, cls: "text-red-300" },
  info: { Icon: Info, cls: "text-zinc-300" },
};

/** Montado uma vez no layout do painel. */
export function ToastHost() {
  const [itens, setItens] = useState<Item[]>([]);

  useEffect(() => {
    let seq = 0;
    function onToast(e: Event) {
      const d = (e as CustomEvent).detail as { tipo: Tipo; texto: string };
      if (!d?.texto) return;
      const id = ++seq;
      setItens((prev) => {
        // Teto de 3: uma pilha que cresce sem limite vira parede e tapa a
        // própria tela que a pessoa está tentando usar.
        const proximo = [...prev, { id, tipo: d.tipo, texto: d.texto }];
        return proximo.slice(-3);
      });
      setTimeout(
        () => setItens((prev) => prev.filter((t) => t.id !== id)),
        DURACAO_MS,
      );
    }
    window.addEventListener(EVENTO, onToast);
    return () => window.removeEventListener(EVENTO, onToast);
  }, []);

  if (itens.length === 0) return null;

  return (
    /**
     * `aria-live="polite"`: leitor de tela anuncia sem interromper o que a
     * pessoa está fazendo. `pointer-events-none` no container e `auto` só no
     * cartão — sem isso a faixa invisível captura cliques do que está embaixo.
     *
     * `bottom-24` no celular pela mesma razão do botão de suporte: a barra de
     * abas mora ali embaixo.
     */
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-24 right-4 z-[90] flex flex-col items-end gap-2 md:bottom-6 md:right-6"
    >
      {itens.map((t) => {
        const { Icon, cls } = META[t.tipo];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-[min(22rem,calc(100vw-2rem))] items-start gap-2.5 rounded-xl border border-white/[0.10] bg-zinc-950/95 px-3.5 py-2.5 shadow-2xl backdrop-blur animate-in slide-in-from-bottom-2"
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${cls}`} />
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-zinc-200">
              {t.texto}
            </p>
            <button
              type="button"
              onClick={() => setItens((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="Fechar aviso"
              className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-zinc-500 transition hover:text-zinc-300"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
