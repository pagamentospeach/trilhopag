/**
 * Temas ESPECIAIS — pra galera do Trilho (kushdela_ e _.zzeny).
 * Mordecai + Rigby (Apenas um Show / Regular Show) misturados com vibe
 * dos perfis Instagram.
 */

import type { Scene } from "./theme-scenes";

/* ============== KUSH DELA — Mordecai + lifestyle "worldwide $$$" ============== */

/** Mordecai: blue jay com bico amarelo, olhos brancos, sobrancelhas */
const MORDECAI_HEAD = `<svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo azul (pescoço) -->
  <path d="M30 85 L70 85 L72 105 L28 105 Z" fill="#3b82f6" stroke="#0c1d4a" stroke-width="2"/>
  <!-- cabeça -->
  <ellipse cx="50" cy="50" rx="34" ry="38" fill="#3b82f6" stroke="#0c1d4a" stroke-width="2.5"/>
  <!-- topete (cabelo no topo) -->
  <path d="M30 18 Q40 4 50 14 Q60 4 70 18 L50 30 Z" fill="#1e40af" stroke="#0c1d4a" stroke-width="2"/>
  <!-- olhos -->
  <ellipse cx="38" cy="45" rx="9" ry="11" fill="#fafafa" stroke="#0c1d4a" stroke-width="1.8"/>
  <ellipse cx="62" cy="45" rx="9" ry="11" fill="#fafafa" stroke="#0c1d4a" stroke-width="1.8"/>
  <circle cx="38" cy="47" r="3" fill="#0c1d4a"/>
  <circle cx="62" cy="47" r="3" fill="#0c1d4a"/>
  <!-- sobrancelhas (a marca registrada) -->
  <path d="M28 30 L46 36" stroke="#0c1d4a" stroke-width="3" stroke-linecap="round"/>
  <path d="M54 36 L72 30" stroke="#0c1d4a" stroke-width="3" stroke-linecap="round"/>
  <!-- bico amarelo -->
  <path d="M42 60 L58 60 L50 76 Z" fill="#fbbf24" stroke="#0c1d4a" stroke-width="2"/>
  <line x1="42" y1="64" x2="58" y2="64" stroke="#0c1d4a" stroke-width="1.5"/>
  <!-- bochechas azul mais claro (sutil) -->
  <ellipse cx="30" cy="60" rx="4" ry="2" fill="#60a5fa" opacity="0.5"/>
  <ellipse cx="70" cy="60" rx="4" ry="2" fill="#60a5fa" opacity="0.5"/>
</svg>`;

/** Audi rings — 4 círculos prata encadeados */
const AUDI_RINGS = `<svg viewBox="0 0 160 50" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="#cbd5e1" stroke-width="3.5">
    <circle cx="22" cy="25" r="20"/>
    <circle cx="58" cy="25" r="20"/>
    <circle cx="94" cy="25" r="20"/>
    <circle cx="130" cy="25" r="20"/>
  </g>
</svg>`;

/** Nota de US$ 100 — versão luxo dourada */
const HUNDRED_BILL = `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="116" height="56" rx="3" fill="#14532d" stroke="#052e16" stroke-width="1.5"/>
  <rect x="6" y="6" width="108" height="48" rx="2" fill="none" stroke="#bbf7d0" stroke-width="0.8"/>
  <circle cx="60" cy="30" r="18" fill="#166534" stroke="#bbf7d0" stroke-width="1.5"/>
  <text x="60" y="38" font-family="serif" font-weight="900" font-size="24" fill="#fef3c7" text-anchor="middle">100</text>
  <text x="14" y="18" font-family="serif" font-weight="900" font-size="10" fill="#fef3c7">$</text>
  <text x="106" y="50" font-family="serif" font-weight="900" font-size="10" fill="#fef3c7" text-anchor="end">$</text>
</svg>`;

/** Castelo da Disney (foto do feed) */
const DISNEY_CASTLE = `<svg viewBox="0 0 140 110" xmlns="http://www.w3.org/2000/svg">
  <!-- base muralha -->
  <rect x="20" y="70" width="100" height="30" fill="#cbd5e1" stroke="#475569" stroke-width="1.5"/>
  <!-- portão -->
  <path d="M60 100 L60 84 Q70 78 80 84 L80 100 Z" fill="#1e3a8a"/>
  <!-- torres laterais -->
  <rect x="22" y="40" width="14" height="60" fill="#cbd5e1" stroke="#475569" stroke-width="1.5"/>
  <polygon points="22,40 29,24 36,40" fill="#3b82f6" stroke="#0c1d4a" stroke-width="1.5"/>
  <rect x="104" y="40" width="14" height="60" fill="#cbd5e1" stroke="#475569" stroke-width="1.5"/>
  <polygon points="104,40 111,24 118,40" fill="#3b82f6" stroke="#0c1d4a" stroke-width="1.5"/>
  <!-- torre central alta -->
  <rect x="60" y="20" width="20" height="50" fill="#cbd5e1" stroke="#475569" stroke-width="1.5"/>
  <polygon points="60,20 70,2 80,20" fill="#3b82f6" stroke="#0c1d4a" stroke-width="1.5"/>
  <!-- bandeirinhas -->
  <line x1="70" y1="2" x2="70" y2="-4" stroke="#0c1d4a"/>
  <path d="M70 -4 L78 -1 L70 3 Z" fill="#fbbf24"/>
  <line x1="29" y1="24" x2="29" y2="18" stroke="#0c1d4a"/>
  <path d="M29 18 L36 21 L29 24 Z" fill="#fbbf24"/>
  <line x1="111" y1="24" x2="111" y2="18" stroke="#0c1d4a"/>
  <path d="M111 18 L118 21 L111 24 Z" fill="#fbbf24"/>
  <!-- janelas com luz -->
  <rect x="26" y="50" width="6" height="10" fill="#fbbf24"/>
  <rect x="108" y="50" width="6" height="10" fill="#fbbf24"/>
  <rect x="64" y="32" width="6" height="10" fill="#fbbf24"/>
  <rect x="70" y="32" width="6" height="10" fill="#fbbf24"/>
  <rect x="44" y="80" width="6" height="10" fill="#fbbf24"/>
  <rect x="90" y="80" width="6" height="10" fill="#fbbf24"/>
</svg>`;

/** Tênis estiloso (sneaker) */
const SNEAKER = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 38 L8 22 Q14 16 24 18 L48 24 Q62 26 76 32 Q90 36 92 42 L4 42 Q4 40 4 38 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/>
  <path d="M4 42 L92 42 L94 46 L4 46 Z" fill="#0a0a0a"/>
  <path d="M16 24 Q34 18 56 26" stroke="#3b82f6" stroke-width="2.5" fill="none"/>
  <path d="M24 28 Q42 22 64 30" stroke="#3b82f6" stroke-width="2" fill="none" opacity="0.6"/>
  <circle cx="20" cy="34" r="1.5" fill="#0a0a0a"/>
  <circle cx="30" cy="33" r="1.5" fill="#0a0a0a"/>
  <circle cx="40" cy="32" r="1.5" fill="#0a0a0a"/>
</svg>`;

/** Globo terrestre (worldwide) */
const GLOBE = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
  <circle cx="30" cy="30" r="26" fill="#3b82f6" stroke="#0c1d4a" stroke-width="2"/>
  <ellipse cx="30" cy="30" rx="26" ry="10" fill="none" stroke="#fafafa" stroke-width="1.5" opacity="0.6"/>
  <ellipse cx="30" cy="30" rx="10" ry="26" fill="none" stroke="#fafafa" stroke-width="1.5" opacity="0.6"/>
  <line x1="4" y1="30" x2="56" y2="30" stroke="#fafafa" stroke-width="1.5" opacity="0.6"/>
  <line x1="30" y1="4" x2="30" y2="56" stroke="#fafafa" stroke-width="1.5" opacity="0.6"/>
  <!-- continente abstrato -->
  <path d="M14 22 Q22 18 28 24 L26 32 L20 36 Z" fill="#16a34a"/>
  <path d="M36 26 Q44 24 48 32 L42 38 L36 36 Z" fill="#16a34a"/>
</svg>`;

/** Coffee mug — Mordecai trabalha no Park, sempre tem café */
const COFFEE_MUG = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 24 L46 24 L44 52 Q44 56 40 56 L16 56 Q12 56 12 52 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/>
  <path d="M46 30 Q56 30 56 38 Q56 46 46 46" fill="none" stroke="#0a0a0a" stroke-width="2"/>
  <!-- café dentro -->
  <ellipse cx="28" cy="26" rx="18" ry="3" fill="#78350f"/>
  <!-- fumaça -->
  <path d="M22 18 Q24 14 22 10 Q20 6 22 2" stroke="#cbd5e1" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>
  <path d="M30 18 Q32 14 30 10 Q28 6 30 2" stroke="#cbd5e1" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>
  <path d="M38 18 Q40 14 38 10 Q36 6 38 2" stroke="#cbd5e1" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>
</svg>`;

/** "$" gigante dourado */
const DOLLAR_BIG = `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg">
  <text x="20" y="48" font-family="Arial Black, sans-serif" font-weight="900" font-size="56" fill="#fbbf24" text-anchor="middle" stroke="#78350f" stroke-width="1.5">$</text>
</svg>`;

/** Diamante (lifestyle $$$) */
const DIAMOND_GEM = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 18 L25 6 L40 18 L25 44 Z" fill="#67e8f9" stroke="#0c4a6e" stroke-width="2"/>
  <path d="M10 18 L40 18 L25 6 Z" fill="#bae6fd" opacity="0.8"/>
  <path d="M10 18 L25 18 L25 44 Z" fill="none" stroke="#0c4a6e" stroke-width="1"/>
  <path d="M40 18 L25 18 L25 44 Z" fill="none" stroke="#0c4a6e" stroke-width="1"/>
</svg>`;

/* ============== ZENY — Rigby + cybersecurity swag ============== */

/** Rigby: guaxinim marrom com listras pretas */
const RIGBY_HEAD = `<svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo (pescoço) -->
  <path d="M32 85 L68 85 L72 105 L28 105 Z" fill="#78350f" stroke="#1c0a01" stroke-width="2"/>
  <!-- cabeça oval -->
  <ellipse cx="50" cy="55" rx="38" ry="42" fill="#78350f" stroke="#1c0a01" stroke-width="2.5"/>
  <!-- focinho/máscara branca -->
  <path d="M18 50 Q50 64 82 50 Q72 80 50 84 Q28 80 18 50 Z" fill="#fafafa" stroke="#1c0a01" stroke-width="2"/>
  <!-- olhos brancos com pupilas pequenas (marca registrada do Rigby) -->
  <circle cx="38" cy="46" r="11" fill="#fafafa" stroke="#1c0a01" stroke-width="2"/>
  <circle cx="62" cy="46" r="11" fill="#fafafa" stroke="#1c0a01" stroke-width="2"/>
  <circle cx="38" cy="46" r="2.5" fill="#1c0a01"/>
  <circle cx="62" cy="46" r="2.5" fill="#1c0a01"/>
  <!-- orelhinhas redondas em cima -->
  <circle cx="22" cy="22" r="9" fill="#78350f" stroke="#1c0a01" stroke-width="2"/>
  <circle cx="78" cy="22" r="9" fill="#78350f" stroke="#1c0a01" stroke-width="2"/>
  <circle cx="22" cy="22" r="4" fill="#fafafa"/>
  <circle cx="78" cy="22" r="4" fill="#fafafa"/>
  <!-- nariz preto -->
  <ellipse cx="50" cy="62" rx="4" ry="3" fill="#1c0a01"/>
  <!-- boca pequena com dentes -->
  <path d="M44 72 L46 76 L50 73 L54 76 L56 72" stroke="#1c0a01" stroke-width="2" fill="none"/>
  <!-- listras na cauda visíveis (lateral da cabeça) -->
  <path d="M14 64 Q10 68 8 64" stroke="#1c0a01" stroke-width="3" fill="none"/>
  <path d="M86 64 Q90 68 92 64" stroke="#1c0a01" stroke-width="3" fill="none"/>
</svg>`;

/** Gato preto (story highlight) */
const BLACK_CAT = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo -->
  <ellipse cx="30" cy="50" rx="20" ry="16" fill="#0a0a0a" stroke="#1c1917" stroke-width="1"/>
  <!-- cabeça -->
  <circle cx="30" cy="28" r="16" fill="#0a0a0a" stroke="#1c1917" stroke-width="1"/>
  <!-- orelhas triangulares -->
  <path d="M18 18 L14 4 L26 14 Z" fill="#0a0a0a" stroke="#1c1917" stroke-width="1"/>
  <path d="M42 18 L46 4 L34 14 Z" fill="#0a0a0a" stroke="#1c1917" stroke-width="1"/>
  <path d="M18 14 L18 8 L23 12 Z" fill="#ec4899"/>
  <path d="M42 14 L42 8 L37 12 Z" fill="#ec4899"/>
  <!-- olhos verdes -->
  <ellipse cx="24" cy="28" rx="2.5" ry="4" fill="#22c55e"/>
  <ellipse cx="36" cy="28" rx="2.5" ry="4" fill="#22c55e"/>
  <ellipse cx="24" cy="28" rx="1" ry="3" fill="#0a0a0a"/>
  <ellipse cx="36" cy="28" rx="1" ry="3" fill="#0a0a0a"/>
  <!-- nariz e bigodes -->
  <path d="M28 34 L32 34 L30 36 Z" fill="#ec4899"/>
  <path d="M16 32 L24 33 M16 36 L24 35 M36 33 L44 32 M36 35 L44 36" stroke="#a3a3a3" stroke-width="0.6"/>
  <!-- cauda saindo do corpo -->
  <path d="M48 50 Q60 48 56 30" stroke="#0a0a0a" stroke-width="6" fill="none" stroke-linecap="round"/>
</svg>`;

/** Carro esportivo branco (foto da postagem) */
const WHITE_SPORTS_CAR = `<svg viewBox="0 0 140 50" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 36 L8 26 L24 16 L46 10 L82 8 L106 14 L132 26 L136 36 L132 42 L106 42 L102 38 L34 38 L30 42 L8 42 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/>
  <path d="M24 20 L46 14 L78 14 L100 18 L96 28 L28 28 Z" fill="#cbd5e1" opacity="0.6"/>
  <circle cx="30" cy="42" r="6" fill="#0a0a0a"/>
  <circle cx="30" cy="42" r="2.5" fill="#525252"/>
  <circle cx="106" cy="42" r="6" fill="#0a0a0a"/>
  <circle cx="106" cy="42" r="2.5" fill="#525252"/>
  <!-- detalhes esportivos -->
  <line x1="50" y1="20" x2="90" y2="20" stroke="#0a0a0a" stroke-width="0.8"/>
  <rect x="118" y="22" width="6" height="3" fill="#fbbf24"/>
</svg>`;

/** Rato (emoji do bio: zeny 🐀) */
const RAT = `<svg viewBox="0 0 70 50" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="40" cy="30" rx="22" ry="14" fill="#94a3b8" stroke="#1c1917" stroke-width="1.5"/>
  <circle cx="58" cy="22" r="10" fill="#94a3b8" stroke="#1c1917" stroke-width="1.5"/>
  <!-- orelhas -->
  <circle cx="54" cy="14" r="5" fill="#fda4af"/>
  <circle cx="64" cy="14" r="5" fill="#fda4af"/>
  <circle cx="54" cy="14" r="3" fill="#94a3b8"/>
  <circle cx="64" cy="14" r="3" fill="#94a3b8"/>
  <!-- olho -->
  <circle cx="62" cy="22" r="2" fill="#0a0a0a"/>
  <!-- focinho -->
  <path d="M66 24 L70 22 L66 28 Z" fill="#fda4af"/>
  <!-- bigodes -->
  <line x1="64" y1="26" x2="70" y2="28" stroke="#1c1917" stroke-width="0.5"/>
  <line x1="64" y1="28" x2="70" y2="30" stroke="#1c1917" stroke-width="0.5"/>
  <!-- cauda -->
  <path d="M18 32 Q4 36 2 44" stroke="#94a3b8" stroke-width="3" fill="none" stroke-linecap="round"/>
  <!-- patinhas -->
  <ellipse cx="28" cy="44" rx="4" ry="2" fill="#1c1917"/>
  <ellipse cx="48" cy="44" rx="4" ry="2" fill="#1c1917"/>
</svg>`;

/** Terminal/Hacker — janela de código verde */
const TERMINAL_WINDOW = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="116" height="76" rx="6" fill="#0a0a0a" stroke="#1c1917" stroke-width="1.5"/>
  <rect x="2" y="2" width="116" height="14" rx="6" fill="#1c1917"/>
  <circle cx="10" cy="9" r="2.5" fill="#dc2626"/>
  <circle cx="20" cy="9" r="2.5" fill="#facc15"/>
  <circle cx="30" cy="9" r="2.5" fill="#22c55e"/>
  <g fill="#22c55e" font-family="monospace" font-size="6">
    <text x="8" y="28">$ sudo rm -rf</text>
    <text x="8" y="38">&gt; access granted</text>
    <text x="8" y="48">&gt; bypass.....OK</text>
    <text x="8" y="58">$ exploit run</text>
    <text x="8" y="68">[████████] 100%</text>
  </g>
</svg>`;

/** Caveira (#SWAG) */
const SWAG_SKULL = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg">
  <path d="M30 6 Q52 10 52 34 Q52 48 46 52 L46 60 L36 60 L36 56 L24 56 L24 60 L14 60 L14 52 Q8 48 8 34 Q8 10 30 6 Z" fill="#fafafa" stroke="#1c1917" stroke-width="2"/>
  <ellipse cx="20" cy="34" rx="5" ry="6" fill="#1c1917"/>
  <ellipse cx="40" cy="34" rx="5" ry="6" fill="#1c1917"/>
  <path d="M26 44 L30 44 L34 44 L32 50 L28 50 Z" fill="#1c1917"/>
  <!-- "SWAG" testa -->
  <text x="30" y="22" font-family="Impact" font-weight="900" font-size="7" fill="#ec4899" text-anchor="middle">SWAG</text>
  <!-- dentes -->
  <line x1="22" y1="56" x2="22" y2="60" stroke="#1c1917" stroke-width="1.5"/>
  <line x1="28" y1="56" x2="28" y2="60" stroke="#1c1917" stroke-width="1.5"/>
  <line x1="34" y1="56" x2="34" y2="60" stroke="#1c1917" stroke-width="1.5"/>
</svg>`;

/** TikTok live indicator (ele faz live no tiktok) */
const TIKTOK_LIVE = `<svg viewBox="0 0 70 30" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="66" height="26" rx="13" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/>
  <circle cx="14" cy="15" r="4" fill="#fafafa"/>
  <text x="40" y="20" font-family="Arial Black" font-weight="900" font-size="11" fill="#fafafa" text-anchor="middle">LIVE</text>
</svg>`;

/** Capuz/Hoodie — hacker silhouette */
const HOODIE_FIGURE = `<svg viewBox="0 0 70 90" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 30 Q14 8 35 8 Q56 8 56 30 L56 50 L50 50 L50 88 L20 88 L20 50 L14 50 Z" fill="#1c1917" stroke="#0a0a0a" stroke-width="2"/>
  <!-- sombra do rosto -->
  <path d="M24 26 Q24 16 35 16 Q46 16 46 26 L46 38 L24 38 Z" fill="#0a0a0a"/>
  <!-- olhos verdes brilhando -->
  <circle cx="30" cy="30" r="2" fill="#22c55e"/>
  <circle cx="40" cy="30" r="2" fill="#22c55e"/>
</svg>`;

/* ============== TONY ECOM — Homem-Aranha Black v2 (cinematográfico) ============== */

/** Teia diagonal GIGANTE cobrindo metade da tela — cinematográfico */
const HUGE_DIAGONAL_WEB = `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#fafafa" stroke-width="1.2" fill="none" stroke-linecap="round">
    <!-- raios principais saindo do canto -->
    <line x1="0" y1="0" x2="600" y2="600"/>
    <line x1="0" y1="0" x2="600" y2="500"/>
    <line x1="0" y1="0" x2="600" y2="400"/>
    <line x1="0" y1="0" x2="600" y2="300"/>
    <line x1="0" y1="0" x2="600" y2="200"/>
    <line x1="0" y1="0" x2="600" y2="100"/>
    <line x1="0" y1="0" x2="500" y2="600"/>
    <line x1="0" y1="0" x2="400" y2="600"/>
    <line x1="0" y1="0" x2="300" y2="600"/>
    <line x1="0" y1="0" x2="200" y2="600"/>
    <line x1="0" y1="0" x2="100" y2="600"/>
    <line x1="0" y1="0" x2="600" y2="0"/>
    <line x1="0" y1="0" x2="0" y2="600"/>
  </g>
  <g stroke="#fafafa" stroke-width="0.6" fill="none" opacity="0.55">
    <!-- arcos concêntricos da teia em níveis -->
    <path d="M 80 0 Q 60 60 0 80"/>
    <path d="M 160 0 Q 120 120 0 160"/>
    <path d="M 240 0 Q 180 180 0 240"/>
    <path d="M 320 0 Q 240 240 0 320"/>
    <path d="M 400 0 Q 300 300 0 400"/>
    <path d="M 480 0 Q 360 360 0 480"/>
    <path d="M 560 0 Q 420 420 0 560"/>
    <path d="M 600 80 Q 500 480 80 600"/>
    <path d="M 600 200 Q 540 540 200 600"/>
  </g>
</svg>`;

/** Teia rasgada/quebrada — pedaços flutuando */
const WEB_FRAGMENT = `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#fafafa" stroke-width="0.9" fill="none" stroke-linecap="round">
    <line x1="10" y1="60" x2="190" y2="60"/>
    <line x1="20" y1="20" x2="180" y2="100"/>
    <line x1="20" y1="100" x2="180" y2="20"/>
    <line x1="100" y1="10" x2="100" y2="110"/>
    <path d="M 30 60 Q 70 30 100 60 Q 130 90 170 60"/>
    <path d="M 30 60 Q 70 90 100 60 Q 130 30 170 60"/>
    <path d="M 50 35 Q 70 50 100 35"/>
    <path d="M 50 85 Q 70 70 100 85"/>
    <path d="M 100 35 Q 130 50 150 35"/>
    <path d="M 100 85 Q 130 70 150 85"/>
  </g>
  <!-- pontos de aderência (onde teia "gruda") -->
  <circle cx="100" cy="60" r="2" fill="#fafafa"/>
  <circle cx="30" cy="60" r="1.5" fill="#fafafa" opacity="0.6"/>
  <circle cx="170" cy="60" r="1.5" fill="#fafafa" opacity="0.6"/>
</svg>`;

/** Fio de teia solto pendendo (vertical, com gota na ponta) */
const WEB_THREAD = `<svg viewBox="0 0 30 240" xmlns="http://www.w3.org/2000/svg">
  <path d="M 15 0 Q 12 60 18 120 Q 10 180 15 230" stroke="#fafafa" stroke-width="1" fill="none" opacity="0.7"/>
  <circle cx="15" cy="232" r="3" fill="#fafafa" opacity="0.85"/>
  <circle cx="15" cy="232" r="6" fill="#fafafa" opacity="0.2"/>
</svg>`;

/** Nota de US$100 girada/movimento — "caindo" pela tela */
const FALLING_BILL = `<svg viewBox="0 0 140 70" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="billGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#16a34a"/>
      <stop offset="100%" stop-color="#14532d"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="136" height="66" rx="3" fill="url(#billGrad)" stroke="#052e16" stroke-width="1.5"/>
  <rect x="6" y="6" width="128" height="58" rx="2" fill="none" stroke="#bbf7d0" stroke-width="0.7" opacity="0.7"/>
  <circle cx="70" cy="35" r="20" fill="#166534" stroke="#bbf7d0" stroke-width="1.2"/>
  <text x="70" y="42" font-family="serif" font-weight="900" font-size="22" fill="#fef3c7" text-anchor="middle">100</text>
  <!-- ornamentos canto -->
  <circle cx="14" cy="14" r="6" fill="none" stroke="#bbf7d0" stroke-width="0.8"/>
  <text x="14" y="18" font-family="serif" font-weight="900" font-size="9" fill="#bbf7d0" text-anchor="middle">$</text>
  <circle cx="126" cy="56" r="6" fill="none" stroke="#bbf7d0" stroke-width="0.8"/>
  <text x="126" y="60" font-family="serif" font-weight="900" font-size="9" fill="#bbf7d0" text-anchor="middle">$</text>
</svg>`;

/** Nota presa na teia — bill + web sobreposta */
const BILL_IN_WEB = `<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="14" y="14" width="132" height="68" rx="3" fill="#15803d" stroke="#052e16" stroke-width="1.5"/>
  <circle cx="80" cy="48" r="18" fill="#166534" stroke="#bbf7d0" stroke-width="1"/>
  <text x="80" y="54" font-family="serif" font-weight="900" font-size="18" fill="#fef3c7" text-anchor="middle">100</text>
  <!-- teia em cima da nota -->
  <g stroke="#fafafa" stroke-width="0.8" fill="none" opacity="0.85" stroke-linecap="round">
    <line x1="0" y1="0" x2="160" y2="100"/>
    <line x1="160" y1="0" x2="0" y2="100"/>
    <line x1="80" y1="0" x2="80" y2="100"/>
    <line x1="0" y1="50" x2="160" y2="50"/>
    <path d="M 40 30 Q 80 20 120 30"/>
    <path d="M 40 70 Q 80 80 120 70"/>
    <path d="M 30 30 Q 30 50 30 70"/>
    <path d="M 130 30 Q 130 50 130 70"/>
  </g>
</svg>`;

/** Aranha branca pequena descendo num fio */
const SPIDER_HANGING = `<svg viewBox="0 0 40 100" xmlns="http://www.w3.org/2000/svg">
  <line x1="20" y1="0" x2="20" y2="60" stroke="#fafafa" stroke-width="0.8" opacity="0.8"/>
  <!-- aranha -->
  <ellipse cx="20" cy="72" rx="10" ry="13" fill="#fafafa" stroke="#0a0a0a" stroke-width="1"/>
  <ellipse cx="20" cy="64" rx="6" ry="6" fill="#fafafa" stroke="#0a0a0a" stroke-width="1"/>
  <!-- pernas -->
  <g stroke="#fafafa" stroke-width="1" fill="none" stroke-linecap="round">
    <path d="M 12 68 Q 4 64 2 76"/>
    <path d="M 12 74 Q 2 76 0 86"/>
    <path d="M 12 80 Q 4 86 2 96"/>
    <path d="M 28 68 Q 36 64 38 76"/>
    <path d="M 28 74 Q 38 76 40 86"/>
    <path d="M 28 80 Q 36 86 38 96"/>
  </g>
  <!-- olhos brancos (vibe symbiote — inversão de cor) -->
  <ellipse cx="17" cy="63" rx="1.2" ry="2" fill="#0a0a0a"/>
  <ellipse cx="23" cy="63" rx="1.2" ry="2" fill="#0a0a0a"/>
</svg>`;

/** Pequena partícula brilhante (sparkle) — usada pra dar "vida" às teias */
const WEB_SPARKLE = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
  <circle cx="10" cy="10" r="2" fill="#fafafa"/>
  <circle cx="10" cy="10" r="5" fill="#fafafa" opacity="0.3"/>
  <line x1="10" y1="2" x2="10" y2="18" stroke="#fafafa" stroke-width="0.5" opacity="0.6"/>
  <line x1="2" y1="10" x2="18" y2="10" stroke="#fafafa" stroke-width="0.5" opacity="0.6"/>
</svg>`;

/** Símbolo da aranha branca grande — usado como focal central */
const BIG_WHITE_SPIDER = `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo -->
  <ellipse cx="100" cy="80" rx="22" ry="34" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5"/>
  <ellipse cx="100" cy="64" rx="14" ry="18" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- 8 pernas longas estilizadas (vibe simbionte) -->
  <g fill="#fafafa" stroke="#0a0a0a" stroke-width="1">
    <path d="M82 50 Q40 20 8 30 Q40 35 80 60 Z"/>
    <path d="M82 70 Q30 60 0 78 Q40 80 82 80 Z"/>
    <path d="M82 90 Q30 100 4 130 Q40 110 80 100 Z"/>
    <path d="M85 110 Q50 130 28 160 Q60 138 90 116 Z"/>
    <path d="M118 50 Q160 20 192 30 Q160 35 120 60 Z"/>
    <path d="M118 70 Q170 60 200 78 Q160 80 118 80 Z"/>
    <path d="M118 90 Q170 100 196 130 Q160 110 120 100 Z"/>
    <path d="M115 110 Q150 130 172 160 Q140 138 110 116 Z"/>
  </g>
</svg>`;

/* ============== TONY ECOM — Homem-Aranha Black (Simbionte) ============== */

/** Máscara do Homem-Aranha Black — olhos brancos, simbionte */
const SPIDERMAN_BLACK_MASK = `<svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg">
  <!-- contorno do rosto -->
  <ellipse cx="50" cy="55" rx="36" ry="42" fill="#0a0a0a" stroke="#1a1a1a" stroke-width="1.5"/>
  <!-- teias finíssimas decorando -->
  <g stroke="#1f1f1f" stroke-width="0.5" fill="none" opacity="0.8">
    <line x1="14" y1="30" x2="86" y2="30"/>
    <line x1="14" y1="42" x2="86" y2="42"/>
    <line x1="14" y1="56" x2="86" y2="56"/>
    <line x1="14" y1="70" x2="86" y2="70"/>
    <line x1="14" y1="82" x2="86" y2="82"/>
    <line x1="50" y1="14" x2="50" y2="96"/>
    <line x1="30" y1="18" x2="30" y2="92"/>
    <line x1="70" y1="18" x2="70" y2="92"/>
    <path d="M30 30 Q50 26 70 30"/>
    <path d="M30 42 Q50 38 70 42"/>
    <path d="M30 56 Q50 52 70 56"/>
    <path d="M30 70 Q50 66 70 70"/>
    <path d="M30 82 Q50 78 70 82"/>
  </g>
  <!-- olho esquerdo (icônico em forma de gota) -->
  <path d="M16 38 L36 36 L42 50 L36 60 L18 56 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/>
  <path d="M22 42 L34 40 L38 50 L32 56 L22 52 Z" fill="#e5e5e5"/>
  <!-- olho direito -->
  <path d="M84 38 L64 36 L58 50 L64 60 L82 56 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/>
  <path d="M78 42 L66 40 L62 50 L68 56 L78 52 Z" fill="#e5e5e5"/>
</svg>`;

/** Símbolo da aranha branca peitoral (suit black) — versão maior, marcante */
const WHITE_SPIDER_LOGO = `<svg viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo da aranha -->
  <ellipse cx="50" cy="40" rx="14" ry="20" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5"/>
  <ellipse cx="50" cy="30" rx="9" ry="11" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- pernas (8 — formato icônico do logo) -->
  <g fill="#fafafa" stroke="#0a0a0a" stroke-width="1.2">
    <!-- esquerdas -->
    <path d="M40 24 Q22 12 8 18 Q24 22 38 30 Z"/>
    <path d="M38 34 Q18 28 4 36 Q22 38 38 40 Z"/>
    <path d="M38 44 Q18 46 6 56 Q22 52 40 50 Z"/>
    <path d="M42 54 Q26 62 18 78 Q32 68 46 60 Z"/>
    <!-- direitas -->
    <path d="M60 24 Q78 12 92 18 Q76 22 62 30 Z"/>
    <path d="M62 34 Q82 28 96 36 Q78 38 62 40 Z"/>
    <path d="M62 44 Q82 46 94 56 Q78 52 60 50 Z"/>
    <path d="M58 54 Q74 62 82 78 Q68 68 54 60 Z"/>
  </g>
</svg>`;

/** Teia de aranha completa (cantos do dashboard) */
const SPIDER_WEB = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#fafafa" stroke-width="1" fill="none">
    <!-- raios da teia -->
    <line x1="0" y1="0" x2="120" y2="120"/>
    <line x1="0" y1="120" x2="120" y2="0"/>
    <line x1="60" y1="0" x2="60" y2="120"/>
    <line x1="0" y1="60" x2="120" y2="60"/>
    <line x1="0" y1="30" x2="120" y2="90"/>
    <line x1="0" y1="90" x2="120" y2="30"/>
    <line x1="30" y1="0" x2="90" y2="120"/>
    <line x1="90" y1="0" x2="30" y2="120"/>
    <!-- círculos concêntricos da teia -->
    <circle cx="60" cy="60" r="15"/>
    <circle cx="60" cy="60" r="32"/>
    <circle cx="60" cy="60" r="50"/>
    <circle cx="60" cy="60" r="68"/>
  </g>
</svg>`;

/** Tendril/tentáculo do simbionte (orgânico, sombras) */
const SYMBIOTE_TENDRIL = `<svg viewBox="0 0 80 200" xmlns="http://www.w3.org/2000/svg">
  <path d="M40 0 Q30 30 38 60 Q50 90 30 120 Q14 150 26 180 Q34 195 40 200 Q46 195 50 180 Q44 150 56 120 Q70 90 56 60 Q48 30 56 0 Z" fill="#0a0a0a" stroke="#262626" stroke-width="1.5"/>
  <path d="M40 20 Q34 40 38 60 Q44 80 36 100 Q26 130 32 160 Q38 180 40 195" stroke="#525252" stroke-width="0.8" fill="none"/>
  <!-- gotinhas saindo -->
  <circle cx="20" cy="80" r="3" fill="#0a0a0a" stroke="#262626"/>
  <circle cx="62" cy="110" r="2.5" fill="#0a0a0a" stroke="#262626"/>
  <circle cx="14" cy="160" r="2" fill="#0a0a0a" stroke="#262626"/>
</svg>`;

/** Carrinho de compras (Ecom hint) — minimalista preto */
const SHOPPING_CART_BLACK = `<svg viewBox="0 0 70 50" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 8 L14 8 L20 36 L60 36 L66 16 L24 16" stroke="#fafafa" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="26" cy="46" r="4" fill="#fafafa"/>
  <circle cx="56" cy="46" r="4" fill="#fafafa"/>
</svg>`;

/** $ branco dentro de teia */
const DOLLAR_WEB = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
  <circle cx="30" cy="30" r="26" fill="#0a0a0a" stroke="#fafafa" stroke-width="1.5"/>
  <g stroke="#525252" stroke-width="0.6" fill="none" opacity="0.7">
    <line x1="4" y1="30" x2="56" y2="30"/>
    <line x1="30" y1="4" x2="30" y2="56"/>
    <line x1="10" y1="10" x2="50" y2="50"/>
    <line x1="50" y1="10" x2="10" y2="50"/>
  </g>
  <text x="30" y="40" font-family="Georgia, serif" font-weight="900" font-size="32" fill="#fafafa" text-anchor="middle">$</text>
</svg>`;

/* ============== TWS — Esmeralda + ouro + luxo ============== */

/** Maço de dólares enrolado com elástico vermelho */
const DOLLAR_STACK = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <!-- maço de notas (layers) -->
  <rect x="4" y="14" width="112" height="60" rx="4" fill="#15803d" stroke="#052e16" stroke-width="1.5"/>
  <rect x="6" y="12" width="112" height="60" rx="4" fill="#16a34a" stroke="#052e16" stroke-width="1.5"/>
  <rect x="8" y="10" width="112" height="60" rx="4" fill="#22c55e" stroke="#052e16" stroke-width="1.5"/>
  <rect x="10" y="8" width="108" height="60" rx="3" fill="#15803d" stroke="#052e16" stroke-width="1.5"/>
  <!-- nota de cima -->
  <rect x="14" y="12" width="100" height="52" rx="2" fill="none" stroke="#bbf7d0" stroke-width="1"/>
  <circle cx="64" cy="38" r="14" fill="#166534" stroke="#bbf7d0" stroke-width="1.2"/>
  <text x="64" y="44" font-family="serif" font-weight="900" font-size="16" fill="#fef3c7" text-anchor="middle">100</text>
  <!-- elástico vermelho -->
  <rect x="56" y="4" width="20" height="76" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5" opacity="0.85"/>
</svg>`;

/** Lingote de ouro (alto detalhe) */
const GOLD_BAR = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 44 L20 8 L80 8 L94 44 Z" fill="#fbbf24" stroke="#78350f" stroke-width="2"/>
  <path d="M20 8 L80 8 L74 18 L26 18 Z" fill="#fef3c7" opacity="0.7"/>
  <path d="M14 38 L86 38" stroke="#78350f" stroke-width="1.5" opacity="0.5"/>
  <text x="50" y="32" font-family="serif" font-weight="900" font-size="9" fill="#78350f" text-anchor="middle">1 KG · 999.9 AU</text>
</svg>`;

/** Diamante esmeralda cut (TWS = wealth) */
const EMERALD_DIAMOND = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 14 L46 14 L54 28 L30 64 L6 28 Z" fill="#10b981" stroke="#064e3b" stroke-width="2"/>
  <path d="M14 14 L46 14 L40 28 L20 28 Z" fill="#6ee7b7" opacity="0.8"/>
  <path d="M14 14 L20 28 L30 64 L6 28 Z" fill="#047857" opacity="0.6"/>
  <path d="M46 14 L40 28 L30 64 L54 28 Z" fill="#34d399" opacity="0.5"/>
  <line x1="20" y1="28" x2="40" y2="28" stroke="#064e3b" stroke-width="1"/>
  <line x1="20" y1="28" x2="30" y2="64" stroke="#064e3b" stroke-width="1"/>
  <line x1="40" y1="28" x2="30" y2="64" stroke="#064e3b" stroke-width="1"/>
</svg>`;

/** Relógio de luxo (cara, dourado) */
const LUXURY_WATCH = `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
  <!-- pulseira -->
  <rect x="28" y="0" width="24" height="22" fill="#fbbf24" stroke="#78350f" stroke-width="1.5"/>
  <rect x="28" y="78" width="24" height="22" fill="#fbbf24" stroke="#78350f" stroke-width="1.5"/>
  <!-- mostrador -->
  <circle cx="40" cy="50" r="26" fill="#fbbf24" stroke="#78350f" stroke-width="2.5"/>
  <circle cx="40" cy="50" r="20" fill="#0a0a0a" stroke="#78350f" stroke-width="1.5"/>
  <!-- ponteiros -->
  <line x1="40" y1="50" x2="40" y2="36" stroke="#fbbf24" stroke-width="2"/>
  <line x1="40" y1="50" x2="50" y2="56" stroke="#fbbf24" stroke-width="1.5"/>
  <circle cx="40" cy="50" r="2" fill="#fbbf24"/>
  <!-- marcadores -->
  <g fill="#fbbf24">
    <rect x="39" y="32" width="2" height="3"/>
    <rect x="39" y="65" width="2" height="3"/>
    <rect x="55" y="49" width="3" height="2"/>
    <rect x="22" y="49" width="3" height="2"/>
  </g>
</svg>`;

/** Maleta com $ */
const MONEY_BRIEFCASE = `<svg viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="22" width="84" height="46" rx="3" fill="#451a03" stroke="#1c0a01" stroke-width="2"/>
  <rect x="8" y="22" width="84" height="8" fill="#92400e"/>
  <rect x="38" y="14" width="24" height="10" fill="#92400e" stroke="#1c0a01" stroke-width="1.5"/>
  <rect x="44" y="36" width="12" height="20" fill="#fbbf24" stroke="#78350f" stroke-width="1"/>
  <text x="50" y="50" font-family="serif" font-weight="900" font-size="14" fill="#78350f" text-anchor="middle">$</text>
  <!-- locks -->
  <rect x="22" y="42" width="4" height="6" fill="#fbbf24"/>
  <rect x="74" y="42" width="4" height="6" fill="#fbbf24"/>
</svg>`;

/** Taça de champanhe */
const CHAMPAGNE_GLASS = `<svg viewBox="0 0 40 80" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 4 L34 4 Q32 24 20 32 Q8 24 6 4 Z" fill="#fbbf24" opacity="0.4" stroke="#78350f" stroke-width="1.5"/>
  <path d="M6 4 L34 4 Q33 14 20 18 Q7 14 6 4 Z" fill="#fef3c7" opacity="0.7"/>
  <!-- bolhas -->
  <circle cx="14" cy="14" r="1.2" fill="#fef3c7"/>
  <circle cx="20" cy="10" r="0.8" fill="#fef3c7"/>
  <circle cx="25" cy="15" r="1" fill="#fef3c7"/>
  <circle cx="17" cy="20" r="0.8" fill="#fef3c7"/>
  <!-- haste -->
  <rect x="19" y="32" width="2" height="38" fill="#78350f"/>
  <!-- base -->
  <ellipse cx="20" cy="72" rx="12" ry="2" fill="#78350f"/>
</svg>`;

/** Coroa dourada */
const GOLD_CROWN = `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 50 L10 14 L26 32 L40 6 L54 32 L70 14 L74 50 Z" fill="#fbbf24" stroke="#78350f" stroke-width="2"/>
  <rect x="6" y="50" width="68" height="6" fill="#92400e" stroke="#78350f" stroke-width="1.5"/>
  <circle cx="10" cy="14" r="3" fill="#dc2626" stroke="#7f1d1d" stroke-width="1"/>
  <circle cx="40" cy="6" r="3" fill="#10b981" stroke="#064e3b" stroke-width="1"/>
  <circle cx="70" cy="14" r="3" fill="#3b82f6" stroke="#1e3a8a" stroke-width="1"/>
  <circle cx="26" cy="32" r="2" fill="#fef3c7"/>
  <circle cx="54" cy="32" r="2" fill="#fef3c7"/>
</svg>`;

/* ============== BLAME — Monster Ultra White ============== */

/** Lata Monster Branca (Zero/Ultra) — branca com M azul */
const MONSTER_WHITE_CAN = `<svg viewBox="0 0 60 110" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo branco -->
  <rect x="8" y="10" width="44" height="92" rx="4" fill="#fafafa" stroke="#94a3b8" stroke-width="1.5"/>
  <!-- topo metálico -->
  <rect x="8" y="10" width="44" height="6" fill="#cbd5e1"/>
  <rect x="22" y="6" width="16" height="4" fill="#94a3b8"/>
  <!-- M claws (3 garras azuis) -->
  <g fill="#3b82f6" stroke="#1e3a8a" stroke-width="0.8">
    <path d="M14 30 L18 50 L20 30 L24 52 L26 30 Z"/>
    <path d="M26 30 L30 52 L32 30 L36 50 L38 30 Z" transform="translate(2 0)"/>
    <path d="M40 30 L44 52 L46 30 L50 50 L52 30 Z" transform="translate(-4 0)"/>
  </g>
  <!-- ZERO / ULTRA label -->
  <text x="30" y="76" font-family="Arial Black" font-weight="900" font-size="9" fill="#3b82f6" text-anchor="middle">ULTRA</text>
  <text x="30" y="90" font-family="Arial Black" font-weight="900" font-size="7" fill="#3b82f6" text-anchor="middle">ENERGY</text>
  <!-- linhas decorativas -->
  <line x1="10" y1="60" x2="50" y2="60" stroke="#bfdbfe" stroke-width="0.8"/>
  <line x1="10" y1="96" x2="50" y2="96" stroke="#bfdbfe" stroke-width="0.8"/>
</svg>`;

/** Garra "M" do Monster — só as 3 listras (icônico) */
const MONSTER_CLAW_BLUE = `<svg viewBox="0 0 80 50" xmlns="http://www.w3.org/2000/svg">
  <g fill="#3b82f6" stroke="#1e3a8a" stroke-width="1.2">
    <path d="M6 6 L12 44 L18 6 L24 44 L30 6 Z"/>
    <path d="M28 6 L34 44 L40 6 L46 44 L52 6 Z"/>
    <path d="M50 6 L56 44 L62 6 L68 44 L74 6 Z"/>
  </g>
</svg>`;

/** Cubo de gelo (frosted) */
const ICE_CUBE = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="6" width="38" height="38" rx="6" fill="#bfdbfe" stroke="#1e3a8a" stroke-width="1.5" opacity="0.85"/>
  <rect x="10" y="10" width="14" height="14" rx="2" fill="#fafafa" opacity="0.5"/>
  <line x1="10" y1="20" x2="40" y2="20" stroke="#fafafa" opacity="0.4"/>
  <line x1="20" y1="10" x2="20" y2="40" stroke="#fafafa" opacity="0.4"/>
</svg>`;

/** Raio azul (energia) */
const LIGHTNING_BLUE = `<svg viewBox="0 0 40 70" xmlns="http://www.w3.org/2000/svg">
  <path d="M24 4 L8 38 L20 38 L16 66 L34 28 L22 28 Z" fill="#3b82f6" stroke="#1e3a8a" stroke-width="1.5"/>
  <path d="M22 12 L14 36 L20 36 L18 60 L30 32 L24 32 Z" fill="#93c5fd" opacity="0.7"/>
</svg>`;

/** Snowflake (cold/frost) */
const SNOWFLAKE_BLUE = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#3b82f6" stroke-width="2" stroke-linecap="round" fill="none">
    <line x1="25" y1="4" x2="25" y2="46"/>
    <line x1="4" y1="25" x2="46" y2="25"/>
    <line x1="10" y1="10" x2="40" y2="40"/>
    <line x1="40" y1="10" x2="10" y2="40"/>
    <!-- decoração nas pontas -->
    <path d="M20 8 L25 4 L30 8"/>
    <path d="M20 42 L25 46 L30 42"/>
    <path d="M8 20 L4 25 L8 30"/>
    <path d="M42 20 L46 25 L42 30"/>
  </g>
  <circle cx="25" cy="25" r="3" fill="#3b82f6"/>
</svg>`;

/** Gota d'agua / hidratação */
const WATER_DROP = `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 4 Q4 30 8 44 Q12 56 20 56 Q28 56 32 44 Q36 30 20 4 Z" fill="#bfdbfe" stroke="#1e3a8a" stroke-width="1.5"/>
  <path d="M14 36 Q14 44 18 46" stroke="#fafafa" stroke-width="2" fill="none" opacity="0.8"/>
</svg>`;

/* ============== TILTADO ZAMPIERRE — modo tilt total ============== */

/** Cara MUITO brava (😡) — vermelha, sobrancelhas pesadas, dentes cerrados */
const ANGRY_RED_FACE = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="rage1" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#fca5a5"/>
      <stop offset="60%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#7f1d1d"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="52" r="44" fill="url(#rage1)" stroke="#450a0a" stroke-width="2.5"/>
  <!-- veias na testa -->
  <path d="M30 22 Q34 26 32 32 Q36 30 38 26" fill="none" stroke="#7f1d1d" stroke-width="2" stroke-linecap="round"/>
  <path d="M68 22 Q72 28 70 34" fill="none" stroke="#7f1d1d" stroke-width="2" stroke-linecap="round"/>
  <!-- sobrancelhas grossas em V -->
  <path d="M20 40 L46 50 L40 44 Z" fill="#1a1a1a"/>
  <path d="M80 40 L54 50 L60 44 Z" fill="#1a1a1a"/>
  <!-- olhos brancos pequenos furiosos -->
  <ellipse cx="36" cy="56" rx="6" ry="4" fill="#fafafa"/>
  <ellipse cx="64" cy="56" rx="6" ry="4" fill="#fafafa"/>
  <circle cx="36" cy="57" r="2.2" fill="#0a0a0a"/>
  <circle cx="64" cy="57" r="2.2" fill="#0a0a0a"/>
  <!-- boca com dentes cerrados -->
  <path d="M30 76 Q50 70 70 76 L70 82 L30 82 Z" fill="#1a0202" stroke="#450a0a" stroke-width="1.5"/>
  <line x1="36" y1="76" x2="36" y2="82" stroke="#fafafa" stroke-width="1.2"/>
  <line x1="44" y1="76" x2="44" y2="82" stroke="#fafafa" stroke-width="1.2"/>
  <line x1="52" y1="76" x2="52" y2="82" stroke="#fafafa" stroke-width="1.2"/>
  <line x1="60" y1="76" x2="60" y2="82" stroke="#fafafa" stroke-width="1.2"/>
</svg>`;

/** Cara xingando 🤬 — quadradinho preto com #@$!% na boca */
const CURSING_FACE = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="rage2" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#fb923c"/>
      <stop offset="60%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#7f1d1d"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="52" r="44" fill="url(#rage2)" stroke="#450a0a" stroke-width="2.5"/>
  <!-- sobrancelhas grossas -->
  <path d="M18 38 L46 48 L42 42 Z" fill="#1a1a1a"/>
  <path d="M82 38 L54 48 L58 42 Z" fill="#1a1a1a"/>
  <!-- olhos -->
  <ellipse cx="36" cy="56" rx="5.5" ry="4" fill="#fafafa"/>
  <ellipse cx="64" cy="56" rx="5.5" ry="4" fill="#fafafa"/>
  <circle cx="36" cy="57" r="2" fill="#0a0a0a"/>
  <circle cx="64" cy="57" r="2" fill="#0a0a0a"/>
  <!-- censura preta sobre a boca -->
  <rect x="22" y="68" width="56" height="16" rx="3" fill="#0a0a0a" stroke="#450a0a" stroke-width="1"/>
  <!-- símbolos de xingamento -->
  <text x="29" y="80" font-family="sans-serif" font-weight="900" font-size="13" fill="#facc15">#</text>
  <text x="40" y="80" font-family="sans-serif" font-weight="900" font-size="13" fill="#fafafa">@</text>
  <text x="52" y="80" font-family="sans-serif" font-weight="900" font-size="13" fill="#facc15">$</text>
  <text x="62" y="80" font-family="sans-serif" font-weight="900" font-size="13" fill="#fafafa">!</text>
  <text x="68" y="80" font-family="sans-serif" font-weight="900" font-size="13" fill="#facc15">%</text>
</svg>`;

/** Cara berrando 😤 (vapor saindo) */
const STEAM_FACE = `<svg viewBox="0 0 130 110" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="rage3" cx="50%" cy="60%" r="60%">
      <stop offset="0%" stop-color="#fda4af"/>
      <stop offset="60%" stop-color="#e11d48"/>
      <stop offset="100%" stop-color="#7f1d1d"/>
    </radialGradient>
  </defs>
  <!-- nuvens de vapor saindo do nariz -->
  <ellipse cx="36" cy="22" rx="14" ry="10" fill="#e2e8f0" opacity="0.85"/>
  <ellipse cx="46" cy="14" rx="10" ry="7" fill="#cbd5e1" opacity="0.7"/>
  <ellipse cx="94" cy="22" rx="14" ry="10" fill="#e2e8f0" opacity="0.85"/>
  <ellipse cx="84" cy="14" rx="10" ry="7" fill="#cbd5e1" opacity="0.7"/>
  <!-- cabeça -->
  <circle cx="65" cy="65" r="40" fill="url(#rage3)" stroke="#450a0a" stroke-width="2.5"/>
  <!-- sobrancelhas em V agressivo -->
  <path d="M35 56 L60 64 L56 58 Z" fill="#1a1a1a"/>
  <path d="M95 56 L70 64 L74 58 Z" fill="#1a1a1a"/>
  <!-- olhos cerrados furiosos -->
  <path d="M40 64 Q47 67 52 64" stroke="#0a0a0a" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M78 64 Q85 67 90 64" stroke="#0a0a0a" stroke-width="3" fill="none" stroke-linecap="round"/>
  <!-- narinas pretas (vapor) -->
  <ellipse cx="55" cy="72" rx="3" ry="2" fill="#0a0a0a"/>
  <ellipse cx="75" cy="72" rx="3" ry="2" fill="#0a0a0a"/>
  <!-- boca virada pra baixo, dura -->
  <path d="M48 88 Q65 82 82 88" stroke="#0a0a0a" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

/** Caveira berrando 💀 (rage mode) */
const RAGE_SKULL = `<svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="skullglow" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#fca5a5"/>
      <stop offset="100%" stop-color="#7f1d1d"/>
    </radialGradient>
  </defs>
  <!-- aura vermelha -->
  <circle cx="50" cy="50" r="48" fill="url(#skullglow)" opacity="0.4"/>
  <!-- crânio -->
  <path d="M50 8 C25 8 14 28 14 50 C14 64 20 72 26 78 L26 92 L38 92 L38 84 L46 84 L46 92 L54 92 L54 84 L62 84 L62 92 L74 92 L74 78 C80 72 86 64 86 50 C86 28 75 8 50 8 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/>
  <!-- olhos brilhando vermelho -->
  <ellipse cx="36" cy="48" rx="9" ry="11" fill="#dc2626"/>
  <ellipse cx="64" cy="48" rx="9" ry="11" fill="#dc2626"/>
  <circle cx="36" cy="48" r="3" fill="#fef3c7"/>
  <circle cx="64" cy="48" r="3" fill="#fef3c7"/>
  <!-- nariz triangular -->
  <path d="M50 60 L45 70 L55 70 Z" fill="#0a0a0a"/>
  <!-- dentes -->
  <rect x="32" y="72" width="36" height="10" fill="#fafafa" stroke="#0a0a0a" stroke-width="1"/>
  <line x1="38" y1="72" x2="38" y2="82" stroke="#0a0a0a" stroke-width="1"/>
  <line x1="44" y1="72" x2="44" y2="82" stroke="#0a0a0a" stroke-width="1"/>
  <line x1="50" y1="72" x2="50" y2="82" stroke="#0a0a0a" stroke-width="1"/>
  <line x1="56" y1="72" x2="56" y2="82" stroke="#0a0a0a" stroke-width="1"/>
  <line x1="62" y1="72" x2="62" y2="82" stroke="#0a0a0a" stroke-width="1"/>
</svg>`;

/** Símbolos de xingamento avulsos #@$!% */
const CURSE_CLOUD = `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">
  <text x="6" y="38" font-family="sans-serif" font-weight="900" font-size="36" fill="#facc15" stroke="#7f1d1d" stroke-width="1">#</text>
  <text x="30" y="44" font-family="sans-serif" font-weight="900" font-size="34" fill="#fafafa" stroke="#7f1d1d" stroke-width="1">@</text>
  <text x="56" y="40" font-family="sans-serif" font-weight="900" font-size="34" fill="#dc2626" stroke="#450a0a" stroke-width="1">$</text>
  <text x="78" y="42" font-family="sans-serif" font-weight="900" font-size="36" fill="#facc15" stroke="#7f1d1d" stroke-width="1">!</text>
  <text x="90" y="40" font-family="sans-serif" font-weight="900" font-size="34" fill="#fafafa" stroke="#7f1d1d" stroke-width="1">%</text>
</svg>`;

/** Teclado quebrado (gamer tiltado) */
const BROKEN_KEYBOARD = `<svg viewBox="0 0 160 60" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo do teclado partido em dois pedaços -->
  <path d="M2 14 L70 14 L66 50 L6 50 Z" fill="#1f1f1f" stroke="#0a0a0a" stroke-width="1.5"/>
  <path d="M78 16 L158 14 L155 50 L82 50 Z" fill="#1f1f1f" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- linha de rachadura -->
  <path d="M72 12 L76 52" stroke="#dc2626" stroke-width="2.5"/>
  <!-- teclas avulsas espalhadas -->
  <rect x="14" y="20" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="26" y="20" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="38" y="20" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="50" y="22" width="8" height="8" rx="1.5" fill="#3a3a3a" transform="rotate(15 54 26)"/>
  <rect x="18" y="34" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="32" y="36" width="8" height="8" rx="1.5" fill="#3a3a3a" transform="rotate(-12 36 40)"/>
  <rect x="46" y="36" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="92" y="22" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="104" y="22" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="116" y="22" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="128" y="22" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="140" y="22" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="96" y="34" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="108" y="36" width="8" height="8" rx="1.5" fill="#3a3a3a" transform="rotate(10 112 40)"/>
  <rect x="122" y="34" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <rect x="134" y="36" width="8" height="8" rx="1.5" fill="#3a3a3a"/>
  <!-- teclas voando longe -->
  <rect x="60" y="4" width="8" height="8" rx="1.5" fill="#3a3a3a" transform="rotate(30 64 8)"/>
  <rect x="84" y="2" width="8" height="8" rx="1.5" fill="#3a3a3a" transform="rotate(-25 88 6)"/>
</svg>`;

/** Controle de videogame partido */
const SMASHED_CONTROLLER = `<svg viewBox="0 0 140 80" xmlns="http://www.w3.org/2000/svg">
  <!-- metade esquerda -->
  <path d="M8 30 Q4 50 16 64 Q30 72 50 68 L62 60 L56 30 Q44 24 28 24 Q12 24 8 30 Z" fill="#1f1f1f" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- metade direita -->
  <path d="M132 30 Q136 50 124 64 Q110 72 90 68 L78 60 L84 30 Q96 24 112 24 Q128 24 132 30 Z" fill="#1f1f1f" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- rachadura -->
  <path d="M58 18 L72 76 L86 18" stroke="#dc2626" stroke-width="2.5" fill="none"/>
  <!-- botões -->
  <circle cx="105" cy="38" r="3.5" fill="#facc15"/>
  <circle cx="115" cy="46" r="3.5" fill="#dc2626"/>
  <circle cx="95" cy="46" r="3.5" fill="#3b82f6"/>
  <circle cx="105" cy="54" r="3.5" fill="#22c55e"/>
  <!-- d-pad -->
  <rect x="22" y="40" width="14" height="4" fill="#0a0a0a"/>
  <rect x="27" y="35" width="4" height="14" fill="#0a0a0a"/>
  <!-- analógicos -->
  <circle cx="42" cy="58" r="6" fill="#0a0a0a" stroke="#3a3a3a" stroke-width="1.5"/>
  <circle cx="92" cy="58" r="6" fill="#0a0a0a" stroke="#3a3a3a" stroke-width="1.5"/>
</svg>`;

/** Raio vermelho de raiva */
const RAGE_BOLT = `<svg viewBox="0 0 40 90" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="boltgrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="50%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#7f1d1d"/>
    </linearGradient>
  </defs>
  <path d="M22 2 L6 46 L18 46 L10 88 L36 38 L22 38 L30 2 Z" fill="url(#boltgrad)" stroke="#450a0a" stroke-width="1.5"/>
</svg>`;

/** Chama de fogo (laranja+vermelha) */
const RAGE_FLAME = `<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="flamegrad" cx="50%" cy="80%" r="60%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="40%" stop-color="#fbbf24"/>
      <stop offset="80%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#7f1d1d"/>
    </radialGradient>
  </defs>
  <!-- chama externa -->
  <path d="M30 4 Q44 26 50 46 Q56 66 44 80 Q36 86 30 84 Q24 86 16 80 Q4 66 10 46 Q16 26 30 4 Z" fill="url(#flamegrad)" stroke="#7f1d1d" stroke-width="1.2"/>
  <!-- chama interna -->
  <path d="M30 24 Q38 40 40 56 Q42 70 36 76 Q30 80 24 76 Q18 70 20 56 Q22 40 30 24 Z" fill="#fef08a" opacity="0.85"/>
</svg>`;

/** Coração partido (de raiva) */
const BROKEN_RAGE_HEART = `<svg viewBox="0 0 80 70" xmlns="http://www.w3.org/2000/svg">
  <!-- metade esquerda -->
  <path d="M40 18 Q30 4 16 8 Q4 14 8 28 Q14 44 38 62 Z" fill="#dc2626" stroke="#450a0a" stroke-width="1.5"/>
  <!-- metade direita (afastada) -->
  <path d="M42 16 Q52 2 66 6 Q78 12 74 26 Q68 42 44 60 Z" fill="#b91c1c" stroke="#450a0a" stroke-width="1.5"/>
  <!-- linha de quebra -->
  <path d="M38 64 L40 56 L34 48 L42 38 L36 28 L42 20 L40 16" stroke="#0a0a0a" stroke-width="1.5" fill="none"/>
</svg>`;

/** Mouse gamer quebrado */
const SMASHED_MOUSE = `<svg viewBox="0 0 70 100" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo do mouse -->
  <path d="M10 30 Q10 10 35 8 Q60 10 60 30 L58 78 Q56 92 35 92 Q14 92 12 78 Z" fill="#1f1f1f" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- rachadura central -->
  <path d="M35 8 L32 30 L38 50 L33 72 L36 92" stroke="#dc2626" stroke-width="2.5" fill="none"/>
  <!-- scroll wheel quebrada -->
  <rect x="32" y="22" width="6" height="14" rx="2" fill="#0a0a0a" stroke="#dc2626" stroke-width="1"/>
  <!-- LED RGB rachado -->
  <circle cx="35" cy="60" r="4" fill="#dc2626" opacity="0.6"/>
  <circle cx="35" cy="60" r="2" fill="#fef3c7"/>
</svg>`;

/* ============== KAUE ESCALUDO — tudo azul + Audi + cash ============== */

/** Nota de US$100 azul (versão Kaue) */
const BLUE_BILL = `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="116" height="56" rx="3" fill="#1e3a8a" stroke="#0c1d4a" stroke-width="1.5"/>
  <rect x="6" y="6" width="108" height="48" rx="2" fill="none" stroke="#bfdbfe" stroke-width="0.8"/>
  <circle cx="60" cy="30" r="18" fill="#1e40af" stroke="#bfdbfe" stroke-width="1.5"/>
  <text x="60" y="38" font-family="serif" font-weight="900" font-size="24" fill="#dbeafe" text-anchor="middle">100</text>
  <text x="14" y="18" font-family="serif" font-weight="900" font-size="10" fill="#dbeafe">$</text>
  <text x="106" y="50" font-family="serif" font-weight="900" font-size="10" fill="#dbeafe" text-anchor="end">$</text>
</svg>`;

/** Audi rings AZUL grande (icônico) */
const AUDI_RINGS_BLUE = `<svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="#3b82f6" stroke-width="4">
    <circle cx="28" cy="30" r="24"/>
    <circle cx="74" cy="30" r="24"/>
    <circle cx="120" cy="30" r="24"/>
    <circle cx="166" cy="30" r="24"/>
  </g>
  <g fill="none" stroke="#dbeafe" stroke-width="1.5" opacity="0.6">
    <circle cx="28" cy="30" r="24"/>
    <circle cx="74" cy="30" r="24"/>
    <circle cx="120" cy="30" r="24"/>
    <circle cx="166" cy="30" r="24"/>
  </g>
</svg>`;

/** Audi RS (carro azul lateral) */
const AUDI_CAR_BLUE = `<svg viewBox="0 0 160 60" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo do carro -->
  <path d="M10 40 L20 28 Q40 18 70 16 Q100 14 120 22 L145 28 Q155 32 155 42 L155 46 L10 46 Z" fill="#1d4ed8" stroke="#0c1d4a" stroke-width="1.5"/>
  <!-- vidros -->
  <path d="M40 28 Q55 22 75 21 L95 22 L110 28 L100 28 L60 28 Z" fill="#bfdbfe" opacity="0.65"/>
  <!-- linha lateral -->
  <line x1="22" y1="38" x2="148" y2="38" stroke="#3b82f6" stroke-width="0.8"/>
  <!-- rodas -->
  <circle cx="38" cy="46" r="9" fill="#0a0a0a"/>
  <circle cx="38" cy="46" r="4" fill="#94a3b8"/>
  <circle cx="122" cy="46" r="9" fill="#0a0a0a"/>
  <circle cx="122" cy="46" r="4" fill="#94a3b8"/>
  <!-- 4 anéis na frente -->
  <g fill="none" stroke="#dbeafe" stroke-width="1">
    <circle cx="14" cy="34" r="2"/>
    <circle cx="18" cy="34" r="2"/>
    <circle cx="22" cy="34" r="2"/>
    <circle cx="26" cy="34" r="2"/>
  </g>
</svg>`;

/** Diamante azul */
const BLUE_DIAMOND = `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 18 L25 4 L42 18 L25 56 Z" fill="#3b82f6" stroke="#1e3a8a" stroke-width="1.5"/>
  <path d="M8 18 L42 18" stroke="#1e3a8a" stroke-width="1"/>
  <path d="M25 4 L25 18" stroke="#1e3a8a" stroke-width="0.8"/>
  <path d="M16 18 L25 56" stroke="#1e3a8a" stroke-width="0.8"/>
  <path d="M34 18 L25 56" stroke="#1e3a8a" stroke-width="0.8"/>
  <!-- brilho -->
  <path d="M14 12 L20 10" stroke="#bfdbfe" stroke-width="2" opacity="0.8"/>
</svg>`;

/** Cifrão $ grande azul */
const BLUE_DOLLAR = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
  <text x="30" y="64" font-family="serif" font-weight="900" font-size="74" fill="#3b82f6" stroke="#1e3a8a" stroke-width="2" text-anchor="middle">$</text>
</svg>`;

/* ============== JAPA LUCA — bandeira Japão + Fielder ============== */

/** Bandeira do Japão (Hinomaru) */
const JAPAN_FLAG = `<svg viewBox="0 0 90 60" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="90" height="60" fill="#fafafa" stroke="#0a0a0a" stroke-width="1"/>
  <circle cx="45" cy="30" r="18" fill="#dc2626"/>
</svg>`;

/** Bandeira ondulada (para variação) */
const JAPAN_FLAG_WAVY = `<svg viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="wavyflag" patternUnits="userSpaceOnUse" width="100" height="70">
      <path d="M0 10 Q25 0 50 10 Q75 20 100 10 L100 60 Q75 70 50 60 Q25 50 0 60 Z" fill="#fafafa"/>
    </pattern>
  </defs>
  <path d="M0 10 Q25 0 50 10 Q75 20 100 10 L100 60 Q75 70 50 60 Q25 50 0 60 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="1"/>
  <ellipse cx="50" cy="35" rx="18" ry="16" fill="#dc2626"/>
</svg>`;

/** Toyota Corolla Fielder (perua) — lateral */
const FIELDER_WAGON = `<svg viewBox="0 0 180 70" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo (perua/wagon) -->
  <path d="M8 50 L12 36 Q20 28 36 26 L60 22 L130 22 Q150 24 162 32 L170 38 Q174 44 174 52 L174 56 L8 56 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- vidros (formato típico de perua, traseira reta) -->
  <path d="M40 26 L62 24 L62 36 L38 36 Z" fill="#94a3b8" opacity="0.7"/>
  <path d="M66 24 L92 24 L92 36 L66 36 Z" fill="#94a3b8" opacity="0.7"/>
  <path d="M96 24 L130 24 L138 36 L96 36 Z" fill="#94a3b8" opacity="0.7"/>
  <!-- pilar entre vidros -->
  <line x1="64" y1="24" x2="64" y2="36" stroke="#0a0a0a" stroke-width="1.5"/>
  <line x1="94" y1="24" x2="94" y2="36" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- portas -->
  <line x1="62" y1="36" x2="62" y2="56" stroke="#94a3b8" stroke-width="0.8"/>
  <line x1="94" y1="36" x2="94" y2="56" stroke="#94a3b8" stroke-width="0.8"/>
  <line x1="138" y1="36" x2="138" y2="56" stroke="#94a3b8" stroke-width="0.8"/>
  <!-- rodas -->
  <circle cx="40" cy="56" r="11" fill="#0a0a0a"/>
  <circle cx="40" cy="56" r="5" fill="#cbd5e1"/>
  <circle cx="40" cy="56" r="2.5" fill="#475569"/>
  <circle cx="142" cy="56" r="11" fill="#0a0a0a"/>
  <circle cx="142" cy="56" r="5" fill="#cbd5e1"/>
  <circle cx="142" cy="56" r="2.5" fill="#475569"/>
  <!-- farol traseiro -->
  <rect x="166" y="38" width="6" height="10" rx="1" fill="#dc2626"/>
  <!-- farol dianteiro -->
  <rect x="10" y="36" width="6" height="8" rx="1" fill="#fef3c7"/>
  <!-- logo Toyota (oval) -->
  <ellipse cx="90" cy="48" rx="10" ry="6" fill="none" stroke="#0a0a0a" stroke-width="1.5"/>
  <ellipse cx="90" cy="48" rx="4" ry="5" fill="none" stroke="#0a0a0a" stroke-width="1.2"/>
  <ellipse cx="90" cy="46" rx="6" ry="1.5" fill="none" stroke="#0a0a0a" stroke-width="1"/>
</svg>`;

/** Fielder em prata (variação) */
const FIELDER_SILVER = `<svg viewBox="0 0 180 70" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 50 L12 36 Q20 28 36 26 L60 22 L130 22 Q150 24 162 32 L170 38 Q174 44 174 52 L174 56 L8 56 Z" fill="#94a3b8" stroke="#0a0a0a" stroke-width="1.5"/>
  <path d="M40 26 L62 24 L62 36 L38 36 Z" fill="#0f172a" opacity="0.7"/>
  <path d="M66 24 L92 24 L92 36 L66 36 Z" fill="#0f172a" opacity="0.7"/>
  <path d="M96 24 L130 24 L138 36 L96 36 Z" fill="#0f172a" opacity="0.7"/>
  <line x1="64" y1="24" x2="64" y2="36" stroke="#0a0a0a" stroke-width="1.5"/>
  <line x1="94" y1="24" x2="94" y2="36" stroke="#0a0a0a" stroke-width="1.5"/>
  <circle cx="40" cy="56" r="11" fill="#0a0a0a"/>
  <circle cx="40" cy="56" r="5" fill="#e2e8f0"/>
  <circle cx="142" cy="56" r="11" fill="#0a0a0a"/>
  <circle cx="142" cy="56" r="5" fill="#e2e8f0"/>
  <ellipse cx="90" cy="48" rx="10" ry="6" fill="none" stroke="#0f172a" stroke-width="1.5"/>
  <ellipse cx="90" cy="48" rx="4" ry="5" fill="none" stroke="#0f172a" stroke-width="1.2"/>
  <ellipse cx="90" cy="46" rx="6" ry="1.5" fill="none" stroke="#0f172a" stroke-width="1"/>
</svg>`;

/** Logo Toyota isolado (oval cromado) */
const TOYOTA_LOGO = `<svg viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="50" cy="35" rx="44" ry="28" fill="none" stroke="#94a3b8" stroke-width="4"/>
  <ellipse cx="50" cy="35" rx="18" ry="24" fill="none" stroke="#94a3b8" stroke-width="4"/>
  <ellipse cx="50" cy="26" rx="28" ry="8" fill="none" stroke="#94a3b8" stroke-width="4"/>
</svg>`;

/** Flor de cerejeira (sakura) */
const SAKURA = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(30 30)">
    <ellipse cx="0" cy="-18" rx="8" ry="14" fill="#fce7f3" stroke="#ec4899" stroke-width="1.2"/>
    <ellipse cx="17" cy="-6" rx="8" ry="14" fill="#fce7f3" stroke="#ec4899" stroke-width="1.2" transform="rotate(72)"/>
    <ellipse cx="10" cy="15" rx="8" ry="14" fill="#fce7f3" stroke="#ec4899" stroke-width="1.2" transform="rotate(144)"/>
    <ellipse cx="-10" cy="15" rx="8" ry="14" fill="#fce7f3" stroke="#ec4899" stroke-width="1.2" transform="rotate(216)"/>
    <ellipse cx="-17" cy="-6" rx="8" ry="14" fill="#fce7f3" stroke="#ec4899" stroke-width="1.2" transform="rotate(288)"/>
    <circle r="4" fill="#facc15"/>
  </g>
</svg>`;

/* ============== DAVI.COPY — copy master, vendedor de elite ============== */

/** Notificação de PIX recebido (card de banco) — o som do dinheiro */
const PIX_NOTIFICATION = `<svg viewBox="0 0 240 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pixbg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#064e3b"/>
      <stop offset="100%" stop-color="#022c22"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="236" height="76" rx="14" fill="url(#pixbg)" stroke="#10b981" stroke-width="2"/>
  <!-- ícone PIX (losango com 4 cantos) -->
  <g transform="translate(20 22)">
    <rect x="0" y="0" width="36" height="36" rx="6" fill="#10b981"/>
    <path d="M8 18 L18 8 L28 18 L18 28 Z" fill="#022c22" stroke="#fef3c7" stroke-width="1.5"/>
  </g>
  <!-- texto -->
  <text x="68" y="32" font-family="sans-serif" font-weight="700" font-size="13" fill="#a7f3d0">PIX RECEBIDO</text>
  <text x="68" y="56" font-family="sans-serif" font-weight="900" font-size="22" fill="#fef3c7">R$ 1.997,00</text>
  <!-- checkmark verde -->
  <circle cx="218" cy="40" r="14" fill="#10b981"/>
  <path d="M212 40 L216 44 L224 36" stroke="#022c22" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** Gráfico de conversão subindo exponencial */
const RISING_CHART = `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="chartfill" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <!-- grid -->
  <g stroke="#1e1b1b" stroke-width="0.5" opacity="0.5">
    <line x1="0" y1="30" x2="200" y2="30"/>
    <line x1="0" y1="60" x2="200" y2="60"/>
    <line x1="0" y1="90" x2="200" y2="90"/>
  </g>
  <!-- fill -->
  <path d="M10 100 L40 92 L70 80 L100 64 L130 44 L160 22 L190 8 L190 110 L10 110 Z" fill="url(#chartfill)"/>
  <!-- linha -->
  <path d="M10 100 L40 92 L70 80 L100 64 L130 44 L160 22 L190 8" stroke="#fbbf24" stroke-width="3" fill="none" stroke-linecap="round"/>
  <!-- pontos -->
  <circle cx="10" cy="100" r="3" fill="#fbbf24"/>
  <circle cx="70" cy="80" r="3" fill="#fbbf24"/>
  <circle cx="130" cy="44" r="3" fill="#fbbf24"/>
  <circle cx="190" cy="8" r="4" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
  <!-- seta de alta -->
  <path d="M178 14 L190 8 L186 20" stroke="#fbbf24" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** Smartphone com tela de notificação PIX */
const PHONE_PIX = `<svg viewBox="0 0 100 180" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo -->
  <rect x="6" y="4" width="88" height="172" rx="14" fill="#0a0a0a" stroke="#fbbf24" stroke-width="1.5"/>
  <rect x="10" y="14" width="80" height="152" rx="6" fill="#022c22"/>
  <!-- notch -->
  <rect x="40" y="6" width="20" height="4" rx="2" fill="#0a0a0a"/>
  <!-- header tipo banco -->
  <rect x="14" y="20" width="72" height="22" fill="#064e3b"/>
  <text x="50" y="34" font-family="sans-serif" font-weight="700" font-size="9" fill="#a7f3d0" text-anchor="middle">PIX RECEBIDO</text>
  <!-- valor grande -->
  <text x="50" y="76" font-family="sans-serif" font-weight="900" font-size="16" fill="#fef3c7" text-anchor="middle">R$ 497,00</text>
  <!-- check verde -->
  <circle cx="50" cy="100" r="14" fill="#10b981"/>
  <path d="M42 100 L48 106 L58 92" stroke="#022c22" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- linhas de info -->
  <rect x="18" y="124" width="64" height="3" rx="1" fill="#10b981" opacity="0.5"/>
  <rect x="22" y="132" width="56" height="3" rx="1" fill="#10b981" opacity="0.3"/>
  <rect x="20" y="140" width="60" height="3" rx="1" fill="#10b981" opacity="0.3"/>
  <!-- botão -->
  <rect x="26" y="150" width="48" height="10" rx="5" fill="#fbbf24"/>
  <text x="50" y="158" font-family="sans-serif" font-weight="700" font-size="7" fill="#0a0a0a" text-anchor="middle">VER EXTRATO</text>
</svg>`;

/** Funil de vendas (formato V invertido) */
const SALES_FUNNEL = `<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="funnelg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#dc2626"/>
    </linearGradient>
  </defs>
  <!-- camada 1 (mais larga, topo) -->
  <path d="M8 14 L112 14 L100 36 L20 36 Z" fill="#fbbf24" stroke="#0a0a0a" stroke-width="1.5"/>
  <text x="60" y="29" font-family="sans-serif" font-weight="900" font-size="10" fill="#0a0a0a" text-anchor="middle">VISITAS</text>
  <!-- camada 2 -->
  <path d="M20 40 L100 40 L88 62 L32 62 Z" fill="#f59e0b" stroke="#0a0a0a" stroke-width="1.5"/>
  <text x="60" y="55" font-family="sans-serif" font-weight="900" font-size="9" fill="#0a0a0a" text-anchor="middle">LEADS</text>
  <!-- camada 3 -->
  <path d="M32 66 L88 66 L76 88 L44 88 Z" fill="#ea580c" stroke="#0a0a0a" stroke-width="1.5"/>
  <text x="60" y="80" font-family="sans-serif" font-weight="900" font-size="9" fill="#fef3c7" text-anchor="middle">VSL</text>
  <!-- camada 4 (mais estreita, base) -->
  <path d="M44 92 L76 92 L64 130 L56 130 Z" fill="#dc2626" stroke="#0a0a0a" stroke-width="1.5"/>
  <text x="60" y="110" font-family="sans-serif" font-weight="900" font-size="9" fill="#fef3c7" text-anchor="middle">$$$</text>
  <!-- gotas saindo do funil -->
  <circle cx="60" cy="136" r="3" fill="#fbbf24"/>
  <circle cx="60" cy="134" r="3" fill="#fbbf24" opacity="0.7"/>
</svg>`;

/** Alvo/mira (target audience) */
const TARGET = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <circle cx="40" cy="40" r="36" fill="none" stroke="#fbbf24" stroke-width="3"/>
  <circle cx="40" cy="40" r="26" fill="none" stroke="#f59e0b" stroke-width="2.5"/>
  <circle cx="40" cy="40" r="16" fill="none" stroke="#dc2626" stroke-width="2.5"/>
  <circle cx="40" cy="40" r="6" fill="#dc2626"/>
  <!-- mira crosshair -->
  <line x1="40" y1="4" x2="40" y2="14" stroke="#fbbf24" stroke-width="2"/>
  <line x1="40" y1="66" x2="40" y2="76" stroke="#fbbf24" stroke-width="2"/>
  <line x1="4" y1="40" x2="14" y2="40" stroke="#fbbf24" stroke-width="2"/>
  <line x1="66" y1="40" x2="76" y2="40" stroke="#fbbf24" stroke-width="2"/>
  <!-- seta cravada no centro -->
  <path d="M52 26 L42 38 L46 42 Z" fill="#fef3c7" stroke="#0a0a0a" stroke-width="1.5"/>
  <line x1="52" y1="26" x2="60" y2="18" stroke="#0a0a0a" stroke-width="2"/>
</svg>`;

/** Foguete dourado (escalada) */
const GOLD_ROCKET = `<svg viewBox="0 0 60 140" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo -->
  <path d="M30 6 Q42 24 42 70 L42 100 L18 100 L18 70 Q18 24 30 6 Z" fill="#fbbf24" stroke="#7c2d12" stroke-width="1.5"/>
  <!-- janela -->
  <circle cx="30" cy="40" r="7" fill="#bae6fd" stroke="#0c4a6e" stroke-width="1.5"/>
  <circle cx="30" cy="40" r="3" fill="#0c4a6e"/>
  <!-- linha decorativa -->
  <line x1="18" y1="62" x2="42" y2="62" stroke="#7c2d12" stroke-width="1"/>
  <!-- aletas -->
  <path d="M18 80 L8 110 L18 105 Z" fill="#dc2626" stroke="#7c2d12" stroke-width="1.5"/>
  <path d="M42 80 L52 110 L42 105 Z" fill="#dc2626" stroke="#7c2d12" stroke-width="1.5"/>
  <!-- bocal -->
  <path d="M20 100 L24 116 L36 116 L40 100 Z" fill="#9a3412" stroke="#0a0a0a" stroke-width="1"/>
  <!-- chamas -->
  <path d="M22 116 Q26 130 30 138 Q34 130 38 116 Z" fill="#fbbf24"/>
  <path d="M25 116 Q28 126 30 132 Q32 126 35 116 Z" fill="#fef3c7"/>
</svg>`;

/** Coroa dourada (CEO / king) */
const KING_CROWN = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="crowng" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="50%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#92400e"/>
    </linearGradient>
  </defs>
  <path d="M10 60 L18 24 L34 44 L50 14 L60 38 L70 14 L86 44 L102 24 L110 60 Z" fill="url(#crowng)" stroke="#7c2d12" stroke-width="2"/>
  <rect x="6" y="60" width="108" height="14" rx="2" fill="url(#crowng)" stroke="#7c2d12" stroke-width="2"/>
  <!-- gems -->
  <circle cx="34" cy="44" r="5" fill="#dc2626" stroke="#7c2d12" stroke-width="1.5"/>
  <circle cx="60" cy="38" r="6" fill="#10b981" stroke="#7c2d12" stroke-width="1.5"/>
  <circle cx="86" cy="44" r="5" fill="#3b82f6" stroke="#7c2d12" stroke-width="1.5"/>
  <!-- pérolas na base -->
  <circle cx="22" cy="67" r="3" fill="#fef3c7" stroke="#92400e" stroke-width="0.8"/>
  <circle cx="42" cy="67" r="3" fill="#fef3c7" stroke="#92400e" stroke-width="0.8"/>
  <circle cx="60" cy="67" r="3" fill="#fef3c7" stroke="#92400e" stroke-width="0.8"/>
  <circle cx="78" cy="67" r="3" fill="#fef3c7" stroke="#92400e" stroke-width="0.8"/>
  <circle cx="98" cy="67" r="3" fill="#fef3c7" stroke="#92400e" stroke-width="0.8"/>
</svg>`;

/** Selo "BEST SELLER" */
const BESTSELLER_BADGE = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <!-- selo serrilhado -->
  <path d="M50 4 L58 12 L68 8 L72 18 L82 18 L82 28 L92 32 L88 42 L96 50 L88 58 L92 68 L82 72 L82 82 L72 82 L68 92 L58 88 L50 96 L42 88 L32 92 L28 82 L18 82 L18 72 L8 68 L12 58 L4 50 L12 42 L8 32 L18 28 L18 18 L28 18 L32 8 L42 12 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
  <!-- interno -->
  <circle cx="50" cy="50" r="32" fill="#fbbf24" stroke="#7c2d12" stroke-width="1.5"/>
  <!-- texto -->
  <text x="50" y="44" font-family="sans-serif" font-weight="900" font-size="11" fill="#7c2d12" text-anchor="middle">BEST</text>
  <text x="50" y="58" font-family="sans-serif" font-weight="900" font-size="10" fill="#7c2d12" text-anchor="middle">SELLER</text>
  <!-- estrela -->
  <path d="M50 64 L52 68 L57 68 L53 71 L55 75 L50 73 L45 75 L47 71 L43 68 L48 68 Z" fill="#7c2d12"/>
</svg>`;

/** Tag de OFERTA URGENTE */
const URGENT_TAG = `<svg viewBox="0 0 160 50" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 2 L130 2 L158 25 L130 48 L2 48 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
  <circle cx="20" cy="25" r="4" fill="#fef3c7"/>
  <text x="80" y="32" font-family="sans-serif" font-weight="900" font-size="18" fill="#fef3c7" text-anchor="middle">OFERTA!</text>
</svg>`;

/** Cifrão dourado MASSIVO com brilho */
const GOLDEN_DOLLAR = `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="dollarglow" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="40%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#92400e"/>
    </radialGradient>
    <filter id="goldglow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
  </defs>
  <text x="40" y="84" font-family="serif" font-weight="900" font-size="100" fill="#fbbf24" filter="url(#goldglow)" text-anchor="middle" opacity="0.6">$</text>
  <text x="40" y="84" font-family="serif" font-weight="900" font-size="100" fill="url(#dollarglow)" stroke="#7c2d12" stroke-width="2" text-anchor="middle">$</text>
</svg>`;

/** Palavra de poder do copy (CTA) — várias variações */
const COPY_WORD_BUY = `<svg viewBox="0 0 180 50" xmlns="http://www.w3.org/2000/svg">
  <text x="90" y="36" font-family="sans-serif" font-weight="900" font-size="32" fill="#fbbf24" stroke="#7c2d12" stroke-width="1.5" text-anchor="middle" letter-spacing="2">COMPRE JÁ</text>
</svg>`;

const COPY_WORD_LIMITED = `<svg viewBox="0 0 200 50" xmlns="http://www.w3.org/2000/svg">
  <text x="100" y="36" font-family="sans-serif" font-weight="900" font-size="28" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5" text-anchor="middle" letter-spacing="2">ÚLTIMAS HORAS</text>
</svg>`;

const COPY_WORD_NOW = `<svg viewBox="0 0 140 50" xmlns="http://www.w3.org/2000/svg">
  <text x="70" y="36" font-family="sans-serif" font-weight="900" font-size="30" fill="#10b981" stroke="#064e3b" stroke-width="1.5" text-anchor="middle" letter-spacing="2">AGORA!</text>
</svg>`;

const COPY_WORD_VOCE = `<svg viewBox="0 0 200 50" xmlns="http://www.w3.org/2000/svg">
  <text x="100" y="36" font-family="serif" font-style="italic" font-weight="900" font-size="32" fill="#fef3c7" stroke="#7c2d12" stroke-width="1" text-anchor="middle">você merece...</text>
</svg>`;

const COPY_WORD_GARANTIA = `<svg viewBox="0 0 220 50" xmlns="http://www.w3.org/2000/svg">
  <text x="110" y="36" font-family="sans-serif" font-weight="900" font-size="26" fill="#fbbf24" stroke="#7c2d12" stroke-width="1.5" text-anchor="middle" letter-spacing="1">GARANTIA 7 DIAS</text>
</svg>`;

/** Card de checkout (mini visualização) */
const CHECKOUT_CARD = `<svg viewBox="0 0 220 130" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="216" height="126" rx="14" fill="#0a0a0a" stroke="#fbbf24" stroke-width="2"/>
  <!-- header -->
  <rect x="2" y="2" width="216" height="28" rx="14" fill="#fbbf24"/>
  <text x="14" y="22" font-family="sans-serif" font-weight="900" font-size="13" fill="#0a0a0a">FINALIZAR COMPRA</text>
  <!-- linhas de produto -->
  <rect x="14" y="40" width="120" height="8" rx="2" fill="#fef3c7" opacity="0.7"/>
  <rect x="14" y="54" width="90" height="6" rx="2" fill="#a3a3a3" opacity="0.6"/>
  <!-- preço -->
  <text x="206" y="56" font-family="sans-serif" font-weight="900" font-size="20" fill="#fbbf24" text-anchor="end">R$ 297</text>
  <!-- divider -->
  <line x1="14" y1="74" x2="206" y2="74" stroke="#fbbf24" stroke-width="0.5" opacity="0.4"/>
  <!-- botão PIX -->
  <rect x="14" y="84" width="192" height="32" rx="8" fill="#10b981" stroke="#064e3b" stroke-width="1.5"/>
  <text x="110" y="105" font-family="sans-serif" font-weight="900" font-size="13" fill="#fef3c7" text-anchor="middle">PAGAR COM PIX →</text>
</svg>`;

/** Coração 🔥 (engajamento + viralizou) */
const VIRAL_FIRE_HEART = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="fireheart" cx="50%" cy="60%" r="60%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="50%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#dc2626"/>
    </radialGradient>
  </defs>
  <path d="M40 70 Q12 50 8 28 Q8 12 22 10 Q34 10 40 22 Q46 10 58 10 Q72 12 72 28 Q68 50 40 70 Z" fill="url(#fireheart)" stroke="#7f1d1d" stroke-width="1.5"/>
  <!-- chama dentro -->
  <path d="M40 60 Q30 50 30 36 Q34 30 40 36 Q46 30 50 36 Q50 50 40 60 Z" fill="#fef08a" opacity="0.85"/>
</svg>`;

/* ============== JV EGUDO — #01, troféus, ego mode ============== */

/** Número "01" gigante dourado (the one) */
const NUMBER_01 = `<svg viewBox="0 0 140 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="num01grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="50%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#a16207"/>
    </linearGradient>
  </defs>
  <text x="70" y="98" font-family="serif" font-weight="900" font-size="120" fill="url(#num01grad)" stroke="#713f12" stroke-width="2.5" text-anchor="middle">01</text>
</svg>`;

/** Número "#1" estilo varsity */
const HASHTAG_ONE = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="h1grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#a16207"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="44" fill="#0a0a0a" stroke="url(#h1grad)" stroke-width="4"/>
  <text x="50" y="68" font-family="sans-serif" font-weight="900" font-size="48" fill="url(#h1grad)" text-anchor="middle">#1</text>
</svg>`;

/** Troféu dourado grande */
const TROPHY = `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="trophygrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="40%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#92400e"/>
    </linearGradient>
  </defs>
  <!-- alças laterais -->
  <path d="M16 30 Q4 30 4 50 Q4 68 22 70" fill="none" stroke="url(#trophygrad)" stroke-width="5" stroke-linecap="round"/>
  <path d="M84 30 Q96 30 96 50 Q96 68 78 70" fill="none" stroke="url(#trophygrad)" stroke-width="5" stroke-linecap="round"/>
  <!-- copo principal -->
  <path d="M18 14 L82 14 L80 64 Q78 84 50 86 Q22 84 20 64 Z" fill="url(#trophygrad)" stroke="#713f12" stroke-width="2"/>
  <!-- borda superior decorativa -->
  <rect x="14" y="10" width="72" height="8" rx="2" fill="url(#trophygrad)" stroke="#713f12" stroke-width="2"/>
  <!-- estrela no centro -->
  <path d="M50 30 L54 42 L66 42 L57 50 L60 62 L50 55 L40 62 L43 50 L34 42 L46 42 Z" fill="#7c2d12"/>
  <!-- haste -->
  <rect x="44" y="86" width="12" height="18" fill="url(#trophygrad)" stroke="#713f12" stroke-width="1.5"/>
  <!-- base -->
  <path d="M28 104 L72 104 L78 124 L22 124 Z" fill="url(#trophygrad)" stroke="#713f12" stroke-width="2"/>
  <rect x="20" y="124" width="60" height="10" rx="2" fill="#92400e" stroke="#713f12" stroke-width="1.5"/>
  <!-- placa "1ST" -->
  <text x="50" y="120" font-family="sans-serif" font-weight="900" font-size="10" fill="#fef3c7" text-anchor="middle">1ST</text>
</svg>`;

/** Medalha de ouro nº 1 */
const GOLD_MEDAL = `<svg viewBox="0 0 80 110" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="medalgrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="50%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#92400e"/>
    </linearGradient>
  </defs>
  <!-- fita -->
  <path d="M22 4 L34 50 L46 50 L58 4 L52 4 L42 36 L38 36 L28 4 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/>
  <!-- medalha circular -->
  <circle cx="40" cy="72" r="32" fill="url(#medalgrad)" stroke="#713f12" stroke-width="2.5"/>
  <circle cx="40" cy="72" r="24" fill="none" stroke="#7c2d12" stroke-width="1.2"/>
  <text x="40" y="84" font-family="serif" font-weight="900" font-size="32" fill="#7c2d12" text-anchor="middle">1</text>
  <!-- raios -->
  <g stroke="#fef3c7" stroke-width="1.5" opacity="0.7">
    <line x1="40" y1="44" x2="40" y2="48"/>
    <line x1="68" y1="72" x2="64" y2="72"/>
    <line x1="40" y1="96" x2="40" y2="100"/>
    <line x1="16" y1="72" x2="12" y2="72"/>
  </g>
</svg>`;

/** "GOAT" — Greatest Of All Time */
const GOAT_BADGE = `<svg viewBox="0 0 140 60" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="goatgrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#a16207"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="136" height="56" rx="28" fill="#0a0a0a" stroke="url(#goatgrad)" stroke-width="3"/>
  <text x="70" y="40" font-family="sans-serif" font-weight="900" font-size="30" fill="url(#goatgrad)" text-anchor="middle" letter-spacing="3">GOAT</text>
</svg>`;

/** TOP 1 — selo */
const TOP_ONE_SEAL = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="topseal" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#a16207"/>
    </radialGradient>
  </defs>
  <!-- raios atrás -->
  <g fill="#facc15" opacity="0.4">
    <path d="M50 4 L54 22 L46 22 Z"/>
    <path d="M96 50 L78 54 L78 46 Z"/>
    <path d="M50 96 L46 78 L54 78 Z"/>
    <path d="M4 50 L22 46 L22 54 Z"/>
    <path d="M82 18 L72 30 L66 24 Z"/>
    <path d="M82 82 L66 76 L72 70 Z"/>
    <path d="M18 82 L24 66 L30 72 Z"/>
    <path d="M18 18 L30 24 L24 30 Z"/>
  </g>
  <!-- circulo principal -->
  <circle cx="50" cy="50" r="38" fill="url(#topseal)" stroke="#7c2d12" stroke-width="2.5"/>
  <circle cx="50" cy="50" r="32" fill="none" stroke="#7c2d12" stroke-width="1"/>
  <text x="50" y="46" font-family="sans-serif" font-weight="900" font-size="12" fill="#7c2d12" text-anchor="middle">TOP</text>
  <text x="50" y="68" font-family="serif" font-weight="900" font-size="28" fill="#7c2d12" text-anchor="middle">1</text>
</svg>`;

/** Coroa de louros (laurel wreath) */
const LAUREL_WREATH = `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
  <!-- ramo esquerdo -->
  <g fill="#a16207" stroke="#713f12" stroke-width="1">
    <path d="M30 84 Q12 60 12 30 Q22 26 28 36"/>
    <ellipse cx="18" cy="40" rx="8" ry="4" transform="rotate(-50 18 40)" fill="#ca8a04"/>
    <ellipse cx="14" cy="52" rx="8" ry="4" transform="rotate(-60 14 52)" fill="#a16207"/>
    <ellipse cx="14" cy="64" rx="8" ry="4" transform="rotate(-70 14 64)" fill="#ca8a04"/>
    <ellipse cx="20" cy="76" rx="8" ry="4" transform="rotate(-80 20 76)" fill="#a16207"/>
    <ellipse cx="28" cy="30" rx="8" ry="4" transform="rotate(-30 28 30)" fill="#ca8a04"/>
  </g>
  <!-- ramo direito (espelho) -->
  <g fill="#a16207" stroke="#713f12" stroke-width="1">
    <path d="M90 84 Q108 60 108 30 Q98 26 92 36"/>
    <ellipse cx="102" cy="40" rx="8" ry="4" transform="rotate(50 102 40)" fill="#ca8a04"/>
    <ellipse cx="106" cy="52" rx="8" ry="4" transform="rotate(60 106 52)" fill="#a16207"/>
    <ellipse cx="106" cy="64" rx="8" ry="4" transform="rotate(70 106 64)" fill="#ca8a04"/>
    <ellipse cx="100" cy="76" rx="8" ry="4" transform="rotate(80 100 76)" fill="#a16207"/>
    <ellipse cx="92" cy="30" rx="8" ry="4" transform="rotate(30 92 30)" fill="#ca8a04"/>
  </g>
  <!-- número 1 central -->
  <circle cx="60" cy="50" r="22" fill="#facc15" stroke="#713f12" stroke-width="2"/>
  <text x="60" y="62" font-family="serif" font-weight="900" font-size="28" fill="#7c2d12" text-anchor="middle">1</text>
</svg>`;

/** Lingotes de ouro empilhados */
const GOLD_BARS = `<svg viewBox="0 0 140 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bargrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="100%" stop-color="#a16207"/>
    </linearGradient>
  </defs>
  <!-- 3 lingotes empilhados -->
  <path d="M30 56 L110 56 L120 74 L20 74 Z" fill="url(#bargrad)" stroke="#713f12" stroke-width="1.5"/>
  <path d="M36 38 L104 38 L114 56 L26 56 Z" fill="url(#bargrad)" stroke="#713f12" stroke-width="1.5"/>
  <path d="M44 20 L96 20 L106 38 L34 38 Z" fill="url(#bargrad)" stroke="#713f12" stroke-width="1.5"/>
  <!-- carimbo "9999" -->
  <text x="70" y="32" font-family="sans-serif" font-weight="900" font-size="8" fill="#7c2d12" text-anchor="middle">999.9</text>
</svg>`;

/** Ego-mode flame (chama com 1 dentro) */
const EGO_FLAME = `<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="egoflame" cx="50%" cy="70%" r="60%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="50%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#dc2626"/>
    </radialGradient>
  </defs>
  <path d="M30 4 Q44 26 50 46 Q56 66 44 80 Q36 86 30 84 Q24 86 16 80 Q4 66 10 46 Q16 26 30 4 Z" fill="url(#egoflame)" stroke="#7f1d1d" stroke-width="1.5"/>
  <text x="30" y="64" font-family="serif" font-weight="900" font-size="26" fill="#fef3c7" stroke="#7c2d12" stroke-width="1" text-anchor="middle">1</text>
</svg>`;

/* ============== JV MULHERENGO — mesmo cara, mulheres diferentes ============== */

/** Silhueta do MESMO cara (sempre igual) — cabelo curto preto + barba sutil */
const SAME_GUY = `<svg viewBox="0 0 70 100" xmlns="http://www.w3.org/2000/svg">
  <!-- pescoço -->
  <rect x="28" y="40" width="14" height="14" fill="#d4a574"/>
  <!-- cabeça -->
  <ellipse cx="35" cy="32" rx="18" ry="22" fill="#d4a574" stroke="#92400e" stroke-width="1.2"/>
  <!-- cabelo preto curto (assinatura: SEMPRE ele) -->
  <path d="M17 26 Q17 12 35 10 Q53 12 53 26 L52 22 Q44 16 35 16 Q26 16 18 22 Z" fill="#0a0a0a" stroke="#0a0a0a" stroke-width="1"/>
  <!-- sobrancelhas -->
  <line x1="25" y1="28" x2="32" y2="28" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="38" y1="28" x2="45" y2="28" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round"/>
  <!-- olhos -->
  <circle cx="28" cy="32" r="1.8" fill="#0a0a0a"/>
  <circle cx="42" cy="32" r="1.8" fill="#0a0a0a"/>
  <!-- nariz -->
  <path d="M35 36 L33 40 L37 40 Z" fill="#a16207" opacity="0.4"/>
  <!-- sorriso lateral confiante -->
  <path d="M30 44 Q35 47 40 44" stroke="#7c2d12" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <!-- barba sutil queixo -->
  <path d="M28 46 Q35 50 42 46" stroke="#3f3f46" stroke-width="2" fill="none" opacity="0.5"/>
  <!-- corpo / camisa -->
  <path d="M14 56 Q14 52 22 52 L48 52 Q56 52 56 56 L58 96 L12 96 Z" fill="#1f1f1f" stroke="#0a0a0a" stroke-width="1.2"/>
  <!-- gola V -->
  <path d="M28 52 L35 60 L42 52" fill="#d4a574" stroke="#92400e" stroke-width="1"/>
</svg>`;

/** Mulher RUIVA */
const WOMAN_REDHEAD = `<svg viewBox="0 0 70 100" xmlns="http://www.w3.org/2000/svg">
  <!-- cabelo ruivo (longo, atrás) -->
  <path d="M10 26 Q8 60 14 92 L26 90 L26 60 L44 60 L44 90 L56 92 Q62 60 60 26 Q60 10 35 8 Q10 10 10 26 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.2"/>
  <!-- pescoço -->
  <rect x="28" y="40" width="14" height="14" fill="#f5d6c0"/>
  <!-- cabeça -->
  <ellipse cx="35" cy="32" rx="17" ry="21" fill="#f5d6c0" stroke="#dc2626" stroke-width="1"/>
  <!-- franja ruiva -->
  <path d="M18 22 Q22 10 35 10 Q48 10 52 22 L48 26 Q40 18 35 18 Q30 18 22 26 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1"/>
  <!-- olhos verdes -->
  <ellipse cx="28" cy="32" rx="2.5" ry="3" fill="#fafafa"/>
  <ellipse cx="42" cy="32" rx="2.5" ry="3" fill="#fafafa"/>
  <circle cx="28" cy="33" r="1.5" fill="#16a34a"/>
  <circle cx="42" cy="33" r="1.5" fill="#16a34a"/>
  <!-- sobrancelhas -->
  <path d="M25 28 Q28 26 32 28" stroke="#7f1d1d" stroke-width="1.5" fill="none"/>
  <path d="M38 28 Q42 26 45 28" stroke="#7f1d1d" stroke-width="1.5" fill="none"/>
  <!-- nariz pequeno -->
  <path d="M35 36 L34 40 L36 40 Z" fill="#dc2626" opacity="0.3"/>
  <!-- lábios pintados (vermelho) -->
  <path d="M30 44 Q35 47 40 44 Q35 49 30 44 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="0.8"/>
  <!-- sardas -->
  <circle cx="29" cy="38" r="0.6" fill="#7f1d1d"/>
  <circle cx="32" cy="40" r="0.5" fill="#7f1d1d"/>
  <circle cx="38" cy="40" r="0.6" fill="#7f1d1d"/>
  <circle cx="41" cy="38" r="0.5" fill="#7f1d1d"/>
  <!-- blusa -->
  <path d="M14 56 Q14 52 22 52 L48 52 Q56 52 56 56 L58 96 L12 96 Z" fill="#ec4899" stroke="#831843" stroke-width="1.2"/>
  <path d="M28 52 L35 62 L42 52" fill="#f5d6c0" stroke="#dc2626" stroke-width="0.8"/>
</svg>`;

/** Mulher LOIRA */
const WOMAN_BLONDE = `<svg viewBox="0 0 70 100" xmlns="http://www.w3.org/2000/svg">
  <!-- cabelo loiro longo -->
  <path d="M10 26 Q8 60 12 92 L26 90 L26 60 L44 60 L44 90 L58 92 Q62 60 60 26 Q60 10 35 8 Q10 10 10 26 Z" fill="#fbbf24" stroke="#92400e" stroke-width="1.2"/>
  <!-- mechas claras (highlights) -->
  <path d="M14 30 Q14 60 18 88" stroke="#fef3c7" stroke-width="2" fill="none" opacity="0.7"/>
  <path d="M56 30 Q56 60 52 88" stroke="#fef3c7" stroke-width="2" fill="none" opacity="0.7"/>
  <!-- pescoço -->
  <rect x="28" y="40" width="14" height="14" fill="#ffe0c4"/>
  <!-- cabeça -->
  <ellipse cx="35" cy="32" rx="17" ry="21" fill="#ffe0c4" stroke="#fbbf24" stroke-width="1"/>
  <!-- franja loira -->
  <path d="M18 22 Q22 10 35 10 Q48 10 52 22 Q44 18 35 20 Q26 18 18 22 Z" fill="#fbbf24" stroke="#92400e" stroke-width="1"/>
  <!-- olhos azuis -->
  <ellipse cx="28" cy="32" rx="2.5" ry="3" fill="#fafafa"/>
  <ellipse cx="42" cy="32" rx="2.5" ry="3" fill="#fafafa"/>
  <circle cx="28" cy="33" r="1.5" fill="#3b82f6"/>
  <circle cx="42" cy="33" r="1.5" fill="#3b82f6"/>
  <!-- sobrancelhas finas claras -->
  <path d="M25 28 Q28 26 32 28" stroke="#a16207" stroke-width="1.2" fill="none"/>
  <path d="M38 28 Q42 26 45 28" stroke="#a16207" stroke-width="1.2" fill="none"/>
  <!-- nariz -->
  <path d="M35 36 L34 40 L36 40 Z" fill="#92400e" opacity="0.25"/>
  <!-- lábios rosa -->
  <path d="M30 44 Q35 46 40 44 Q35 48 30 44 Z" fill="#ec4899" stroke="#831843" stroke-width="0.6"/>
  <!-- brincos -->
  <circle cx="17" cy="36" r="1.5" fill="#facc15"/>
  <circle cx="53" cy="36" r="1.5" fill="#facc15"/>
  <!-- blusa -->
  <path d="M14 56 Q14 52 22 52 L48 52 Q56 52 56 56 L58 96 L12 96 Z" fill="#fafafa" stroke="#a3a3a3" stroke-width="1.2"/>
  <path d="M28 52 L35 62 L42 52" fill="#ffe0c4" stroke="#a16207" stroke-width="0.8"/>
</svg>`;

/** Mulher MORENA */
const WOMAN_BRUNETTE = `<svg viewBox="0 0 70 100" xmlns="http://www.w3.org/2000/svg">
  <!-- cabelo moreno (longo, castanho-escuro) -->
  <path d="M10 26 Q8 60 14 92 L26 90 L26 60 L44 60 L44 90 L56 92 Q62 60 60 26 Q60 10 35 8 Q10 10 10 26 Z" fill="#3f2817" stroke="#1c1209" stroke-width="1.2"/>
  <!-- pescoço -->
  <rect x="28" y="40" width="14" height="14" fill="#c89a73"/>
  <!-- cabeça -->
  <ellipse cx="35" cy="32" rx="17" ry="21" fill="#c89a73" stroke="#7c4a1e" stroke-width="1"/>
  <!-- franja morena -->
  <path d="M18 22 Q22 10 35 10 Q48 10 52 22 L48 26 Q40 18 35 18 Q30 18 22 26 Z" fill="#3f2817" stroke="#1c1209" stroke-width="1"/>
  <!-- olhos castanhos -->
  <ellipse cx="28" cy="32" rx="2.5" ry="3" fill="#fafafa"/>
  <ellipse cx="42" cy="32" rx="2.5" ry="3" fill="#fafafa"/>
  <circle cx="28" cy="33" r="1.5" fill="#78350f"/>
  <circle cx="42" cy="33" r="1.5" fill="#78350f"/>
  <!-- sobrancelhas grossas escuras -->
  <path d="M25 28 Q28 26 32 28" stroke="#1c1209" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M38 28 Q42 26 45 28" stroke="#1c1209" stroke-width="2" fill="none" stroke-linecap="round"/>
  <!-- nariz -->
  <path d="M35 36 L33 40 L37 40 Z" fill="#7c4a1e" opacity="0.4"/>
  <!-- lábios -->
  <path d="M30 44 Q35 47 40 44 Q35 49 30 44 Z" fill="#be123c" stroke="#831843" stroke-width="0.8"/>
  <!-- blusa -->
  <path d="M14 56 Q14 52 22 52 L48 52 Q56 52 56 56 L58 96 L12 96 Z" fill="#7e22ce" stroke="#3b0764" stroke-width="1.2"/>
  <path d="M28 52 L35 62 L42 52" fill="#c89a73" stroke="#7c4a1e" stroke-width="0.8"/>
</svg>`;

/** Coração rosa (vibe romântica) */
const PINK_HEART = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="phgrad" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#fbcfe8"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </radialGradient>
  </defs>
  <path d="M30 52 Q8 38 6 22 Q6 8 18 6 Q26 6 30 16 Q34 6 42 6 Q54 8 54 22 Q52 38 30 52 Z" fill="url(#phgrad)" stroke="#831843" stroke-width="1.5"/>
</svg>`;

/** Marca de batom (kiss) */
const LIPSTICK_KISS = `<svg viewBox="0 0 80 50" xmlns="http://www.w3.org/2000/svg">
  <!-- lábio superior -->
  <path d="M10 24 Q18 12 28 16 Q34 22 40 22 Q46 22 52 16 Q62 12 70 24 Q60 28 50 26 Q44 28 40 30 Q36 28 30 26 Q20 28 10 24 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1"/>
  <!-- lábio inferior -->
  <path d="M10 24 Q20 38 30 38 Q40 42 50 38 Q60 38 70 24 Q60 30 50 32 Q40 36 30 32 Q20 30 10 24 Z" fill="#be123c" stroke="#7f1d1d" stroke-width="1"/>
  <!-- linhas de batom -->
  <path d="M22 22 L22 38" stroke="#7f1d1d" stroke-width="0.5"/>
  <path d="M30 20 L30 36" stroke="#7f1d1d" stroke-width="0.5"/>
  <path d="M40 22 L40 38" stroke="#7f1d1d" stroke-width="0.5"/>
  <path d="M50 20 L50 36" stroke="#7f1d1d" stroke-width="0.5"/>
  <path d="M58 22 L58 36" stroke="#7f1d1d" stroke-width="0.5"/>
</svg>`;

/** Casal: mesmo cara + mulher ruiva */
const COUPLE_REDHEAD = `<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(0 5)"><svg width="70" height="100" viewBox="0 0 70 100">${SAME_GUY.replace(/<svg[^>]*>|<\/svg>/g, "")}</svg></g>
  <g transform="translate(90 5)"><svg width="70" height="100" viewBox="0 0 70 100">${WOMAN_REDHEAD.replace(/<svg[^>]*>|<\/svg>/g, "")}</svg></g>
  <!-- coraçãozinho no meio -->
  <path d="M80 8 Q72 2 72 12 Q72 18 80 24 Q88 18 88 12 Q88 2 80 8 Z" fill="#ec4899" stroke="#831843" stroke-width="1"/>
</svg>`;

/** Casal: mesmo cara + loira */
const COUPLE_BLONDE = `<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(0 5)"><svg width="70" height="100" viewBox="0 0 70 100">${SAME_GUY.replace(/<svg[^>]*>|<\/svg>/g, "")}</svg></g>
  <g transform="translate(90 5)"><svg width="70" height="100" viewBox="0 0 70 100">${WOMAN_BLONDE.replace(/<svg[^>]*>|<\/svg>/g, "")}</svg></g>
  <path d="M80 8 Q72 2 72 12 Q72 18 80 24 Q88 18 88 12 Q88 2 80 8 Z" fill="#ec4899" stroke="#831843" stroke-width="1"/>
</svg>`;

/** Casal: mesmo cara + morena */
const COUPLE_BRUNETTE = `<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(0 5)"><svg width="70" height="100" viewBox="0 0 70 100">${SAME_GUY.replace(/<svg[^>]*>|<\/svg>/g, "")}</svg></g>
  <g transform="translate(90 5)"><svg width="70" height="100" viewBox="0 0 70 100">${WOMAN_BRUNETTE.replace(/<svg[^>]*>|<\/svg>/g, "")}</svg></g>
  <path d="M80 8 Q72 2 72 12 Q72 18 80 24 Q88 18 88 12 Q88 2 80 8 Z" fill="#ec4899" stroke="#831843" stroke-width="1"/>
</svg>`;

/* ============== LORECIO — anjos loiros + academia ============== */

/** Anjo loiro com aro e asas */
const ANGEL_BLONDE = `<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
  <!-- aro (halo) -->
  <ellipse cx="60" cy="14" rx="22" ry="6" fill="none" stroke="#facc15" stroke-width="3"/>
  <ellipse cx="60" cy="14" rx="22" ry="6" fill="none" stroke="#fef3c7" stroke-width="1" opacity="0.7"/>
  <!-- asas brancas -->
  <path d="M22 50 Q-2 40 4 80 Q14 88 32 78 Z" fill="#fafafa" stroke="#cbd5e1" stroke-width="1.5"/>
  <path d="M98 50 Q122 40 116 80 Q106 88 88 78 Z" fill="#fafafa" stroke="#cbd5e1" stroke-width="1.5"/>
  <!-- penas detalhe -->
  <path d="M8 56 Q14 62 20 60" stroke="#cbd5e1" stroke-width="1" fill="none"/>
  <path d="M10 68 Q16 72 22 70" stroke="#cbd5e1" stroke-width="1" fill="none"/>
  <path d="M112 56 Q106 62 100 60" stroke="#cbd5e1" stroke-width="1" fill="none"/>
  <path d="M110 68 Q104 72 98 70" stroke="#cbd5e1" stroke-width="1" fill="none"/>
  <!-- cabelo loiro -->
  <path d="M40 28 Q40 18 60 18 Q80 18 80 28 L78 36 Q70 28 60 28 Q50 28 42 36 Z" fill="#fbbf24" stroke="#92400e" stroke-width="1"/>
  <!-- cabeça -->
  <ellipse cx="60" cy="36" rx="18" ry="20" fill="#ffe0c4" stroke="#fbbf24" stroke-width="1"/>
  <!-- olhos -->
  <ellipse cx="53" cy="36" rx="2" ry="2.5" fill="#fafafa"/>
  <ellipse cx="67" cy="36" rx="2" ry="2.5" fill="#fafafa"/>
  <circle cx="53" cy="37" r="1.3" fill="#3b82f6"/>
  <circle cx="67" cy="37" r="1.3" fill="#3b82f6"/>
  <!-- sobrancelhas -->
  <path d="M50 32 Q53 30 56 32" stroke="#a16207" stroke-width="1.2" fill="none"/>
  <path d="M64 32 Q67 30 70 32" stroke="#a16207" stroke-width="1.2" fill="none"/>
  <!-- sorriso angelical -->
  <path d="M54 46 Q60 49 66 46" stroke="#7c2d12" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <!-- corpo musculoso (track de academia) -->
  <path d="M36 58 Q36 56 42 56 L78 56 Q84 56 84 58 L88 100 L84 106 Q76 104 60 104 Q44 104 36 106 L32 100 Z" fill="#fafafa" stroke="#cbd5e1" stroke-width="1.5"/>
  <!-- gola -->
  <path d="M48 56 L60 64 L72 56" fill="#ffe0c4" stroke="#fbbf24" stroke-width="1"/>
  <!-- braços musculosos -->
  <path d="M32 60 Q22 70 18 90 Q22 100 30 96 Q34 80 36 70" fill="#ffe0c4" stroke="#fbbf24" stroke-width="1.2"/>
  <path d="M88 60 Q98 70 102 90 Q98 100 90 96 Q86 80 84 70" fill="#ffe0c4" stroke="#fbbf24" stroke-width="1.2"/>
  <!-- bíceps detalhe -->
  <ellipse cx="24" cy="78" rx="5" ry="8" fill="#facc15" opacity="0.3"/>
  <ellipse cx="96" cy="78" rx="5" ry="8" fill="#facc15" opacity="0.3"/>
</svg>`;

/** Dumbbell (peso de academia) */
const DUMBBELL = `<svg viewBox="0 0 160 50" xmlns="http://www.w3.org/2000/svg">
  <!-- esfera esquerda grande -->
  <rect x="2" y="10" width="14" height="30" rx="3" fill="#1f1f1f" stroke="#0a0a0a" stroke-width="1"/>
  <rect x="16" y="6" width="20" height="38" rx="4" fill="#262626" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- haste -->
  <rect x="36" y="22" width="88" height="6" fill="#94a3b8" stroke="#475569" stroke-width="1"/>
  <!-- detalhe central -->
  <rect x="76" y="20" width="8" height="10" fill="#3a3a3a" stroke="#0a0a0a" stroke-width="1"/>
  <!-- esfera direita -->
  <rect x="124" y="6" width="20" height="38" rx="4" fill="#262626" stroke="#0a0a0a" stroke-width="1.5"/>
  <rect x="144" y="10" width="14" height="30" rx="3" fill="#1f1f1f" stroke="#0a0a0a" stroke-width="1"/>
  <!-- highlights -->
  <line x1="22" y1="14" x2="22" y2="36" stroke="#525252" stroke-width="1"/>
  <line x1="130" y1="14" x2="130" y2="36" stroke="#525252" stroke-width="1"/>
</svg>`;

/** Bíceps flexionado */
const MUSCLE_ARM = `<svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg">
  <!-- ombro -->
  <path d="M10 50 Q14 30 30 28 Q44 28 50 40 Q52 50 50 60 Q40 64 30 62 Q14 58 10 50 Z" fill="#f5d6c0" stroke="#a16207" stroke-width="1.5"/>
  <!-- bíceps flexionado (a bola) -->
  <path d="M28 40 Q44 22 64 28 Q80 36 78 56 Q70 70 50 66 Q34 60 28 40 Z" fill="#fbbf24" stroke="#a16207" stroke-width="1.5"/>
  <path d="M44 36 Q56 30 68 40 Q72 48 66 56 Q56 60 48 54 Q42 46 44 36 Z" fill="#fde68a" opacity="0.85"/>
  <!-- antebraço -->
  <path d="M62 28 Q90 30 90 80 Q86 96 70 92 Q60 84 56 60 Q58 40 62 28 Z" fill="#f5d6c0" stroke="#a16207" stroke-width="1.5"/>
  <!-- punho fechado -->
  <ellipse cx="80" cy="86" rx="14" ry="12" fill="#f5d6c0" stroke="#a16207" stroke-width="1.5"/>
  <!-- linhas dos dedos -->
  <path d="M76 80 L82 80" stroke="#a16207" stroke-width="0.8"/>
  <path d="M76 84 L82 84" stroke="#a16207" stroke-width="0.8"/>
  <path d="M76 88 L82 88" stroke="#a16207" stroke-width="0.8"/>
  <path d="M76 92 L82 92" stroke="#a16207" stroke-width="0.8"/>
  <!-- veia -->
  <path d="M52 42 Q56 50 60 48" stroke="#a16207" stroke-width="1" fill="none" opacity="0.6"/>
  <!-- sombra do músculo -->
  <path d="M50 52 Q56 58 62 54" stroke="#a16207" stroke-width="1.2" fill="none" opacity="0.5"/>
</svg>`;

/* ============== LEO CHICKEN — galinhas + alcool + cara loiro ============== */

/** Galinha (frango) */
const CHICKEN = `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo -->
  <ellipse cx="60" cy="60" rx="36" ry="26" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- pescoço -->
  <path d="M86 50 Q92 36 90 24 L96 24 Q102 36 94 56 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- cabeça -->
  <circle cx="96" cy="22" r="12" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- crista vermelha -->
  <path d="M88 12 Q90 4 94 8 Q96 2 100 8 Q104 4 106 12 Q102 14 96 14 Q90 14 88 12 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1"/>
  <!-- bico amarelo -->
  <path d="M104 22 L114 22 L108 28 Z" fill="#facc15" stroke="#a16207" stroke-width="1"/>
  <!-- queixo vermelho -->
  <ellipse cx="98" cy="30" rx="3" ry="4" fill="#dc2626" stroke="#7f1d1d" stroke-width="1"/>
  <!-- olho -->
  <circle cx="98" cy="20" r="2" fill="#0a0a0a"/>
  <circle cx="98.5" cy="19.5" r="0.6" fill="#fafafa"/>
  <!-- asa -->
  <path d="M40 50 Q50 44 70 50 Q72 64 64 72 Q50 74 40 66 Z" fill="#e5e5e5" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- penas detalhe -->
  <path d="M44 56 Q50 58 56 56" stroke="#a3a3a3" stroke-width="0.8" fill="none"/>
  <path d="M44 62 Q50 64 56 62" stroke="#a3a3a3" stroke-width="0.8" fill="none"/>
  <!-- pé/perna -->
  <line x1="50" y1="84" x2="48" y2="96" stroke="#facc15" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="48" y1="96" x2="42" y2="96" stroke="#facc15" stroke-width="2"/>
  <line x1="48" y1="96" x2="50" y2="98" stroke="#facc15" stroke-width="2"/>
  <line x1="48" y1="96" x2="54" y2="96" stroke="#facc15" stroke-width="2"/>
  <line x1="70" y1="84" x2="68" y2="96" stroke="#facc15" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="68" y1="96" x2="62" y2="96" stroke="#facc15" stroke-width="2"/>
  <line x1="68" y1="96" x2="70" y2="98" stroke="#facc15" stroke-width="2"/>
  <line x1="68" y1="96" x2="74" y2="96" stroke="#facc15" stroke-width="2"/>
  <!-- cauda -->
  <path d="M24 56 Q14 40 10 56 Q14 70 24 64 Z" fill="#a3a3a3" stroke="#0a0a0a" stroke-width="1.5"/>
</svg>`;

/** Cara loiro (variação do SAME_GUY com cabelo loiro) */
const BLONDE_GUY = `<svg viewBox="0 0 70 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="28" y="40" width="14" height="14" fill="#ffe0c4"/>
  <ellipse cx="35" cy="32" rx="18" ry="22" fill="#ffe0c4" stroke="#a16207" stroke-width="1.2"/>
  <path d="M17 26 Q17 12 35 10 Q53 12 53 26 L52 22 Q44 16 35 16 Q26 16 18 22 Z" fill="#fbbf24" stroke="#a16207" stroke-width="1"/>
  <line x1="25" y1="28" x2="32" y2="28" stroke="#a16207" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="38" y1="28" x2="45" y2="28" stroke="#a16207" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="28" cy="32" r="1.8" fill="#3b82f6"/>
  <circle cx="42" cy="32" r="1.8" fill="#3b82f6"/>
  <path d="M35 36 L33 40 L37 40 Z" fill="#a16207" opacity="0.3"/>
  <path d="M30 44 Q35 47 40 44" stroke="#7c2d12" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M14 56 Q14 52 22 52 L48 52 Q56 52 56 56 L58 96 L12 96 Z" fill="#1d4ed8" stroke="#0c1d4a" stroke-width="1.2"/>
  <path d="M28 52 L35 60 L42 52" fill="#ffe0c4" stroke="#a16207" stroke-width="1"/>
</svg>`;

/** Garrafa de cerveja */
const BEER_BOTTLE = `<svg viewBox="0 0 40 110" xmlns="http://www.w3.org/2000/svg">
  <!-- tampa -->
  <rect x="14" y="4" width="12" height="6" fill="#dc2626" stroke="#0a0a0a" stroke-width="1"/>
  <!-- gargalo -->
  <rect x="15" y="10" width="10" height="18" fill="#16a34a" stroke="#052e16" stroke-width="1.5"/>
  <!-- corpo -->
  <path d="M10 28 L30 28 L32 104 L8 104 Z" fill="#16a34a" stroke="#052e16" stroke-width="1.5"/>
  <!-- rótulo -->
  <rect x="12" y="50" width="16" height="36" fill="#fef3c7" stroke="#a16207" stroke-width="0.8"/>
  <text x="20" y="64" font-family="serif" font-weight="900" font-size="8" fill="#7c2d12" text-anchor="middle">CERVEJA</text>
  <circle cx="20" cy="74" r="3" fill="#dc2626"/>
  <text x="20" y="84" font-family="serif" font-weight="700" font-size="6" fill="#7c2d12" text-anchor="middle">5%</text>
  <!-- brilho -->
  <path d="M12 36 L12 90" stroke="#bbf7d0" stroke-width="1.5" opacity="0.6"/>
</svg>`;

/** Copo de whisky com gelo */
const WHISKY_GLASS = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <!-- copo -->
  <path d="M16 16 L64 16 L60 70 Q40 74 20 70 Z" fill="#fef3c7" fill-opacity="0.25" stroke="#fef3c7" stroke-width="1.5"/>
  <!-- whisky -->
  <path d="M18 36 L62 36 L60 70 Q40 74 20 70 Z" fill="#d97706" stroke="#92400e" stroke-width="1"/>
  <!-- superfície líquida -->
  <ellipse cx="40" cy="36" rx="22" ry="3" fill="#fef3c7" opacity="0.4"/>
  <!-- cubos de gelo -->
  <rect x="26" y="38" width="12" height="12" rx="1" fill="#fafafa" fill-opacity="0.5" stroke="#fafafa" stroke-width="0.8"/>
  <rect x="42" y="44" width="10" height="10" rx="1" fill="#fafafa" fill-opacity="0.55" stroke="#fafafa" stroke-width="0.8"/>
  <!-- brilho do copo -->
  <line x1="22" y1="22" x2="22" y2="64" stroke="#fafafa" stroke-width="1" opacity="0.5"/>
</svg>`;

/** Caneca de chopp (chopp em estilo bar) */
const BEER_MUG = `<svg viewBox="0 0 90 100" xmlns="http://www.w3.org/2000/svg">
  <!-- alça -->
  <path d="M64 30 Q88 30 88 60 Q88 86 64 86" fill="none" stroke="#fef3c7" stroke-width="6" stroke-linecap="round"/>
  <path d="M64 30 Q88 30 88 60 Q88 86 64 86" fill="none" stroke="#fbbf24" stroke-width="3"/>
  <!-- copo -->
  <rect x="10" y="20" width="56" height="76" rx="3" fill="#fef3c7" fill-opacity="0.3" stroke="#fef3c7" stroke-width="1.5"/>
  <!-- cerveja dourada -->
  <rect x="14" y="32" width="48" height="60" fill="#f59e0b" stroke="#a16207" stroke-width="0.8"/>
  <!-- espuma -->
  <path d="M12 28 Q18 16 26 24 Q32 14 40 22 Q48 14 54 24 Q62 16 64 28 L62 36 L14 36 Z" fill="#fef3c7" stroke="#cbd5e1" stroke-width="1"/>
  <!-- bolhas -->
  <circle cx="24" cy="50" r="2" fill="#fef3c7" opacity="0.6"/>
  <circle cx="38" cy="60" r="1.5" fill="#fef3c7" opacity="0.6"/>
  <circle cx="48" cy="48" r="1.8" fill="#fef3c7" opacity="0.6"/>
  <circle cx="30" cy="74" r="1.6" fill="#fef3c7" opacity="0.6"/>
  <circle cx="50" cy="78" r="1.5" fill="#fef3c7" opacity="0.6"/>
</svg>`;

/* ============== AZZI — carro batido + cash + saque 1M ============== */

/** Carro batido com fumaça */
const CRASHED_CAR = `<svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg">
  <!-- fumaça subindo -->
  <ellipse cx="60" cy="18" rx="22" ry="14" fill="#71717a" opacity="0.55"/>
  <ellipse cx="80" cy="8" rx="18" ry="10" fill="#a3a3a3" opacity="0.5"/>
  <ellipse cx="100" cy="14" rx="20" ry="12" fill="#71717a" opacity="0.55"/>
  <ellipse cx="120" cy="6" rx="16" ry="9" fill="#a3a3a3" opacity="0.5"/>
  <!-- corpo batido (frente amassada) -->
  <path d="M30 60 Q22 64 18 76 L12 84 Q14 92 24 92 L180 92 Q188 92 188 84 L184 50 Q176 38 154 36 L80 36 Q66 38 56 44 L40 48 Z" fill="#dc2626" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- frente amassada (linhas zigzag) -->
  <path d="M14 70 L24 64 L18 60 L28 56 L20 52 L30 50" stroke="#0a0a0a" stroke-width="2" fill="none"/>
  <!-- vidros rachados -->
  <path d="M60 42 L90 38 L88 56 L58 56 Z" fill="#94a3b8" opacity="0.7"/>
  <path d="M70 42 L74 56" stroke="#0a0a0a" stroke-width="1"/>
  <path d="M80 42 L78 56" stroke="#0a0a0a" stroke-width="1"/>
  <path d="M94 40 L150 36 L154 56 L92 56 Z" fill="#94a3b8" opacity="0.7"/>
  <path d="M110 38 L114 56" stroke="#0a0a0a" stroke-width="1"/>
  <path d="M130 38 L128 56" stroke="#0a0a0a" stroke-width="1"/>
  <!-- porta amassada -->
  <path d="M92 56 L92 90" stroke="#0a0a0a" stroke-width="1.5"/>
  <path d="M132 56 L132 90" stroke="#0a0a0a" stroke-width="1.5"/>
  <path d="M118 60 L122 80" stroke="#facc15" stroke-width="2"/>
  <!-- roda quebrada esquerda -->
  <circle cx="50" cy="92" r="14" fill="#0a0a0a" stroke="#dc2626" stroke-width="2"/>
  <path d="M42 84 L58 100" stroke="#facc15" stroke-width="2"/>
  <path d="M58 84 L42 100" stroke="#facc15" stroke-width="2"/>
  <!-- roda direita -->
  <circle cx="160" cy="92" r="14" fill="#0a0a0a"/>
  <circle cx="160" cy="92" r="6" fill="#94a3b8"/>
  <!-- pedaço solto -->
  <path d="M6 78 L14 84 L6 88 Z" fill="#dc2626" stroke="#0a0a0a" stroke-width="1"/>
  <!-- estrelas de impacto -->
  <path d="M170 30 L172 36 L178 34 L173 39 L176 44 L170 41 L165 44 L168 39 L162 34 L168 36 Z" fill="#facc15" stroke="#7c2d12" stroke-width="1"/>
</svg>`;

/** Celular com PIX de R$ 1.000.000 */
const PHONE_MILLION = `<svg viewBox="0 0 110 200" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="4" width="98" height="192" rx="14" fill="#0a0a0a" stroke="#facc15" stroke-width="2"/>
  <rect x="10" y="14" width="90" height="172" rx="6" fill="#022c22"/>
  <rect x="44" y="6" width="22" height="4" rx="2" fill="#0a0a0a"/>
  <!-- header banco -->
  <rect x="14" y="22" width="82" height="24" fill="#064e3b"/>
  <text x="55" y="38" font-family="sans-serif" font-weight="700" font-size="10" fill="#a7f3d0" text-anchor="middle">PIX RECEBIDO</text>
  <!-- VALOR GIGANTE -->
  <text x="55" y="76" font-family="sans-serif" font-weight="900" font-size="11" fill="#a7f3d0" text-anchor="middle">R$</text>
  <text x="55" y="100" font-family="sans-serif" font-weight="900" font-size="20" fill="#facc15" text-anchor="middle">1.000.000</text>
  <text x="55" y="116" font-family="sans-serif" font-weight="700" font-size="10" fill="#fef3c7" text-anchor="middle">,00</text>
  <!-- check -->
  <circle cx="55" cy="140" r="16" fill="#10b981"/>
  <path d="M46 140 L52 146 L64 132" stroke="#022c22" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- texto -->
  <text x="55" y="170" font-family="sans-serif" font-weight="700" font-size="7" fill="#a7f3d0" text-anchor="middle">SAQUE REALIZADO</text>
  <text x="55" y="180" font-family="sans-serif" font-weight="400" font-size="6" fill="#86efac" text-anchor="middle">via PIX • Trilho</text>
</svg>`;

/* ============== RENAN — óculos + mulheres + cash + armas ============== */

/** Cara de óculos escuros (sempre o mesmo, vibe Renan) */
const GUY_GLASSES = `<svg viewBox="0 0 70 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="28" y="40" width="14" height="14" fill="#d4a574"/>
  <ellipse cx="35" cy="32" rx="18" ry="22" fill="#d4a574" stroke="#7c2d12" stroke-width="1.2"/>
  <!-- cabelo curto preto -->
  <path d="M17 26 Q17 10 35 8 Q53 10 53 26 L52 22 Q44 14 35 14 Q26 14 18 22 Z" fill="#0a0a0a"/>
  <!-- ÓCULOS ESCUROS (assinatura) -->
  <rect x="20" y="28" width="14" height="8" rx="2" fill="#0a0a0a" stroke="#0a0a0a" stroke-width="1.5"/>
  <rect x="36" y="28" width="14" height="8" rx="2" fill="#0a0a0a" stroke="#0a0a0a" stroke-width="1.5"/>
  <line x1="34" y1="32" x2="36" y2="32" stroke="#0a0a0a" stroke-width="1.5"/>
  <line x1="18" y1="32" x2="20" y2="32" stroke="#0a0a0a" stroke-width="1.5"/>
  <line x1="50" y1="32" x2="52" y2="32" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- reflexo lens -->
  <line x1="22" y1="30" x2="26" y2="30" stroke="#3b82f6" stroke-width="0.8" opacity="0.6"/>
  <line x1="38" y1="30" x2="42" y2="30" stroke="#3b82f6" stroke-width="0.8" opacity="0.6"/>
  <!-- nariz -->
  <path d="M35 36 L33 42 L37 42 Z" fill="#a16207" opacity="0.4"/>
  <!-- sorriso confiante -->
  <path d="M30 46 Q35 49 40 46" stroke="#7c2d12" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <!-- corpo -->
  <path d="M14 56 Q14 52 22 52 L48 52 Q56 52 56 56 L58 96 L12 96 Z" fill="#0a0a0a" stroke="#3a3a3a" stroke-width="1.2"/>
  <!-- corrente de ouro -->
  <path d="M28 56 Q35 64 42 56" stroke="#facc15" stroke-width="1.5" fill="none"/>
  <circle cx="35" cy="62" r="2" fill="#facc15" stroke="#a16207" stroke-width="0.8"/>
</svg>`;

/** Pistola */
const GUN_PISTOL = `<svg viewBox="0 0 140 80" xmlns="http://www.w3.org/2000/svg">
  <!-- cano -->
  <rect x="60" y="22" width="76" height="18" rx="2" fill="#1f1f1f" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- mira -->
  <rect x="128" y="18" width="6" height="6" fill="#0a0a0a"/>
  <!-- corpo principal -->
  <path d="M30 22 L70 22 L70 50 Q70 58 60 60 L50 64 Q44 66 40 60 L30 50 Z" fill="#3a3a3a" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- cabo -->
  <path d="M30 50 L36 76 L52 76 L52 60 L40 60 Z" fill="#1f1f1f" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- texture do cabo -->
  <line x1="38" y1="56" x2="48" y2="56" stroke="#3a3a3a" stroke-width="0.8"/>
  <line x1="38" y1="62" x2="48" y2="62" stroke="#3a3a3a" stroke-width="0.8"/>
  <line x1="38" y1="68" x2="48" y2="68" stroke="#3a3a3a" stroke-width="0.8"/>
  <line x1="38" y1="74" x2="48" y2="74" stroke="#3a3a3a" stroke-width="0.8"/>
  <!-- gatilho guarda -->
  <path d="M48 48 Q60 48 60 64 Q56 70 50 68" fill="none" stroke="#0a0a0a" stroke-width="2"/>
  <!-- gatilho -->
  <path d="M54 56 L58 64 L52 64 Z" fill="#0a0a0a"/>
  <!-- highlight no slide -->
  <line x1="64" y1="28" x2="130" y2="28" stroke="#525252" stroke-width="0.8"/>
</svg>`;

/* ============== PALUMBIUN — Audi SUV + cash + plantas ============== */

/** SUV Audi prata (Q7/Q8 style) */
const AUDI_SUV_SILVER = `<svg viewBox="0 0 200 90" xmlns="http://www.w3.org/2000/svg">
  <!-- corpo SUV (mais alto que sedan) -->
  <path d="M10 70 L14 50 Q22 38 40 36 L60 30 L140 28 Q160 30 174 38 L190 50 Q194 60 194 72 L194 76 L10 76 Z" fill="#cbd5e1" stroke="#475569" stroke-width="1.5"/>
  <!-- vidros (formato SUV alto) -->
  <path d="M42 36 L62 30 L96 30 L96 50 L40 50 Z" fill="#1e293b" opacity="0.75"/>
  <path d="M98 30 L138 28 L154 50 L98 50 Z" fill="#1e293b" opacity="0.75"/>
  <line x1="96" y1="30" x2="96" y2="50" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- portas -->
  <line x1="96" y1="50" x2="96" y2="76" stroke="#94a3b8" stroke-width="0.8"/>
  <line x1="60" y1="36" x2="60" y2="76" stroke="#94a3b8" stroke-width="0.8"/>
  <line x1="140" y1="36" x2="140" y2="76" stroke="#94a3b8" stroke-width="0.8"/>
  <!-- linha cromada -->
  <line x1="20" y1="60" x2="186" y2="60" stroke="#fafafa" stroke-width="1.2"/>
  <!-- rodas grandes (SUV) -->
  <circle cx="44" cy="76" r="14" fill="#0a0a0a"/>
  <circle cx="44" cy="76" r="7" fill="#cbd5e1"/>
  <path d="M44 69 L44 83 M37 76 L51 76 M39 71 L49 81 M49 71 L39 81" stroke="#0a0a0a" stroke-width="1.5"/>
  <circle cx="158" cy="76" r="14" fill="#0a0a0a"/>
  <circle cx="158" cy="76" r="7" fill="#cbd5e1"/>
  <path d="M158 69 L158 83 M151 76 L165 76 M153 71 L163 81 M163 71 L153 81" stroke="#0a0a0a" stroke-width="1.5"/>
  <!-- farois -->
  <rect x="12" y="50" width="10" height="8" rx="1" fill="#fef3c7"/>
  <rect x="178" y="50" width="10" height="8" rx="1" fill="#dc2626"/>
  <!-- 4 anéis Audi na frente -->
  <g fill="none" stroke="#fafafa" stroke-width="1.2">
    <circle cx="14" cy="44" r="2.5"/>
    <circle cx="20" cy="44" r="2.5"/>
    <circle cx="26" cy="44" r="2.5"/>
    <circle cx="32" cy="44" r="2.5"/>
  </g>
</svg>`;

/** Folha de planta (genérica, verde) */
const PLANT_LEAF = `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
  <!-- folha principal -->
  <path d="M40 6 Q12 26 14 60 Q20 88 40 94 Q60 88 66 60 Q68 26 40 6 Z" fill="#16a34a" stroke="#052e16" stroke-width="1.5"/>
  <!-- nervura central -->
  <path d="M40 6 L40 94" stroke="#052e16" stroke-width="1.5"/>
  <!-- nervuras laterais -->
  <path d="M40 20 Q28 24 22 32" stroke="#15803d" stroke-width="1" fill="none"/>
  <path d="M40 32 Q26 36 18 46" stroke="#15803d" stroke-width="1" fill="none"/>
  <path d="M40 48 Q24 52 16 62" stroke="#15803d" stroke-width="1" fill="none"/>
  <path d="M40 64 Q26 68 20 76" stroke="#15803d" stroke-width="1" fill="none"/>
  <path d="M40 20 Q52 24 58 32" stroke="#15803d" stroke-width="1" fill="none"/>
  <path d="M40 32 Q54 36 62 46" stroke="#15803d" stroke-width="1" fill="none"/>
  <path d="M40 48 Q56 52 64 62" stroke="#15803d" stroke-width="1" fill="none"/>
  <path d="M40 64 Q54 68 60 76" stroke="#15803d" stroke-width="1" fill="none"/>
  <!-- highlight -->
  <path d="M40 14 Q30 30 30 60" stroke="#22c55e" stroke-width="2" fill="none" opacity="0.55"/>
</svg>`;

/** Vaso de planta (Monstera estilo) */
const POTTED_PLANT = `<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg">
  <!-- folhas variadas -->
  <ellipse cx="30" cy="40" rx="14" ry="22" fill="#16a34a" stroke="#052e16" stroke-width="1.2" transform="rotate(-30 30 40)"/>
  <ellipse cx="70" cy="42" rx="14" ry="22" fill="#15803d" stroke="#052e16" stroke-width="1.2" transform="rotate(30 70 42)"/>
  <ellipse cx="50" cy="22" rx="13" ry="20" fill="#22c55e" stroke="#052e16" stroke-width="1.2"/>
  <ellipse cx="18" cy="64" rx="10" ry="18" fill="#16a34a" stroke="#052e16" stroke-width="1.2" transform="rotate(-50 18 64)"/>
  <ellipse cx="82" cy="64" rx="10" ry="18" fill="#15803d" stroke="#052e16" stroke-width="1.2" transform="rotate(50 82 64)"/>
  <!-- haste -->
  <line x1="50" y1="80" x2="50" y2="100" stroke="#166534" stroke-width="2"/>
  <!-- vaso -->
  <path d="M30 86 L70 86 L74 124 L26 124 Z" fill="#92400e" stroke="#451a03" stroke-width="1.5"/>
  <rect x="28" y="86" width="44" height="6" fill="#7c2d12" stroke="#451a03" stroke-width="1.5"/>
</svg>`;

/* ============== Bandeira do Japão WAVING (variação) ============== */
const JAPAN_FLAG_POLE = `<svg viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg">
  <!-- mastro -->
  <line x1="10" y1="6" x2="10" y2="106" stroke="#a3a3a3" stroke-width="3"/>
  <circle cx="10" cy="6" r="3" fill="#facc15" stroke="#a16207" stroke-width="1"/>
  <!-- bandeira -->
  <path d="M14 10 Q60 4 110 14 Q108 40 112 60 Q60 50 14 62 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="1"/>
  <ellipse cx="60" cy="34" rx="20" ry="18" fill="#dc2626"/>
</svg>`;

/* ============== SCENES ============== */

export const SCENES_SPECIAL: Record<string, Scene> = {
  kushdela: {
    gradient:
      "radial-gradient(ellipse at top, rgba(59,130,246,0.25) 0%, transparent 60%), linear-gradient(180deg, transparent 0%, rgba(10,23,51,0.6) 100%)",
    elements: [
      // Mordecai grande nos cantos de baixo
      { svg: MORDECAI_HEAD, pin: "bottom-left", x: 5, y: 5, size: 240, opacity: 0.7 },
      { svg: MORDECAI_HEAD, pin: "bottom-right", x: 5, y: 5, size: 260, opacity: 0.72 },
      { svg: MORDECAI_HEAD, x: 50, y: 35, size: 200, opacity: 0.55, anim: 0 },
      { svg: MORDECAI_HEAD, x: 25, y: 65, size: 160, opacity: 0.5, anim: 1 },
      { svg: MORDECAI_HEAD, x: 75, y: 65, size: 170, opacity: 0.52, anim: 2 },

      // Castelo da Disney (foto do feed)
      { svg: DISNEY_CASTLE, x: 50, y: 18, size: 260, opacity: 0.7, anim: 0 },
      { svg: DISNEY_CASTLE, x: 18, y: 40, size: 180, opacity: 0.55, anim: 1 },
      { svg: DISNEY_CASTLE, x: 82, y: 40, size: 200, opacity: 0.58, anim: 2 },

      // Audi rings (story highlight)
      { svg: AUDI_RINGS, x: 30, y: 25, size: 200, opacity: 0.7, anim: 0 },
      { svg: AUDI_RINGS, x: 70, y: 80, size: 220, opacity: 0.72, anim: 1 },
      { svg: AUDI_RINGS, x: 50, y: 88, size: 240, opacity: 0.75, anim: 2 },

      // Notas de US$ 100 (faço uns dígitos $$$)
      { svg: HUNDRED_BILL, x: 14, y: 22, size: 130, opacity: 0.7, rotate: -15, anim: 0 },
      { svg: HUNDRED_BILL, x: 42, y: 52, size: 150, opacity: 0.75, rotate: 18, anim: 1 },
      { svg: HUNDRED_BILL, x: 88, y: 22, size: 140, opacity: 0.72, rotate: -10, anim: 2 },
      { svg: HUNDRED_BILL, x: 60, y: 75, size: 130, opacity: 0.7, rotate: 25, anim: 3 },
      { svg: HUNDRED_BILL, x: 14, y: 75, size: 120, opacity: 0.68, rotate: -8, anim: 0 },

      // Diamantes (lifestyle)
      { svg: DIAMOND_GEM, x: 22, y: 50, size: 70, opacity: 0.75, anim: 0 },
      { svg: DIAMOND_GEM, x: 78, y: 50, size: 80, opacity: 0.78, anim: 1 },
      { svg: DIAMOND_GEM, x: 50, y: 60, size: 65, opacity: 0.72, anim: 2 },

      // Globo (worldwide)
      { svg: GLOBE, x: 8, y: 60, size: 90, opacity: 0.7, anim: 0 },
      { svg: GLOBE, x: 92, y: 78, size: 100, opacity: 0.72, anim: 1 },

      // Tênis estiloso (postagens com sneakers)
      { svg: SNEAKER, x: 36, y: 88, size: 140, opacity: 0.75, rotate: -5, anim: 2 },
      { svg: SNEAKER, x: 70, y: 92, size: 130, opacity: 0.72, rotate: 8, anim: 3 },

      // Coffee mug (Mordecai do Park)
      { svg: COFFEE_MUG, x: 14, y: 10, size: 70, opacity: 0.7, anim: 0 },
      { svg: COFFEE_MUG, x: 86, y: 12, size: 80, opacity: 0.72, anim: 1 },

      // $$$ gigante de fundo
      { svg: DOLLAR_BIG, x: 50, y: 50, size: 280, opacity: 0.15, anim: 0 },
    ],
  },

  thonyecom: {
    gradient:
      "radial-gradient(ellipse at 20% 30%, rgba(255,255,255,0.06) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(22,163,74,0.08) 0%, transparent 50%), linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.95) 100%)",
    elements: [
      /* ============ CAMADA 1 — TEIAS GIGANTES DIAGONAIS ============
       * 4 teias enormes saindo dos cantos cobrindo metade da tela cada,
       * com rotação pra cada canto. Cria a sensação de "tela inteira
       * coberta de teias" cinematográfica.
       */
      { svg: HUGE_DIAGONAL_WEB, pin: "top-left", x: 0, y: 0, size: 700, opacity: 0.35 },
      { svg: HUGE_DIAGONAL_WEB, pin: "top-right", x: 0, y: 0, size: 700, opacity: 0.32, rotate: 90 },
      { svg: HUGE_DIAGONAL_WEB, pin: "bottom-right", x: 0, y: 0, size: 700, opacity: 0.32, rotate: 180 },
      { svg: HUGE_DIAGONAL_WEB, pin: "bottom-left", x: 0, y: 0, size: 700, opacity: 0.32, rotate: 270 },

      /* ============ CAMADA 2 — ARANHA BRANCA CENTRAL ============
       * Símbolo gigante centralizado, baixo opacity — vira o "ponto focal"
       * mas sem competir com a leitura
       */
      { svg: BIG_WHITE_SPIDER, x: 50, y: 50, size: 460, opacity: 0.12 },

      /* ============ CAMADA 3 — FRAGMENTOS DE TEIA FLUTUANDO ============
       * Pedaços menores de teia em rotações variadas, criam profundidade.
       */
      { svg: WEB_FRAGMENT, x: 18, y: 25, size: 180, opacity: 0.45, rotate: -15, anim: 0 },
      { svg: WEB_FRAGMENT, x: 78, y: 22, size: 200, opacity: 0.42, rotate: 22, anim: 1 },
      { svg: WEB_FRAGMENT, x: 30, y: 70, size: 170, opacity: 0.4, rotate: 35, anim: 2 },
      { svg: WEB_FRAGMENT, x: 72, y: 75, size: 190, opacity: 0.44, rotate: -28, anim: 3 },
      { svg: WEB_FRAGMENT, x: 50, y: 32, size: 150, opacity: 0.36, rotate: 8, anim: 0 },
      { svg: WEB_FRAGMENT, x: 50, y: 78, size: 160, opacity: 0.38, rotate: -10, anim: 1 },

      /* ============ CAMADA 4 — FIOS DE TEIA PENDURADOS ============
       * Threads verticais com gotinha na ponta saindo do topo.
       */
      { svg: WEB_THREAD, pin: "top-left", x: 22, y: 0, size: 120, opacity: 0.5 },
      { svg: WEB_THREAD, pin: "top-left", x: 38, y: 0, size: 100, opacity: 0.45 },
      { svg: WEB_THREAD, pin: "top-right", x: 22, y: 0, size: 130, opacity: 0.5 },
      { svg: WEB_THREAD, pin: "top-right", x: 38, y: 0, size: 110, opacity: 0.46 },
      { svg: WEB_THREAD, x: 14, y: 30, size: 90, opacity: 0.4, anim: 0 },
      { svg: WEB_THREAD, x: 86, y: 30, size: 95, opacity: 0.42, anim: 1 },
      { svg: WEB_THREAD, x: 50, y: 20, size: 80, opacity: 0.38, anim: 2 },

      /* ============ CAMADA 5 — DINHEIRO CAINDO ============
       * Notas de US$100 em rotações dramáticas + tamanhos variados,
       * algumas grandes em primeiro plano, outras pequenas no fundo.
       */
      { svg: FALLING_BILL, x: 18, y: 15, size: 130, opacity: 0.85, rotate: -25, anim: 0 },
      { svg: FALLING_BILL, x: 42, y: 22, size: 100, opacity: 0.7, rotate: 35, anim: 1 },
      { svg: FALLING_BILL, x: 70, y: 12, size: 140, opacity: 0.88, rotate: -15, anim: 2 },
      { svg: FALLING_BILL, x: 88, y: 28, size: 110, opacity: 0.78, rotate: 20, anim: 3 },
      { svg: FALLING_BILL, x: 14, y: 55, size: 120, opacity: 0.82, rotate: 40, anim: 0 },
      { svg: FALLING_BILL, x: 50, y: 50, size: 90, opacity: 0.65, rotate: -45, anim: 1 },
      { svg: FALLING_BILL, x: 86, y: 60, size: 130, opacity: 0.85, rotate: -10, anim: 2 },
      { svg: FALLING_BILL, x: 25, y: 85, size: 150, opacity: 0.9, rotate: 18, anim: 3 },
      { svg: FALLING_BILL, x: 60, y: 88, size: 120, opacity: 0.82, rotate: -25, anim: 0 },
      { svg: FALLING_BILL, x: 80, y: 90, size: 110, opacity: 0.78, rotate: 30, anim: 1 },

      /* ============ CAMADA 6 — NOTAS PRESAS NAS TEIAS ============
       * Bills com teia sobreposta — vibe "money trapped in webs"
       */
      { svg: BILL_IN_WEB, x: 30, y: 40, size: 140, opacity: 0.8, rotate: -18, anim: 2 },
      { svg: BILL_IN_WEB, x: 72, y: 42, size: 150, opacity: 0.82, rotate: 22, anim: 3 },
      { svg: BILL_IN_WEB, x: 50, y: 65, size: 130, opacity: 0.78, rotate: 5, anim: 0 },

      /* ============ CAMADA 7 — ARANHAS DESCENDO ============
       * Pequenas aranhas brancas penduradas em fios, em pontos estratégicos.
       */
      { svg: SPIDER_HANGING, pin: "top-left", x: 10, y: 0, size: 60, opacity: 0.7 },
      { svg: SPIDER_HANGING, pin: "top-right", x: 14, y: 0, size: 65, opacity: 0.72 },
      { svg: SPIDER_HANGING, x: 50, y: 10, size: 55, opacity: 0.65, anim: 0 },

      /* ============ CAMADA 8 — SPARKLES (brilhos pontuais) ============
       * Pontinhos brilhantes pra dar "vida noturna" à teia (como se
       * orvalho refletisse luz nas teias).
       */
      { svg: WEB_SPARKLE, x: 25, y: 28, size: 14, opacity: 0.9, anim: 0 },
      { svg: WEB_SPARKLE, x: 65, y: 18, size: 12, opacity: 0.85, anim: 1 },
      { svg: WEB_SPARKLE, x: 40, y: 50, size: 10, opacity: 0.8, anim: 2 },
      { svg: WEB_SPARKLE, x: 80, y: 55, size: 14, opacity: 0.9, anim: 3 },
      { svg: WEB_SPARKLE, x: 20, y: 75, size: 12, opacity: 0.85, anim: 0 },
      { svg: WEB_SPARKLE, x: 60, y: 80, size: 10, opacity: 0.8, anim: 1 },
      { svg: WEB_SPARKLE, x: 90, y: 85, size: 14, opacity: 0.9, anim: 2 },
      { svg: WEB_SPARKLE, x: 35, y: 92, size: 11, opacity: 0.82, anim: 3 },
      { svg: WEB_SPARKLE, x: 12, y: 50, size: 13, opacity: 0.85, anim: 0 },
      { svg: WEB_SPARKLE, x: 88, y: 35, size: 12, opacity: 0.83, anim: 2 },
    ],
  },

  blame: {
    gradient:
      "radial-gradient(ellipse at top, rgba(59,130,246,0.20) 0%, transparent 60%), radial-gradient(ellipse at bottom, rgba(191,219,254,0.15) 0%, transparent 50%), linear-gradient(180deg, rgba(2,6,23,0.4) 0%, rgba(15,23,42,0.7) 100%)",
    elements: [
      // 6 latas Monster White em destaque
      { svg: MONSTER_WHITE_CAN, pin: "bottom-left", x: 5, y: 5, size: 170, opacity: 0.9 },
      { svg: MONSTER_WHITE_CAN, pin: "bottom-right", x: 5, y: 5, size: 190, opacity: 0.92 },
      { svg: MONSTER_WHITE_CAN, x: 50, y: 50, size: 220, opacity: 0.88, anim: 0 },
      { svg: MONSTER_WHITE_CAN, x: 22, y: 35, size: 140, opacity: 0.78, rotate: -8, anim: 1 },
      { svg: MONSTER_WHITE_CAN, x: 78, y: 35, size: 150, opacity: 0.8, rotate: 8, anim: 2 },
      { svg: MONSTER_WHITE_CAN, x: 50, y: 18, size: 120, opacity: 0.72, anim: 3 },
      // Garras "M" azuis (icônicas) em vários ângulos
      { svg: MONSTER_CLAW_BLUE, x: 18, y: 18, size: 130, opacity: 0.7, rotate: -10, anim: 0 },
      { svg: MONSTER_CLAW_BLUE, x: 82, y: 18, size: 140, opacity: 0.72, rotate: 12, anim: 1 },
      { svg: MONSTER_CLAW_BLUE, x: 38, y: 75, size: 150, opacity: 0.75, rotate: -8, anim: 2 },
      { svg: MONSTER_CLAW_BLUE, x: 62, y: 75, size: 145, opacity: 0.73, rotate: 10, anim: 3 },
      { svg: MONSTER_CLAW_BLUE, x: 12, y: 65, size: 110, opacity: 0.65, rotate: 20, anim: 0 },
      { svg: MONSTER_CLAW_BLUE, x: 88, y: 65, size: 115, opacity: 0.68, rotate: -20, anim: 1 },
      // Cubos de gelo
      { svg: ICE_CUBE, x: 10, y: 50, size: 65, opacity: 0.75, rotate: 15, anim: 0 },
      { svg: ICE_CUBE, x: 90, y: 50, size: 70, opacity: 0.78, rotate: -20, anim: 1 },
      { svg: ICE_CUBE, x: 30, y: 90, size: 55, opacity: 0.7, rotate: 10, anim: 2 },
      { svg: ICE_CUBE, x: 70, y: 90, size: 60, opacity: 0.72, rotate: -15, anim: 3 },
      // Raios azuis (energia)
      { svg: LIGHTNING_BLUE, x: 14, y: 8, size: 70, opacity: 0.85, anim: 0 },
      { svg: LIGHTNING_BLUE, x: 86, y: 8, size: 80, opacity: 0.88, rotate: 15, anim: 1 },
      { svg: LIGHTNING_BLUE, x: 34, y: 30, size: 55, opacity: 0.72, rotate: -10, anim: 2 },
      { svg: LIGHTNING_BLUE, x: 66, y: 30, size: 60, opacity: 0.75, rotate: 8, anim: 3 },
      { svg: LIGHTNING_BLUE, x: 50, y: 88, size: 75, opacity: 0.82, anim: 0 },
      // Flocos de neve (frost)
      { svg: SNOWFLAKE_BLUE, x: 22, y: 12, size: 50, opacity: 0.7, anim: 0 },
      { svg: SNOWFLAKE_BLUE, x: 78, y: 12, size: 55, opacity: 0.72, anim: 1 },
      { svg: SNOWFLAKE_BLUE, x: 42, y: 65, size: 45, opacity: 0.65, anim: 2 },
      { svg: SNOWFLAKE_BLUE, x: 58, y: 65, size: 48, opacity: 0.68, anim: 3 },
      { svg: SNOWFLAKE_BLUE, x: 8, y: 80, size: 42, opacity: 0.6, anim: 0 },
      { svg: SNOWFLAKE_BLUE, x: 92, y: 80, size: 46, opacity: 0.63, anim: 1 },
      // Gotas d'água
      { svg: WATER_DROP, x: 28, y: 50, size: 50, opacity: 0.7, anim: 0 },
      { svg: WATER_DROP, x: 72, y: 50, size: 55, opacity: 0.72, anim: 1 },
    ],
  },

  zeny: {
    gradient:
      "radial-gradient(ellipse at top, rgba(220,38,38,0.22) 0%, transparent 60%), linear-gradient(180deg, rgba(26,10,10,0.30) 0%, rgba(0,0,0,0.6) 100%)",
    elements: [
      // Rigby grande nos cantos
      { svg: RIGBY_HEAD, pin: "bottom-left", x: 5, y: 5, size: 220, opacity: 0.72 },
      { svg: RIGBY_HEAD, pin: "bottom-right", x: 5, y: 5, size: 240, opacity: 0.75 },
      { svg: RIGBY_HEAD, x: 50, y: 35, size: 200, opacity: 0.55, anim: 0 },
      { svg: RIGBY_HEAD, x: 22, y: 60, size: 150, opacity: 0.5, anim: 1 },
      { svg: RIGBY_HEAD, x: 78, y: 60, size: 160, opacity: 0.52, anim: 2 },

      // Gato preto (story highlight)
      { svg: BLACK_CAT, x: 14, y: 22, size: 110, opacity: 0.75, anim: 0 },
      { svg: BLACK_CAT, x: 50, y: 18, size: 130, opacity: 0.78, anim: 1 },
      { svg: BLACK_CAT, x: 86, y: 22, size: 120, opacity: 0.75, anim: 2 },
      { svg: BLACK_CAT, x: 30, y: 78, size: 100, opacity: 0.7, anim: 3 },
      { svg: BLACK_CAT, x: 70, y: 78, size: 105, opacity: 0.72, anim: 0 },

      // Carro branco (foto do post)
      { svg: WHITE_SPORTS_CAR, x: 50, y: 60, size: 240, opacity: 0.72, anim: 0 },
      { svg: WHITE_SPORTS_CAR, x: 22, y: 40, size: 180, opacity: 0.6, anim: 1 },
      { svg: WHITE_SPORTS_CAR, x: 78, y: 40, size: 190, opacity: 0.62, anim: 2 },

      // Ratos 🐀 (zeny)
      { svg: RAT, x: 18, y: 50, size: 100, opacity: 0.72, anim: 0 },
      { svg: RAT, x: 82, y: 48, size: 110, opacity: 0.75, anim: 1 },
      { svg: RAT, x: 50, y: 88, size: 130, opacity: 0.78, anim: 2 },

      // Terminal/Cybersecurity (👨‍💻)
      { svg: TERMINAL_WINDOW, x: 14, y: 70, size: 170, opacity: 0.65, rotate: -8, anim: 0 },
      { svg: TERMINAL_WINDOW, x: 86, y: 70, size: 180, opacity: 0.68, rotate: 6, anim: 1 },
      { svg: TERMINAL_WINDOW, x: 50, y: 22, size: 200, opacity: 0.6, anim: 2 },

      // Caveiras #SWAG
      { svg: SWAG_SKULL, x: 36, y: 50, size: 90, opacity: 0.75, rotate: -10, anim: 0 },
      { svg: SWAG_SKULL, x: 64, y: 52, size: 95, opacity: 0.78, rotate: 12, anim: 1 },
      { svg: SWAG_SKULL, x: 50, y: 70, size: 80, opacity: 0.7, anim: 2 },

      // Hoodie hacker silhuetas
      { svg: HOODIE_FIGURE, x: 8, y: 38, size: 110, opacity: 0.55, anim: 0 },
      { svg: HOODIE_FIGURE, x: 92, y: 38, size: 120, opacity: 0.58, anim: 1 },

      // TikTok LIVE badge
      { svg: TIKTOK_LIVE, x: 28, y: 28, size: 130, opacity: 0.78, rotate: -8, anim: 0 },
      { svg: TIKTOK_LIVE, x: 72, y: 30, size: 140, opacity: 0.8, rotate: 10, anim: 1 },
      { svg: TIKTOK_LIVE, x: 50, y: 80, size: 150, opacity: 0.82, anim: 2 },
    ],
  },

  japa: {
    gradient:
      "radial-gradient(ellipse at top, rgba(220,38,38,0.25) 0%, transparent 55%), radial-gradient(ellipse at bottom, rgba(250,250,250,0.10) 0%, transparent 50%), linear-gradient(180deg, rgba(26,10,10,0.55) 0%, rgba(0,0,0,0.85) 100%)",
    elements: [
      // BANDEIRAS DO JAPÃO caindo pela tela inteira (chuva de Hinomaru)
      { svg: JAPAN_FLAG, x: 8, y: 6, size: 100, opacity: 0.95, rotate: -18, anim: 0 },
      { svg: JAPAN_FLAG, x: 24, y: 12, size: 120, opacity: 0.96, rotate: 14, anim: 1 },
      { svg: JAPAN_FLAG, x: 42, y: 8, size: 110, opacity: 0.95, rotate: -8, anim: 2 },
      { svg: JAPAN_FLAG, x: 60, y: 14, size: 130, opacity: 0.96, rotate: 22, anim: 3 },
      { svg: JAPAN_FLAG, x: 78, y: 10, size: 115, opacity: 0.95, rotate: -16, anim: 0 },
      { svg: JAPAN_FLAG, x: 92, y: 18, size: 105, opacity: 0.94, rotate: 24, anim: 1 },
      { svg: JAPAN_FLAG, x: 14, y: 34, size: 120, opacity: 0.96, rotate: 18, anim: 2 },
      { svg: JAPAN_FLAG, x: 34, y: 40, size: 135, opacity: 0.96, rotate: -14, anim: 3 },
      { svg: JAPAN_FLAG, x: 54, y: 36, size: 125, opacity: 0.96, rotate: 20, anim: 0 },
      { svg: JAPAN_FLAG, x: 74, y: 42, size: 130, opacity: 0.96, rotate: -22, anim: 1 },
      { svg: JAPAN_FLAG, x: 90, y: 38, size: 110, opacity: 0.94, rotate: 10, anim: 2 },
      { svg: JAPAN_FLAG, x: 10, y: 64, size: 115, opacity: 0.95, rotate: -10, anim: 3 },
      { svg: JAPAN_FLAG, x: 28, y: 66, size: 120, opacity: 0.96, rotate: 16, anim: 0 },
      { svg: JAPAN_FLAG, x: 50, y: 62, size: 140, opacity: 0.97, rotate: -20, anim: 1 },
      { svg: JAPAN_FLAG, x: 70, y: 68, size: 125, opacity: 0.96, rotate: 14, anim: 2 },
      { svg: JAPAN_FLAG, x: 88, y: 64, size: 115, opacity: 0.95, rotate: -8, anim: 3 },
      { svg: JAPAN_FLAG, x: 18, y: 88, size: 110, opacity: 0.94, rotate: 22, anim: 0 },
      { svg: JAPAN_FLAG, x: 42, y: 92, size: 130, opacity: 0.96, rotate: -16, anim: 1 },
      { svg: JAPAN_FLAG, x: 66, y: 90, size: 120, opacity: 0.95, rotate: 18, anim: 2 },
      { svg: JAPAN_FLAG, x: 86, y: 88, size: 115, opacity: 0.95, rotate: -12, anim: 3 },

      // BANDEIRAS ONDULADAS (variação maior, em movimento)
      { svg: JAPAN_FLAG_WAVY, x: 20, y: 22, size: 160, opacity: 0.88, rotate: -6, anim: 0 },
      { svg: JAPAN_FLAG_WAVY, x: 80, y: 24, size: 170, opacity: 0.9, rotate: 8, anim: 1 },
      { svg: JAPAN_FLAG_WAVY, x: 50, y: 52, size: 180, opacity: 0.85, anim: 2 },
      { svg: JAPAN_FLAG_WAVY, x: 26, y: 78, size: 165, opacity: 0.87, rotate: -10, anim: 3 },
      { svg: JAPAN_FLAG_WAVY, x: 76, y: 80, size: 175, opacity: 0.88, rotate: 12, anim: 0 },

      // TOYOTA FIELDER (perua branca) — ancorados nos cantos + central
      { svg: FIELDER_WAGON, pin: "bottom-left", x: 4, y: 6, size: 280, opacity: 0.95 },
      { svg: FIELDER_WAGON, pin: "bottom-right", x: 4, y: 6, size: 300, opacity: 0.96 },
      { svg: FIELDER_WAGON, x: 50, y: 58, size: 360, opacity: 0.92, anim: 0 },
      { svg: FIELDER_WAGON, x: 22, y: 28, size: 200, opacity: 0.85, rotate: -4, anim: 1 },
      { svg: FIELDER_WAGON, x: 78, y: 28, size: 220, opacity: 0.86, rotate: 4, anim: 2 },
      { svg: FIELDER_WAGON, x: 30, y: 78, size: 240, opacity: 0.88, rotate: -2, anim: 3 },
      { svg: FIELDER_WAGON, x: 70, y: 82, size: 250, opacity: 0.88, rotate: 2, anim: 0 },

      // FIELDER PRATA (variação)
      { svg: FIELDER_SILVER, x: 14, y: 50, size: 200, opacity: 0.82, rotate: -6, anim: 1 },
      { svg: FIELDER_SILVER, x: 86, y: 50, size: 210, opacity: 0.83, rotate: 6, anim: 2 },
      { svg: FIELDER_SILVER, x: 50, y: 36, size: 230, opacity: 0.85, anim: 3 },

      // LOGOS DA TOYOTA (oval cromado)
      { svg: TOYOTA_LOGO, x: 12, y: 14, size: 100, opacity: 0.78, rotate: -8, anim: 0 },
      { svg: TOYOTA_LOGO, x: 88, y: 14, size: 110, opacity: 0.8, rotate: 10, anim: 1 },
      { svg: TOYOTA_LOGO, x: 40, y: 52, size: 130, opacity: 0.7, anim: 2 },
      { svg: TOYOTA_LOGO, x: 60, y: 50, size: 120, opacity: 0.72, anim: 3 },

      // SAKURAS (cerejeiras caindo)
      { svg: SAKURA, x: 6, y: 24, size: 50, opacity: 0.85, rotate: -10, anim: 0 },
      { svg: SAKURA, x: 36, y: 16, size: 60, opacity: 0.88, rotate: 18, anim: 1 },
      { svg: SAKURA, x: 64, y: 22, size: 55, opacity: 0.86, rotate: -14, anim: 2 },
      { svg: SAKURA, x: 94, y: 28, size: 50, opacity: 0.84, rotate: 22, anim: 3 },
      { svg: SAKURA, x: 22, y: 56, size: 65, opacity: 0.9, anim: 0 },
      { svg: SAKURA, x: 78, y: 58, size: 60, opacity: 0.88, anim: 1 },
      { svg: SAKURA, x: 50, y: 78, size: 55, opacity: 0.86, rotate: 16, anim: 2 },
    ],
  },

  davicopy: {
    gradient:
      "radial-gradient(ellipse at 20% 30%, rgba(251,191,36,0.18) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(16,185,129,0.16) 0%, transparent 50%), radial-gradient(ellipse at 50% 100%, rgba(220,38,38,0.12) 0%, transparent 60%), linear-gradient(180deg, rgba(5,10,8,0.6) 0%, rgba(0,0,0,0.92) 100%)",
    elements: [
      // ===== CAMADA 1: BACKGROUND — cifrões dourados gigantes (atmosfera) =====
      { svg: GOLDEN_DOLLAR, x: 50, y: 50, size: 600, opacity: 0.06, anim: 0 },
      { svg: GOLDEN_DOLLAR, x: 18, y: 28, size: 280, opacity: 0.12, anim: 1 },
      { svg: GOLDEN_DOLLAR, x: 82, y: 72, size: 320, opacity: 0.14, anim: 2 },

      // ===== CAMADA 2: PALAVRAS DE PODER (copy CTAs) flutuando =====
      { svg: COPY_WORD_BUY, x: 18, y: 12, size: 200, opacity: 0.88, rotate: -8, anim: 0 },
      { svg: COPY_WORD_LIMITED, x: 78, y: 18, size: 220, opacity: 0.85, rotate: 6, anim: 1 },
      { svg: COPY_WORD_NOW, x: 22, y: 84, size: 160, opacity: 0.9, rotate: -10, anim: 2 },
      { svg: COPY_WORD_VOCE, x: 68, y: 86, size: 220, opacity: 0.78, rotate: 4, anim: 3 },
      { svg: COPY_WORD_GARANTIA, x: 50, y: 22, size: 240, opacity: 0.82, rotate: -2, anim: 0 },
      { svg: COPY_WORD_BUY, x: 88, y: 56, size: 180, opacity: 0.85, rotate: 12, anim: 1 },
      { svg: COPY_WORD_LIMITED, x: 12, y: 60, size: 200, opacity: 0.82, rotate: -14, anim: 2 },
      { svg: COPY_WORD_NOW, x: 50, y: 72, size: 150, opacity: 0.88, rotate: 8, anim: 3 },

      // ===== CAMADA 3: COROA gigante de fundo (CEO vibe) =====
      { svg: KING_CROWN, x: 50, y: 14, size: 360, opacity: 0.32, anim: 0 },

      // ===== CAMADA 4: CHECKOUT CARDS (o produto final, foco) =====
      { svg: CHECKOUT_CARD, x: 28, y: 42, size: 280, opacity: 0.92, rotate: -4, anim: 1 },
      { svg: CHECKOUT_CARD, x: 72, y: 50, size: 300, opacity: 0.94, rotate: 5, anim: 2 },
      { svg: CHECKOUT_CARD, x: 50, y: 30, size: 260, opacity: 0.78, rotate: -1, anim: 3 },

      // ===== CAMADA 5: NOTIFICAÇÕES DE PIX RECEBIDO (o som do dinheiro) =====
      { svg: PIX_NOTIFICATION, x: 14, y: 24, size: 240, opacity: 0.94, rotate: -6, anim: 0 },
      { svg: PIX_NOTIFICATION, x: 86, y: 30, size: 250, opacity: 0.95, rotate: 5, anim: 1 },
      { svg: PIX_NOTIFICATION, x: 22, y: 56, size: 230, opacity: 0.92, rotate: 4, anim: 2 },
      { svg: PIX_NOTIFICATION, x: 80, y: 64, size: 240, opacity: 0.94, rotate: -3, anim: 3 },
      { svg: PIX_NOTIFICATION, x: 50, y: 80, size: 260, opacity: 0.96, rotate: 2, anim: 0 },

      // ===== CAMADA 6: SMARTPHONES (mobile-first) =====
      { svg: PHONE_PIX, pin: "bottom-left", x: 6, y: 8, size: 180, opacity: 0.88 },
      { svg: PHONE_PIX, pin: "bottom-right", x: 6, y: 8, size: 190, opacity: 0.9 },
      { svg: PHONE_PIX, x: 38, y: 70, size: 150, opacity: 0.78, rotate: -8, anim: 1 },
      { svg: PHONE_PIX, x: 62, y: 70, size: 155, opacity: 0.8, rotate: 8, anim: 2 },

      // ===== CAMADA 7: GRÁFICOS DE CONVERSÃO subindo =====
      { svg: RISING_CHART, x: 12, y: 38, size: 200, opacity: 0.85, rotate: -2, anim: 0 },
      { svg: RISING_CHART, x: 88, y: 42, size: 210, opacity: 0.87, rotate: 3, anim: 1 },
      { svg: RISING_CHART, x: 50, y: 60, size: 240, opacity: 0.75, anim: 2 },
      { svg: RISING_CHART, x: 30, y: 88, size: 180, opacity: 0.82, rotate: -4, anim: 3 },
      { svg: RISING_CHART, x: 70, y: 88, size: 180, opacity: 0.82, rotate: 4, anim: 0 },

      // ===== CAMADA 8: FUNIS DE VENDA =====
      { svg: SALES_FUNNEL, x: 8, y: 50, size: 130, opacity: 0.85, rotate: -6, anim: 0 },
      { svg: SALES_FUNNEL, x: 92, y: 52, size: 140, opacity: 0.87, rotate: 6, anim: 1 },
      { svg: SALES_FUNNEL, x: 50, y: 90, size: 140, opacity: 0.82, anim: 2 },

      // ===== CAMADA 9: ALVOS (target audience certeira) =====
      { svg: TARGET, x: 28, y: 18, size: 90, opacity: 0.8, rotate: -10, anim: 0 },
      { svg: TARGET, x: 72, y: 18, size: 95, opacity: 0.82, rotate: 12, anim: 1 },
      { svg: TARGET, x: 18, y: 76, size: 80, opacity: 0.78, anim: 2 },
      { svg: TARGET, x: 82, y: 78, size: 85, opacity: 0.8, anim: 3 },

      // ===== CAMADA 10: FOGUETES DOURADOS (escalada) =====
      { svg: GOLD_ROCKET, x: 14, y: 14, size: 100, opacity: 0.9, rotate: -20, anim: 0 },
      { svg: GOLD_ROCKET, x: 86, y: 14, size: 105, opacity: 0.92, rotate: 20, anim: 1 },
      { svg: GOLD_ROCKET, x: 38, y: 8, size: 80, opacity: 0.85, rotate: -10, anim: 2 },
      { svg: GOLD_ROCKET, x: 62, y: 8, size: 85, opacity: 0.87, rotate: 10, anim: 3 },

      // ===== CAMADA 11: SELOS BEST SELLER + URGENTE =====
      { svg: BESTSELLER_BADGE, x: 16, y: 46, size: 110, opacity: 0.92, rotate: -12, anim: 0 },
      { svg: BESTSELLER_BADGE, x: 84, y: 46, size: 115, opacity: 0.94, rotate: 14, anim: 1 },
      { svg: BESTSELLER_BADGE, x: 42, y: 22, size: 95, opacity: 0.88, rotate: 8, anim: 2 },
      { svg: BESTSELLER_BADGE, x: 58, y: 78, size: 100, opacity: 0.9, rotate: -8, anim: 3 },
      { svg: URGENT_TAG, x: 30, y: 30, size: 180, opacity: 0.88, rotate: -6, anim: 0 },
      { svg: URGENT_TAG, x: 70, y: 36, size: 190, opacity: 0.9, rotate: 8, anim: 1 },
      { svg: URGENT_TAG, x: 50, y: 56, size: 200, opacity: 0.92, rotate: -3, anim: 2 },

      // ===== CAMADA 12: CIFRÕES DOURADOS médios espalhados =====
      { svg: GOLDEN_DOLLAR, x: 6, y: 36, size: 90, opacity: 0.85, rotate: -16, anim: 0 },
      { svg: GOLDEN_DOLLAR, x: 94, y: 36, size: 95, opacity: 0.87, rotate: 16, anim: 1 },
      { svg: GOLDEN_DOLLAR, x: 32, y: 64, size: 80, opacity: 0.8, anim: 2 },
      { svg: GOLDEN_DOLLAR, x: 68, y: 66, size: 85, opacity: 0.82, anim: 3 },
      { svg: GOLDEN_DOLLAR, x: 6, y: 92, size: 75, opacity: 0.78, rotate: -10, anim: 0 },
      { svg: GOLDEN_DOLLAR, x: 94, y: 92, size: 80, opacity: 0.8, rotate: 12, anim: 1 },

      // ===== CAMADA 13: COROAS médias (CEO badges) =====
      { svg: KING_CROWN, x: 22, y: 6, size: 130, opacity: 0.85, rotate: -6, anim: 2 },
      { svg: KING_CROWN, x: 78, y: 6, size: 140, opacity: 0.87, rotate: 6, anim: 3 },

      // ===== CAMADA 14: CORAÇÕES VIRAIS (engajamento) =====
      { svg: VIRAL_FIRE_HEART, x: 40, y: 14, size: 70, opacity: 0.85, anim: 0 },
      { svg: VIRAL_FIRE_HEART, x: 60, y: 14, size: 75, opacity: 0.87, anim: 1 },
      { svg: VIRAL_FIRE_HEART, x: 26, y: 64, size: 65, opacity: 0.82, anim: 2 },
      { svg: VIRAL_FIRE_HEART, x: 74, y: 66, size: 70, opacity: 0.84, anim: 3 },
      { svg: VIRAL_FIRE_HEART, x: 50, y: 46, size: 60, opacity: 0.78, anim: 0 },

      // ===== CAMADA 15: NOTAS DE DINHEIRO DOURADAS caindo =====
      { svg: HUNDRED_BILL, x: 10, y: 6, size: 100, opacity: 0.88, rotate: -22, anim: 0 },
      { svg: HUNDRED_BILL, x: 30, y: 50, size: 110, opacity: 0.9, rotate: 14, anim: 1 },
      { svg: HUNDRED_BILL, x: 50, y: 4, size: 95, opacity: 0.86, rotate: -8, anim: 2 },
      { svg: HUNDRED_BILL, x: 70, y: 48, size: 115, opacity: 0.92, rotate: 18, anim: 3 },
      { svg: HUNDRED_BILL, x: 90, y: 8, size: 100, opacity: 0.88, rotate: -16, anim: 0 },
      { svg: HUNDRED_BILL, x: 16, y: 96, size: 110, opacity: 0.9, rotate: 22, anim: 1 },
      { svg: HUNDRED_BILL, x: 44, y: 98, size: 105, opacity: 0.88, rotate: -10, anim: 2 },
      { svg: HUNDRED_BILL, x: 84, y: 96, size: 115, opacity: 0.92, rotate: 14, anim: 3 },
    ],
  },

  jvegudo: {
    gradient:
      "radial-gradient(ellipse at top, rgba(250,204,21,0.30) 0%, transparent 55%), radial-gradient(ellipse at bottom, rgba(161,98,7,0.22) 0%, transparent 50%), linear-gradient(180deg, rgba(10,10,5,0.6) 0%, rgba(0,0,0,0.95) 100%)",
    elements: [
      // ===== BACKDROP: "01" gigante atrás de tudo =====
      { svg: NUMBER_01, x: 50, y: 50, size: 600, opacity: 0.08, anim: 0 },

      // ===== NÚMEROS 01 médios pela tela =====
      { svg: NUMBER_01, x: 18, y: 16, size: 200, opacity: 0.85, rotate: -10, anim: 0 },
      { svg: NUMBER_01, x: 82, y: 18, size: 220, opacity: 0.88, rotate: 12, anim: 1 },
      { svg: NUMBER_01, x: 14, y: 50, size: 180, opacity: 0.82, rotate: 18, anim: 2 },
      { svg: NUMBER_01, x: 86, y: 52, size: 190, opacity: 0.84, rotate: -16, anim: 3 },
      { svg: NUMBER_01, x: 50, y: 90, size: 240, opacity: 0.92, rotate: 4, anim: 0 },
      { svg: NUMBER_01, x: 24, y: 88, size: 160, opacity: 0.78, rotate: -20, anim: 1 },
      { svg: NUMBER_01, x: 76, y: 86, size: 170, opacity: 0.8, rotate: 22, anim: 2 },

      // ===== HASHTAG #1 medalhas circulares =====
      { svg: HASHTAG_ONE, x: 30, y: 30, size: 110, opacity: 0.95, rotate: -8, anim: 0 },
      { svg: HASHTAG_ONE, x: 70, y: 30, size: 115, opacity: 0.96, rotate: 10, anim: 1 },
      { svg: HASHTAG_ONE, x: 22, y: 70, size: 100, opacity: 0.92, anim: 2 },
      { svg: HASHTAG_ONE, x: 78, y: 70, size: 105, opacity: 0.93, anim: 3 },

      // ===== TROFÉUS GIGANTES nos cantos + central =====
      { svg: TROPHY, pin: "bottom-left", x: 4, y: 6, size: 220, opacity: 0.95 },
      { svg: TROPHY, pin: "bottom-right", x: 4, y: 6, size: 240, opacity: 0.96 },
      { svg: TROPHY, x: 50, y: 36, size: 280, opacity: 0.94, anim: 0 },
      { svg: TROPHY, x: 26, y: 56, size: 170, opacity: 0.85, rotate: -6, anim: 1 },
      { svg: TROPHY, x: 74, y: 58, size: 175, opacity: 0.86, rotate: 6, anim: 2 },
      { svg: TROPHY, x: 12, y: 30, size: 130, opacity: 0.8, rotate: -12, anim: 3 },
      { svg: TROPHY, x: 88, y: 32, size: 135, opacity: 0.82, rotate: 12, anim: 0 },

      // ===== MEDALHAS DE OURO =====
      { svg: GOLD_MEDAL, x: 16, y: 22, size: 100, opacity: 0.92, rotate: -10, anim: 0 },
      { svg: GOLD_MEDAL, x: 84, y: 22, size: 105, opacity: 0.94, rotate: 12, anim: 1 },
      { svg: GOLD_MEDAL, x: 38, y: 78, size: 95, opacity: 0.9, rotate: -8, anim: 2 },
      { svg: GOLD_MEDAL, x: 62, y: 80, size: 100, opacity: 0.92, rotate: 8, anim: 3 },
      { svg: GOLD_MEDAL, x: 50, y: 58, size: 110, opacity: 0.95, anim: 0 },

      // ===== GOAT BADGES =====
      { svg: GOAT_BADGE, x: 28, y: 14, size: 160, opacity: 0.88, rotate: -8, anim: 0 },
      { svg: GOAT_BADGE, x: 72, y: 16, size: 170, opacity: 0.9, rotate: 8, anim: 1 },
      { svg: GOAT_BADGE, x: 50, y: 68, size: 180, opacity: 0.92, rotate: -3, anim: 2 },

      // ===== TOP 1 SEALS =====
      { svg: TOP_ONE_SEAL, x: 18, y: 64, size: 110, opacity: 0.92, rotate: -10, anim: 0 },
      { svg: TOP_ONE_SEAL, x: 82, y: 66, size: 115, opacity: 0.94, rotate: 12, anim: 1 },
      { svg: TOP_ONE_SEAL, x: 42, y: 24, size: 95, opacity: 0.88, rotate: 8, anim: 2 },
      { svg: TOP_ONE_SEAL, x: 58, y: 26, size: 100, opacity: 0.9, rotate: -6, anim: 3 },

      // ===== COROAS DE LOUROS (laurel champion) =====
      { svg: LAUREL_WREATH, x: 24, y: 44, size: 180, opacity: 0.85, rotate: -4, anim: 0 },
      { svg: LAUREL_WREATH, x: 76, y: 44, size: 190, opacity: 0.87, rotate: 4, anim: 1 },
      { svg: LAUREL_WREATH, x: 50, y: 18, size: 200, opacity: 0.78, anim: 2 },

      // ===== LINGOTES DE OURO =====
      { svg: GOLD_BARS, x: 14, y: 80, size: 140, opacity: 0.92, rotate: -6, anim: 0 },
      { svg: GOLD_BARS, x: 86, y: 82, size: 150, opacity: 0.94, rotate: 6, anim: 1 },
      { svg: GOLD_BARS, x: 50, y: 48, size: 160, opacity: 0.85, anim: 2 },

      // ===== EGO FLAMES (chama com 1 dentro) =====
      { svg: EGO_FLAME, x: 8, y: 40, size: 80, opacity: 0.9, rotate: -10, anim: 0 },
      { svg: EGO_FLAME, x: 92, y: 40, size: 85, opacity: 0.92, rotate: 10, anim: 1 },
      { svg: EGO_FLAME, x: 32, y: 6, size: 70, opacity: 0.85, anim: 2 },
      { svg: EGO_FLAME, x: 68, y: 6, size: 75, opacity: 0.87, anim: 3 },

      // ===== NOTAS DE DINHEIRO DOURADAS =====
      { svg: HUNDRED_BILL, x: 10, y: 10, size: 100, opacity: 0.92, rotate: -22, anim: 0 },
      { svg: HUNDRED_BILL, x: 90, y: 10, size: 105, opacity: 0.94, rotate: 18, anim: 1 },
      { svg: HUNDRED_BILL, x: 22, y: 40, size: 115, opacity: 0.95, rotate: 14, anim: 2 },
      { svg: HUNDRED_BILL, x: 78, y: 42, size: 120, opacity: 0.96, rotate: -16, anim: 3 },
      { svg: HUNDRED_BILL, x: 44, y: 50, size: 110, opacity: 0.92, rotate: 22, anim: 0 },
      { svg: HUNDRED_BILL, x: 56, y: 52, size: 115, opacity: 0.93, rotate: -10, anim: 1 },
      { svg: HUNDRED_BILL, x: 14, y: 92, size: 105, opacity: 0.92, rotate: -18, anim: 2 },
      { svg: HUNDRED_BILL, x: 86, y: 94, size: 110, opacity: 0.94, rotate: 16, anim: 3 },
    ],
  },

  jvmulherengo: {
    gradient:
      "radial-gradient(ellipse at top, rgba(236,72,153,0.28) 0%, transparent 55%), radial-gradient(ellipse at bottom, rgba(168,85,247,0.22) 0%, transparent 50%), linear-gradient(180deg, rgba(26,10,20,0.55) 0%, rgba(0,0,0,0.92) 100%)",
    elements: [
      // ===== CASAIS (sempre mesmo cara + mulher diferente) — figuras grandes =====
      // Ruivas
      { svg: COUPLE_REDHEAD, x: 20, y: 24, size: 280, opacity: 0.95, rotate: -4, anim: 0 },
      { svg: COUPLE_REDHEAD, x: 76, y: 60, size: 290, opacity: 0.96, rotate: 4, anim: 1 },
      { svg: COUPLE_REDHEAD, x: 50, y: 88, size: 260, opacity: 0.94, rotate: -2, anim: 2 },

      // Loiras
      { svg: COUPLE_BLONDE, x: 78, y: 22, size: 290, opacity: 0.95, rotate: 5, anim: 1 },
      { svg: COUPLE_BLONDE, x: 22, y: 60, size: 280, opacity: 0.95, rotate: -5, anim: 2 },
      { svg: COUPLE_BLONDE, x: 50, y: 12, size: 270, opacity: 0.93, rotate: 2, anim: 3 },

      // Morenas
      { svg: COUPLE_BRUNETTE, x: 50, y: 42, size: 320, opacity: 0.96, rotate: 0, anim: 2 },
      { svg: COUPLE_BRUNETTE, x: 20, y: 88, size: 270, opacity: 0.94, rotate: 6, anim: 0 },
      { svg: COUPLE_BRUNETTE, x: 80, y: 88, size: 280, opacity: 0.95, rotate: -6, anim: 3 },

      // ===== MULHERES SOLO menores (espalhadas pelas bordas) =====
      { svg: WOMAN_REDHEAD, x: 8, y: 14, size: 100, opacity: 0.92, rotate: -8, anim: 0 },
      { svg: WOMAN_BLONDE, x: 92, y: 14, size: 100, opacity: 0.92, rotate: 8, anim: 1 },
      { svg: WOMAN_BRUNETTE, x: 8, y: 46, size: 95, opacity: 0.9, rotate: -10, anim: 2 },
      { svg: WOMAN_REDHEAD, x: 92, y: 46, size: 95, opacity: 0.9, rotate: 10, anim: 3 },
      { svg: WOMAN_BLONDE, x: 8, y: 78, size: 100, opacity: 0.92, rotate: -6, anim: 0 },
      { svg: WOMAN_BRUNETTE, x: 92, y: 78, size: 100, opacity: 0.92, rotate: 6, anim: 1 },
      { svg: WOMAN_REDHEAD, x: 30, y: 12, size: 90, opacity: 0.88, rotate: 12, anim: 2 },
      { svg: WOMAN_BLONDE, x: 70, y: 12, size: 90, opacity: 0.88, rotate: -12, anim: 3 },

      // ===== O MESMO CARA solo (assinatura — ele aparece em destaque) =====
      { svg: SAME_GUY, pin: "bottom-left", x: 6, y: 4, size: 200, opacity: 0.9 },
      { svg: SAME_GUY, pin: "bottom-right", x: 6, y: 4, size: 200, opacity: 0.9 },

      // ===== CORAÇÕES ROSAS =====
      { svg: PINK_HEART, x: 18, y: 8, size: 55, opacity: 0.9, rotate: -12, anim: 0 },
      { svg: PINK_HEART, x: 38, y: 10, size: 65, opacity: 0.92, rotate: 14, anim: 1 },
      { svg: PINK_HEART, x: 62, y: 10, size: 60, opacity: 0.9, rotate: -10, anim: 2 },
      { svg: PINK_HEART, x: 82, y: 8, size: 55, opacity: 0.9, rotate: 16, anim: 3 },
      { svg: PINK_HEART, x: 14, y: 36, size: 50, opacity: 0.88, anim: 0 },
      { svg: PINK_HEART, x: 50, y: 36, size: 70, opacity: 0.95, rotate: -8, anim: 1 },
      { svg: PINK_HEART, x: 86, y: 36, size: 50, opacity: 0.88, anim: 2 },
      { svg: PINK_HEART, x: 30, y: 56, size: 55, opacity: 0.88, rotate: 18, anim: 3 },
      { svg: PINK_HEART, x: 70, y: 58, size: 60, opacity: 0.9, rotate: -16, anim: 0 },
      { svg: PINK_HEART, x: 42, y: 74, size: 50, opacity: 0.86, anim: 1 },
      { svg: PINK_HEART, x: 58, y: 76, size: 55, opacity: 0.88, anim: 2 },
      { svg: PINK_HEART, x: 24, y: 96, size: 60, opacity: 0.9, rotate: 12, anim: 3 },
      { svg: PINK_HEART, x: 76, y: 96, size: 65, opacity: 0.92, rotate: -14, anim: 0 },

      // ===== MARCAS DE BATOM =====
      { svg: LIPSTICK_KISS, x: 14, y: 28, size: 80, opacity: 0.88, rotate: -18, anim: 0 },
      { svg: LIPSTICK_KISS, x: 86, y: 28, size: 85, opacity: 0.9, rotate: 14, anim: 1 },
      { svg: LIPSTICK_KISS, x: 38, y: 22, size: 70, opacity: 0.85, rotate: 22, anim: 2 },
      { svg: LIPSTICK_KISS, x: 62, y: 24, size: 75, opacity: 0.87, rotate: -16, anim: 3 },
      { svg: LIPSTICK_KISS, x: 24, y: 50, size: 90, opacity: 0.92, rotate: -10, anim: 0 },
      { svg: LIPSTICK_KISS, x: 76, y: 50, size: 95, opacity: 0.94, rotate: 12, anim: 1 },
      { svg: LIPSTICK_KISS, x: 50, y: 68, size: 100, opacity: 0.95, rotate: -4, anim: 2 },
      { svg: LIPSTICK_KISS, x: 14, y: 88, size: 80, opacity: 0.88, rotate: 18, anim: 3 },
      { svg: LIPSTICK_KISS, x: 86, y: 88, size: 85, opacity: 0.9, rotate: -22, anim: 0 },
      { svg: LIPSTICK_KISS, x: 40, y: 96, size: 75, opacity: 0.86, rotate: 8, anim: 1 },
      { svg: LIPSTICK_KISS, x: 60, y: 96, size: 80, opacity: 0.88, rotate: -8, anim: 2 },
    ],
  },

  lorecio: {
    gradient:
      "radial-gradient(ellipse at top, rgba(251,191,36,0.28) 0%, transparent 55%), radial-gradient(ellipse at bottom, rgba(59,130,246,0.18) 0%, transparent 50%), linear-gradient(180deg, rgba(10,16,41,0.55) 0%, rgba(0,0,15,0.92) 100%)",
    elements: [
      // Anjos loiros gigantes nos cantos
      { svg: ANGEL_BLONDE, pin: "bottom-left", x: 4, y: 6, size: 240, opacity: 0.95 },
      { svg: ANGEL_BLONDE, pin: "bottom-right", x: 4, y: 6, size: 260, opacity: 0.96 },
      { svg: ANGEL_BLONDE, x: 50, y: 30, size: 280, opacity: 0.94, anim: 0 },
      { svg: ANGEL_BLONDE, x: 24, y: 52, size: 180, opacity: 0.88, rotate: -4, anim: 1 },
      { svg: ANGEL_BLONDE, x: 76, y: 52, size: 190, opacity: 0.9, rotate: 4, anim: 2 },
      { svg: ANGEL_BLONDE, x: 14, y: 16, size: 130, opacity: 0.82, rotate: -10, anim: 3 },
      { svg: ANGEL_BLONDE, x: 86, y: 16, size: 135, opacity: 0.84, rotate: 10, anim: 0 },
      // Halos isolados (extras de aro)
      // Dumbbells voando
      { svg: DUMBBELL, x: 16, y: 36, size: 180, opacity: 0.92, rotate: -14, anim: 0 },
      { svg: DUMBBELL, x: 84, y: 38, size: 190, opacity: 0.94, rotate: 16, anim: 1 },
      { svg: DUMBBELL, x: 30, y: 72, size: 160, opacity: 0.9, rotate: -8, anim: 2 },
      { svg: DUMBBELL, x: 70, y: 72, size: 170, opacity: 0.92, rotate: 8, anim: 3 },
      { svg: DUMBBELL, x: 50, y: 60, size: 200, opacity: 0.95, anim: 0 },
      { svg: DUMBBELL, x: 50, y: 88, size: 180, opacity: 0.92, rotate: 4, anim: 1 },
      { svg: DUMBBELL, x: 10, y: 80, size: 140, opacity: 0.85, rotate: -20, anim: 2 },
      { svg: DUMBBELL, x: 90, y: 80, size: 145, opacity: 0.87, rotate: 20, anim: 3 },
      // Bíceps flexionados
      { svg: MUSCLE_ARM, x: 18, y: 60, size: 120, opacity: 0.9, rotate: -10, anim: 0 },
      { svg: MUSCLE_ARM, x: 82, y: 62, size: 125, opacity: 0.92, rotate: 10, anim: 1 },
      { svg: MUSCLE_ARM, x: 38, y: 22, size: 100, opacity: 0.85, rotate: 12, anim: 2 },
      { svg: MUSCLE_ARM, x: 62, y: 22, size: 105, opacity: 0.87, rotate: -12, anim: 3 },
      { svg: MUSCLE_ARM, x: 28, y: 92, size: 110, opacity: 0.88, anim: 0 },
      { svg: MUSCLE_ARM, x: 72, y: 92, size: 115, opacity: 0.9, anim: 1 },
      // Coroas dos anjos (halos) — reuso de elementos dourados
      { svg: GOLD_MEDAL, x: 50, y: 14, size: 80, opacity: 0.85, anim: 2 },
    ],
  },

  leochicken: {
    gradient:
      "radial-gradient(ellipse at top, rgba(249,115,22,0.30) 0%, transparent 55%), radial-gradient(ellipse at bottom, rgba(217,119,6,0.22) 0%, transparent 50%), linear-gradient(180deg, rgba(26,13,0,0.55) 0%, rgba(0,0,0,0.92) 100%)",
    elements: [
      // GALINHAS gigantes pela tela
      { svg: CHICKEN, pin: "bottom-left", x: 4, y: 6, size: 220, opacity: 0.95 },
      { svg: CHICKEN, pin: "bottom-right", x: 4, y: 6, size: 230, opacity: 0.96 },
      { svg: CHICKEN, x: 50, y: 30, size: 240, opacity: 0.94, anim: 0 },
      { svg: CHICKEN, x: 22, y: 50, size: 180, opacity: 0.9, rotate: -6, anim: 1 },
      { svg: CHICKEN, x: 78, y: 50, size: 190, opacity: 0.92, rotate: 6, anim: 2 },
      { svg: CHICKEN, x: 16, y: 16, size: 140, opacity: 0.85, rotate: -10, anim: 3 },
      { svg: CHICKEN, x: 84, y: 16, size: 145, opacity: 0.87, rotate: 10, anim: 0 },
      { svg: CHICKEN, x: 38, y: 80, size: 160, opacity: 0.92, rotate: 4, anim: 1 },
      { svg: CHICKEN, x: 62, y: 80, size: 165, opacity: 0.93, rotate: -4, anim: 2 },
      // Cara loiro (Leo) — figura central
      { svg: BLONDE_GUY, x: 50, y: 60, size: 240, opacity: 0.95, anim: 1 },
      { svg: BLONDE_GUY, x: 24, y: 30, size: 150, opacity: 0.88, rotate: -6, anim: 2 },
      { svg: BLONDE_GUY, x: 76, y: 30, size: 160, opacity: 0.9, rotate: 6, anim: 3 },
      // Garrafas de cerveja
      { svg: BEER_BOTTLE, x: 12, y: 40, size: 90, opacity: 0.92, rotate: -12, anim: 0 },
      { svg: BEER_BOTTLE, x: 88, y: 40, size: 95, opacity: 0.94, rotate: 12, anim: 1 },
      { svg: BEER_BOTTLE, x: 32, y: 62, size: 80, opacity: 0.88, rotate: 18, anim: 2 },
      { svg: BEER_BOTTLE, x: 68, y: 64, size: 85, opacity: 0.9, rotate: -18, anim: 3 },
      { svg: BEER_BOTTLE, x: 50, y: 88, size: 100, opacity: 0.94, anim: 0 },
      // Whisky
      { svg: WHISKY_GLASS, x: 20, y: 70, size: 80, opacity: 0.9, rotate: -8, anim: 1 },
      { svg: WHISKY_GLASS, x: 80, y: 72, size: 85, opacity: 0.92, rotate: 8, anim: 2 },
      { svg: WHISKY_GLASS, x: 44, y: 44, size: 75, opacity: 0.88, anim: 3 },
      { svg: WHISKY_GLASS, x: 56, y: 46, size: 78, opacity: 0.88, anim: 0 },
      // Canecas de chopp
      { svg: BEER_MUG, x: 14, y: 84, size: 110, opacity: 0.94, rotate: -6, anim: 1 },
      { svg: BEER_MUG, x: 86, y: 84, size: 115, opacity: 0.95, rotate: 6, anim: 2 },
      { svg: BEER_MUG, x: 36, y: 18, size: 100, opacity: 0.9, rotate: 10, anim: 3 },
      { svg: BEER_MUG, x: 64, y: 18, size: 105, opacity: 0.92, rotate: -10, anim: 0 },
    ],
  },

  azzi: {
    gradient:
      "radial-gradient(ellipse at top, rgba(220,38,38,0.20) 0%, transparent 55%), radial-gradient(ellipse at bottom, rgba(16,185,129,0.20) 0%, transparent 50%), linear-gradient(180deg, rgba(2,8,23,0.55) 0%, rgba(0,0,5,0.92) 100%)",
    elements: [
      // CELULAR R$ 1 MILHÃO — destaque central enorme
      { svg: PHONE_MILLION, x: 50, y: 38, size: 360, opacity: 0.96, anim: 0 },
      { svg: PHONE_MILLION, pin: "bottom-left", x: 6, y: 6, size: 220, opacity: 0.94 },
      { svg: PHONE_MILLION, pin: "bottom-right", x: 6, y: 6, size: 230, opacity: 0.95 },
      { svg: PHONE_MILLION, x: 24, y: 70, size: 170, opacity: 0.88, rotate: -6, anim: 1 },
      { svg: PHONE_MILLION, x: 76, y: 70, size: 175, opacity: 0.9, rotate: 6, anim: 2 },
      // CARROS BATIDOS
      { svg: CRASHED_CAR, x: 20, y: 22, size: 260, opacity: 0.94, rotate: -4, anim: 0 },
      { svg: CRASHED_CAR, x: 80, y: 22, size: 270, opacity: 0.95, rotate: 4, anim: 1 },
      { svg: CRASHED_CAR, x: 50, y: 88, size: 280, opacity: 0.96, anim: 2 },
      { svg: CRASHED_CAR, x: 16, y: 50, size: 200, opacity: 0.88, rotate: -8, anim: 3 },
      { svg: CRASHED_CAR, x: 84, y: 50, size: 210, opacity: 0.9, rotate: 8, anim: 0 },
      // CASAIS (mulheres + cara, igual mulherengo)
      { svg: COUPLE_REDHEAD, x: 30, y: 60, size: 220, opacity: 0.88, rotate: -3, anim: 1 },
      { svg: COUPLE_BLONDE, x: 70, y: 60, size: 230, opacity: 0.9, rotate: 3, anim: 2 },
      { svg: COUPLE_BRUNETTE, x: 50, y: 82, size: 240, opacity: 0.92, anim: 3 },
      // Mulheres solo
      { svg: WOMAN_REDHEAD, x: 10, y: 36, size: 90, opacity: 0.9, rotate: -8, anim: 0 },
      { svg: WOMAN_BLONDE, x: 90, y: 36, size: 92, opacity: 0.92, rotate: 8, anim: 1 },
      { svg: WOMAN_BRUNETTE, x: 50, y: 16, size: 100, opacity: 0.92, anim: 2 },
      // CASH chovendo
      { svg: HUNDRED_BILL, x: 14, y: 10, size: 110, opacity: 0.92, rotate: -20, anim: 0 },
      { svg: HUNDRED_BILL, x: 38, y: 14, size: 120, opacity: 0.94, rotate: 16, anim: 1 },
      { svg: HUNDRED_BILL, x: 62, y: 14, size: 115, opacity: 0.93, rotate: -10, anim: 2 },
      { svg: HUNDRED_BILL, x: 86, y: 10, size: 110, opacity: 0.92, rotate: 20, anim: 3 },
      { svg: HUNDRED_BILL, x: 28, y: 44, size: 130, opacity: 0.95, rotate: 24, anim: 0 },
      { svg: HUNDRED_BILL, x: 72, y: 44, size: 135, opacity: 0.95, rotate: -22, anim: 1 },
      { svg: HUNDRED_BILL, x: 10, y: 88, size: 105, opacity: 0.9, rotate: 14, anim: 2 },
      { svg: HUNDRED_BILL, x: 90, y: 88, size: 110, opacity: 0.92, rotate: -16, anim: 3 },
    ],
  },

  renan: {
    gradient:
      "radial-gradient(ellipse at top, rgba(82,82,82,0.22) 0%, transparent 55%), radial-gradient(ellipse at bottom, rgba(250,204,21,0.18) 0%, transparent 50%), linear-gradient(180deg, rgba(10,10,10,0.6) 0%, rgba(0,0,0,0.95) 100%)",
    elements: [
      // O CARA (Renan, sempre o mesmo de óculos escuros) — figuras grandes
      { svg: GUY_GLASSES, pin: "bottom-left", x: 4, y: 6, size: 220, opacity: 0.95 },
      { svg: GUY_GLASSES, pin: "bottom-right", x: 4, y: 6, size: 230, opacity: 0.96 },
      { svg: GUY_GLASSES, x: 50, y: 30, size: 260, opacity: 0.95, anim: 0 },
      { svg: GUY_GLASSES, x: 22, y: 56, size: 170, opacity: 0.9, rotate: -4, anim: 1 },
      { svg: GUY_GLASSES, x: 78, y: 56, size: 180, opacity: 0.92, rotate: 4, anim: 2 },
      { svg: GUY_GLASSES, x: 14, y: 14, size: 130, opacity: 0.85, rotate: -10, anim: 3 },
      { svg: GUY_GLASSES, x: 86, y: 14, size: 135, opacity: 0.87, rotate: 10, anim: 0 },
      // MULHERES diferentes ao lado dele
      { svg: WOMAN_REDHEAD, x: 36, y: 30, size: 140, opacity: 0.92, rotate: -6, anim: 1 },
      { svg: WOMAN_BLONDE, x: 64, y: 30, size: 145, opacity: 0.94, rotate: 6, anim: 2 },
      { svg: WOMAN_BRUNETTE, x: 36, y: 56, size: 135, opacity: 0.92, anim: 3 },
      { svg: WOMAN_REDHEAD, x: 64, y: 56, size: 140, opacity: 0.93, anim: 0 },
      { svg: WOMAN_BLONDE, x: 50, y: 78, size: 150, opacity: 0.95, anim: 1 },
      { svg: WOMAN_BRUNETTE, x: 12, y: 70, size: 110, opacity: 0.9, rotate: -8, anim: 2 },
      { svg: WOMAN_REDHEAD, x: 88, y: 70, size: 115, opacity: 0.92, rotate: 8, anim: 3 },
      // ARMAS
      { svg: GUN_PISTOL, x: 18, y: 40, size: 160, opacity: 0.92, rotate: -10, anim: 0 },
      { svg: GUN_PISTOL, x: 82, y: 40, size: 170, opacity: 0.94, rotate: 14, anim: 1 },
      { svg: GUN_PISTOL, x: 30, y: 80, size: 150, opacity: 0.9, rotate: 20, anim: 2 },
      { svg: GUN_PISTOL, x: 70, y: 82, size: 155, opacity: 0.92, rotate: -22, anim: 3 },
      { svg: GUN_PISTOL, x: 50, y: 92, size: 180, opacity: 0.94, anim: 0 },
      { svg: GUN_PISTOL, x: 10, y: 50, size: 130, opacity: 0.85, rotate: -30, anim: 1 },
      { svg: GUN_PISTOL, x: 90, y: 50, size: 135, opacity: 0.87, rotate: 30, anim: 2 },
      // CASH dourado
      { svg: HUNDRED_BILL, x: 16, y: 24, size: 110, opacity: 0.92, rotate: -18, anim: 0 },
      { svg: HUNDRED_BILL, x: 84, y: 24, size: 115, opacity: 0.94, rotate: 18, anim: 1 },
      { svg: HUNDRED_BILL, x: 32, y: 62, size: 120, opacity: 0.94, rotate: 22, anim: 2 },
      { svg: HUNDRED_BILL, x: 68, y: 64, size: 125, opacity: 0.95, rotate: -20, anim: 3 },
      { svg: HUNDRED_BILL, x: 50, y: 46, size: 130, opacity: 0.95, anim: 0 },
      { svg: HUNDRED_BILL, x: 22, y: 88, size: 110, opacity: 0.92, rotate: 16, anim: 1 },
      { svg: HUNDRED_BILL, x: 78, y: 88, size: 115, opacity: 0.93, rotate: -14, anim: 2 },
    ],
  },

  lucasjapa: {
    gradient:
      "radial-gradient(ellipse at top, rgba(220,38,38,0.28) 0%, transparent 55%), radial-gradient(ellipse at bottom, rgba(250,250,250,0.10) 0%, transparent 50%), linear-gradient(180deg, rgba(26,10,10,0.55) 0%, rgba(0,0,0,0.92) 100%)",
    elements: [
      // CELULAR R$ 1 MILHÃO em destaque (vários)
      { svg: PHONE_MILLION, x: 50, y: 34, size: 380, opacity: 0.96, anim: 0 },
      { svg: PHONE_MILLION, pin: "bottom-left", x: 6, y: 6, size: 220, opacity: 0.94 },
      { svg: PHONE_MILLION, pin: "bottom-right", x: 6, y: 6, size: 230, opacity: 0.95 },
      { svg: PHONE_MILLION, x: 24, y: 68, size: 180, opacity: 0.9, rotate: -6, anim: 1 },
      { svg: PHONE_MILLION, x: 76, y: 68, size: 190, opacity: 0.92, rotate: 6, anim: 2 },
      // BANDEIRAS DO JAPÃO chovendo
      { svg: JAPAN_FLAG, x: 10, y: 8, size: 110, opacity: 0.95, rotate: -16, anim: 0 },
      { svg: JAPAN_FLAG, x: 28, y: 14, size: 120, opacity: 0.95, rotate: 14, anim: 1 },
      { svg: JAPAN_FLAG, x: 48, y: 8, size: 115, opacity: 0.95, rotate: -8, anim: 2 },
      { svg: JAPAN_FLAG, x: 68, y: 14, size: 125, opacity: 0.96, rotate: 22, anim: 3 },
      { svg: JAPAN_FLAG, x: 90, y: 10, size: 110, opacity: 0.94, rotate: -20, anim: 0 },
      { svg: JAPAN_FLAG, x: 14, y: 30, size: 105, opacity: 0.93, rotate: 12, anim: 1 },
      { svg: JAPAN_FLAG, x: 86, y: 32, size: 110, opacity: 0.94, rotate: -10, anim: 2 },
      { svg: JAPAN_FLAG, x: 18, y: 56, size: 120, opacity: 0.95, rotate: 18, anim: 3 },
      { svg: JAPAN_FLAG, x: 82, y: 56, size: 125, opacity: 0.96, rotate: -14, anim: 0 },
      { svg: JAPAN_FLAG, x: 14, y: 88, size: 110, opacity: 0.94, rotate: 22, anim: 1 },
      { svg: JAPAN_FLAG, x: 38, y: 92, size: 120, opacity: 0.95, rotate: -16, anim: 2 },
      { svg: JAPAN_FLAG, x: 62, y: 92, size: 115, opacity: 0.94, rotate: 16, anim: 3 },
      { svg: JAPAN_FLAG, x: 86, y: 88, size: 110, opacity: 0.94, rotate: -22, anim: 0 },
      // Bandeiras com mastro
      { svg: JAPAN_FLAG_POLE, x: 22, y: 20, size: 200, opacity: 0.85, rotate: -6, anim: 1 },
      { svg: JAPAN_FLAG_POLE, x: 78, y: 20, size: 210, opacity: 0.87, rotate: 6, anim: 2 },
      { svg: JAPAN_FLAG_POLE, x: 50, y: 60, size: 220, opacity: 0.85, anim: 3 },
      // Sakuras
      { svg: SAKURA, x: 8, y: 44, size: 50, opacity: 0.85, anim: 0 },
      { svg: SAKURA, x: 92, y: 44, size: 55, opacity: 0.87, anim: 1 },
      { svg: SAKURA, x: 44, y: 70, size: 60, opacity: 0.88, anim: 2 },
      { svg: SAKURA, x: 56, y: 72, size: 60, opacity: 0.88, anim: 3 },
      // CASH dourado
      { svg: HUNDRED_BILL, x: 28, y: 36, size: 110, opacity: 0.92, rotate: -18, anim: 0 },
      { svg: HUNDRED_BILL, x: 72, y: 36, size: 115, opacity: 0.94, rotate: 18, anim: 1 },
      { svg: HUNDRED_BILL, x: 38, y: 76, size: 120, opacity: 0.94, rotate: 22, anim: 2 },
      { svg: HUNDRED_BILL, x: 62, y: 76, size: 125, opacity: 0.95, rotate: -20, anim: 3 },
      { svg: HUNDRED_BILL, x: 50, y: 50, size: 130, opacity: 0.95, anim: 0 },
    ],
  },
};
