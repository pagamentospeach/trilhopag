import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * O hero e Server Component desde 08/08/2026. Ele nao tem estado nem evento —
 * as duas entradas e a flutuacao do mascote sao `animation` de CSS
 * (.tp-hero-rise / .tp-float, no globals.css), entao nao ha nada aqui que
 * precise rodar no navegador.
 *
 * Alem de tirar a `motion` do bundle, isso conserta o tempo: com `motion` a
 * animacao de entrada so comecava depois do JS baixar, parsear e hidratar, e
 * ate la a primeira tela do site ficava em branco. Em CSS ela comeca no
 * primeiro paint — que e justamente o LCP da pagina.
 *
 * Quem pediu menos movimento continua atendido: o bloco @media
 * prefers-reduced-motion no globals.css desliga as duas.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      <RailBackdrop />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="tp-hero-rise min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
            Pagamentos que não param
          </p>

          <h1 className="mt-5 text-balance text-[2.125rem] font-semibold leading-[1.05] tracking-tight text-ink min-[420px]:text-[2.5rem] sm:text-6xl">
            O trilho que move
            <br />
            <span className="text-brand">seus pagamentos.</span>
          </h1>

          <p className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-slate-500">
            Infraestrutura de pagamentos com Pix, cartão, checkout e API para
            empresas que precisam receber sem complicação.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-white transition hover:bg-ink/90"
            >
              Começar agora
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#produto"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3.5 text-[15px] font-medium text-ink transition hover:border-slate-300 hover:bg-slate-50"
            >
              Conhecer a plataforma
            </a>
          </div>

          <p className="mt-5 text-sm text-slate-400">
            Sem mensalidade · Pix liberado na hora
          </p>
        </div>

        <div
          className="tp-hero-rise relative mx-auto w-full min-w-0 max-w-sm lg:max-w-none"
          style={
            { animationDelay: "120ms", "--tp-rise-from": "28px" } as CSSProperties
          }
        >
          <Volp />
        </div>
      </div>
    </section>
  );
}

/** Linhas horizontais finissimas atras do hero — a leitura de "trilho" sem
 *  virar ilustracao de ferrovia. */
function RailBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-mist to-white" />
      {/* Escondido abaixo de lg: com o texto ocupando a largura toda, a linha
       *  passaria por cima da headline e viraria um risco. */}
      <div className="absolute left-0 right-0 top-56 hidden space-y-[7px] opacity-70 lg:block">
        <div className="h-px bg-gradient-to-r from-transparent via-brand/30 to-transparent" />
        <div className="h-px bg-gradient-to-r from-transparent via-brand/15 to-transparent" />
      </div>
    </div>
  );
}

/** Volp, o mascote. O arquivo sai de scripts/volp-cutout.py em 738x1208 — tudo
 *  pixel de verdade da arte nova, sem upscale. Cobre o maior tamanho daqui de
 *  baixo numa tela retina (380 CSS px x 2 = 760). */
function Volp() {
  return (
    <div className="relative flex justify-center">
      {/* Halo da marca atras dele: da peso sem precisar de card nem moldura. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/[0.09] blur-3xl sm:size-[520px]"
      />

      <div className="tp-float relative w-full max-w-[290px] sm:max-w-[340px] lg:max-w-[380px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/volp.webp"
          alt="Volp, o mascote da Trilho Pagamentos"
          width={738}
          height={1208}
          fetchPriority="high"
          className="relative z-10 w-full drop-shadow-[0_28px_45px_rgba(7,26,51,0.22)]"
        />
      </div>

      {/* Sombra de chao. Fica FORA do bloco que flutua de proposito: se subisse
       *  junto com ele, viraria adesivo em vez de sombra. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 h-5 w-[58%] max-w-[220px] -translate-x-1/2 rounded-[50%] bg-ink/15 blur-md"
      />
    </div>
  );
}
