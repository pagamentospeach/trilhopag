"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Sobe o bloco quando ele entra na tela, uma vez so.
 *
 * 08/08/2026: era `motion.div` com `whileInView`. Virou IntersectionObserver
 * mais uma classe de CSS — a landing usa isso em umas dez secoes, e era o que
 * puxava a `motion` inteira (~48kb brotli, fora o parse) pra dentro da
 * primeira pagina que alguem ve do produto.
 *
 * A classe `.tp-reveal` (que zera a opacidade) e adicionada no efeito, nao no
 * JSX: assim ela so existe quando o observer tambem existe. Se o JS nunca
 * rodar, a pagina fica do jeito que veio do servidor — visivel — em vez de
 * ficar uma tela de secoes invisiveis.
 *
 * O observer se desconecta no primeiro cruzamento, entao depois que a pagina
 * apareceu nao sobra nada rodando.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.classList.add("tp-reveal");

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        // O `data-shown` e o gatilho da animacao no CSS.
        el.dataset.shown = "";
        io.disconnect();
      },
      // Mesma margem do `viewport={{ margin: "-80px" }}` de antes: a secao so
      // conta como visivel depois de entrar 80px na tela.
      { rootMargin: "0px 0px -80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
      className={className}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <Reveal className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-3 text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-pretty text-base leading-relaxed text-slate-500 sm:text-lg">
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
