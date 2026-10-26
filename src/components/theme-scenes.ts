/**
 * SVGs + cenas pra cada tema. Mantido separado de theme-icons.tsx pra
 * o componente React não inchar a 2000 linhas.
 *
 * Tudo SVG inline (sem requests). Formas evocativas, sem usar arte
 * protegida por copyright.
 */

export type SceneElement = {
  svg: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  rotate?: number;
  anim?: number;
  pin?: "bottom-left" | "bottom-right" | "bottom" | "top-right" | "top-left";
};

export type Scene = {
  gradient?: string;
  ground?: { height: string; fill: string; opacity?: number };
  elements: SceneElement[];
};

/* ============== PRIMITIVOS REUTILIZÁVEIS ============== */

const PILL_CAPSULE_RW = `<svg viewBox="0 0 70 30" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="33" height="22" rx="11" fill="#ef4444" stroke="#7f1d1d" stroke-width="1.5"/><rect x="35" y="4" width="33" height="22" rx="11" fill="#fafafa" stroke="#52525b" stroke-width="1.5"/></svg>`;
const PILL_CAPSULE_BW = `<svg viewBox="0 0 70 30" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="33" height="22" rx="11" fill="#3b82f6" stroke="#1e3a8a" stroke-width="1.5"/><rect x="35" y="4" width="33" height="22" rx="11" fill="#fafafa" stroke="#52525b" stroke-width="1.5"/></svg>`;
const PILL_CAPSULE_GY = `<svg viewBox="0 0 70 30" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="33" height="22" rx="11" fill="#22c55e" stroke="#14532d" stroke-width="1.5"/><rect x="35" y="4" width="33" height="22" rx="11" fill="#facc15" stroke="#713f12" stroke-width="1.5"/></svg>`;
const PILL_TABLET = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><circle cx="25" cy="25" r="22" fill="#f1f5f9" stroke="#475569" stroke-width="2"/><line x1="5" y1="25" x2="45" y2="25" stroke="#475569" stroke-width="1.5"/></svg>`;

const LIGHTNING_BOLT = `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg"><path d="M22 2 L8 32 L18 32 L14 58 L34 24 L22 24 Z" fill="#facc15" stroke="#713f12" stroke-width="1.5"/></svg>`;
const LIGHTNING_GREEN = `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg"><path d="M22 2 L8 32 L18 32 L14 58 L34 24 L22 24 Z" fill="#39FF14" stroke="#14532d" stroke-width="1.5"/></svg>`;

const MONSTER_CAN = `<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="44" height="74" rx="4" fill="#0a0a0a" stroke="#39FF14" stroke-width="2"/><rect x="8" y="8" width="44" height="6" fill="#1c1917"/><path d="M16 25 L18 35 L14 35 Z M24 20 L26 32 L22 32 Z M32 25 L34 35 L30 35 Z" fill="#39FF14"/><text x="30" y="58" font-family="Arial Black" font-weight="900" font-size="14" fill="#39FF14" text-anchor="middle">M</text></svg>`;
const MONSTER_CLAW = `<svg viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg"><path d="M2 4 L18 26 L14 4 L26 26 L24 4 L36 26 L32 4 L46 26 L42 4 L58 26" stroke="#39FF14" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>`;

const WHISKY_GLASS = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><path d="M8 14 L52 14 L48 64 L12 64 Z" fill="#d97706" opacity="0.7" stroke="#451a03" stroke-width="2"/><rect x="8" y="14" width="44" height="6" fill="#fef3c7" opacity="0.4" stroke="#451a03" stroke-width="2"/><rect x="18" y="26" width="8" height="6" fill="#fef3c7" opacity="0.6"/><rect x="34" y="32" width="8" height="6" fill="#fef3c7" opacity="0.6"/></svg>`;
const WHISKY_BOTTLE = `<svg viewBox="0 0 40 90" xmlns="http://www.w3.org/2000/svg"><rect x="14" y="2" width="12" height="14" fill="#451a03" stroke="#1c0a01" stroke-width="1.5"/><path d="M14 16 L26 16 L34 30 L34 84 L6 84 L6 30 Z" fill="#d97706" stroke="#451a03" stroke-width="2"/><rect x="10" y="38" width="20" height="22" fill="#fef3c7" stroke="#92400e" stroke-width="1.5"/><text x="20" y="52" font-size="6" fill="#451a03" text-anchor="middle" font-family="serif">WHISKY</text></svg>`;
const WHISKY_BARREL = `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg"><ellipse cx="40" cy="30" rx="36" ry="28" fill="#92400e" stroke="#451a03" stroke-width="2"/><rect x="4" y="14" width="72" height="4" fill="#451a03"/><rect x="4" y="42" width="72" height="4" fill="#451a03"/><rect x="4" y="28" width="72" height="2" fill="#451a03"/></svg>`;

const REDBULL_CAN = `<svg viewBox="0 0 50 90" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="8" width="38" height="74" rx="3" fill="#dbeafe" stroke="#1e3a8a" stroke-width="2"/><rect x="6" y="8" width="38" height="36" fill="#1e40af"/><circle cx="25" cy="26" r="10" fill="#fbbf24"/><path d="M14 50 L36 50 L32 60 L18 60 Z" fill="#dc2626"/></svg>`;
const REDBULL_BULL = `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg"><path d="M14 30 Q14 14 30 14 L50 14 Q66 14 66 30 L66 44 L58 44 L50 38 L30 38 L22 44 L14 44 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><path d="M14 14 L6 4 L20 12 Z M66 14 L74 4 L60 12 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><circle cx="26" cy="28" r="2" fill="#fff"/><circle cx="54" cy="28" r="2" fill="#fff"/></svg>`;
const WING = `<svg viewBox="0 0 70 30" xmlns="http://www.w3.org/2000/svg"><path d="M2 28 Q12 18 18 20 Q22 14 28 18 Q34 10 40 16 Q48 6 54 14 Q62 8 68 14 L68 28 Z" fill="#fef3c7" stroke="#92400e" stroke-width="1.5"/></svg>`;

const MONEY_BILL_100 = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="96" height="46" rx="2" fill="#15803d" stroke="#052e16" stroke-width="1.5"/><circle cx="50" cy="25" r="14" fill="#16a34a" stroke="#052e16" stroke-width="1"/><text x="50" y="31" font-family="serif" font-weight="900" font-size="18" fill="#bbf7d0" text-anchor="middle">100</text><text x="14" y="14" font-size="8" fill="#bbf7d0">$</text><text x="86" y="44" font-size="8" fill="#bbf7d0" text-anchor="end">$</text></svg>`;
const MONEY_COIN = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="#fbbf24" stroke="#92400e" stroke-width="2"/><circle cx="20" cy="20" r="13" fill="none" stroke="#92400e" stroke-width="1.5"/><text x="20" y="27" font-family="serif" font-weight="900" font-size="18" fill="#92400e" text-anchor="middle">$</text></svg>`;
const MONEY_BAG = `<svg viewBox="0 0 70 80" xmlns="http://www.w3.org/2000/svg"><path d="M24 4 L46 4 L42 14 L48 18 Q60 28 60 50 Q60 72 35 76 Q10 72 10 50 Q10 28 22 18 L28 14 Z" fill="#a16207" stroke="#451a03" stroke-width="2"/><text x="35" y="52" font-family="serif" font-weight="900" font-size="24" fill="#fef3c7" text-anchor="middle">$</text></svg>`;
const MONEY_INGOT = `<svg viewBox="0 0 70 40" xmlns="http://www.w3.org/2000/svg"><path d="M2 36 L10 8 L60 8 L68 36 Z" fill="#fbbf24" stroke="#78350f" stroke-width="2"/><path d="M10 8 L60 8 L56 14 L14 14 Z" fill="#fef3c7" opacity="0.6"/></svg>`;
const MONEY_DIAMOND = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><path d="M5 18 L25 4 L45 18 L25 46 Z" fill="#22d3ee" stroke="#0e7490" stroke-width="2"/><path d="M5 18 L45 18 L25 4 Z" fill="#cffafe" opacity="0.7"/><path d="M5 18 L45 18 L25 46 Z" fill="none" stroke="#0e7490" stroke-width="1"/></svg>`;

const POLICE_BADGE = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><path d="M30 4 L52 14 L52 38 Q52 56 30 66 Q8 56 8 38 L8 14 Z" fill="#fbbf24" stroke="#451a03" stroke-width="2"/><path d="M30 18 L34 26 L42 26 L36 32 L38 40 L30 36 L22 40 L24 32 L18 26 L26 26 Z" fill="#fef3c7" stroke="#451a03" stroke-width="1"/></svg>`;
const POLICE_SIREN = `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="20" width="64" height="22" rx="3" fill="#0a0a0a" stroke="#525252" stroke-width="1.5"/><rect x="14" y="24" width="22" height="14" fill="#dc2626"/><rect x="44" y="24" width="22" height="14" fill="#1e40af"/><rect x="36" y="14" width="8" height="32" fill="#0a0a0a"/></svg>`;
const POLICE_CAR = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><path d="M8 36 L8 30 L18 18 L40 18 L48 14 L72 14 L80 18 L92 30 L92 36 Z" fill="#1e40af" stroke="#0c1d4a" stroke-width="2"/><rect x="20" y="20" width="22" height="14" fill="#bfdbfe"/><rect x="50" y="20" width="22" height="14" fill="#bfdbfe"/><circle cx="20" cy="38" r="6" fill="#0a0a0a"/><circle cx="80" cy="38" r="6" fill="#0a0a0a"/><rect x="32" y="10" width="12" height="8" fill="#dc2626"/><rect x="46" y="10" width="12" height="8" fill="#1e40af"/></svg>`;
const POLICE_HANDCUFF = `<svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="20" r="14" fill="none" stroke="#94a3b8" stroke-width="4"/><circle cx="62" cy="20" r="14" fill="none" stroke="#94a3b8" stroke-width="4"/><line x1="32" y1="20" x2="48" y2="20" stroke="#94a3b8" stroke-width="3"/></svg>`;

const STOCK_CANDLE_UP = `<svg viewBox="0 0 30 80" xmlns="http://www.w3.org/2000/svg"><line x1="15" y1="2" x2="15" y2="20" stroke="#10b981" stroke-width="2"/><rect x="5" y="20" width="20" height="40" fill="#10b981"/><line x1="15" y1="60" x2="15" y2="78" stroke="#10b981" stroke-width="2"/></svg>`;
const STOCK_CANDLE_DOWN = `<svg viewBox="0 0 30 80" xmlns="http://www.w3.org/2000/svg"><line x1="15" y1="2" x2="15" y2="20" stroke="#ef4444" stroke-width="2"/><rect x="5" y="20" width="20" height="40" fill="#ef4444"/><line x1="15" y1="60" x2="15" y2="78" stroke="#ef4444" stroke-width="2"/></svg>`;
const STOCK_ARROW_UP = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><path d="M10 50 L30 20 L50 50 L40 50 L40 50 L20 50 Z" fill="#10b981" stroke="#064e3b" stroke-width="2"/><path d="M30 20 L40 40 L20 40 Z" fill="#10b981"/></svg>`;
const STOCK_CHART = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><polyline points="2,55 18,40 30,45 45,25 60,30 75,15 95,8" stroke="#10b981" stroke-width="2.5" fill="none"/><circle cx="95" cy="8" r="3" fill="#10b981"/></svg>`;

const CAR_SEDAN = `<svg viewBox="0 0 120 50" xmlns="http://www.w3.org/2000/svg"><path d="M6 36 L6 30 L20 16 L46 12 L74 12 L92 18 L114 30 L114 38 Z" fill="#171717" stroke="#525252" stroke-width="2"/><path d="M24 20 L46 16 L70 16 L84 20 L82 28 L26 28 Z" fill="#94a3b8" opacity="0.4"/><circle cx="26" cy="38" r="7" fill="#0a0a0a" stroke="#525252" stroke-width="1.5"/><circle cx="26" cy="38" r="3" fill="#525252"/><circle cx="94" cy="38" r="7" fill="#0a0a0a" stroke="#525252" stroke-width="1.5"/><circle cx="94" cy="38" r="3" fill="#525252"/></svg>`;
const CAR_SPORT = `<svg viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg"><path d="M4 30 L8 22 L24 14 L50 8 L80 10 L96 16 L114 22 L116 30 Z" fill="#dc2626" stroke="#450a0a" stroke-width="2"/><path d="M24 18 L50 14 L78 14 L92 18 L88 22 L28 22 Z" fill="#fee2e2" opacity="0.4"/><circle cx="26" cy="30" r="6" fill="#0a0a0a"/><circle cx="92" cy="30" r="6" fill="#0a0a0a"/></svg>`;
const RIM_AUDI = `<svg viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="15" r="10" fill="none" stroke="#a3a3a3" stroke-width="2"/><circle cx="22" cy="15" r="10" fill="none" stroke="#a3a3a3" stroke-width="2"/><circle cx="32" cy="15" r="10" fill="none" stroke="#a3a3a3" stroke-width="2"/><circle cx="42" cy="15" r="10" fill="none" stroke="#a3a3a3" stroke-width="2"/></svg>`;
const RIM_BMW = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="#0a0a0a" stroke="#a3a3a3" stroke-width="1.5"/><path d="M20 4 A16 16 0 0 1 36 20 L20 20 Z" fill="#1e40af"/><path d="M20 36 A16 16 0 0 1 4 20 L20 20 Z" fill="#1e40af"/><path d="M20 4 A16 16 0 0 0 4 20 L20 20 Z" fill="#fafafa"/><path d="M20 36 A16 16 0 0 0 36 20 L20 20 Z" fill="#fafafa"/></svg>`;

/** Padrão monograma estilo Damier + quadrifólio dourado (sem reproduzir logo exato) */
const LV_MONOGRAM = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <rect width="120" height="120" fill="#451a03"/>
  <g fill="#d97706" opacity="0.95">
    <g transform="translate(20 20)">
      <circle r="8" fill="#fbbf24"/>
      <path d="M-6 0 L0 -6 L6 0 L0 6 Z" fill="#451a03"/>
    </g>
    <g transform="translate(60 20)">
      <path d="M-7 -7 L7 -7 L7 7 L-7 7 Z M-3 -3 L3 -3 L3 3 L-3 3 Z" stroke="#fbbf24" stroke-width="1" fill="none"/>
      <circle cx="0" cy="0" r="3" fill="#fbbf24"/>
    </g>
    <g transform="translate(100 20)">
      <path d="M-8 -8 L0 0 L8 -8 L8 0 L0 8 L-8 0 Z" fill="#fbbf24"/>
    </g>
    <g transform="translate(40 60)">
      <circle r="9" fill="#fbbf24"/>
      <circle cx="-3" cy="-3" r="2" fill="#451a03"/>
      <circle cx="3" cy="-3" r="2" fill="#451a03"/>
      <circle cx="0" cy="3" r="2" fill="#451a03"/>
    </g>
    <g transform="translate(80 60)">
      <text x="0" y="6" font-family="Georgia, serif" font-size="22" font-weight="900" fill="#fbbf24" text-anchor="middle">LV</text>
    </g>
    <g transform="translate(20 100)">
      <path d="M-8 -8 L0 0 L8 -8 L8 0 L0 8 L-8 0 Z" fill="#fbbf24"/>
    </g>
    <g transform="translate(60 100)">
      <circle r="8" fill="#fbbf24"/>
      <path d="M-6 0 L0 -6 L6 0 L0 6 Z" fill="#451a03"/>
    </g>
    <g transform="translate(100 100)">
      <path d="M-7 -7 L7 -7 L7 7 L-7 7 Z" stroke="#fbbf24" stroke-width="1" fill="none"/>
      <circle cx="0" cy="0" r="3" fill="#fbbf24"/>
    </g>
  </g>
</svg>`;

const LV_BAG = `<svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 28 L76 28 L70 84 L20 84 Z" fill="#92400e" stroke="#1c0a01" stroke-width="2"/>
  <path d="M26 28 Q26 10 45 10 Q64 10 64 28" stroke="#1c0a01" stroke-width="3" fill="none"/>
  <rect x="14" y="38" width="62" height="6" fill="#d97706"/>
  <g fill="#fbbf24" opacity="0.75">
    <circle cx="26" cy="56" r="3"/>
    <text x="35" y="60" font-family="Georgia, serif" font-size="9" font-weight="900">LV</text>
    <circle cx="56" cy="56" r="3"/>
    <text x="22" y="74" font-family="Georgia, serif" font-size="9" font-weight="900">LV</text>
    <circle cx="40" cy="74" r="2.5"/>
    <text x="56" y="74" font-family="Georgia, serif" font-size="9" font-weight="900">LV</text>
  </g>
  <rect x="36" y="44" width="18" height="4" fill="#fbbf24" opacity="0.6"/>
</svg>`;

/** Cinto LV — segundo elemento icônico */
const LV_BELT = `<svg viewBox="0 0 120 30" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="4" width="116" height="22" fill="#451a03" stroke="#1c0a01" stroke-width="1.5"/>
  <g fill="#fbbf24" opacity="0.8">
    <circle cx="14" cy="15" r="3"/>
    <text x="22" y="20" font-family="Georgia, serif" font-size="10" font-weight="900">LV</text>
    <circle cx="42" cy="15" r="3"/>
    <text x="50" y="20" font-family="Georgia, serif" font-size="10" font-weight="900">LV</text>
    <circle cx="70" cy="15" r="3"/>
    <text x="78" y="20" font-family="Georgia, serif" font-size="10" font-weight="900">LV</text>
  </g>
  <rect x="92" y="2" width="26" height="26" fill="#fbbf24" stroke="#92400e" stroke-width="1.5"/>
  <rect x="98" y="8" width="14" height="14" fill="#451a03"/>
  <text x="105" y="20" font-family="Georgia, serif" font-size="12" font-weight="900" fill="#fbbf24" text-anchor="middle">LV</text>
</svg>`;

const GUCCI_STRIPES = `<svg viewBox="0 0 100 30" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="10" fill="#15803d"/><rect x="0" y="10" width="100" height="10" fill="#dc2626"/><rect x="0" y="20" width="100" height="10" fill="#15803d"/></svg>`;
const GUCCI_GG = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="22" cy="30" r="16" fill="none" stroke="#fbbf24" stroke-width="3"/><path d="M22 30 L38 30" stroke="#fbbf24" stroke-width="3"/><circle cx="38" cy="30" r="16" fill="none" stroke="#fbbf24" stroke-width="3"/><path d="M38 30 L54 30" stroke="#fbbf24" stroke-width="3"/></svg>`;

const WS_BULL = `<svg viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg"><path d="M14 50 Q14 30 30 28 Q26 18 36 14 L42 16 Q48 12 56 16 L62 14 Q72 18 68 28 Q86 30 86 50 L80 50 L74 46 L26 46 L20 50 Z" fill="#eab308" stroke="#713f12" stroke-width="2"/><path d="M30 28 L18 16 L24 28 Z M68 28 L82 16 L74 28 Z" fill="#eab308" stroke="#713f12" stroke-width="2"/><circle cx="38" cy="30" r="2" fill="#fff"/><circle cx="58" cy="30" r="2" fill="#fff"/></svg>`;
const WS_CIGAR = `<svg viewBox="0 0 80 18" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="6" width="60" height="8" fill="#78350f" stroke="#451a03" stroke-width="1"/><rect x="64" y="4" width="12" height="12" fill="#fbbf24" stroke="#713f12" stroke-width="1"/><circle cx="2" cy="10" r="2" fill="#ef4444"/><path d="M2 10 Q-4 4 -2 -2" stroke="#94a3b8" stroke-width="1" fill="none" opacity="0.7"/></svg>`;

const BR_FLAG = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="60" fill="#15803d"/><path d="M50 6 L94 30 L50 54 L6 30 Z" fill="#facc15"/><circle cx="50" cy="30" r="14" fill="#1e40af"/><path d="M38 28 Q50 22 62 28" stroke="#fafafa" stroke-width="1.5" fill="none"/></svg>`;
const LULA_SILHOUETTE = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="22" r="16" fill="#451a03"/><path d="M14 36 Q14 56 30 56 Q46 56 46 36" fill="#fafafa"/><path d="M14 38 L46 38 L48 80 L12 80 Z" fill="#dc2626"/><path d="M22 18 Q22 12 30 10 Q38 12 38 18 L36 24 L24 24 Z" fill="#fafafa"/><circle cx="25" cy="22" r="1.5" fill="#000"/><circle cx="35" cy="22" r="1.5" fill="#000"/></svg>`;
const PT_STAR = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><path d="M25 2 L31 18 L48 18 L34 28 L40 45 L25 35 L10 45 L16 28 L2 18 L19 18 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/></svg>`;
const BOLSO_SILHOUETTE = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="22" r="16" fill="#facc15"/><path d="M14 38 L46 38 L48 80 L12 80 Z" fill="#15803d"/><path d="M30 8 L34 4 L36 12 L40 8 L40 14 Z" fill="#451a03"/><circle cx="25" cy="22" r="1.5" fill="#000"/><circle cx="35" cy="22" r="1.5" fill="#000"/><rect x="22" y="28" width="16" height="2" fill="#451a03"/></svg>`;

const PALM_TREE = `<svg viewBox="0 0 80 110" xmlns="http://www.w3.org/2000/svg"><path d="M38 50 Q34 80 30 108 L42 108 Q46 80 42 50 Z" fill="#78350f" stroke="#451a03" stroke-width="1.5"/><path d="M40 40 Q14 28 4 12 Q24 26 40 36 Z" fill="#16a34a"/><path d="M40 40 Q66 28 76 12 Q56 26 40 36 Z" fill="#16a34a"/><path d="M40 36 Q26 14 36 4 Q42 18 40 36 Z" fill="#15803d"/><path d="M40 36 Q54 14 44 4 Q38 18 40 36 Z" fill="#15803d"/><path d="M40 36 Q20 38 6 50 Q24 38 40 36 Z" fill="#16a34a"/><path d="M40 36 Q60 38 74 50 Q56 38 40 36 Z" fill="#16a34a"/></svg>`;
const SUN_RAYS = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="20" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="3" stroke-linecap="round"><line x1="40" y1="4" x2="40" y2="16"/><line x1="40" y1="64" x2="40" y2="76"/><line x1="4" y1="40" x2="16" y2="40"/><line x1="64" y1="40" x2="76" y2="40"/><line x1="14" y1="14" x2="22" y2="22"/><line x1="58" y1="58" x2="66" y2="66"/><line x1="66" y1="14" x2="58" y2="22"/><line x1="22" y1="58" x2="14" y2="66"/></g></svg>`;
const SUN_HORIZON = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="35" fill="url(#sg)"/><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#dc2626"/></linearGradient></defs></svg>`;
const WAVE = `<svg viewBox="0 0 120 30" xmlns="http://www.w3.org/2000/svg"><path d="M0 20 Q15 8 30 20 Q45 28 60 20 Q75 8 90 20 Q105 28 120 20 L120 30 L0 30 Z" fill="#06b6d4" opacity="0.5"/></svg>`;
const SHELL = `<svg viewBox="0 0 50 40" xmlns="http://www.w3.org/2000/svg"><path d="M25 4 Q44 8 46 28 Q40 36 25 36 Q10 36 4 28 Q6 8 25 4 Z" fill="#fed7aa" stroke="#9a3412" stroke-width="1.5"/><g stroke="#9a3412" stroke-width="1" fill="none"><path d="M25 4 Q20 18 18 36"/><path d="M25 4 Q22 18 22 36"/><path d="M25 4 Q26 18 26 36"/><path d="M25 4 Q30 18 32 36"/></g></svg>`;
const SURFBOARD = `<svg viewBox="0 0 20 80" xmlns="http://www.w3.org/2000/svg"><path d="M10 2 Q4 20 4 50 Q4 72 10 78 Q16 72 16 50 Q16 20 10 2 Z" fill="#fef3c7" stroke="#92400e" stroke-width="1.5"/><line x1="10" y1="2" x2="10" y2="78" stroke="#dc2626" stroke-width="1.5"/></svg>`;

const CROSS = `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg"><rect x="16" y="2" width="8" height="56" fill="#fbbf24" stroke="#92400e" stroke-width="1.5"/><rect x="2" y="14" width="36" height="8" fill="#fbbf24" stroke="#92400e" stroke-width="1.5"/></svg>`;
const DOVE = `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><path d="M30 8 Q40 10 44 18 Q48 22 50 28 L40 30 L30 28 L20 30 L10 28 Q12 22 16 18 Q20 10 30 8 Z" fill="#fafafa" stroke="#94a3b8" stroke-width="1"/><circle cx="42" cy="14" r="2" fill="#000"/><path d="M44 16 L50 14 Z" stroke="#facc15" stroke-width="2"/></svg>`;
const HALO = `<svg viewBox="0 0 60 20" xmlns="http://www.w3.org/2000/svg"><ellipse cx="30" cy="10" rx="26" ry="6" fill="none" stroke="#fbbf24" stroke-width="3"/></svg>`;

const SP_BUILDING = `<svg viewBox="0 0 30 100" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="14" width="26" height="86" fill="#171717" stroke="#525252" stroke-width="1.5"/><g fill="#facc15" opacity="0.8"><rect x="6" y="20" width="4" height="4"/><rect x="14" y="20" width="4" height="4"/><rect x="22" y="20" width="4" height="4"/><rect x="6" y="32" width="4" height="4"/><rect x="14" y="32" width="4" height="4"/><rect x="22" y="32" width="4" height="4"/><rect x="6" y="44" width="4" height="4"/><rect x="14" y="44" width="4" height="4"/><rect x="22" y="44" width="4" height="4"/><rect x="6" y="56" width="4" height="4"/><rect x="22" y="56" width="4" height="4"/><rect x="6" y="68" width="4" height="4"/><rect x="14" y="68" width="4" height="4"/><rect x="6" y="80" width="4" height="4"/><rect x="22" y="80" width="4" height="4"/></g><rect x="12" y="4" width="6" height="14" fill="#171717"/></svg>`;
const COPAN = `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg"><path d="M14 100 L4 14 Q14 6 40 4 Q66 6 76 14 L66 100 Z" fill="#1f2937" stroke="#525252" stroke-width="1.5"/><g fill="#fbbf24" opacity="0.6"><rect x="14" y="20" width="52" height="3"/><rect x="14" y="30" width="52" height="3"/><rect x="14" y="40" width="52" height="3"/><rect x="14" y="50" width="52" height="3"/><rect x="14" y="60" width="52" height="3"/><rect x="14" y="70" width="52" height="3"/><rect x="14" y="80" width="52" height="3"/><rect x="14" y="90" width="52" height="3"/></g></svg>`;

const PAO_ACUCAR = `<svg viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg"><path d="M2 68 Q14 50 22 56 Q30 30 44 36 Q50 12 60 30 Q70 18 80 38 Q88 28 98 56 L98 68 Z" fill="#525252" stroke="#171717" stroke-width="1.5"/><path d="M44 36 Q50 24 60 30 Q66 22 72 30" fill="#737373"/></svg>`;
const CRISTO = `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg"><rect x="32" y="34" width="16" height="56" fill="#94a3b8" stroke="#475569" stroke-width="2"/><rect x="2" y="42" width="76" height="14" fill="#94a3b8" stroke="#475569" stroke-width="2"/><circle cx="40" cy="22" r="10" fill="#94a3b8" stroke="#475569" stroke-width="2"/><rect x="38" y="90" width="4" height="10" fill="#525252"/></svg>`;
const BONDINHO = `<svg viewBox="0 0 60 50" xmlns="http://www.w3.org/2000/svg"><line x1="2" y1="6" x2="58" y2="14" stroke="#525252" stroke-width="2"/><rect x="14" y="18" width="32" height="20" fill="#facc15" stroke="#451a03" stroke-width="2"/><line x1="30" y1="6" x2="30" y2="18" stroke="#525252" stroke-width="2"/><rect x="18" y="22" width="10" height="10" fill="#bae6fd"/><rect x="32" y="22" width="10" height="10" fill="#bae6fd"/></svg>`;

const TAMBOR = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><ellipse cx="30" cy="14" rx="26" ry="8" fill="#fef3c7" stroke="#451a03" stroke-width="2"/><rect x="4" y="14" width="52" height="40" fill="#dc2626" stroke="#451a03" stroke-width="2"/><ellipse cx="30" cy="54" rx="26" ry="8" fill="#fef3c7" stroke="#451a03" stroke-width="2"/><g stroke="#451a03" stroke-width="1.5"><line x1="14" y1="14" x2="14" y2="54"/><line x1="30" y1="14" x2="30" y2="54"/><line x1="46" y1="14" x2="46" y2="54"/></g></svg>`;
const FITA_BONFIM = `<svg viewBox="0 0 100 20" xmlns="http://www.w3.org/2000/svg"><path d="M2 10 Q20 4 40 10 Q60 16 80 10 Q90 6 98 10" stroke="#fbbf24" stroke-width="6" fill="none"/></svg>`;
const PIMENTA = `<svg viewBox="0 0 30 50" xmlns="http://www.w3.org/2000/svg"><path d="M15 4 Q12 14 14 24 Q18 38 18 46 Q14 48 12 46 Q8 38 12 24 Q14 14 15 4 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/><path d="M14 4 L18 4 L16 8 Z" fill="#16a34a"/></svg>`;

const CASINO_CHIP = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="#dc2626" stroke="#fef3c7" stroke-width="3"/><circle cx="30" cy="30" r="18" fill="#dc2626" stroke="#fef3c7" stroke-width="2"/><circle cx="30" cy="30" r="10" fill="#fef3c7"/><text x="30" y="36" font-family="serif" font-weight="900" font-size="12" fill="#dc2626" text-anchor="middle">$</text></svg>`;
const CASINO_CARD = `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="36" height="56" rx="3" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5"/><text x="8" y="16" font-family="serif" font-weight="900" font-size="12" fill="#dc2626">A</text><path d="M20 22 L26 32 L20 42 L14 32 Z" fill="#dc2626"/><text x="32" y="54" font-family="serif" font-weight="900" font-size="12" fill="#dc2626" text-anchor="end">A</text></svg>`;
const CASINO_DICE = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="42" height="42" rx="6" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/><circle cx="15" cy="15" r="3" fill="#0a0a0a"/><circle cx="35" cy="15" r="3" fill="#0a0a0a"/><circle cx="25" cy="25" r="3" fill="#0a0a0a"/><circle cx="15" cy="35" r="3" fill="#0a0a0a"/><circle cx="35" cy="35" r="3" fill="#0a0a0a"/></svg>`;
const CASINO_SEVEN = `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg"><text x="25" y="50" font-family="Arial Black" font-weight="900" font-size="56" fill="#dc2626" text-anchor="middle">7</text></svg>`;

const DUBAI_BURJ = `<svg viewBox="0 0 40 120" xmlns="http://www.w3.org/2000/svg"><path d="M20 2 L22 30 L28 60 L34 100 L20 118 L6 100 L12 60 L18 30 Z" fill="#94a3b8" stroke="#525252" stroke-width="1.5"/><g stroke="#fbbf24" opacity="0.6"><line x1="8" y1="70" x2="32" y2="70" stroke-width="1"/><line x1="10" y1="80" x2="30" y2="80" stroke-width="1"/><line x1="12" y1="90" x2="28" y2="90" stroke-width="1"/></g></svg>`;
const CAMEL = `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg"><path d="M10 50 L14 30 Q18 14 26 16 Q28 8 36 14 Q40 8 48 14 L52 28 Q58 24 66 30 L70 50 L62 50 L60 38 L24 38 L22 50 Z" fill="#d97706" stroke="#451a03" stroke-width="2"/><path d="M14 18 L10 14 L18 18 Z" fill="#d97706"/></svg>`;
const DUNE = `<svg viewBox="0 0 200 50" xmlns="http://www.w3.org/2000/svg"><path d="M0 50 Q40 20 80 35 Q120 45 160 25 Q180 18 200 30 L200 50 Z" fill="#fbbf24" opacity="0.6"/></svg>`;

const SPOTIFY_RING = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="36" fill="#1DB954"/><g fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"><path d="M14 36 Q40 24 64 36"/><path d="M18 46 Q40 36 60 46"/><path d="M22 54 Q40 48 56 54"/></g></svg>`;
const SOUND_WAVE = `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><g fill="#1DB954"><rect x="4" y="14" width="4" height="12"/><rect x="12" y="6" width="4" height="28"/><rect x="20" y="10" width="4" height="20"/><rect x="28" y="2" width="4" height="36"/><rect x="36" y="14" width="4" height="12"/><rect x="44" y="6" width="4" height="28"/><rect x="52" y="10" width="4" height="20"/></g></svg>`;
const MUSIC_NOTE = `<svg viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg"><path d="M18 4 L34 8 L34 16 L20 14 L20 38 Q20 46 12 46 Q4 46 4 40 Q4 34 12 34 Q16 34 18 36 Z" fill="#1DB954"/></svg>`;

const CLAUDE_LOGO = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="#cc785c"/><path d="M22 40 L18 46 L26 36 M22 40 Q22 24 30 24 Q38 24 38 40 L22 40 Z M30 24 L30 16 M26 20 L34 20" stroke="#1a0f0a" stroke-width="2.5" fill="none"/></svg>`;
const CLAUDE_SPARK = `<svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg"><path d="M15 2 L17 13 L28 15 L17 17 L15 28 L13 17 L2 15 L13 13 Z" fill="#cc785c"/></svg>`;

const KITTY_FACE = `<svg viewBox="0 0 80 70" xmlns="http://www.w3.org/2000/svg"><path d="M40 6 L18 10 L8 30 L14 50 L40 60 L66 50 L72 30 L62 10 Z" fill="#fafafa" stroke="#1a1a1a" stroke-width="2"/><path d="M18 10 L14 2 L26 10 Z M62 10 L66 2 L54 10 Z" fill="#fafafa" stroke="#1a1a1a" stroke-width="2"/><circle cx="28" cy="32" r="3" fill="#1a1a1a"/><circle cx="52" cy="32" r="3" fill="#1a1a1a"/><circle cx="40" cy="38" r="3" fill="#fbbf24"/><g stroke="#1a1a1a" stroke-width="1.5"><line x1="16" y1="34" x2="22" y2="36"/><line x1="14" y1="38" x2="22" y2="38"/><line x1="16" y1="42" x2="22" y2="40"/><line x1="58" y1="36" x2="64" y2="34"/><line x1="58" y1="38" x2="66" y2="38"/><line x1="58" y1="40" x2="64" y2="42"/></g><path d="M22 16 Q18 8 26 6 Q32 10 28 18 Z" fill="#ec4899" stroke="#831843" stroke-width="1.5"/></svg>`;
const BOW = `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><path d="M4 20 Q4 6 22 14 L30 16 L38 14 Q56 6 56 20 Q56 34 38 26 L30 24 L22 26 Q4 34 4 20 Z" fill="#ec4899" stroke="#831843" stroke-width="1.5"/><rect x="26" y="14" width="8" height="12" fill="#ec4899" stroke="#831843" stroke-width="1.5"/></svg>`;
const HEART = `<svg viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg"><path d="M20 34 L4 18 Q-2 8 8 4 Q14 4 20 12 Q26 4 32 4 Q42 8 36 18 Z" fill="#ec4899" stroke="#831843" stroke-width="1.5"/></svg>`;

const TROPHY = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><path d="M14 10 L46 10 L44 32 Q42 44 30 44 Q18 44 16 32 Z" fill="#fbbf24" stroke="#713f12" stroke-width="2"/><path d="M14 14 L4 16 L4 24 Q4 30 14 30 M46 14 L56 16 L56 24 Q56 30 46 30" fill="#fbbf24" stroke="#713f12" stroke-width="2"/><rect x="20" y="44" width="20" height="6" fill="#92400e"/><rect x="14" y="50" width="32" height="10" fill="#92400e" stroke="#451a03" stroke-width="1.5"/><rect x="10" y="60" width="40" height="6" fill="#451a03"/></svg>`;
const SOCCER_BALL = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><circle cx="25" cy="25" r="22" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/><path d="M25 8 L35 16 L31 28 L19 28 L15 16 Z" fill="#0a0a0a"/><path d="M25 8 L13 6 M25 8 L37 6 M35 16 L44 12 M31 28 L40 36 M19 28 L10 36 M15 16 L6 12" stroke="#0a0a0a" stroke-width="1.5"/></svg>`;

const ZOMBIE = `<svg viewBox="0 0 50 80" xmlns="http://www.w3.org/2000/svg"><ellipse cx="25" cy="18" rx="14" ry="16" fill="#06b6d4" stroke="#365314" stroke-width="2"/><circle cx="20" cy="14" r="2" fill="#fff"/><circle cx="30" cy="16" r="2" fill="#fff"/><circle cx="20" cy="14" r="1" fill="#7f1d1d"/><circle cx="30" cy="16" r="1" fill="#7f1d1d"/><path d="M18 24 L22 26 L24 22 L26 26 L28 22 L30 26 L32 24" stroke="#365314" stroke-width="1.5" fill="none"/><rect x="14" y="34" width="22" height="30" fill="#0891b2" stroke="#365314" stroke-width="2"/><rect x="8" y="38" width="8" height="20" fill="#06b6d4" stroke="#365314" stroke-width="1.5"/><rect x="34" y="38" width="8" height="20" fill="#06b6d4" stroke="#365314" stroke-width="1.5"/><rect x="14" y="64" width="8" height="16" fill="#1c1917"/><rect x="28" y="64" width="8" height="16" fill="#1c1917"/><path d="M14 24 Q12 30 18 28" fill="#365314"/></svg>`;
const TOMB = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><path d="M6 80 L6 30 Q6 6 30 6 Q54 6 54 30 L54 80 Z" fill="#525252" stroke="#171717" stroke-width="2"/><text x="30" y="40" font-family="serif" font-weight="900" font-size="14" fill="#171717" text-anchor="middle">RIP</text></svg>`;
const MOON_FULL = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="#fef3c7" opacity="0.9"/><circle cx="20" cy="22" r="3" fill="#e5e7eb" opacity="0.6"/><circle cx="38" cy="36" r="4" fill="#e5e7eb" opacity="0.6"/><circle cx="30" cy="44" r="2" fill="#e5e7eb" opacity="0.6"/></svg>`;

const TIKTOK_NOTE = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><path d="M30 8 Q30 4 34 4 L42 4 Q42 18 54 18 L54 28 Q42 28 36 22 L36 42 Q36 52 26 52 Q16 52 16 42 Q16 32 26 32 L26 42 Q26 44 26 44" fill="#ff0050"/><path d="M30 8 Q30 4 34 4 L42 4 Q42 18 54 18 L54 28 Q42 28 36 22 L36 42 Q36 52 26 52 Q16 52 16 42 Q16 32 26 32 L26 42 Q26 44 26 44" stroke="#22d3ee" stroke-width="2" fill="none" transform="translate(-3, -3)"/></svg>`;
const KWAI_K = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="#FF7A00"/><path d="M20 14 L20 46 M20 30 L34 14 M20 30 L34 46" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;

const GOOGLE_DOTS = `<svg viewBox="0 0 80 20" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" fill="#4285F4"/><circle cx="30" cy="10" r="8" fill="#EA4335"/><circle cx="50" cy="10" r="8" fill="#FBBC05"/><circle cx="70" cy="10" r="8" fill="#34A853"/></svg>`;
const SEARCH_ICON = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="16" fill="none" stroke="#4285F4" stroke-width="4"/><line x1="36" y1="36" x2="54" y2="54" stroke="#4285F4" stroke-width="5" stroke-linecap="round"/></svg>`;

const AK47 = `<svg viewBox="0 0 120 30" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="14" width="100" height="6" fill="#171717"/><rect x="14" y="8" width="40" height="6" fill="#92400e"/><rect x="58" y="8" width="42" height="14" fill="#171717"/><rect x="32" y="20" width="12" height="10" fill="#92400e"/><rect x="100" y="10" width="16" height="4" fill="#171717"/><path d="M50 22 Q46 28 50 30 L58 30 Q58 26 56 22 Z" fill="#171717"/></svg>`;
const C4_BOMB = `<svg viewBox="0 0 70 50" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="14" width="58" height="32" rx="3" fill="#facc15" stroke="#713f12" stroke-width="2"/><rect x="12" y="20" width="46" height="14" fill="#ef4444"/><text x="35" y="32" font-family="monospace" font-weight="900" font-size="12" fill="#fff" text-anchor="middle">C4</text><rect x="28" y="2" width="14" height="14" fill="#171717"/><circle cx="35" cy="9" r="4" fill="#ef4444"/></svg>`;

const FB_F = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="#1877F2"/><path d="M34 18 L40 18 L40 26 L34 26 L34 50 L26 50 L26 26 L22 26 L22 18 L26 18 L26 14 Q26 8 34 8 L40 8 L40 14 L36 14 Q34 14 34 16 Z" fill="#fff"/></svg>`;
const FB_THUMB = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><path d="M14 24 L20 24 L20 46 L14 46 Z" fill="#1877F2"/><path d="M22 22 L22 46 L40 46 Q44 46 44 42 L44 32 Q44 28 40 28 L34 28 Q36 24 36 18 Q36 10 30 10 L28 18 L22 24 Z" fill="#1877F2"/></svg>`;
const SPEECH = `<svg viewBox="0 0 60 50" xmlns="http://www.w3.org/2000/svg"><path d="M4 8 Q4 4 8 4 L52 4 Q56 4 56 8 L56 30 Q56 34 52 34 L24 34 L14 44 L14 34 L8 34 Q4 34 4 30 Z" fill="#1877F2"/></svg>`;

const FUJI = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><path d="M4 56 L34 14 Q50 4 66 14 L96 56 Z" fill="#3b82f6" stroke="#1e3a8a" stroke-width="2"/><path d="M30 18 Q50 6 70 18 L60 24 L52 18 L44 24 L36 18 Z" fill="#fafafa"/></svg>`;
const TORII = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><rect x="14" y="14" width="32" height="6" fill="#dc2626"/><rect x="10" y="6" width="40" height="6" fill="#dc2626"/><rect x="18" y="20" width="4" height="46" fill="#dc2626"/><rect x="38" y="20" width="4" height="46" fill="#dc2626"/><rect x="22" y="14" width="16" height="2" fill="#dc2626"/></svg>`;
const SAKURA = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><g fill="#fda4af" stroke="#9f1239" stroke-width="0.8"><path d="M20 4 Q22 14 20 20 Q18 14 20 4 Z"/><path d="M30 12 Q28 22 22 22 Q26 18 30 12 Z"/><path d="M30 28 Q22 26 22 22 Q28 24 30 28 Z"/><path d="M20 36 Q18 26 22 22 Q20 28 20 36 Z"/><path d="M10 28 Q18 26 22 22 Q14 26 10 28 Z"/><path d="M10 12 Q18 18 22 22 Q14 16 10 12 Z"/></g><circle cx="22" cy="22" r="3" fill="#facc15"/></svg>`;
const RED_DOT_SUN = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="34" fill="#dc2626"/></svg>`;

const AFRICA_MAP = `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg"><path d="M20 6 L40 4 L60 10 L66 24 L62 38 L70 52 L66 70 L52 90 L42 96 L30 90 L24 76 L14 60 L10 40 L14 22 Z" fill="#ea580c" stroke="#7c2d12" stroke-width="2"/></svg>`;
const LION = `<svg viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg"><circle cx="35" cy="40" r="28" fill="#a16207" stroke="#451a03" stroke-width="2"/><circle cx="35" cy="38" r="18" fill="#fbbf24" stroke="#451a03" stroke-width="2"/><circle cx="28" cy="34" r="2" fill="#0a0a0a"/><circle cx="42" cy="34" r="2" fill="#0a0a0a"/><path d="M30 42 L40 42 L35 48 Z" fill="#0a0a0a"/><path d="M35 48 L35 52 M30 50 L25 52 M40 50 L45 52" stroke="#0a0a0a" stroke-width="1"/></svg>`;
const BAOBAB = `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg"><path d="M36 50 Q34 70 30 98 L50 98 Q46 70 44 50 Z" fill="#78350f" stroke="#451a03" stroke-width="2"/><ellipse cx="40" cy="34" rx="34" ry="16" fill="#16a34a" stroke="#052e16" stroke-width="1.5"/><ellipse cx="22" cy="28" rx="14" ry="8" fill="#16a34a"/><ellipse cx="58" cy="28" rx="14" ry="8" fill="#16a34a"/></svg>`;
const MASK_AFRICAN = `<svg viewBox="0 0 50 80" xmlns="http://www.w3.org/2000/svg"><path d="M25 4 Q40 8 42 30 L42 60 Q42 76 25 76 Q8 76 8 60 L8 30 Q10 8 25 4 Z" fill="#92400e" stroke="#1c0a01" stroke-width="2"/><path d="M16 28 L22 32 L18 36 Z M28 32 L34 28 L32 36 Z" fill="#fbbf24"/><path d="M22 50 L28 50 L26 56 L24 56 Z" fill="#fbbf24"/></svg>`;

const PRADA_TRIANGLE = `<svg viewBox="0 0 50 40" xmlns="http://www.w3.org/2000/svg"><path d="M4 4 L46 4 L25 38 Z" fill="#171717" stroke="#a3a3a3" stroke-width="2"/><path d="M14 12 L36 12 L25 30 Z" fill="none" stroke="#a3a3a3" stroke-width="1"/></svg>`;

const FIRE_BIG = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><path d="M30 4 Q42 22 38 38 Q48 32 46 50 Q52 50 48 64 Q42 74 30 76 Q18 74 12 64 Q8 50 14 50 Q12 32 22 38 Q18 22 30 4 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/><path d="M30 24 Q38 38 34 54 Q30 66 30 68 Q26 66 26 54 Q22 38 30 24 Z" fill="#f97316"/><path d="M30 36 Q34 50 30 60 Q26 50 30 36 Z" fill="#fbbf24"/></svg>`;
const DEVIL_HORN = `<svg viewBox="0 0 60 50" xmlns="http://www.w3.org/2000/svg"><path d="M6 46 Q4 30 14 22 Q18 6 28 18 L32 18 Q42 6 46 22 Q56 30 54 46 L40 42 L34 30 L26 30 L20 42 Z" fill="#7f1d1d" stroke="#000" stroke-width="1.5"/><circle cx="22" cy="30" r="2" fill="#facc15"/><circle cx="38" cy="30" r="2" fill="#facc15"/></svg>`;
const TRIDENT = `<svg viewBox="0 0 50 80" xmlns="http://www.w3.org/2000/svg"><rect x="22" y="20" width="6" height="56" fill="#7c2d12" stroke="#451a03" stroke-width="1.5"/><path d="M10 22 L14 4 L18 22 Z M22 22 L25 0 L28 22 Z M32 22 L36 4 L40 22 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/><rect x="6" y="20" width="38" height="6" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/></svg>`;

const ARCH_GOLD = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><path d="M10 56 Q10 14 30 14 Q50 14 50 38 Q50 14 70 14 Q90 14 90 56" stroke="#fbbf24" stroke-width="14" fill="none" stroke-linecap="round"/></svg>`;
const BURGER = `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg"><path d="M6 22 Q6 6 40 6 Q74 6 74 22 Z" fill="#d97706" stroke="#451a03" stroke-width="2"/><circle cx="20" cy="14" r="1.5" fill="#fef3c7"/><circle cx="32" cy="12" r="1.5" fill="#fef3c7"/><circle cx="50" cy="14" r="1.5" fill="#fef3c7"/><circle cx="62" cy="12" r="1.5" fill="#fef3c7"/><rect x="4" y="22" width="72" height="4" fill="#16a34a"/><rect x="4" y="26" width="72" height="8" fill="#7f1d1d"/><path d="M4 34 Q14 38 24 34 Q34 30 44 34 Q54 38 64 34 Q74 30 76 34 L76 38 L4 38 Z" fill="#facc15"/><path d="M4 38 Q6 54 40 54 Q74 54 76 38 Z" fill="#d97706" stroke="#451a03" stroke-width="2"/></svg>`;
const FRIES = `<svg viewBox="0 0 50 70" xmlns="http://www.w3.org/2000/svg"><path d="M8 30 L42 30 L40 64 Q40 68 36 68 L14 68 Q10 68 10 64 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><g fill="#facc15" stroke="#a16207" stroke-width="1"><rect x="12" y="6" width="5" height="30"/><rect x="20" y="2" width="5" height="34"/><rect x="28" y="8" width="5" height="28"/><rect x="36" y="4" width="5" height="32"/></g></svg>`;
const SODA_CUP = `<svg viewBox="0 0 50 70" xmlns="http://www.w3.org/2000/svg"><path d="M8 14 L42 14 L38 66 L12 66 Z" fill="#fafafa" stroke="#171717" stroke-width="2"/><rect x="6" y="10" width="38" height="6" rx="2" fill="#dc2626"/><rect x="22" y="2" width="6" height="14" fill="#fafafa" stroke="#171717" stroke-width="1.5"/><text x="25" y="44" font-family="Arial Black" font-size="10" fill="#dc2626" text-anchor="middle">COLA</text></svg>`;
const CROWN_BK = `<svg viewBox="0 0 80 50" xmlns="http://www.w3.org/2000/svg"><path d="M6 44 L10 14 L24 30 L40 6 L56 30 L70 14 L74 44 Z" fill="#fbbf24" stroke="#92400e" stroke-width="2"/><circle cx="10" cy="14" r="3" fill="#ef4444"/><circle cx="40" cy="6" r="3" fill="#ef4444"/><circle cx="70" cy="14" r="3" fill="#ef4444"/></svg>`;

const NUMBER_67 = `<svg viewBox="0 0 80 50" xmlns="http://www.w3.org/2000/svg"><text x="40" y="42" font-family="Impact, Arial Black" font-weight="900" font-size="56" fill="#22d3ee" text-anchor="middle" letter-spacing="-2">67</text></svg>`;
const SKULL = `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg"><path d="M25 4 Q44 8 44 30 Q44 42 38 46 L38 54 L30 54 L30 48 L20 48 L20 54 L12 54 L12 46 Q6 42 6 30 Q6 8 25 4 Z" fill="#fafafa" stroke="#171717" stroke-width="2"/><circle cx="18" cy="28" r="4" fill="#171717"/><circle cx="32" cy="28" r="4" fill="#171717"/><path d="M22 38 L28 38 L26 42 L24 42 Z" fill="#171717"/></svg>`;
const TROLLFACE = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="36" fill="#fafafa" stroke="#0a0a0a" stroke-width="3"/><ellipse cx="26" cy="32" rx="5" ry="6" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/><ellipse cx="54" cy="32" rx="5" ry="6" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/><circle cx="26" cy="32" r="2" fill="#0a0a0a"/><circle cx="54" cy="32" r="2" fill="#0a0a0a"/><path d="M14 50 Q40 72 66 50 Q40 64 14 50 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/><path d="M14 50 Q40 72 66 50" stroke="#0a0a0a" stroke-width="2" fill="none"/></svg>`;

const IBIZA_SUN = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="ig"><stop offset="0%" stop-color="#fef3c7"/><stop offset="50%" stop-color="#f97316"/><stop offset="100%" stop-color="#ec4899"/></radialGradient></defs><circle cx="50" cy="60" r="44" fill="url(#ig)"/></svg>`;
const DISCO_BALL = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="#94a3b8" stroke="#171717" stroke-width="1.5"/><g stroke="#1a1a1a" stroke-width="0.6"><line x1="4" y1="30" x2="56" y2="30"/><line x1="30" y1="4" x2="30" y2="56"/><line x1="10" y1="14" x2="50" y2="46"/><line x1="50" y1="14" x2="10" y2="46"/><ellipse cx="30" cy="30" rx="26" ry="10" fill="none"/><ellipse cx="30" cy="30" rx="10" ry="26" fill="none"/></g><circle cx="22" cy="20" r="2" fill="#fafafa"/><circle cx="40" cy="24" r="1.5" fill="#fafafa"/></svg>`;
const SPEAKER = `<svg viewBox="0 0 50 80" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="42" height="72" rx="4" fill="#1a1a1a" stroke="#525252" stroke-width="2"/><circle cx="25" cy="22" r="10" fill="#525252" stroke="#737373" stroke-width="1.5"/><circle cx="25" cy="22" r="4" fill="#171717"/><circle cx="25" cy="54" r="14" fill="#525252" stroke="#737373" stroke-width="1.5"/><circle cx="25" cy="54" r="6" fill="#171717"/></svg>`;
const NEON_BAR = `<svg viewBox="0 0 80 8" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="8" rx="4" fill="#a855f7"/></svg>`;

/* ============== SCENES ============== */

export const SCENES: Record<string, Scene> = {
  /* ============ PHARMA ============ */
  pharma: {
    gradient: "radial-gradient(circle at 30% 20%, rgba(6,182,212,0.14) 0%, transparent 50%)",
    elements: [
      { svg: PILL_CAPSULE_RW, x: 18, y: 20, size: 90, opacity: 0.55, rotate: -25, anim: 0 },
      { svg: PILL_CAPSULE_BW, x: 65, y: 18, size: 100, opacity: 0.58, rotate: 18, anim: 1 },
      { svg: PILL_CAPSULE_GY, x: 38, y: 38, size: 85, opacity: 0.5, rotate: 45, anim: 2 },
      { svg: PILL_CAPSULE_RW, x: 80, y: 45, size: 70, opacity: 0.5, rotate: -10, anim: 3 },
      { svg: PILL_CAPSULE_BW, x: 12, y: 55, size: 80, opacity: 0.52, rotate: 60, anim: 0 },
      { svg: PILL_CAPSULE_GY, x: 56, y: 62, size: 95, opacity: 0.55, rotate: -30, anim: 1 },
      { svg: PILL_CAPSULE_RW, x: 28, y: 78, size: 75, opacity: 0.48, rotate: 12, anim: 2 },
      { svg: PILL_CAPSULE_BW, x: 78, y: 80, size: 85, opacity: 0.52, rotate: -45, anim: 3 },
      { svg: PILL_TABLET, x: 8, y: 30, size: 50, opacity: 0.45, anim: 0 },
      { svg: PILL_TABLET, x: 48, y: 18, size: 42, opacity: 0.4, anim: 1 },
      { svg: PILL_TABLET, x: 92, y: 28, size: 48, opacity: 0.42, anim: 2 },
      { svg: PILL_TABLET, x: 22, y: 88, size: 38, opacity: 0.4, anim: 3 },
      { svg: PILL_TABLET, x: 68, y: 35, size: 44, opacity: 0.45, anim: 0 },
      { svg: PILL_TABLET, x: 42, y: 85, size: 46, opacity: 0.42, anim: 1 },
    ],
  },

  /* ============ MONSTER ============ */
  monster: {
    gradient: "radial-gradient(circle at 50% 80%, rgba(57,255,20,0.16) 0%, transparent 60%)",
    elements: [
      { svg: MONSTER_CAN, x: 18, y: 30, size: 110, opacity: 0.55, rotate: -8, anim: 0 },
      { svg: MONSTER_CAN, x: 78, y: 28, size: 130, opacity: 0.6, rotate: 12, anim: 1 },
      { svg: MONSTER_CAN, x: 48, y: 70, size: 100, opacity: 0.5, anim: 2 },
      { svg: MONSTER_CAN, pin: "bottom-left", x: 5, y: 5, size: 140, opacity: 0.45 },
      { svg: MONSTER_CLAW, x: 32, y: 18, size: 140, opacity: 0.5, rotate: -10, anim: 0 },
      { svg: MONSTER_CLAW, x: 65, y: 50, size: 120, opacity: 0.45, rotate: 15, anim: 2 },
      { svg: MONSTER_CLAW, x: 22, y: 60, size: 110, opacity: 0.4, rotate: -25, anim: 3 },
      { svg: LIGHTNING_GREEN, x: 12, y: 80, size: 55, opacity: 0.5, anim: 0 },
      { svg: LIGHTNING_GREEN, x: 88, y: 75, size: 60, opacity: 0.52, rotate: 20, anim: 1 },
      { svg: LIGHTNING_GREEN, x: 50, y: 18, size: 50, opacity: 0.48, rotate: -15, anim: 2 },
      { svg: LIGHTNING_GREEN, x: 92, y: 18, size: 45, opacity: 0.45, anim: 3 },
    ],
  },

  /* ============ WHISKY ============ */
  whisky: {
    gradient: "linear-gradient(135deg, rgba(217,119,6,0.12) 0%, transparent 50%, rgba(69,26,3,0.25) 100%)",
    elements: [
      { svg: WHISKY_BOTTLE, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.4 },
      { svg: WHISKY_BOTTLE, pin: "bottom-right", x: 5, y: 5, size: 160, opacity: 0.36, rotate: 5 },
      { svg: WHISKY_GLASS, x: 25, y: 70, size: 110, opacity: 0.5, anim: 0 },
      { svg: WHISKY_GLASS, x: 70, y: 75, size: 130, opacity: 0.55, anim: 1 },
      { svg: WHISKY_GLASS, x: 50, y: 40, size: 90, opacity: 0.42, anim: 2 },
      { svg: WHISKY_BARREL, x: 18, y: 30, size: 130, opacity: 0.35, anim: 3 },
      { svg: WHISKY_BARREL, x: 82, y: 35, size: 120, opacity: 0.32, rotate: 5, anim: 0 },
      { svg: WHISKY_BARREL, x: 50, y: 12, size: 100, opacity: 0.3, anim: 1 },
    ],
  },

  /* ============ REDBULL ============ */
  redbull: {
    gradient: "linear-gradient(135deg, rgba(220,38,38,0.10) 0%, rgba(30,64,175,0.14) 100%)",
    elements: [
      { svg: REDBULL_BULL, x: 22, y: 25, size: 140, opacity: 0.45, rotate: -10, anim: 0 },
      { svg: REDBULL_BULL, x: 78, y: 70, size: 160, opacity: 0.5, rotate: 8, anim: 1 },
      { svg: REDBULL_BULL, x: 50, y: 45, size: 130, opacity: 0.42, anim: 2 },
      { svg: REDBULL_CAN, pin: "bottom-left", x: 5, y: 5, size: 130, opacity: 0.5 },
      { svg: REDBULL_CAN, pin: "bottom-right", x: 5, y: 5, size: 110, opacity: 0.46 },
      { svg: REDBULL_CAN, x: 30, y: 70, size: 90, opacity: 0.42, anim: 3 },
      { svg: REDBULL_CAN, x: 68, y: 22, size: 100, opacity: 0.45, rotate: -5, anim: 0 },
      { svg: WING, x: 14, y: 50, size: 120, opacity: 0.35, anim: 1 },
      { svg: WING, x: 88, y: 40, size: 110, opacity: 0.32, rotate: 180, anim: 2 },
      { svg: LIGHTNING_BOLT, x: 8, y: 18, size: 50, opacity: 0.4, anim: 0 },
      { svg: LIGHTNING_BOLT, x: 92, y: 88, size: 60, opacity: 0.45, anim: 2 },
    ],
  },

  /* ============ MONEY ============ */
  money: {
    gradient: "radial-gradient(ellipse at top, rgba(21,128,61,0.18) 0%, transparent 60%)",
    elements: [
      { svg: MONEY_BILL_100, x: 18, y: 25, size: 110, opacity: 0.55, rotate: -8, anim: 0 },
      { svg: MONEY_BILL_100, x: 65, y: 18, size: 100, opacity: 0.5, rotate: 14, anim: 1 },
      { svg: MONEY_BILL_100, x: 38, y: 50, size: 120, opacity: 0.58, rotate: -22, anim: 2 },
      { svg: MONEY_BILL_100, x: 82, y: 55, size: 105, opacity: 0.5, rotate: 18, anim: 3 },
      { svg: MONEY_BILL_100, x: 22, y: 78, size: 95, opacity: 0.45, rotate: 8, anim: 0 },
      { svg: MONEY_BILL_100, x: 58, y: 85, size: 115, opacity: 0.5, rotate: -15, anim: 1 },
      { svg: MONEY_COIN, x: 10, y: 50, size: 45, opacity: 0.6, anim: 0 },
      { svg: MONEY_COIN, x: 50, y: 22, size: 38, opacity: 0.55, anim: 1 },
      { svg: MONEY_COIN, x: 90, y: 35, size: 50, opacity: 0.6, anim: 2 },
      { svg: MONEY_COIN, x: 30, y: 38, size: 35, opacity: 0.5, anim: 3 },
      { svg: MONEY_COIN, x: 72, y: 72, size: 42, opacity: 0.55, anim: 0 },
      { svg: MONEY_BAG, pin: "bottom-left", x: 5, y: 5, size: 130, opacity: 0.45 },
      { svg: MONEY_BAG, pin: "bottom-right", x: 5, y: 5, size: 110, opacity: 0.42 },
      { svg: MONEY_INGOT, x: 45, y: 12, size: 80, opacity: 0.4, rotate: 5, anim: 1 },
      { svg: MONEY_INGOT, x: 88, y: 10, size: 70, opacity: 0.38, rotate: -8, anim: 3 },
      { svg: MONEY_DIAMOND, x: 12, y: 12, size: 55, opacity: 0.45, anim: 0 },
      { svg: MONEY_DIAMOND, x: 78, y: 92, size: 60, opacity: 0.5, anim: 2 },
    ],
  },

  /* ============ POLICIA ============ */
  policia: {
    gradient: "linear-gradient(135deg, rgba(30,64,175,0.18) 0%, transparent 50%, rgba(220,38,38,0.10) 100%)",
    elements: [
      { svg: POLICE_BADGE, x: 22, y: 30, size: 120, opacity: 0.5, rotate: -10, anim: 0 },
      { svg: POLICE_BADGE, x: 78, y: 70, size: 130, opacity: 0.52, rotate: 8, anim: 1 },
      { svg: POLICE_BADGE, x: 50, y: 18, size: 90, opacity: 0.42, anim: 2 },
      { svg: POLICE_SIREN, pin: "top-left", x: 3, y: 3, size: 140, opacity: 0.45 },
      { svg: POLICE_SIREN, pin: "top-right", x: 3, y: 3, size: 140, opacity: 0.45 },
      { svg: POLICE_CAR, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.5 },
      { svg: POLICE_CAR, pin: "bottom-right", x: 5, y: 5, size: 160, opacity: 0.46 },
      { svg: POLICE_CAR, x: 50, y: 55, size: 140, opacity: 0.42, anim: 3 },
      { svg: POLICE_HANDCUFF, x: 18, y: 70, size: 100, opacity: 0.4, rotate: 25, anim: 0 },
      { svg: POLICE_HANDCUFF, x: 82, y: 30, size: 110, opacity: 0.42, rotate: -15, anim: 2 },
    ],
  },

  /* ============ BOLSA ============ */
  bolsa: {
    gradient: "linear-gradient(180deg, transparent 0%, rgba(16,185,129,0.12) 80%, rgba(16,185,129,0.06) 100%)",
    elements: [
      { svg: STOCK_CANDLE_UP, x: 10, y: 60, size: 50, opacity: 0.7 },
      { svg: STOCK_CANDLE_UP, x: 18, y: 55, size: 60, opacity: 0.75 },
      { svg: STOCK_CANDLE_DOWN, x: 26, y: 50, size: 70, opacity: 0.7 },
      { svg: STOCK_CANDLE_UP, x: 34, y: 45, size: 80, opacity: 0.78 },
      { svg: STOCK_CANDLE_UP, x: 42, y: 40, size: 90, opacity: 0.82 },
      { svg: STOCK_CANDLE_DOWN, x: 50, y: 50, size: 75, opacity: 0.72 },
      { svg: STOCK_CANDLE_UP, x: 58, y: 35, size: 95, opacity: 0.85 },
      { svg: STOCK_CANDLE_UP, x: 66, y: 28, size: 100, opacity: 0.85 },
      { svg: STOCK_CANDLE_DOWN, x: 74, y: 35, size: 80, opacity: 0.74 },
      { svg: STOCK_CANDLE_UP, x: 82, y: 22, size: 110, opacity: 0.88 },
      { svg: STOCK_CANDLE_UP, x: 90, y: 18, size: 120, opacity: 0.9 },
      { svg: STOCK_ARROW_UP, x: 25, y: 20, size: 70, opacity: 0.55, anim: 0 },
      { svg: STOCK_ARROW_UP, x: 72, y: 80, size: 60, opacity: 0.5, anim: 2 },
      { svg: STOCK_CHART, x: 50, y: 85, size: 280, opacity: 0.3 },
      { svg: STOCK_CHART, x: 50, y: 12, size: 320, opacity: 0.28 },
    ],
  },

  /* ============ LUXO CARS ============ */
  luxocars: {
    gradient: "linear-gradient(180deg, rgba(220,38,38,0.08) 0%, transparent 50%, rgba(0,0,0,0.4) 100%)",
    elements: [
      { svg: CAR_SPORT, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.55 },
      { svg: CAR_SPORT, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.6 },
      { svg: CAR_SEDAN, x: 35, y: 65, size: 180, opacity: 0.5, anim: 3 },
      { svg: CAR_SEDAN, x: 70, y: 35, size: 160, opacity: 0.45, rotate: 3, anim: 0 },
      { svg: CAR_SEDAN, x: 20, y: 30, size: 140, opacity: 0.42, rotate: -2, anim: 1 },
      { svg: RIM_BMW, x: 50, y: 18, size: 70, opacity: 0.5, anim: 0 },
      { svg: RIM_BMW, x: 85, y: 85, size: 80, opacity: 0.52, anim: 2 },
      { svg: RIM_AUDI, x: 14, y: 80, size: 100, opacity: 0.5, anim: 1 },
      { svg: RIM_AUDI, x: 78, y: 18, size: 90, opacity: 0.48, anim: 3 },
    ],
  },

  /* ============ LV ============ */
  louisvuitton: {
    gradient: "linear-gradient(135deg, rgba(146,64,14,0.30) 0%, rgba(69,26,3,0.50) 50%, rgba(217,119,6,0.15) 100%)",
    elements: [
      // Padrão monograma cobrindo o fundo todo (grid 4×3)
      { svg: LV_MONOGRAM, x: 12, y: 14, size: 200, opacity: 0.55 },
      { svg: LV_MONOGRAM, x: 38, y: 14, size: 200, opacity: 0.55 },
      { svg: LV_MONOGRAM, x: 62, y: 14, size: 200, opacity: 0.55 },
      { svg: LV_MONOGRAM, x: 88, y: 14, size: 200, opacity: 0.55 },
      { svg: LV_MONOGRAM, x: 12, y: 40, size: 200, opacity: 0.5 },
      { svg: LV_MONOGRAM, x: 38, y: 40, size: 200, opacity: 0.5 },
      { svg: LV_MONOGRAM, x: 62, y: 40, size: 200, opacity: 0.5 },
      { svg: LV_MONOGRAM, x: 88, y: 40, size: 200, opacity: 0.5 },
      { svg: LV_MONOGRAM, x: 12, y: 70, size: 200, opacity: 0.45 },
      { svg: LV_MONOGRAM, x: 38, y: 70, size: 200, opacity: 0.45 },
      { svg: LV_MONOGRAM, x: 62, y: 70, size: 200, opacity: 0.45 },
      { svg: LV_MONOGRAM, x: 88, y: 70, size: 200, opacity: 0.45 },
      // Bolsas e cintos em foreground
      { svg: LV_BAG, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.85 },
      { svg: LV_BAG, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.88, rotate: 5 },
      { svg: LV_BAG, x: 45, y: 60, size: 160, opacity: 0.75, anim: 0 },
      { svg: LV_BELT, x: 30, y: 20, size: 250, opacity: 0.75, rotate: -8, anim: 1 },
      { svg: LV_BELT, x: 70, y: 80, size: 280, opacity: 0.78, rotate: 6, anim: 2 },
    ],
  },

  /* ============ GUCCI ============ */
  gucci: {
    gradient: "linear-gradient(135deg, rgba(21,128,61,0.08) 0%, transparent 50%, rgba(220,38,38,0.08) 100%)",
    ground: {
      height: "60px",
      fill: `linear-gradient(180deg, #15803d 0%, #15803d 33%, #dc2626 33%, #dc2626 66%, #15803d 66%, #15803d 100%)`,
      opacity: 0.18,
    },
    elements: [
      { svg: GUCCI_STRIPES, x: 50, y: 8, size: 600, opacity: 0.18 },
      { svg: GUCCI_STRIPES, x: 50, y: 92, size: 600, opacity: 0.18 },
      { svg: GUCCI_GG, x: 18, y: 25, size: 110, opacity: 0.5, rotate: -5, anim: 0 },
      { svg: GUCCI_GG, x: 50, y: 32, size: 130, opacity: 0.55, anim: 1 },
      { svg: GUCCI_GG, x: 82, y: 28, size: 115, opacity: 0.5, rotate: 8, anim: 2 },
      { svg: GUCCI_GG, x: 25, y: 60, size: 100, opacity: 0.45, anim: 3 },
      { svg: GUCCI_GG, x: 60, y: 65, size: 120, opacity: 0.5, rotate: -8, anim: 0 },
      { svg: GUCCI_GG, x: 92, y: 75, size: 95, opacity: 0.42, anim: 1 },
      { svg: GUCCI_GG, x: 15, y: 80, size: 100, opacity: 0.45, anim: 2 },
      { svg: GUCCI_GG, x: 70, y: 88, size: 90, opacity: 0.4, anim: 3 },
    ],
  },

  /* ============ WALLSTREET ============ */
  wallstreet: {
    gradient: "linear-gradient(180deg, rgba(234,179,8,0.12) 0%, transparent 50%, rgba(12,10,9,0.6) 100%)",
    elements: [
      { svg: WS_BULL, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.5 },
      { svg: WS_BULL, x: 70, y: 35, size: 160, opacity: 0.45, rotate: 5, anim: 0 },
      { svg: WS_BULL, x: 35, y: 70, size: 140, opacity: 0.4, anim: 2 },
      { svg: WS_CIGAR, x: 22, y: 22, size: 110, opacity: 0.55, rotate: -15, anim: 0 },
      { svg: WS_CIGAR, x: 65, y: 18, size: 130, opacity: 0.6, rotate: 10, anim: 1 },
      { svg: WS_CIGAR, x: 88, y: 60, size: 100, opacity: 0.5, rotate: -25, anim: 2 },
      { svg: WS_CIGAR, x: 15, y: 80, size: 120, opacity: 0.52, rotate: 20, anim: 3 },
      { svg: MONEY_BILL_100, x: 80, y: 75, size: 110, opacity: 0.5, rotate: 30, anim: 0 },
      { svg: MONEY_BILL_100, x: 50, y: 30, size: 90, opacity: 0.45, rotate: -20, anim: 2 },
      { svg: STOCK_CHART, x: 50, y: 8, size: 400, opacity: 0.3 },
      { svg: MONEY_INGOT, x: 28, y: 50, size: 80, opacity: 0.5, anim: 1 },
      { svg: MONEY_INGOT, x: 92, y: 30, size: 70, opacity: 0.46, anim: 3 },
    ],
  },

  /* ============ LULA ============ */
  lula: {
    gradient: "linear-gradient(135deg, rgba(220,38,38,0.20) 0%, transparent 50%, rgba(251,191,36,0.12) 100%)",
    elements: [
      { svg: LULA_SILHOUETTE, pin: "bottom-left", x: 5, y: 5, size: 220, opacity: 0.55 },
      { svg: LULA_SILHOUETTE, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.5 },
      { svg: LULA_SILHOUETTE, x: 50, y: 50, size: 150, opacity: 0.4, anim: 0 },
      { svg: BR_FLAG, x: 25, y: 22, size: 140, opacity: 0.5, rotate: -8, anim: 1 },
      { svg: BR_FLAG, x: 75, y: 25, size: 130, opacity: 0.48, rotate: 6, anim: 2 },
      { svg: BR_FLAG, x: 50, y: 88, size: 120, opacity: 0.45, anim: 3 },
      { svg: PT_STAR, x: 12, y: 50, size: 60, opacity: 0.55, anim: 0 },
      { svg: PT_STAR, x: 88, y: 60, size: 70, opacity: 0.58, anim: 1 },
      { svg: PT_STAR, x: 50, y: 18, size: 55, opacity: 0.5, anim: 2 },
      { svg: PT_STAR, x: 30, y: 75, size: 50, opacity: 0.5, anim: 3 },
      { svg: PT_STAR, x: 70, y: 80, size: 55, opacity: 0.52, anim: 0 },
    ],
  },

  /* ============ BOLSONARO ============ */
  bolsonaro: {
    gradient: "linear-gradient(135deg, rgba(21,128,61,0.20) 0%, rgba(250,204,21,0.14) 50%, rgba(30,64,175,0.10) 100%)",
    elements: [
      { svg: BOLSO_SILHOUETTE, pin: "bottom-left", x: 5, y: 5, size: 220, opacity: 0.55 },
      { svg: BOLSO_SILHOUETTE, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.5 },
      { svg: BOLSO_SILHOUETTE, x: 50, y: 50, size: 150, opacity: 0.4, anim: 0 },
      { svg: BR_FLAG, x: 22, y: 22, size: 140, opacity: 0.5, rotate: -10, anim: 1 },
      { svg: BR_FLAG, x: 78, y: 20, size: 150, opacity: 0.52, rotate: 8, anim: 2 },
      { svg: BR_FLAG, x: 50, y: 12, size: 130, opacity: 0.48, anim: 0 },
      { svg: BR_FLAG, x: 18, y: 70, size: 110, opacity: 0.45, rotate: 5, anim: 3 },
      { svg: BR_FLAG, x: 82, y: 78, size: 120, opacity: 0.46, rotate: -8, anim: 0 },
      { svg: BR_FLAG, x: 50, y: 92, size: 140, opacity: 0.5, anim: 1 },
    ],
  },

  /* ============ PRAIA ============ */
  praia: {
    gradient: "linear-gradient(180deg, rgba(56,189,248,0.18) 0%, rgba(253,230,138,0.15) 100%)",
    ground: { height: "100px", fill: "linear-gradient(180deg, transparent 0%, rgba(253,230,138,0.4) 60%, rgba(253,230,138,0.7) 100%)", opacity: 1 },
    elements: [
      { svg: PALM_TREE, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.6 },
      { svg: PALM_TREE, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.62, rotate: -5 },
      { svg: PALM_TREE, x: 35, y: 70, size: 140, opacity: 0.4, anim: 0 },
      { svg: PALM_TREE, x: 70, y: 65, size: 130, opacity: 0.38, rotate: 5, anim: 2 },
      { svg: SUN_RAYS, pin: "top-right", x: 5, y: 5, size: 180, opacity: 0.55 },
      { svg: WAVE, x: 50, y: 78, size: 700, opacity: 0.45 },
      { svg: WAVE, x: 50, y: 84, size: 700, opacity: 0.35 },
      { svg: SHELL, x: 18, y: 90, size: 50, opacity: 0.55, anim: 0 },
      { svg: SHELL, x: 80, y: 92, size: 60, opacity: 0.6, rotate: 30, anim: 1 },
      { svg: SHELL, x: 50, y: 92, size: 45, opacity: 0.5, anim: 2 },
      { svg: SURFBOARD, x: 25, y: 50, size: 70, opacity: 0.55, rotate: -20, anim: 3 },
      { svg: SURFBOARD, x: 78, y: 45, size: 80, opacity: 0.58, rotate: 25, anim: 0 },
    ],
  },

  /* ============ JESUS ============ */
  jesus: {
    gradient: "radial-gradient(ellipse at top, rgba(250,204,21,0.22) 0%, transparent 60%)",
    elements: [
      { svg: CROSS, pin: "top-left", x: 3, y: 3, size: 110, opacity: 0.55 },
      { svg: CROSS, pin: "top-right", x: 3, y: 3, size: 120, opacity: 0.55 },
      { svg: CROSS, x: 50, y: 30, size: 180, opacity: 0.5, anim: 0 },
      { svg: CROSS, x: 20, y: 65, size: 100, opacity: 0.45, anim: 1 },
      { svg: CROSS, x: 80, y: 70, size: 110, opacity: 0.48, anim: 2 },
      { svg: DOVE, x: 25, y: 22, size: 80, opacity: 0.55, anim: 0 },
      { svg: DOVE, x: 70, y: 25, size: 90, opacity: 0.58, rotate: 10, anim: 1 },
      { svg: DOVE, x: 50, y: 70, size: 100, opacity: 0.6, anim: 2 },
      { svg: DOVE, x: 12, y: 88, size: 70, opacity: 0.5, anim: 3 },
      { svg: DOVE, x: 88, y: 90, size: 75, opacity: 0.52, anim: 0 },
      { svg: HALO, x: 35, y: 14, size: 100, opacity: 0.6, anim: 1 },
      { svg: HALO, x: 65, y: 50, size: 110, opacity: 0.55, anim: 3 },
    ],
  },

  /* ============ SAO PAULO ============ */
  saopaulo: {
    gradient: "linear-gradient(180deg, rgba(220,38,38,0.10) 0%, transparent 40%, rgba(24,24,27,0.6) 100%)",
    elements: [
      { svg: SP_BUILDING, pin: "bottom-left", x: 5, y: 5, size: 140, opacity: 0.6 },
      { svg: SP_BUILDING, pin: "bottom-right", x: 5, y: 5, size: 180, opacity: 0.65 },
      { svg: SP_BUILDING, x: 22, y: 75, size: 120, opacity: 0.5 },
      { svg: SP_BUILDING, x: 38, y: 70, size: 160, opacity: 0.55 },
      { svg: SP_BUILDING, x: 58, y: 65, size: 150, opacity: 0.55 },
      { svg: SP_BUILDING, x: 70, y: 72, size: 130, opacity: 0.5 },
      { svg: SP_BUILDING, x: 85, y: 65, size: 145, opacity: 0.55 },
      { svg: COPAN, x: 50, y: 60, size: 140, opacity: 0.55 },
      { svg: COPAN, x: 15, y: 65, size: 120, opacity: 0.5 },
      { svg: COPAN, x: 90, y: 78, size: 130, opacity: 0.52 },
    ],
  },

  /* ============ RIO ============ */
  rio: {
    gradient: "linear-gradient(180deg, rgba(2,132,199,0.22) 0%, rgba(22,163,74,0.18) 100%)",
    elements: [
      { svg: PAO_ACUCAR, pin: "bottom-right", x: 5, y: 5, size: 240, opacity: 0.55 },
      { svg: PAO_ACUCAR, x: 28, y: 75, size: 200, opacity: 0.4 },
      { svg: CRISTO, pin: "top-left", x: 8, y: 5, size: 160, opacity: 0.55 },
      { svg: CRISTO, x: 75, y: 30, size: 140, opacity: 0.5, anim: 0 },
      { svg: CRISTO, x: 40, y: 25, size: 130, opacity: 0.5, anim: 1 },
      { svg: BONDINHO, x: 60, y: 50, size: 130, opacity: 0.55, anim: 2 },
      { svg: BONDINHO, x: 20, y: 50, size: 110, opacity: 0.5, anim: 3 },
      { svg: BONDINHO, x: 85, y: 58, size: 100, opacity: 0.46, anim: 0 },
      { svg: WAVE, x: 50, y: 85, size: 700, opacity: 0.35 },
      { svg: WAVE, x: 50, y: 92, size: 700, opacity: 0.32 },
      { svg: PALM_TREE, x: 8, y: 75, size: 120, opacity: 0.4 },
    ],
  },

  /* ============ BAHIA ============ */
  bahia: {
    gradient: "linear-gradient(135deg, rgba(250,204,21,0.16) 0%, rgba(124,45,18,0.30) 100%)",
    elements: [
      { svg: TAMBOR, pin: "bottom-left", x: 5, y: 5, size: 160, opacity: 0.6 },
      { svg: TAMBOR, pin: "bottom-right", x: 5, y: 5, size: 140, opacity: 0.55 },
      { svg: TAMBOR, x: 50, y: 60, size: 130, opacity: 0.5, anim: 0 },
      { svg: TAMBOR, x: 22, y: 50, size: 100, opacity: 0.42, anim: 1 },
      { svg: TAMBOR, x: 78, y: 50, size: 110, opacity: 0.45, anim: 2 },
      { svg: FITA_BONFIM, x: 30, y: 18, size: 280, opacity: 0.55, rotate: -8, anim: 0 },
      { svg: FITA_BONFIM, x: 70, y: 28, size: 320, opacity: 0.58, rotate: 12, anim: 1 },
      { svg: FITA_BONFIM, x: 40, y: 78, size: 260, opacity: 0.5, rotate: -5, anim: 2 },
      { svg: PIMENTA, x: 14, y: 25, size: 60, opacity: 0.65, rotate: -15, anim: 0 },
      { svg: PIMENTA, x: 85, y: 18, size: 70, opacity: 0.7, rotate: 20, anim: 1 },
      { svg: PIMENTA, x: 60, y: 35, size: 55, opacity: 0.6, anim: 2 },
      { svg: PIMENTA, x: 36, y: 88, size: 50, opacity: 0.6, anim: 3 },
      { svg: SUN_RAYS, pin: "top-right", x: 5, y: 5, size: 150, opacity: 0.5 },
    ],
  },

  /* ============ CASSINO ============ */
  cassino: {
    gradient: "radial-gradient(ellipse at center, rgba(220,38,38,0.18) 0%, transparent 60%)",
    elements: [
      { svg: CASINO_SEVEN, x: 50, y: 30, size: 220, opacity: 0.42, anim: 0 },
      { svg: CASINO_SEVEN, x: 15, y: 65, size: 160, opacity: 0.38, rotate: -10, anim: 1 },
      { svg: CASINO_SEVEN, x: 85, y: 70, size: 180, opacity: 0.4, rotate: 8, anim: 2 },
      { svg: CASINO_CHIP, x: 20, y: 20, size: 90, opacity: 0.55, anim: 0 },
      { svg: CASINO_CHIP, x: 75, y: 15, size: 110, opacity: 0.58, anim: 1 },
      { svg: CASINO_CHIP, x: 38, y: 60, size: 100, opacity: 0.55, anim: 2 },
      { svg: CASINO_CHIP, x: 70, y: 50, size: 95, opacity: 0.55, anim: 3 },
      { svg: CASINO_CHIP, x: 12, y: 80, size: 85, opacity: 0.5, anim: 0 },
      { svg: CASINO_CHIP, x: 60, y: 88, size: 90, opacity: 0.52, anim: 1 },
      { svg: CASINO_CARD, x: 28, y: 38, size: 80, opacity: 0.55, rotate: -20, anim: 2 },
      { svg: CASINO_CARD, x: 88, y: 40, size: 90, opacity: 0.58, rotate: 25, anim: 3 },
      { svg: CASINO_CARD, x: 50, y: 78, size: 85, opacity: 0.55, rotate: -10, anim: 0 },
      { svg: CASINO_DICE, x: 8, y: 50, size: 70, opacity: 0.55, rotate: 15, anim: 1 },
      { svg: CASINO_DICE, x: 92, y: 80, size: 75, opacity: 0.58, rotate: -20, anim: 3 },
      { svg: CASINO_DICE, x: 45, y: 12, size: 65, opacity: 0.5, anim: 0 },
    ],
  },

  /* ============ MIAMI ============ */
  miami: {
    gradient: "linear-gradient(135deg, rgba(236,72,153,0.20) 0%, rgba(30,27,75,0.30) 60%, rgba(34,211,238,0.12) 100%)",
    elements: [
      { svg: PALM_TREE, pin: "bottom-left", x: 5, y: 5, size: 220, opacity: 0.55 },
      { svg: PALM_TREE, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.52, rotate: -5 },
      { svg: SP_BUILDING, x: 30, y: 75, size: 140, opacity: 0.45 },
      { svg: SP_BUILDING, x: 65, y: 70, size: 160, opacity: 0.5 },
      { svg: SP_BUILDING, x: 80, y: 78, size: 120, opacity: 0.4 },
      { svg: SUN_HORIZON, x: 50, y: 60, size: 500, opacity: 0.45 },
      { svg: WAVE, x: 50, y: 88, size: 700, opacity: 0.4 },
      { svg: CAR_SPORT, x: 25, y: 85, size: 140, opacity: 0.5, anim: 3 },
      { svg: CAR_SPORT, x: 75, y: 90, size: 130, opacity: 0.5, anim: 0 },
    ],
  },

  /* ============ DUBAI ============ */
  dubai: {
    gradient: "linear-gradient(180deg, rgba(217,119,6,0.18) 0%, rgba(69,26,3,0.40) 100%)",
    ground: { height: "100px", fill: "linear-gradient(180deg, transparent, rgba(217,119,6,0.4))", opacity: 1 },
    elements: [
      { svg: DUBAI_BURJ, pin: "bottom-left", x: 5, y: 0, size: 200, opacity: 0.6 },
      { svg: DUBAI_BURJ, pin: "bottom-right", x: 5, y: 0, size: 240, opacity: 0.65 },
      { svg: DUBAI_BURJ, x: 30, y: 55, size: 150, opacity: 0.45 },
      { svg: DUBAI_BURJ, x: 70, y: 55, size: 160, opacity: 0.48 },
      { svg: DUBAI_BURJ, x: 50, y: 65, size: 180, opacity: 0.55 },
      { svg: SUN_HORIZON, x: 50, y: 80, size: 600, opacity: 0.4 },
      { svg: CAMEL, x: 25, y: 88, size: 110, opacity: 0.5, anim: 0 },
      { svg: CAMEL, x: 75, y: 90, size: 130, opacity: 0.55, anim: 2 },
      { svg: MONEY_INGOT, x: 18, y: 30, size: 70, opacity: 0.5, anim: 0 },
      { svg: MONEY_INGOT, x: 82, y: 28, size: 80, opacity: 0.52, rotate: 8, anim: 1 },
      { svg: MONEY_INGOT, x: 50, y: 20, size: 90, opacity: 0.55, anim: 2 },
      { svg: DUNE, x: 50, y: 92, size: 800, opacity: 0.5 },
    ],
  },

  /* ============ RGB ============ */
  rgb: {
    gradient: "linear-gradient(135deg, rgba(220,38,38,0.18) 0%, rgba(168,85,247,0.18) 33%, rgba(59,130,246,0.18) 66%, rgba(16,185,129,0.18) 100%)",
    elements: [
      // Quadrados RGB rotacionados
      ...Array.from({ length: 20 }, (_, i) => ({
        svg: `<svg viewBox="0 0 50 50"><rect width="50" height="50" rx="6" fill="hsl(${(i * 37) % 360}, 90%, 55%)"/></svg>`,
        x: ((i * 53) % 100),
        y: ((i * 71) % 100),
        size: 40 + (i % 5) * 20,
        opacity: 0.35 + (i % 3) * 0.1,
        rotate: i * 18,
        anim: i % 4,
      })),
    ],
  },

  /* ============ SPOTIFY ============ */
  spotify: {
    gradient: "radial-gradient(circle at 50% 50%, rgba(29,185,84,0.15) 0%, transparent 60%)",
    elements: [
      { svg: SPOTIFY_RING, pin: "bottom-left", x: 5, y: 5, size: 160, opacity: 0.55 },
      { svg: SPOTIFY_RING, pin: "bottom-right", x: 5, y: 5, size: 180, opacity: 0.6 },
      { svg: SPOTIFY_RING, x: 50, y: 50, size: 200, opacity: 0.4, anim: 0 },
      { svg: SPOTIFY_RING, x: 22, y: 25, size: 100, opacity: 0.45, anim: 1 },
      { svg: SPOTIFY_RING, x: 80, y: 22, size: 110, opacity: 0.48, anim: 2 },
      { svg: SOUND_WAVE, x: 35, y: 75, size: 140, opacity: 0.55, anim: 0 },
      { svg: SOUND_WAVE, x: 70, y: 80, size: 160, opacity: 0.58, anim: 1 },
      { svg: SOUND_WAVE, x: 50, y: 22, size: 130, opacity: 0.5, anim: 2 },
      { svg: MUSIC_NOTE, x: 12, y: 50, size: 60, opacity: 0.55, anim: 0 },
      { svg: MUSIC_NOTE, x: 92, y: 50, size: 70, opacity: 0.58, anim: 1 },
      { svg: MUSIC_NOTE, x: 50, y: 90, size: 65, opacity: 0.55, anim: 2 },
      { svg: MUSIC_NOTE, x: 60, y: 12, size: 55, opacity: 0.5, rotate: 15, anim: 3 },
    ],
  },

  /* ============ CLAUDE ============ */
  claude: {
    gradient: "radial-gradient(ellipse at top, rgba(204,120,92,0.25) 0%, transparent 60%)",
    elements: [
      { svg: CLAUDE_LOGO, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.55 },
      { svg: CLAUDE_LOGO, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.6 },
      { svg: CLAUDE_LOGO, x: 50, y: 50, size: 160, opacity: 0.45, anim: 0 },
      { svg: CLAUDE_LOGO, x: 22, y: 22, size: 110, opacity: 0.5, anim: 1 },
      { svg: CLAUDE_LOGO, x: 78, y: 22, size: 120, opacity: 0.5, anim: 2 },
      { svg: CLAUDE_LOGO, x: 18, y: 78, size: 100, opacity: 0.45, anim: 3 },
      { svg: CLAUDE_LOGO, x: 82, y: 78, size: 110, opacity: 0.48, anim: 0 },
      ...Array.from({ length: 8 }, (_, i) => ({
        svg: CLAUDE_SPARK,
        x: (i * 13 + 5) % 95,
        y: (i * 17 + 8) % 90,
        size: 30 + (i % 3) * 12,
        opacity: 0.55 + (i % 2) * 0.1,
        rotate: i * 45,
        anim: i % 4,
      })),
    ],
  },

  /* ============ HELLO KITTY ============ */
  hellokitty: {
    gradient: "radial-gradient(ellipse at top, rgba(236,72,153,0.20) 0%, transparent 60%)",
    elements: [
      { svg: KITTY_FACE, pin: "bottom-left", x: 5, y: 5, size: 160, opacity: 0.6 },
      { svg: KITTY_FACE, pin: "bottom-right", x: 5, y: 5, size: 180, opacity: 0.62 },
      { svg: KITTY_FACE, x: 30, y: 30, size: 130, opacity: 0.55, anim: 0 },
      { svg: KITTY_FACE, x: 70, y: 35, size: 140, opacity: 0.58, rotate: 5, anim: 1 },
      { svg: KITTY_FACE, x: 50, y: 65, size: 110, opacity: 0.5, anim: 2 },
      { svg: BOW, x: 15, y: 15, size: 70, opacity: 0.65, rotate: -10, anim: 0 },
      { svg: BOW, x: 85, y: 14, size: 80, opacity: 0.68, rotate: 12, anim: 1 },
      { svg: BOW, x: 50, y: 12, size: 60, opacity: 0.6, anim: 2 },
      { svg: BOW, x: 20, y: 60, size: 55, opacity: 0.55, anim: 3 },
      { svg: BOW, x: 88, y: 60, size: 65, opacity: 0.58, anim: 0 },
      { svg: HEART, x: 38, y: 50, size: 50, opacity: 0.65, anim: 0 },
      { svg: HEART, x: 62, y: 50, size: 55, opacity: 0.68, anim: 1 },
      { svg: HEART, x: 14, y: 85, size: 45, opacity: 0.6, anim: 2 },
      { svg: HEART, x: 78, y: 88, size: 50, opacity: 0.65, anim: 3 },
      { svg: HEART, x: 50, y: 88, size: 60, opacity: 0.7, anim: 0 },
    ],
  },

  /* ============ COPA ============ */
  copa: {
    gradient: "linear-gradient(180deg, rgba(20,83,45,0.10) 0%, transparent 50%, rgba(22,101,52,0.30) 100%)",
    ground: { height: "100px", fill: "linear-gradient(180deg, transparent, rgba(22,101,52,0.45))", opacity: 1 },
    elements: [
      { svg: TROPHY, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.6 },
      { svg: TROPHY, x: 50, y: 30, size: 160, opacity: 0.5, anim: 0 },
      { svg: TROPHY, x: 18, y: 50, size: 120, opacity: 0.45, anim: 1 },
      { svg: TROPHY, x: 82, y: 55, size: 130, opacity: 0.5, rotate: 5, anim: 2 },
      { svg: SOCCER_BALL, x: 22, y: 25, size: 70, opacity: 0.65, anim: 0 },
      { svg: SOCCER_BALL, x: 65, y: 22, size: 90, opacity: 0.7, anim: 1 },
      { svg: SOCCER_BALL, x: 38, y: 70, size: 80, opacity: 0.68, anim: 2 },
      { svg: SOCCER_BALL, x: 75, y: 80, size: 100, opacity: 0.72, anim: 3 },
      { svg: SOCCER_BALL, x: 15, y: 85, size: 75, opacity: 0.65, anim: 0 },
      { svg: SOCCER_BALL, x: 50, y: 88, size: 85, opacity: 0.7, anim: 1 },
      { svg: SOCCER_BALL, x: 88, y: 30, size: 65, opacity: 0.6, anim: 2 },
      { svg: BR_FLAG, x: 12, y: 12, size: 110, opacity: 0.55, anim: 3 },
      { svg: BR_FLAG, x: 88, y: 12, size: 100, opacity: 0.5, anim: 0 },
    ],
  },

  /* ============ ZUMBI ============ */
  zumbi: {
    gradient: "radial-gradient(ellipse at top, rgba(101,163,13,0.12) 0%, transparent 60%), linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.5) 100%)",
    elements: [
      { svg: MOON_FULL, pin: "top-right", x: 5, y: 5, size: 160, opacity: 0.6 },
      { svg: ZOMBIE, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.65 },
      { svg: ZOMBIE, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.68 },
      { svg: ZOMBIE, x: 25, y: 50, size: 140, opacity: 0.45, anim: 0 },
      { svg: ZOMBIE, x: 50, y: 55, size: 160, opacity: 0.5, anim: 1 },
      { svg: ZOMBIE, x: 72, y: 48, size: 150, opacity: 0.48, anim: 2 },
      { svg: ZOMBIE, x: 88, y: 70, size: 130, opacity: 0.42, anim: 3 },
      { svg: TOMB, x: 18, y: 80, size: 110, opacity: 0.55 },
      { svg: TOMB, x: 48, y: 85, size: 130, opacity: 0.58 },
      { svg: TOMB, x: 80, y: 82, size: 120, opacity: 0.55 },
      { svg: TOMB, x: 12, y: 55, size: 80, opacity: 0.4 },
      { svg: TOMB, x: 92, y: 28, size: 90, opacity: 0.42 },
    ],
  },

  /* ============ TIKTOK ============ */
  tiktok: {
    gradient: "linear-gradient(135deg, rgba(255,0,80,0.14) 0%, transparent 50%, rgba(34,211,238,0.14) 100%)",
    elements: [
      { svg: TIKTOK_NOTE, x: 18, y: 20, size: 110, opacity: 0.6, rotate: -10, anim: 0 },
      { svg: TIKTOK_NOTE, x: 65, y: 22, size: 130, opacity: 0.65, rotate: 8, anim: 1 },
      { svg: TIKTOK_NOTE, x: 40, y: 45, size: 140, opacity: 0.65, anim: 2 },
      { svg: TIKTOK_NOTE, x: 82, y: 55, size: 120, opacity: 0.6, rotate: -15, anim: 3 },
      { svg: TIKTOK_NOTE, x: 15, y: 70, size: 100, opacity: 0.55, anim: 0 },
      { svg: TIKTOK_NOTE, x: 58, y: 78, size: 130, opacity: 0.6, rotate: 20, anim: 1 },
      { svg: TIKTOK_NOTE, x: 88, y: 88, size: 110, opacity: 0.58, anim: 2 },
      { svg: MUSIC_NOTE, x: 30, y: 12, size: 50, opacity: 0.5, anim: 0 },
      { svg: MUSIC_NOTE, x: 80, y: 12, size: 60, opacity: 0.55, anim: 1 },
      { svg: MUSIC_NOTE, x: 8, y: 50, size: 45, opacity: 0.45, anim: 2 },
      { svg: MUSIC_NOTE, x: 50, y: 22, size: 55, opacity: 0.5, rotate: 15, anim: 3 },
      { svg: MUSIC_NOTE, x: 72, y: 50, size: 50, opacity: 0.5, anim: 0 },
    ],
  },

  /* ============ KWAI ============ */
  kwai: {
    gradient: "radial-gradient(circle at center, rgba(255,122,0,0.18) 0%, transparent 60%)",
    elements: [
      { svg: KWAI_K, pin: "bottom-left", x: 5, y: 5, size: 160, opacity: 0.6 },
      { svg: KWAI_K, pin: "bottom-right", x: 5, y: 5, size: 180, opacity: 0.62 },
      { svg: KWAI_K, x: 50, y: 30, size: 200, opacity: 0.5, anim: 0 },
      { svg: KWAI_K, x: 22, y: 60, size: 130, opacity: 0.5, anim: 1 },
      { svg: KWAI_K, x: 78, y: 60, size: 140, opacity: 0.55, anim: 2 },
      { svg: KWAI_K, x: 16, y: 25, size: 90, opacity: 0.45, anim: 3 },
      { svg: KWAI_K, x: 85, y: 25, size: 100, opacity: 0.48, anim: 0 },
      { svg: TIKTOK_NOTE, x: 35, y: 70, size: 90, opacity: 0.45, anim: 1 },
      { svg: TIKTOK_NOTE, x: 65, y: 80, size: 100, opacity: 0.48, anim: 2 },
    ],
  },

  /* ============ GOOGLE ============ */
  google: {
    gradient: "radial-gradient(circle at 20% 20%, rgba(66,133,244,0.10) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(234,67,53,0.10) 0%, transparent 50%)",
    elements: [
      { svg: GOOGLE_DOTS, x: 50, y: 50, size: 400, opacity: 0.55 },
      { svg: GOOGLE_DOTS, x: 25, y: 25, size: 250, opacity: 0.5, anim: 0 },
      { svg: GOOGLE_DOTS, x: 75, y: 75, size: 280, opacity: 0.55, anim: 1 },
      { svg: GOOGLE_DOTS, x: 70, y: 22, size: 200, opacity: 0.45, anim: 2 },
      { svg: GOOGLE_DOTS, x: 22, y: 75, size: 220, opacity: 0.48, anim: 3 },
      { svg: SEARCH_ICON, x: 18, y: 18, size: 90, opacity: 0.5, anim: 0 },
      { svg: SEARCH_ICON, x: 82, y: 30, size: 110, opacity: 0.55, anim: 1 },
      { svg: SEARCH_ICON, x: 50, y: 80, size: 100, opacity: 0.5, anim: 2 },
      { svg: SEARCH_ICON, x: 12, y: 88, size: 80, opacity: 0.45, anim: 3 },
    ],
  },

  /* ============ CSGO ============ */
  csgo: {
    gradient: "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, transparent 50%, rgba(0,0,0,0.6) 100%)",
    elements: [
      { svg: AK47, x: 25, y: 30, size: 200, opacity: 0.55, rotate: -8, anim: 0 },
      { svg: AK47, x: 70, y: 28, size: 220, opacity: 0.6, rotate: 6, anim: 1 },
      { svg: AK47, x: 40, y: 60, size: 180, opacity: 0.5, rotate: -15, anim: 2 },
      { svg: AK47, x: 78, y: 70, size: 200, opacity: 0.55, rotate: 12, anim: 3 },
      { svg: AK47, x: 18, y: 78, size: 160, opacity: 0.5, rotate: 20, anim: 0 },
      { svg: C4_BOMB, pin: "bottom-left", x: 5, y: 5, size: 140, opacity: 0.5 },
      { svg: C4_BOMB, pin: "bottom-right", x: 5, y: 5, size: 130, opacity: 0.48 },
      { svg: C4_BOMB, x: 50, y: 22, size: 110, opacity: 0.45, anim: 0 },
      { svg: C4_BOMB, x: 15, y: 50, size: 100, opacity: 0.42, rotate: 10, anim: 2 },
      { svg: VALORANT_SHELL_REF(), x: 60, y: 88, size: 50, opacity: 0.5, rotate: 45, anim: 1 },
    ],
  },

  /* ============ FACEBOOK ============ */
  facebook: {
    gradient: "radial-gradient(circle at 50% 30%, rgba(24,119,242,0.20) 0%, transparent 60%)",
    elements: [
      { svg: FB_F, pin: "bottom-left", x: 5, y: 5, size: 160, opacity: 0.6 },
      { svg: FB_F, pin: "bottom-right", x: 5, y: 5, size: 180, opacity: 0.62 },
      { svg: FB_F, x: 50, y: 30, size: 200, opacity: 0.5, anim: 0 },
      { svg: FB_F, x: 22, y: 50, size: 130, opacity: 0.5, anim: 1 },
      { svg: FB_F, x: 78, y: 55, size: 140, opacity: 0.55, anim: 2 },
      { svg: FB_THUMB, x: 35, y: 18, size: 90, opacity: 0.55, anim: 0 },
      { svg: FB_THUMB, x: 80, y: 22, size: 110, opacity: 0.6, anim: 1 },
      { svg: FB_THUMB, x: 14, y: 22, size: 80, opacity: 0.5, anim: 2 },
      { svg: FB_THUMB, x: 65, y: 75, size: 100, opacity: 0.55, anim: 3 },
      { svg: SPEECH, x: 30, y: 72, size: 110, opacity: 0.5, anim: 0 },
      { svg: SPEECH, x: 88, y: 85, size: 100, opacity: 0.5, anim: 1 },
      { svg: SPEECH, x: 50, y: 88, size: 120, opacity: 0.55, anim: 2 },
    ],
  },

  /* ============ JAPAO ============ */
  japao: {
    gradient: "linear-gradient(180deg, rgba(254,202,202,0.20) 0%, rgba(255,255,255,0.10) 100%)",
    elements: [
      { svg: RED_DOT_SUN, pin: "top-left", x: 5, y: 5, size: 200, opacity: 0.55 },
      { svg: FUJI, pin: "bottom-left", x: 5, y: 5, size: 280, opacity: 0.55 },
      { svg: FUJI, pin: "bottom-right", x: 5, y: 5, size: 320, opacity: 0.6 },
      { svg: FUJI, x: 50, y: 70, size: 240, opacity: 0.45 },
      { svg: TORII, x: 22, y: 60, size: 130, opacity: 0.6, anim: 0 },
      { svg: TORII, x: 78, y: 55, size: 150, opacity: 0.65, anim: 1 },
      { svg: TORII, x: 50, y: 45, size: 120, opacity: 0.55, anim: 2 },
      { svg: SAKURA, x: 12, y: 22, size: 60, opacity: 0.7, anim: 0 },
      { svg: SAKURA, x: 30, y: 12, size: 50, opacity: 0.65, anim: 1 },
      { svg: SAKURA, x: 50, y: 22, size: 55, opacity: 0.68, anim: 2 },
      { svg: SAKURA, x: 70, y: 14, size: 60, opacity: 0.7, anim: 3 },
      { svg: SAKURA, x: 88, y: 24, size: 50, opacity: 0.62, anim: 0 },
      { svg: SAKURA, x: 38, y: 40, size: 45, opacity: 0.58, anim: 1 },
      { svg: SAKURA, x: 62, y: 38, size: 50, opacity: 0.6, anim: 2 },
      { svg: SAKURA, x: 18, y: 80, size: 55, opacity: 0.65, anim: 3 },
      { svg: SAKURA, x: 82, y: 80, size: 50, opacity: 0.6, anim: 0 },
    ],
  },

  /* ============ ANGOLA ============ */
  angola: {
    gradient: "linear-gradient(180deg, rgba(220,38,38,0.18) 0%, rgba(0,0,0,0.40) 100%)",
    elements: [
      { svg: MASK_AFRICAN, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.55 },
      { svg: MASK_AFRICAN, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.6 },
      { svg: MASK_AFRICAN, x: 50, y: 50, size: 160, opacity: 0.45, anim: 0 },
      { svg: MASK_AFRICAN, x: 22, y: 30, size: 120, opacity: 0.45, anim: 1 },
      { svg: MASK_AFRICAN, x: 78, y: 30, size: 130, opacity: 0.5, anim: 2 },
      { svg: TAMBOR, x: 30, y: 70, size: 130, opacity: 0.55, anim: 0 },
      { svg: TAMBOR, x: 70, y: 75, size: 140, opacity: 0.58, anim: 1 },
      { svg: TAMBOR, x: 12, y: 60, size: 100, opacity: 0.45, anim: 2 },
      { svg: TAMBOR, x: 90, y: 60, size: 110, opacity: 0.48, anim: 3 },
      { svg: SUN_RAYS, pin: "top-right", x: 5, y: 5, size: 130, opacity: 0.5 },
      { svg: PT_STAR, x: 50, y: 18, size: 70, opacity: 0.55, anim: 0 },
    ],
  },

  /* ============ AFRICA ============ */
  africa: {
    gradient: "linear-gradient(135deg, rgba(234,88,12,0.22) 0%, rgba(69,26,3,0.40) 100%)",
    elements: [
      { svg: AFRICA_MAP, x: 50, y: 50, size: 320, opacity: 0.4 },
      { svg: AFRICA_MAP, x: 18, y: 30, size: 150, opacity: 0.5, anim: 0 },
      { svg: AFRICA_MAP, x: 82, y: 32, size: 160, opacity: 0.52, anim: 1 },
      { svg: LION, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.6 },
      { svg: LION, pin: "bottom-right", x: 5, y: 5, size: 160, opacity: 0.55 },
      { svg: LION, x: 50, y: 75, size: 140, opacity: 0.5, anim: 0 },
      { svg: LION, x: 22, y: 70, size: 110, opacity: 0.45, anim: 1 },
      { svg: LION, x: 78, y: 72, size: 120, opacity: 0.48, anim: 2 },
      { svg: BAOBAB, x: 35, y: 50, size: 140, opacity: 0.55 },
      { svg: BAOBAB, x: 70, y: 50, size: 160, opacity: 0.58 },
      { svg: BAOBAB, x: 12, y: 88, size: 100, opacity: 0.4 },
      { svg: SUN_HORIZON, x: 50, y: 25, size: 500, opacity: 0.45 },
    ],
  },

  /* ============ PRADA ============ */
  prada: {
    gradient: "linear-gradient(135deg, rgba(163,163,163,0.10) 0%, transparent 50%, rgba(0,0,0,0.5) 100%)",
    elements: [
      ...Array.from({ length: 14 }, (_, i) => ({
        svg: PRADA_TRIANGLE,
        x: ((i * 17 + 8) % 95),
        y: ((i * 23 + 5) % 92),
        size: 70 + (i % 4) * 30,
        opacity: 0.45 + (i % 3) * 0.08,
        rotate: i % 2 ? 180 : 0,
        anim: i % 4,
      })),
    ],
  },

  /* ============ INFERNO ============ */
  inferno: {
    gradient: "radial-gradient(ellipse at bottom, rgba(220,38,38,0.40) 0%, transparent 60%), linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(69,10,10,0.4) 100%)",
    ground: { height: "120px", fill: "linear-gradient(180deg, transparent, rgba(220,38,38,0.5))", opacity: 1 },
    elements: [
      { svg: FIRE_BIG, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.7 },
      { svg: FIRE_BIG, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.72 },
      { svg: FIRE_BIG, x: 25, y: 75, size: 140, opacity: 0.6, anim: 0 },
      { svg: FIRE_BIG, x: 50, y: 70, size: 170, opacity: 0.7, anim: 1 },
      { svg: FIRE_BIG, x: 75, y: 76, size: 150, opacity: 0.65, anim: 2 },
      { svg: FIRE_BIG, x: 12, y: 55, size: 100, opacity: 0.5, anim: 3 },
      { svg: FIRE_BIG, x: 88, y: 55, size: 110, opacity: 0.55, anim: 0 },
      { svg: DEVIL_HORN, x: 25, y: 25, size: 120, opacity: 0.55, rotate: -5, anim: 0 },
      { svg: DEVIL_HORN, x: 75, y: 22, size: 130, opacity: 0.58, rotate: 8, anim: 1 },
      { svg: DEVIL_HORN, x: 50, y: 35, size: 100, opacity: 0.5, anim: 2 },
      { svg: TRIDENT, x: 14, y: 35, size: 90, opacity: 0.55, rotate: -20, anim: 0 },
      { svg: TRIDENT, x: 88, y: 38, size: 100, opacity: 0.58, rotate: 18, anim: 1 },
      { svg: TRIDENT, x: 38, y: 50, size: 80, opacity: 0.5, anim: 2 },
      { svg: TRIDENT, x: 62, y: 50, size: 85, opacity: 0.52, anim: 3 },
    ],
  },

  /* ============ MCDONALDS ============ */
  mcdonalds: {
    gradient: "linear-gradient(135deg, rgba(220,38,38,0.20) 0%, transparent 50%, rgba(251,191,36,0.18) 100%)",
    elements: [
      { svg: ARCH_GOLD, pin: "top-left", x: 5, y: 5, size: 220, opacity: 0.55 },
      { svg: ARCH_GOLD, pin: "top-right", x: 5, y: 5, size: 240, opacity: 0.58 },
      { svg: ARCH_GOLD, x: 50, y: 30, size: 280, opacity: 0.6, anim: 0 },
      { svg: ARCH_GOLD, x: 22, y: 60, size: 180, opacity: 0.5 },
      { svg: ARCH_GOLD, x: 78, y: 65, size: 200, opacity: 0.52 },
      { svg: BURGER, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.62 },
      { svg: BURGER, pin: "bottom-right", x: 5, y: 5, size: 160, opacity: 0.58 },
      { svg: BURGER, x: 50, y: 85, size: 200, opacity: 0.65 },
      { svg: BURGER, x: 22, y: 85, size: 140, opacity: 0.55 },
      { svg: FRIES, x: 38, y: 55, size: 110, opacity: 0.6, anim: 0 },
      { svg: FRIES, x: 72, y: 50, size: 130, opacity: 0.65, anim: 1 },
      { svg: FRIES, x: 14, y: 38, size: 100, opacity: 0.55, anim: 2 },
      { svg: SODA_CUP, x: 28, y: 30, size: 100, opacity: 0.6, anim: 0 },
      { svg: SODA_CUP, x: 65, y: 28, size: 110, opacity: 0.62, anim: 1 },
      { svg: SODA_CUP, x: 90, y: 35, size: 95, opacity: 0.55, anim: 2 },
    ],
  },

  /* ============ 67 ============ */
  "67": {
    gradient: "linear-gradient(135deg, rgba(34,211,238,0.12) 0%, transparent 50%, rgba(0,0,0,0.6) 100%)",
    elements: [
      ...Array.from({ length: 12 }, (_, i) => ({
        svg: NUMBER_67,
        x: ((i * 19 + 8) % 95),
        y: ((i * 23 + 10) % 92),
        size: 100 + (i % 4) * 50,
        opacity: 0.4 + (i % 3) * 0.12,
        rotate: i * 13 - 30,
        anim: i % 4,
      })),
      { svg: SKULL, x: 25, y: 30, size: 100, opacity: 0.55, anim: 0 },
      { svg: SKULL, x: 78, y: 25, size: 120, opacity: 0.6, anim: 1 },
      { svg: SKULL, x: 50, y: 75, size: 110, opacity: 0.58, anim: 2 },
      { svg: SKULL, x: 15, y: 80, size: 90, opacity: 0.5, anim: 3 },
      { svg: SKULL, x: 88, y: 80, size: 100, opacity: 0.55, anim: 0 },
    ],
  },

  /* ============ TROLLFACE ============ */
  trollface: {
    elements: [
      { svg: TROLLFACE, x: 20, y: 22, size: 130, opacity: 0.6, rotate: -8, anim: 0 },
      { svg: TROLLFACE, x: 60, y: 18, size: 160, opacity: 0.65, rotate: 12, anim: 1 },
      { svg: TROLLFACE, x: 85, y: 35, size: 140, opacity: 0.6, anim: 2 },
      { svg: TROLLFACE, x: 35, y: 50, size: 180, opacity: 0.55, rotate: 5, anim: 3 },
      { svg: TROLLFACE, x: 72, y: 60, size: 150, opacity: 0.6, rotate: -15, anim: 0 },
      { svg: TROLLFACE, x: 15, y: 70, size: 120, opacity: 0.55, anim: 1 },
      { svg: TROLLFACE, x: 50, y: 85, size: 170, opacity: 0.62, rotate: 8, anim: 2 },
      { svg: TROLLFACE, x: 88, y: 85, size: 130, opacity: 0.58, rotate: -10, anim: 3 },
      { svg: TROLLFACE, pin: "top-left", x: 3, y: 3, size: 100, opacity: 0.5 },
    ],
  },

  /* ============ BURGER KING ============ */
  burgerking: {
    gradient: "linear-gradient(135deg, rgba(249,115,22,0.18) 0%, transparent 50%, rgba(127,29,29,0.30) 100%)",
    elements: [
      { svg: CROWN_BK, pin: "top-left", x: 5, y: 5, size: 180, opacity: 0.6 },
      { svg: CROWN_BK, pin: "top-right", x: 5, y: 5, size: 200, opacity: 0.62 },
      { svg: CROWN_BK, x: 50, y: 18, size: 220, opacity: 0.6, anim: 0 },
      { svg: CROWN_BK, x: 22, y: 45, size: 140, opacity: 0.5, anim: 1 },
      { svg: CROWN_BK, x: 78, y: 50, size: 150, opacity: 0.55, anim: 2 },
      { svg: BURGER, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.65 },
      { svg: BURGER, pin: "bottom-right", x: 5, y: 5, size: 180, opacity: 0.6 },
      { svg: BURGER, x: 50, y: 70, size: 180, opacity: 0.62 },
      { svg: BURGER, x: 25, y: 75, size: 140, opacity: 0.55 },
      { svg: FIRE_BIG, x: 12, y: 30, size: 80, opacity: 0.6, anim: 0 },
      { svg: FIRE_BIG, x: 88, y: 30, size: 90, opacity: 0.65, anim: 1 },
      { svg: FIRE_BIG, x: 50, y: 88, size: 100, opacity: 0.7, anim: 2 },
    ],
  },

  /* ============ IBIZA ============ */
  ibiza: {
    gradient: "linear-gradient(135deg, rgba(249,115,22,0.25) 0%, rgba(236,72,153,0.25) 50%, rgba(139,92,246,0.25) 100%)",
    elements: [
      { svg: IBIZA_SUN, x: 50, y: 70, size: 600, opacity: 0.5 },
      { svg: PALM_TREE, pin: "bottom-left", x: 5, y: 5, size: 220, opacity: 0.6 },
      { svg: PALM_TREE, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.58, rotate: -5 },
      { svg: PALM_TREE, x: 30, y: 60, size: 140, opacity: 0.45 },
      { svg: PALM_TREE, x: 70, y: 65, size: 150, opacity: 0.5 },
      { svg: WAVE, x: 50, y: 90, size: 700, opacity: 0.4 },
      { svg: WAVE, x: 50, y: 95, size: 700, opacity: 0.35 },
      { svg: DISCO_BALL, x: 22, y: 22, size: 90, opacity: 0.65, anim: 0 },
      { svg: DISCO_BALL, x: 78, y: 22, size: 100, opacity: 0.7, anim: 1 },
      { svg: DISCO_BALL, x: 50, y: 30, size: 80, opacity: 0.6, anim: 2 },
      { svg: SPEAKER, x: 12, y: 75, size: 100, opacity: 0.5, anim: 3 },
      { svg: SPEAKER, x: 88, y: 78, size: 110, opacity: 0.55, anim: 0 },
    ],
  },

  /* ============ BALADA ============ */
  balada: {
    gradient: "linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(236,72,153,0.18) 50%, rgba(34,211,238,0.18) 100%)",
    elements: [
      { svg: DISCO_BALL, pin: "top-left", x: 5, y: 5, size: 180, opacity: 0.65 },
      { svg: DISCO_BALL, pin: "top-right", x: 5, y: 5, size: 200, opacity: 0.68 },
      { svg: DISCO_BALL, x: 50, y: 28, size: 220, opacity: 0.65, anim: 0 },
      { svg: DISCO_BALL, x: 22, y: 45, size: 130, opacity: 0.5, anim: 1 },
      { svg: DISCO_BALL, x: 78, y: 48, size: 140, opacity: 0.55, anim: 2 },
      { svg: SPEAKER, pin: "bottom-left", x: 5, y: 5, size: 140, opacity: 0.6 },
      { svg: SPEAKER, pin: "bottom-right", x: 5, y: 5, size: 160, opacity: 0.62 },
      { svg: SPEAKER, x: 35, y: 70, size: 110, opacity: 0.5 },
      { svg: SPEAKER, x: 65, y: 72, size: 120, opacity: 0.55 },
      ...Array.from({ length: 8 }, (_, i) => ({
        svg: `<svg viewBox="0 0 80 8"><rect width="80" height="8" rx="4" fill="hsl(${i * 45}, 90%, 60%)"/></svg>`,
        x: ((i * 12 + 5) % 95),
        y: 60 + (i % 3) * 10,
        size: 200 + (i % 3) * 50,
        opacity: 0.55,
        rotate: i * 22 - 90,
        anim: i % 4,
      })),
    ],
  },
};

/* Helper pra evitar referência circular do shell do Valorant no CSGO */
function VALORANT_SHELL_REF() {
  return `<svg viewBox="0 0 20 60" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="10" width="14" height="44" fill="#eab308" stroke="#713f12" stroke-width="1.5"/><ellipse cx="10" cy="10" rx="7" ry="3" fill="#a16207"/><ellipse cx="10" cy="54" rx="7" ry="3" fill="#713f12"/></svg>`;
}
