"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Diálogo de confirmação para ações que não dão pra desfazer.
 *
 * 08/08/2026, seções 22 e 38 do prompt de revamp. O painel usava `confirm()`
 * nativo em 28 lugares, incluindo revogar chave de API, remover a chave PIX de
 * saque, apagar produto e uma compra que gasta dinheiro de verdade. Três
 * problemas com isso, em ordem de gravidade:
 *
 *  1. O `confirm()` não diz O QUE vai acontecer. "Tem certeza?" com dois botões
 *     do sistema não informa consequência nem permite nomear a ação.
 *  2. Ele TRAVA a thread do navegador e é suprimível pelo próprio navegador
 *     ("não deixar este site criar mais diálogos") — se o seller marca isso, a
 *     ação seguinte passa direto, sem confirmação nenhuma.
 *  3. Num gateway, parece amador exatamente na hora em que o produto precisa
 *     parecer confiável (seção 44: "a plataforma parece confiável o suficiente
 *     para eu movimentar meu dinheiro aqui?").
 *
 * ACESSIBILIDADE, que é o motivo de isto não ser só uma div bonita:
 *  - `role="dialog"` + `aria-modal` + `aria-labelledby`/`aria-describedby`.
 *  - Esc fecha (a menos que a ação esteja em curso — cancelar no meio deixaria
 *    o usuário sem saber se a operação foi ou não).
 *  - O foco vai pro botão de CANCELAR ao abrir, não pro destrutivo: um Enter
 *    reflexo não pode apagar nada.
 *  - O foco fica preso enquanto aberto e volta pro elemento que abriu ao
 *    fechar.
 */
export function ConfirmDialog({
  open,
  titulo,
  descricao,
  confirmarLabel,
  cancelarLabel = "Voltar",
  destrutivo = false,
  carregando = false,
  erro,
  onConfirmar,
  onCancelar,
  children,
}: {
  open: boolean;
  titulo: string;
  descricao: React.ReactNode;
  confirmarLabel: string;
  cancelarLabel?: string;
  /** Pinta o botão de confirmar em vermelho. Use pra apagar/revogar. */
  destrutivo?: boolean;
  carregando?: boolean;
  erro?: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
  /** Conteúdo extra entre a descrição e os botões (ex: campo de código 2FA). */
  children?: React.ReactNode;
}) {
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    focoAnterior.current = document.activeElement as HTMLElement | null;
    cancelarRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !carregando) {
        e.preventDefault();
        onCancelar();
        return;
      }
      if (e.key !== "Tab") return;
      // Prisão de foco: sem isto o Tab sai do diálogo e vai passeando pela
      // página atrás, que continua ali mas inerte.
      const focaveis = caixaRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focaveis || focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      focoAnterior.current?.focus?.();
    };
  }, [open, carregando, onCancelar]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !carregando) onCancelar();
      }}
    >
      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-titulo"
        aria-describedby="confirm-descricao"
        className="w-full max-w-md rounded-t-2xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl sm:rounded-2xl"
      >
        <h2 id="confirm-titulo" className="text-base font-semibold text-white">
          {titulo}
        </h2>
        <div
          id="confirm-descricao"
          className="mt-2 text-sm leading-relaxed text-zinc-400"
        >
          {descricao}
        </div>

        {children && <div className="mt-4">{children}</div>}

        {erro && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-400/30 bg-red-400/[0.08] px-3 py-2 text-[13px] text-red-300"
          >
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelarRef}
            type="button"
            disabled={carregando}
            onClick={onCancelar}
            className="rounded-lg border border-white/[0.10] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.05] disabled:opacity-50"
          >
            {cancelarLabel}
          </button>
          <button
            type="button"
            disabled={carregando}
            onClick={onConfirmar}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
              destrutivo
                ? "bg-red-500 text-white hover:bg-red-400"
                : "bg-cyan-400 text-black hover:bg-cyan-300"
            }`}
          >
            {carregando && <Loader2 className="size-3.5 animate-spin" />}
            {confirmarLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
