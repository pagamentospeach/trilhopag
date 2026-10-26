/**
 * Chuva de pontinhos na cor da marca — detalhe estético de fundo.
 *
 * 08/08/2026 (davi): "em todas as telas do gateway, faz uns pontinho azuis
 * caindo, de forma clean e sutil, apenas um detalhe estetico!".
 *
 * Três decisões que valem explicar:
 *
 * 1. É Server Component puro: só spans com `style` inline. Sem canvas, sem
 *    requestAnimationFrame, sem JS no cliente. Quem anima é o compositor do
 *    browser (só `transform` e `opacity`), então não custa uma thread de
 *    layout nem atrapalha o scroll.
 *
 * 2. As posições são uma TABELA FIXA, não `Math.random()`. Random em render
 *    daria valor diferente no servidor e no cliente e o React reclamaria de
 *    hidratação. A tabela foi sorteada uma vez e congelada aqui.
 *
 * 3. `aria-hidden` + `pointer-events-none`: é decoração. Não existe pra leitor
 *    de tela e nunca rouba clique. E some inteiro em `prefers-reduced-motion`
 *    (ver globals.css) — ponto caindo em loop é exatamente o tipo de coisa que
 *    incomoda quem pediu menos movimento.
 */

/** [esquerda %, tamanho px, duração s, atraso s, opacidade máxima] */
const DOTS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [4, 2, 19, 0, 0.5],
  [11, 3, 26, 6, 0.35],
  [17, 2, 22, 12, 0.45],
  [23, 2, 31, 3, 0.3],
  [29, 4, 24, 17, 0.28],
  [35, 2, 18, 9, 0.5],
  [41, 3, 29, 21, 0.34],
  [47, 2, 21, 14, 0.42],
  [53, 2, 27, 2, 0.38],
  [59, 3, 23, 19, 0.3],
  [64, 2, 33, 7, 0.44],
  [70, 2, 20, 24, 0.48],
  [76, 4, 28, 11, 0.26],
  [82, 2, 25, 16, 0.4],
  [88, 3, 30, 4, 0.32],
  [94, 2, 17, 22, 0.46],
];

export function FallingDots({
  fixed = false,
  tone = "auto",
}: {
  /**
   * Preso à VIEWPORT em vez do container. Telas altas (o painel) precisam
   * disso: preso ao container, a chuva cairia num trecho da página e sumiria
   * do resto. `absolute`/`fixed` são props e não classes soltas porque as duas
   * são utilitários do Tailwind no mesmo grupo — passar "fixed" por className
   * não sobrescreve o "absolute" de forma confiável, quem ganha é a ordem no
   * CSS gerado.
   */
  fixed?: boolean;
  /**
   * `auto` segue o tema (ciano claro no escuro, mais fechado no claro).
   * `ink` força o tom fechado — pra telas que são brancas sempre e não passam
   * pelo `data-theme`, como login e cadastro.
   */
  tone?: "auto" | "ink";
} = {}) {
  return (
    <div
      aria-hidden
      className={`tp-dots pointer-events-none inset-0 overflow-hidden ${
        fixed ? "fixed" : "absolute"
      } ${tone === "ink" ? "tp-dots-ink" : ""}`}
    >
      {DOTS.map(([left, size, duration, delay, opacity], i) => (
        <span
          key={i}
          className="tp-dot"
          style={{
            left: `${left}%`,
            width: `${size}px`,
            height: `${size}px`,
            animationDuration: `${duration}s`,
            animationDelay: `-${delay}s`,
            // Lida pelo keyframe: cada ponto tem seu próprio teto de opacidade,
            // senão a chuva vira uma faixa uniforme e chapada.
            ["--tp-dot-opacity" as string]: opacity,
          }}
        />
      ))}
    </div>
  );
}
