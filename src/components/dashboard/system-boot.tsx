"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { clearFirstBoot } from "@/lib/first-boot";

/**
 * Sequência de abertura do painel, tocada UMA vez, logo depois do cadastro.
 *
 * 08/08/2026 (davi): "depois de registrar tudo, faz uma animacao estilo tony
 * stark abrindo a dashboard pela primeira vez (...) como se tivesse iniciado
 * um sistema da NASA".
 *
 * Regras que guiam o arquivo:
 *
 *  - Só transform / opacity / stroke. Nada aqui muda largura, altura ou
 *    posição de nada, então o navegador não recalcula layout em nenhum frame.
 *    É o que segura os 60fps num celular fraco.
 *  - Os módulos aparecem por `animation-delay` de CSS, não por setTimeout.
 *    Seis timers disputando a fila de tarefas dariam stutter; delay de CSS
 *    roda no compositor.
 *  - A única coisa em JS por frame é o contador de porcentagem, e ele anda
 *    por requestAnimationFrame em vez de setInterval — sem drift.
 *  - Nada aqui é status real de sistema. É a abertura de uma tela, e os nomes
 *    são os módulos que a conta realmente tem. Nenhum número de telemetria
 *    inventado.
 *
 * 08/08/2026 (davi): "a dash abriu antes da intro e depois de 1 segundinho
 * veio a intro". Era o preço do `ssr:false`: o painel pintava, o chunk desta
 * tela baixava, e só então ela cobria tudo. Agora o componente é importado
 * direto no layout do painel, então a placa já vem no HTML do servidor e o
 * primeiro frame do /dashboard nunca é o painel.
 *
 * ⚠️ FUNDO BRANCO desde 08/08/2026 (davi: "essa intro que vc fez ficou top mas
 * deixa ela no tema branco"). Não é trocar `bg-black` por `bg-white`: no escuro
 * o desenho inteiro se sustentava em ciano de baixa opacidade, e no branco
 * TODO ciano claro desaparece. A regra que reorganizou a paleta foi:
 *
 *   - estrutura (malha, riscos de escala, aro interno) vira TINTA clara. É o
 *     que dá a leitura de papel milimetrado / instrumento de bancada.
 *   - o ciano fica só no que precisa saltar: o arco que gira, o scan, a barra
 *     e a logo. Menos ciano na tela, e por isso ele pesa mais.
 *   - texto pequeno NUNCA em `brand`: #33d2d9 no branco dá 1.9:1. Quem lê é
 *     `ink` (título/módulos) e `brand-deep` (estado + checks).
 *
 * Este componente mora FORA do wrapper `[data-theme]` do layout, então nada
 * aqui é reescrito pelo themes.css — a paleta abaixo vale como está, em
 * qualquer skin que o seller escolher depois.
 */

/** Módulos que a conta realmente passa a ter. Sem métrica, só nome. */
const MODULES = [
  "NUCLEO DE PAGAMENTOS",
  "ADQUIRENTES",
  "CHECKOUT",
  "PIX",
  "WEBHOOKS",
  "PAINEL",
] as const;

const T = {
  /** Quando o primeiro módulo acende, e de quanto em quanto vem o próximo. */
  moduleStart: 620,
  moduleGap: 250,
  /** Janela do contador de 0 a 100. */
  fillFrom: 380,
  fillTo: 2500,
  /** "SISTEMA PRONTO", início da saída e desmonte. */
  ready: 2620,
  exit: 3220,
  gone: 3900,
} as const;

type Phase = "boot" | "ready" | "exit";

export function SystemBoot() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [pct, setPct] = useState(0);
  const [gone, setGone] = useState(false);
  const skipped = useRef(false);
  /**
   * A placa preta vem do servidor; o conteúdo só entra depois de montar.
   *
   * Os dois relógios da tela partem de lugares diferentes: os `animation-delay`
   * do CSS contam a partir do primeiro paint, e os timers/rAF só começam na
   * hidratação. Renderizar o conteúdo no servidor colocaria um do lado do
   * outro — os seis módulos já acesos com a barra ainda em 0%. Segurando o
   * conteúdo até montar, os dois começam juntos.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Queima o cookie no primeiro paint: se a pessoa recarregar no meio da
  // animação, ela não recomeça.
  useEffect(() => {
    clearFirstBoot();
    // O intro curto de toda sessão não deve emendar logo depois desta tela.
    try {
      sessionStorage.setItem("tp_intro_seen", "1");
    } catch {}
  }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("ready"), T.ready),
      setTimeout(() => setPhase("exit"), T.exit),
      setTimeout(() => setGone(true), T.gone),
    ];

    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = (now - t0 - T.fillFrom) / (T.fillTo - T.fillFrom);
      // easeOutCubic: enche rápido e assenta, em vez de subir reto.
      const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
      setPct(Math.round(eased * 100));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
    };
  }, []);

  /** Clique ou tecla corta o resto. Ninguém é obrigado a assistir. */
  useEffect(() => {
    function skip() {
      if (skipped.current) return;
      skipped.current = true;
      setPct(100);
      setPhase("exit");
      setTimeout(() => setGone(true), 620);
    }
    // Meio segundo de carência: sem isso, uma tecla encostada na hora do
    // redirect mataria a animação antes do primeiro frame.
    const arm = setTimeout(() => {
      window.addEventListener("keydown", skip);
      window.addEventListener("pointerdown", skip);
    }, 500);
    return () => {
      clearTimeout(arm);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, []);

  if (gone) return null;

  const exiting = phase === "exit";

  return (
    <div
      role="status"
      aria-label="Iniciando o painel"
      className={`fixed inset-0 z-[10000] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-white transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        exiting ? "scale-[1.06] opacity-0" : "scale-100 opacity-100"
      }`}
    >
      {!mounted ? null : (
        <>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Respiro de cor atrás do alvo. No preto o próprio fundo já dava
            profundidade; no branco, sem isto, o desenho fica boiando numa
            folha em branco. Gradiente radial e não `blur-3xl`: mancha do
            tamanho da tela com blur é das coisas que mais custam GPU, e o
            resultado aqui é o mesmo de graça. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(closest-side at 50% 46%, rgba(51,210,217,0.13), transparent)",
          }}
        />
        <div className="tpb-grid absolute inset-0" />
        <div className="tpb-scan absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent" />
        <Corners />
      </div>

      <div className="relative flex flex-col items-center px-6">
        <Reticle ready={phase !== "boot"} />

        <h1
          className="tpb-rise mt-9 text-center font-mono text-[11px] font-semibold uppercase text-ink sm:text-xs"
          style={{ animationDelay: "420ms" }}
        >
          <span
            className="tpb-track inline-block"
            style={{ animationDelay: "420ms" }}
          >
            Trilho Pagamentos
          </span>
        </h1>

        {/* Barra: escala horizontal, então nenhum frame mexe em layout.
            `h-0.5` e não `h-px` como no escuro: 1px de ciano sobre branco
            some na maioria das telas, 2px sustenta. */}
        <div
          className="tpb-rise mt-7 h-0.5 w-[240px] overflow-hidden rounded-full bg-ink/10 sm:w-[300px]"
          style={{ animationDelay: "480ms" }}
        >
          <div
            // Sem transition de propósito: o valor já chega novo a cada frame
            // pelo rAF, e uma transição em cima disso só atrasaria a barra.
            className="h-full origin-left rounded-full bg-gradient-to-r from-brand/40 to-brand-deep"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>

        <div
          className="tpb-rise mt-3 flex w-[240px] items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] sm:w-[300px]"
          style={{ animationDelay: "520ms" }}
        >
          {/* slate-500 e nao slate-400: mono de 10px com tracking de 0.18em
              precisa de 4.5:1 pra ser lido, e o 400 entrega 2.9:1 no branco. */}
          <span
            className={
              phase === "boot"
                ? "text-slate-500"
                : "font-semibold text-brand-deep"
            }
          >
            {phase === "boot" ? "Iniciando sistema" : "Sistema pronto"}
          </span>
          <span className="tabular-nums text-slate-500">
            {String(pct).padStart(3, "0")}%
          </span>
        </div>

        {/* Os módulos. Cada um entra sozinho pelo próprio animation-delay. */}
        <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 sm:gap-x-8">
          {MODULES.map((m, i) => (
            <li
              key={m}
              className="tpb-item flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-slate-600 sm:text-[10px]"
              style={{
                animationDelay: `${T.moduleStart + i * T.moduleGap}ms`,
              }}
            >
              <Check
                className="size-3 shrink-0 text-brand-deep"
                strokeWidth={3}
              />
              {m}
            </li>
          ))}
        </ul>
      </div>
        </>
      )}
    </div>
  );
}

/** Cantos de HUD. Puro enquadramento, entram um a um. */
function Corners() {
  // No preto isto era `cyan-400/35`. Em fundo branco a mesma opacidade some,
  // então o traço subiu pra 60% — é o único ciano da moldura e ele que faz a
  // tela ler como visor e não como página em branco.
  const base =
    "tpb-corner absolute size-10 border-brand/60 sm:size-14 md:size-16";
  return (
    <>
      <span
        className={`${base} left-5 top-5 border-l border-t sm:left-8 sm:top-8`}
        style={{ animationDelay: "120ms" }}
      />
      <span
        className={`${base} right-5 top-5 border-r border-t sm:right-8 sm:top-8`}
        style={{ animationDelay: "200ms" }}
      />
      <span
        className={`${base} bottom-5 left-5 border-b border-l sm:bottom-8 sm:left-8`}
        style={{ animationDelay: "280ms" }}
      />
      <span
        className={`${base} bottom-5 right-5 border-b border-r sm:bottom-8 sm:right-8`}
        style={{ animationDelay: "360ms" }}
      />
    </>
  );
}

/**
 * O alvo do meio: três anéis em velocidades diferentes mais os riscos de
 * escala. O de fora é desenhado (stroke-dashoffset), os de dentro giram.
 */
function Reticle({ ready }: { ready: boolean }) {
  const R_OUT = 88;
  const LEN = 2 * Math.PI * R_OUT;
  const origin = { transformOrigin: "100px 100px" } as const;

  return (
    <div className="relative size-[210px] sm:size-[240px]">
      {ready ? (
        <span
          aria-hidden
          className="tpb-flare absolute inset-6 rounded-full border border-brand/80"
        />
      ) : null}

      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
        <g fill="none">
          <circle
            cx="100"
            cy="100"
            r={R_OUT}
            stroke="rgba(51,210,217,0.95)"
            strokeWidth="1"
            className="tpb-draw"
            style={
              {
                "--tpb-len": String(LEN),
                animationDelay: "80ms",
              } as React.CSSProperties
            }
          />

          {/* Riscos de escala, em TINTA. No escuro eles eram ciano e o alvo
              inteiro ficava monocromático; no branco, deixar os 24 riscos em
              ciano roubaria a atenção do arco que gira, que é o que dá a
              sensação de máquina ligada. Estrutura em tinta, movimento em
              ciano. */}
          <g style={origin} className="tpb-spin-slow">
            {Array.from({ length: 24 }, (_, i) => {
              const a = (i * Math.PI * 2) / 24;
              const long = i % 6 === 0;
              const r1 = long ? 74 : 78;
              return (
                <line
                  key={i}
                  x1={100 + Math.cos(a) * r1}
                  y1={100 + Math.sin(a) * r1}
                  x2={100 + Math.cos(a) * 82}
                  y2={100 + Math.sin(a) * 82}
                  stroke={
                    long ? "rgba(7,26,51,0.5)" : "rgba(7,26,51,0.2)"
                  }
                  strokeWidth="1"
                />
              );
            })}
          </g>

          {/* Arco rápido no contrafluxo: é ele que dá a sensação de máquina. */}
          <g style={origin} className="tpb-spin-fast-rev">
            <circle
              cx="100"
              cy="100"
              r="62"
              stroke="rgba(11,122,130,0.95)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="70 320"
            />
            <circle
              cx="100"
              cy="100"
              r="62"
              stroke="rgba(51,210,217,0.55)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="18 370"
              strokeDashoffset="-120"
            />
          </g>

          <circle
            cx="100"
            cy="100"
            r="46"
            stroke="rgba(7,26,51,0.1)"
            strokeWidth="1"
          />
        </g>
      </svg>

      <div
        className="tpb-rise absolute inset-0 flex items-center justify-center"
        style={{ animationDelay: "280ms" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/trilhopag-mark.png"
          alt=""
          width={56}
          height={56}
          // O halo virou sombra projetada. Glow centrado (`0 0`) só existe
          // como ideia em fundo escuro; no branco ele suja a logo em vez de
          // acender. Deslocado pra baixo, lê como peça pousada na folha.
          className="size-12 object-contain drop-shadow-[0_6px_20px_rgba(51,210,217,0.6)] sm:size-14"
        />
      </div>
    </div>
  );
}
