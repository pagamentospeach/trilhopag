"use client";

/**
 * Trilha de passos: barrinhas de progresso + rótulo do passo atual.
 *
 * Vive fora do /signup porque o cadastro por Google/GitHub usa exatamente a
 * mesma trilha — quem entra pelo social precisa preencher os mesmos dados,
 * então tem que ver a mesma tela, e não uma página longa diferente.
 *
 * No mobile os rótulos somem (não cabem 4 palavras em 375px) e no lugar entra
 * a linha "Passo N de M · Título" logo abaixo.
 */
export type Step = { readonly title: string; readonly subtitle: string };

export function StepTrail({
  steps,
  current,
  onJump,
  locked = false,
}: {
  steps: readonly Step[];
  current: number;
  /** Só é chamado pra passos ANTERIORES ao atual. */
  onJump?: (i: number) => void;
  /** Trava a trilha inteira (nada a desfazer daqui pra trás). */
  locked?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => onJump?.(i)}
              disabled={locked || !onJump || i >= current}
              aria-current={active ? "step" : undefined}
              className="group flex flex-1 flex-col gap-1.5 text-left disabled:cursor-default"
            >
              <span
                className={`h-1 w-full rounded-full transition-colors ${
                  done || active ? "bg-brand" : "bg-slate-200"
                }`}
              />
              <span
                className={`hidden text-[11px] font-medium sm:block ${
                  active ? "text-ink" : done ? "text-slate-500" : "text-slate-300"
                }`}
              >
                {s.title}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
        <span className="font-medium text-ink sm:hidden">
          Passo {current + 1} de {steps.length} · {steps[current].title}.{" "}
        </span>
        {steps[current].subtitle}
      </p>
    </div>
  );
}
