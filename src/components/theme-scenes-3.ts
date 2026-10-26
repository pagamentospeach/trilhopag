/**
 * Pack #3 de cenas — comunidades, marcas, memes.
 * Todos SVG inline, sem assets externos, sem ref a marcas/copyright exato.
 */

import type { Scene } from "./theme-scenes";

/* ============== SVG primitivas ============== */

const BOTTLE_WINE = `<svg viewBox="0 0 30 80" xmlns="http://www.w3.org/2000/svg"><rect x="12" y="2" width="6" height="16" fill="#451a03" stroke="#1c0a01" stroke-width="1.5"/><path d="M11 18 L19 18 L24 32 L24 76 Q24 78 22 78 L8 78 Q6 78 6 76 L6 32 Z" fill="#7f1d1d" stroke="#1c0a01" stroke-width="1.5"/><rect x="8" y="42" width="14" height="18" fill="#fef3c7" stroke="#92400e" stroke-width="1"/><text x="15" y="54" font-size="5" fill="#7f1d1d" text-anchor="middle" font-family="serif">VINHO</text></svg>`;
const BOTTLE_BEER = `<svg viewBox="0 0 30 80" xmlns="http://www.w3.org/2000/svg"><rect x="13" y="2" width="4" height="12" fill="#facc15" stroke="#713f12" stroke-width="1"/><path d="M11 14 L19 14 L22 28 L22 76 Q22 78 20 78 L10 78 Q8 78 8 76 L8 28 Z" fill="#92400e" stroke="#1c0a01" stroke-width="1.5"/><rect x="9" y="40" width="12" height="16" fill="#fef3c7" stroke="#451a03" stroke-width="1"/></svg>`;
const WINE_GLASS = `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg"><path d="M8 4 L32 4 Q34 24 20 30 Q6 24 8 4 Z" fill="#7f1d1d" opacity="0.6" stroke="#1c0a01" stroke-width="1.5"/><rect x="19" y="30" width="2" height="24" fill="#1c0a01"/><ellipse cx="20" cy="56" rx="10" ry="2" fill="#1c0a01"/></svg>`;

const INFINITY_RAINBOW = `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ig" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ef4444"/><stop offset="0.25" stop-color="#f59e0b"/><stop offset="0.5" stop-color="#22c55e"/><stop offset="0.75" stop-color="#3b82f6"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs><path d="M30 30 Q30 6 50 14 Q60 22 60 30 Q60 38 70 46 Q90 54 90 30 Q90 6 70 14 Q60 22 60 30 Q60 38 50 46 Q30 54 30 30 Z" fill="none" stroke="url(#ig)" stroke-width="8"/></svg>`;
const PUZZLE_PIECE = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M4 8 Q4 4 8 4 L16 4 Q20 4 20 8 Q20 12 18 12 Q14 12 14 16 Q14 20 18 20 L36 20 Q36 24 32 24 Q28 24 28 28 Q28 32 32 32 Q36 32 36 36 L20 36 Q16 36 16 32 Q16 28 12 28 Q8 28 8 32 Q8 36 4 36 Z" fill="#06b6d4" stroke="#0e7490" stroke-width="1.5"/></svg>`;

const NINJA = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><ellipse cx="30" cy="20" rx="14" ry="16" fill="#171717" stroke="#525252" stroke-width="1.5"/><rect x="16" y="20" width="28" height="6" fill="#fafafa"/><circle cx="22" cy="23" r="1.5" fill="#0a0a0a"/><circle cx="38" cy="23" r="1.5" fill="#0a0a0a"/><path d="M14 34 L46 34 L48 76 L12 76 Z" fill="#171717"/><path d="M14 50 L46 50" stroke="#525252" stroke-width="1"/><rect x="24" y="76" width="6" height="4" fill="#171717"/><rect x="30" y="76" width="6" height="4" fill="#171717"/></svg>`;
const GUY_FAWKES_MASK = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><path d="M30 4 Q46 8 50 26 Q50 50 30 66 Q10 50 10 26 Q14 8 30 4 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/><circle cx="22" cy="28" r="3" fill="#0a0a0a"/><circle cx="38" cy="28" r="3" fill="#0a0a0a"/><path d="M30 38 L34 46 L30 48 L26 46 Z" fill="#0a0a0a"/><path d="M16 52 Q30 58 44 52 L40 56 L20 56 Z" fill="#0a0a0a"/><path d="M28 14 Q30 12 32 14 Q32 18 30 18 Q28 18 28 14 Z" fill="#0a0a0a"/></svg>`;

const SOCK_LOTS = `<svg viewBox="0 0 30 60" xmlns="http://www.w3.org/2000/svg"><path d="M6 4 L22 4 L22 36 L26 44 L26 56 Q26 58 24 58 L8 58 Q6 58 6 56 L6 44 Z" fill="#ec4899" stroke="#831843" stroke-width="1.5"/><rect x="6" y="14" width="16" height="3" fill="#fef3c7"/><rect x="6" y="22" width="16" height="3" fill="#22c55e"/><rect x="6" y="30" width="16" height="3" fill="#3b82f6"/></svg>`;
const SOCK_STRIPED = `<svg viewBox="0 0 30 60" xmlns="http://www.w3.org/2000/svg"><path d="M6 4 L22 4 L22 36 L26 44 L26 56 Q26 58 24 58 L8 58 Q6 58 6 56 L6 44 Z" fill="#facc15" stroke="#713f12" stroke-width="1.5"/><rect x="6" y="14" width="16" height="3" fill="#dc2626"/><rect x="6" y="22" width="16" height="3" fill="#dc2626"/><rect x="6" y="30" width="16" height="3" fill="#dc2626"/></svg>`;
const ARROWS_UP = `<svg viewBox="0 0 60 50" xmlns="http://www.w3.org/2000/svg"><g fill="#ec4899" stroke="#831843" stroke-width="1.5"><path d="M14 46 L14 22 L8 22 L18 6 L28 22 L22 22 L22 46 Z"/><path d="M30 46 L30 22 L24 22 L34 6 L44 22 L38 22 L38 46 Z" transform="translate(-2 0)"/><path d="M44 46 L44 22 L38 22 L48 6 L58 22 L52 22 L52 46 Z" transform="translate(-4 0)"/></g></svg>`;

const MONKEY = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><ellipse cx="30" cy="32" rx="24" ry="26" fill="#78350f" stroke="#1c0a01" stroke-width="2"/><ellipse cx="30" cy="38" rx="18" ry="18" fill="#fef3c7"/><circle cx="22" cy="30" r="3" fill="#0a0a0a"/><circle cx="38" cy="30" r="3" fill="#0a0a0a"/><ellipse cx="30" cy="42" rx="6" ry="3" fill="#92400e"/><circle cx="10" cy="14" r="6" fill="#78350f" stroke="#1c0a01" stroke-width="1.5"/><circle cx="50" cy="14" r="6" fill="#78350f" stroke="#1c0a01" stroke-width="1.5"/><circle cx="10" cy="14" r="3" fill="#fef3c7"/><circle cx="50" cy="14" r="3" fill="#fef3c7"/></svg>`;
const BANANA = `<svg viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg"><path d="M6 18 Q4 6 12 8 Q14 4 20 4 Q44 6 54 22 Q56 26 50 26 Q44 24 30 24 Q12 22 6 18 Z" fill="#facc15" stroke="#713f12" stroke-width="1.5"/><path d="M50 22 Q54 22 56 26" stroke="#713f12" stroke-width="1.5" fill="none"/></svg>`;

const PISTOL_SILH = `<svg viewBox="0 0 80 50" xmlns="http://www.w3.org/2000/svg"><path d="M4 18 L60 18 L60 14 L70 14 L70 18 L76 18 L76 26 L60 26 L60 34 L44 38 L40 46 L26 46 L24 30 L4 30 Z" fill="#171717" stroke="#525252" stroke-width="1.5"/></svg>`;
const RIFLE = `<svg viewBox="0 0 140 30" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="14" width="120" height="6" fill="#171717"/><rect x="50" y="8" width="20" height="14" fill="#171717"/><path d="M70 22 Q66 28 70 30 L80 30 Q80 26 78 22 Z" fill="#171717"/><rect x="14" y="6" width="36" height="6" fill="#92400e"/><rect x="120" y="10" width="18" height="4" fill="#171717"/></svg>`;
const BULLET = `<svg viewBox="0 0 16 40" xmlns="http://www.w3.org/2000/svg"><path d="M8 2 L14 12 L14 30 L2 30 L2 12 Z" fill="#fbbf24" stroke="#713f12" stroke-width="1"/><rect x="2" y="30" width="12" height="8" fill="#92400e"/></svg>`;

const PHONE_PERSON = `<svg viewBox="0 0 50 80" xmlns="http://www.w3.org/2000/svg"><circle cx="25" cy="14" r="10" fill="#525252" stroke="#1a1a1a" stroke-width="1.5"/><path d="M12 30 L38 30 L40 60 L30 60 L30 78 L20 78 L20 60 L10 60 Z" fill="#525252"/><rect x="18" y="40" width="14" height="22" rx="2" fill="#06b6d4" stroke="#0e7490" stroke-width="1.5"/><rect x="20" y="44" width="10" height="14" fill="#0a0a0a"/></svg>`;
const PHONE_DEVICE = `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="32" height="52" rx="4" fill="#0a0a0a" stroke="#525252" stroke-width="1.5"/><rect x="8" y="10" width="24" height="38" fill="#06b6d4" opacity="0.4"/><circle cx="20" cy="52" r="2" fill="#525252"/></svg>`;

const CONDOM_PACK = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="42" height="42" rx="4" fill="#ec4899" stroke="#831843" stroke-width="2"/><circle cx="25" cy="22" r="10" fill="none" stroke="#fef3c7" stroke-width="2"/><text x="25" y="42" font-family="Arial Black" font-size="10" fill="#fef3c7" text-anchor="middle">SAFE</text></svg>`;
const CONDOM_ROUND = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><circle cx="25" cy="25" r="20" fill="#fbbf24" stroke="#92400e" stroke-width="2"/><circle cx="25" cy="25" r="14" fill="none" stroke="#92400e" stroke-width="1.5"/><circle cx="25" cy="25" r="6" fill="#92400e"/></svg>`;

const PIGEON = `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><ellipse cx="32" cy="22" rx="18" ry="10" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/><circle cx="48" cy="16" r="6" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/><circle cx="50" cy="14" r="1.5" fill="#0a0a0a"/><path d="M52 16 L58 14 L52 18 Z" fill="#fbbf24"/><path d="M14 20 Q6 10 14 8 Q22 14 20 22 Z" fill="#cbd5e1" stroke="#475569" stroke-width="1"/><path d="M14 24 Q6 32 14 34 Q22 28 20 22 Z" fill="#cbd5e1" stroke="#475569" stroke-width="1"/><line x1="28" y1="30" x2="26" y2="36" stroke="#fb923c" stroke-width="1.5"/><line x1="34" y1="30" x2="34" y2="36" stroke="#fb923c" stroke-width="1.5"/></svg>`;

const WHEELCHAIR = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="35" r="32" fill="#3b82f6"/><circle cx="32" cy="20" r="4" fill="#fff"/><path d="M28 28 L32 28 L36 38 L42 38 L42 42 L34 42 L30 50 L20 50 L20 46 L28 46 Z" fill="#fff"/><circle cx="22" cy="56" r="6" fill="none" stroke="#fff" stroke-width="2.5"/></svg>`;

const WHITE_CANE = `<svg viewBox="0 0 100 30" xmlns="http://www.w3.org/2000/svg"><line x1="4" y1="26" x2="92" y2="6" stroke="#fafafa" stroke-width="4"/><circle cx="92" cy="6" r="6" fill="#dc2626"/><circle cx="4" cy="26" r="3" fill="#525252"/></svg>`;
const EYE_CLOSED = `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><path d="M4 20 Q30 4 56 20" stroke="#f59e0b" stroke-width="3" fill="none"/><line x1="30" y1="14" x2="30" y2="22" stroke="#f59e0b" stroke-width="2"/></svg>`;

const POOP = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><path d="M14 56 L46 56 Q50 56 50 52 L48 44 Q54 40 50 36 Q44 34 42 28 Q48 22 42 18 Q34 16 32 10 Q28 4 22 12 Q14 14 18 22 Q10 28 16 34 Q8 38 14 44 Q6 50 14 56 Z" fill="#78350f" stroke="#1c0a01" stroke-width="2"/><circle cx="22" cy="30" r="2" fill="#fafafa"/><circle cx="34" cy="32" r="2" fill="#fafafa"/><circle cx="22" cy="30" r="1" fill="#0a0a0a"/><circle cx="34" cy="32" r="1" fill="#0a0a0a"/><path d="M22 42 Q28 46 34 42" stroke="#0a0a0a" stroke-width="1.5" fill="none"/></svg>`;

const HEART_HANDS = `<svg viewBox="0 0 60 50" xmlns="http://www.w3.org/2000/svg"><path d="M30 46 L8 24 Q2 12 14 8 Q22 10 30 18 Q38 10 46 8 Q58 12 52 24 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/></svg>`;
const DONATION_BOX = `<svg viewBox="0 0 70 60" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="20" width="58" height="36" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><rect x="2" y="18" width="66" height="6" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><rect x="30" y="14" width="10" height="6" fill="#7f1d1d"/><path d="M30 36 L40 36 L38 44 L32 44 Z" fill="#fef3c7"/><text x="35" y="34" font-family="serif" font-size="14" fill="#fef3c7" text-anchor="middle">❤</text></svg>`;
const HANDS_GIVING = `<svg viewBox="0 0 80 50" xmlns="http://www.w3.org/2000/svg"><path d="M4 30 L20 30 L24 22 L36 22 L40 30 L40 46 L4 46 Z" fill="#fbbf24" stroke="#713f12" stroke-width="1.5"/><path d="M76 30 L60 30 L56 22 L44 22 L40 30 L40 46 L76 46 Z" fill="#fbbf24" stroke="#713f12" stroke-width="1.5"/><path d="M40 22 L34 14 L40 8 L46 14 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/></svg>`;

const LEAF_LARGE = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><path d="M30 4 Q56 12 54 40 Q50 70 30 76 Q10 70 6 40 Q4 12 30 4 Z" fill="#16a34a" stroke="#052e16" stroke-width="2"/><line x1="30" y1="4" x2="30" y2="76" stroke="#052e16" stroke-width="1.5"/><g stroke="#052e16" stroke-width="1" fill="none"><path d="M30 20 L46 16"/><path d="M30 20 L14 16"/><path d="M30 36 L52 30"/><path d="M30 36 L8 30"/><path d="M30 52 L50 48"/><path d="M30 52 L10 48"/></g></svg>`;
const SUCCULENT = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="32" r="18" fill="#15803d" stroke="#052e16" stroke-width="1.5"/><path d="M30 14 L34 30 L26 30 Z M30 50 L34 34 L26 34 Z M12 32 L28 34 L28 30 Z M48 32 L32 34 L32 30 Z M18 18 L28 30 L24 32 Z M42 18 L32 30 L36 32 Z M18 46 L28 32 L24 30 Z M42 46 L32 32 L36 30 Z" fill="#22c55e" stroke="#052e16" stroke-width="1"/><circle cx="30" cy="32" r="6" fill="#16a34a"/></svg>`;
const POT_PLANT = `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg"><path d="M10 30 L40 30 L36 56 L14 56 Z" fill="#92400e" stroke="#451a03" stroke-width="2"/><path d="M25 4 Q35 10 32 24 Q24 18 25 4 Z M25 4 Q15 10 18 24 Q26 18 25 4 Z" fill="#16a34a" stroke="#052e16" stroke-width="1.5"/></svg>`;

const FERRARI_CAR = `<svg viewBox="0 0 140 50" xmlns="http://www.w3.org/2000/svg"><path d="M4 36 L8 26 L24 16 L50 8 L90 10 L108 16 L132 26 L136 36 L132 42 L106 42 L102 38 L34 38 L30 42 L8 42 Z" fill="#dc2626" stroke="#450a0a" stroke-width="2"/><path d="M24 22 L50 14 L80 14 L100 18 L96 28 L28 28 Z" fill="#fee2e2" opacity="0.5"/><circle cx="30" cy="42" r="6" fill="#0a0a0a"/><circle cx="106" cy="42" r="6" fill="#0a0a0a"/><circle cx="30" cy="42" r="2.5" fill="#525252"/><circle cx="106" cy="42" r="2.5" fill="#525252"/></svg>`;
const PRANCING_HORSE = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="48" height="58" rx="4" fill="#facc15" stroke="#713f12" stroke-width="2"/><path d="M30 14 L34 24 L40 22 L36 30 L42 32 L34 36 L36 44 L28 40 L20 44 L24 36 L18 32 L24 30 L20 22 L26 24 Z" fill="#0a0a0a"/><rect x="14" y="52" width="32" height="8" fill="#15803d"/></svg>`;

const LAMBO = `<svg viewBox="0 0 140 40" xmlns="http://www.w3.org/2000/svg"><path d="M2 30 L6 20 L18 14 L40 8 L80 6 L106 12 L130 20 L138 28 L138 34 L4 34 Z" fill="#facc15" stroke="#713f12" stroke-width="2"/><path d="M22 18 L42 12 L74 12 L98 16 L94 24 L26 24 Z" fill="#fef9c3" opacity="0.5"/><circle cx="26" cy="34" r="5" fill="#0a0a0a"/><circle cx="108" cy="34" r="5" fill="#0a0a0a"/></svg>`;
const LAMBO_BULL = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><path d="M30 6 L34 16 L44 12 L42 22 L52 24 L42 30 L48 38 L36 36 L32 46 L30 38 L28 46 L24 36 L12 38 L18 30 L8 24 L18 22 L16 12 L26 16 Z" fill="#facc15" stroke="#713f12" stroke-width="2"/></svg>`;

const BITCOIN_COIN = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="#f97316" stroke="#7c2d12" stroke-width="2"/><path d="M22 14 L22 46 M22 30 L38 30 Q44 30 44 24 Q44 18 38 18 L22 18 M22 30 L38 30 Q44 30 44 36 Q44 42 38 42 L22 42 M26 14 L26 46 M30 10 L30 18 M30 42 L30 50 M34 10 L34 18 M34 42 L34 50" stroke="#fff" stroke-width="3" fill="none"/></svg>`;
const SOLANA_COIN = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset="0.5" stop-color="#06b6d4"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs><circle cx="30" cy="30" r="26" fill="url(#sg)"/><path d="M14 22 L42 22 L46 18 L18 18 Z M14 32 L42 32 L46 36 L18 36 Z M14 42 L42 42 L46 38 L18 38 Z" fill="#fff"/></svg>`;
const MONERO_COIN = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="#f97316" stroke="#7c2d12" stroke-width="2"/><path d="M12 18 L12 42 L22 42 L22 26 L30 36 L38 26 L38 42 L48 42 L48 18 L40 18 L30 30 L20 18 Z" fill="#fff"/></svg>`;

const GHOST = `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg"><path d="M8 56 L8 28 Q8 4 25 4 Q42 4 42 28 L42 56 L36 50 L30 56 L24 50 L18 56 L14 50 Z" fill="#fafafa" stroke="#94a3b8" stroke-width="2" opacity="0.9"/><circle cx="18" cy="22" r="3" fill="#0a0a0a"/><circle cx="32" cy="22" r="3" fill="#0a0a0a"/><ellipse cx="25" cy="34" rx="4" ry="2" fill="#0a0a0a"/></svg>`;

const PRISON_BARS = `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="72" height="92" fill="#171717"/><g fill="#525252"><rect x="10" y="8" width="4" height="84"/><rect x="22" y="8" width="4" height="84"/><rect x="34" y="8" width="4" height="84"/><rect x="46" y="8" width="4" height="84"/><rect x="58" y="8" width="4" height="84"/><rect x="70" y="8" width="4" height="84"/></g><rect x="4" y="4" width="72" height="6" fill="#525252"/><rect x="4" y="90" width="72" height="6" fill="#525252"/></svg>`;
const CHAIN = `<svg viewBox="0 0 80 30" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#94a3b8" stroke-width="3"><ellipse cx="10" cy="15" rx="8" ry="4"/><ellipse cx="22" cy="15" rx="8" ry="4"/><ellipse cx="34" cy="15" rx="8" ry="4"/><ellipse cx="46" cy="15" rx="8" ry="4"/><ellipse cx="58" cy="15" rx="8" ry="4"/><ellipse cx="70" cy="15" rx="8" ry="4"/></g></svg>`;
const LOCK = `<svg viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg"><path d="M10 20 L10 14 Q10 4 20 4 Q30 4 30 14 L30 20" stroke="#525252" stroke-width="4" fill="none"/><rect x="6" y="20" width="28" height="28" rx="3" fill="#a3a3a3" stroke="#171717" stroke-width="2"/><circle cx="20" cy="32" r="3" fill="#171717"/><rect x="19" y="32" width="2" height="8" fill="#171717"/></svg>`;

const NIKE_SWOOSH = `<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg"><path d="M4 30 Q40 4 96 8 Q60 22 14 32 Q12 32 4 30 Z" fill="#0a0a0a"/></svg>`;
const SHOE = `<svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg"><path d="M4 32 L8 14 Q12 8 22 10 L46 16 Q60 18 70 26 Q78 30 76 34 L8 34 Q4 34 4 32 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5"/><path d="M16 16 Q40 8 64 20" stroke="#0a0a0a" stroke-width="2" fill="none"/></svg>`;

const CACTUS = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><path d="M22 78 L22 30 Q22 20 30 20 Q38 20 38 30 L38 78 Z" fill="#15803d" stroke="#052e16" stroke-width="2"/><path d="M8 50 L8 38 Q8 30 16 30 Q22 30 22 38 L22 50" fill="#16a34a" stroke="#052e16" stroke-width="2"/><path d="M52 56 L52 42 Q52 34 44 34 Q38 34 38 42 L38 56" fill="#16a34a" stroke="#052e16" stroke-width="2"/><path d="M28 14 L28 4 L32 4 L32 14 Z M22 22 L22 18 L20 18 L20 22 Z M38 22 L38 18 L40 18 L40 22 Z" fill="#facc15"/></svg>`;

const KIWI_FRUIT = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="#06b6d4" stroke="#365314" stroke-width="2"/><circle cx="30" cy="30" r="18" fill="#67e8f9"/><g fill="#1c1917"><circle cx="22" cy="22" r="1.5"/><circle cx="30" cy="20" r="1.5"/><circle cx="38" cy="22" r="1.5"/><circle cx="20" cy="30" r="1.5"/><circle cx="30" cy="30" r="1.5"/><circle cx="40" cy="30" r="1.5"/><circle cx="22" cy="38" r="1.5"/><circle cx="30" cy="40" r="1.5"/><circle cx="38" cy="38" r="1.5"/></g></svg>`;

const PEN_BLUE = `<svg viewBox="0 0 20 80" xmlns="http://www.w3.org/2000/svg"><path d="M10 2 L14 14 L14 70 L6 70 L6 14 Z" fill="#1e40af" stroke="#0c1d4a" stroke-width="1.5"/><rect x="6" y="14" width="8" height="4" fill="#fafafa"/><path d="M10 70 L8 78 L12 78 Z" fill="#0c1d4a"/></svg>`;

const SUPERHERO_ROBIN = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="14" r="10" fill="#fef3c7" stroke="#1a1a1a" stroke-width="1.5"/><rect x="22" y="10" width="16" height="4" fill="#0a0a0a"/><path d="M16 24 L44 24 L44 50 L36 56 L36 76 L24 76 L24 56 L16 50 Z" fill="#16a34a" stroke="#052e16" stroke-width="1.5"/><path d="M22 26 L38 26 L36 44 L24 44 Z" fill="#dc2626"/><path d="M16 30 L8 36 L16 42 Z M44 30 L52 36 L44 42 Z" fill="#facc15" stroke="#1a1a1a" stroke-width="1"/><text x="30" y="40" font-family="Arial Black" font-size="14" fill="#facc15" text-anchor="middle">R</text></svg>`;

const SP_KID = `<svg viewBox="0 0 50 70" xmlns="http://www.w3.org/2000/svg"><circle cx="25" cy="22" r="18" fill="#fef3c7" stroke="#92400e" stroke-width="1.5"/><circle cx="20" cy="20" r="3" fill="#fff" stroke="#0a0a0a" stroke-width="1"/><circle cx="30" cy="20" r="3" fill="#fff" stroke="#0a0a0a" stroke-width="1"/><circle cx="20" cy="20" r="1" fill="#0a0a0a"/><circle cx="30" cy="20" r="1" fill="#0a0a0a"/><path d="M22 28 L28 28" stroke="#0a0a0a" stroke-width="1.5"/><path d="M8 14 Q8 4 18 4 L32 4 Q42 4 42 14 L42 24 Q40 14 25 14 Q10 14 8 24 Z" fill="#dc2626"/><rect x="14" y="40" width="22" height="20" fill="#16a34a"/><circle cx="20" cy="50" r="2" fill="#facc15"/><circle cx="30" cy="50" r="2" fill="#facc15"/></svg>`;

const BLUEJAY = `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg"><circle cx="25" cy="22" r="16" fill="#3b82f6" stroke="#1e3a8a" stroke-width="2"/><path d="M10 22 Q4 12 14 8 Q22 14 18 24 Z" fill="#3b82f6"/><path d="M14 36 Q14 56 24 56 L36 56 Q36 50 30 48 L24 38 Z" fill="#3b82f6" stroke="#1e3a8a" stroke-width="2"/><circle cx="24" cy="18" r="2" fill="#fafafa"/><circle cx="24" cy="18" r="1" fill="#0a0a0a"/><path d="M32 22 L40 20 L32 26 Z" fill="#fbbf24"/></svg>`;

const BARREL_CHAVES = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><ellipse cx="30" cy="14" rx="24" ry="6" fill="#92400e" stroke="#451a03" stroke-width="2"/><path d="M6 14 L4 60 Q4 66 30 66 Q56 66 56 60 L54 14 Z" fill="#a16207" stroke="#451a03" stroke-width="2"/><g stroke="#451a03" stroke-width="1.5" fill="none"><line x1="6" y1="28" x2="54" y2="28"/><line x1="4" y1="46" x2="56" y2="46"/></g></svg>`;

const RABBIT_HEAD = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="40" r="22" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/><ellipse cx="20" cy="14" rx="6" ry="14" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/><ellipse cx="40" cy="14" rx="6" ry="14" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/><circle cx="24" cy="36" r="2" fill="#0a0a0a"/><circle cx="36" cy="36" r="2" fill="#0a0a0a"/><circle cx="30" cy="44" r="2" fill="#ec4899"/><path d="M28 46 L32 46 L30 50 Z" fill="#0a0a0a"/></svg>`;

const DALI_MASK = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><path d="M30 4 Q44 8 46 28 Q44 50 30 64 Q16 50 14 28 Q16 8 30 4 Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/><ellipse cx="22" cy="28" rx="3" ry="5" fill="#0a0a0a"/><ellipse cx="38" cy="28" rx="3" ry="5" fill="#0a0a0a"/><path d="M18 50 Q22 56 38 56 L42 50 L22 48 Z" fill="#0a0a0a"/><path d="M22 44 Q30 38 38 44 L36 50 L24 50 Z" fill="#0a0a0a"/></svg>`;
const JUMPSUIT_RED = `<svg viewBox="0 0 50 70" xmlns="http://www.w3.org/2000/svg"><circle cx="25" cy="14" r="10" fill="#fed7aa"/><path d="M12 22 L38 22 L40 66 L10 66 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/><circle cx="25" cy="36" r="1.5" fill="#fef3c7"/><circle cx="25" cy="46" r="1.5" fill="#fef3c7"/><circle cx="25" cy="56" r="1.5" fill="#fef3c7"/></svg>`;

const SCROOGE_HAT = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg"><rect x="14" y="14" width="32" height="22" fill="#0a0a0a" stroke="#facc15" stroke-width="1.5"/><rect x="14" y="36" width="32" height="4" fill="#dc2626"/><ellipse cx="30" cy="40" rx="26" ry="4" fill="#0a0a0a"/><ellipse cx="30" cy="58" rx="20" ry="10" fill="#fafafa" stroke="#facc15" stroke-width="1.5"/><path d="M16 50 L24 56 L20 60 Z" fill="#facc15"/></svg>`;
const VAULT = `<svg viewBox="0 0 80 70" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="68" height="58" rx="6" fill="#525252" stroke="#171717" stroke-width="2"/><circle cx="40" cy="35" r="20" fill="#94a3b8" stroke="#171717" stroke-width="2"/><circle cx="40" cy="35" r="14" fill="#525252" stroke="#171717" stroke-width="1.5"/><circle cx="40" cy="35" r="3" fill="#171717"/><g stroke="#171717" stroke-width="1.5"><line x1="40" y1="15" x2="40" y2="22"/><line x1="40" y1="48" x2="40" y2="55"/><line x1="20" y1="35" x2="27" y2="35"/><line x1="53" y1="35" x2="60" y2="35"/></g></svg>`;

const MONA_FRAME = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="52" height="72" fill="#a16207" stroke="#451a03" stroke-width="3"/><rect x="10" y="10" width="40" height="60" fill="#fef3c7"/><circle cx="30" cy="30" r="10" fill="#92400e"/><path d="M22 38 L38 38 L40 56 L20 56 Z" fill="#451a03"/><path d="M26 28 Q30 30 34 28" stroke="#451a03" stroke-width="1" fill="none"/></svg>`;
const PALETTE = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><path d="M30 4 Q56 4 56 30 Q56 44 44 50 Q40 52 36 48 Q34 44 38 40 Q44 36 44 30 Q44 16 30 16 Q16 16 16 30 Q16 56 4 56 L4 30 Q4 4 30 4 Z" fill="#fbbf24" stroke="#451a03" stroke-width="2"/><circle cx="20" cy="20" r="3" fill="#dc2626"/><circle cx="36" cy="22" r="3" fill="#3b82f6"/><circle cx="44" cy="36" r="3" fill="#16a34a"/><circle cx="20" cy="40" r="3" fill="#a855f7"/></svg>`;

const BRIEFCASE = `<svg viewBox="0 0 70 60" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="20" width="58" height="36" rx="3" fill="#451a03" stroke="#1c0a01" stroke-width="2"/><rect x="6" y="20" width="58" height="6" fill="#92400e"/><rect x="28" y="14" width="14" height="6" fill="#92400e" stroke="#1c0a01" stroke-width="1.5"/><rect x="32" y="32" width="6" height="14" fill="#fbbf24"/></svg>`;
const TIE = `<svg viewBox="0 0 40 80" xmlns="http://www.w3.org/2000/svg"><path d="M20 2 L26 8 L24 14 L30 18 L24 30 L26 70 L20 78 L14 70 L16 30 L10 18 L16 14 L14 8 Z" fill="#1e40af" stroke="#0c1d4a" stroke-width="1.5"/></svg>`;
const SCALE_JUSTICE = `<svg viewBox="0 0 80 70" xmlns="http://www.w3.org/2000/svg"><rect x="38" y="14" width="4" height="50" fill="#facc15" stroke="#713f12" stroke-width="1"/><line x1="14" y1="14" x2="66" y2="14" stroke="#facc15" stroke-width="3"/><circle cx="40" cy="12" r="4" fill="#facc15" stroke="#713f12" stroke-width="1"/><path d="M14 14 L8 28 L20 28 Z" fill="#facc15" stroke="#713f12" stroke-width="1.5"/><path d="M66 14 L60 28 L72 28 Z" fill="#facc15" stroke="#713f12" stroke-width="1.5"/><rect x="22" y="64" width="36" height="4" fill="#facc15"/></svg>`;

const HAZMAT = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="18" r="14" fill="#facc15" stroke="#713f12" stroke-width="2"/><circle cx="30" cy="18" r="9" fill="#0a0a0a"/><rect x="14" y="32" width="32" height="38" fill="#facc15" stroke="#713f12" stroke-width="2"/><rect x="22" y="40" width="16" height="4" fill="#0a0a0a"/></svg>`;
const CRYSTAL_BLUE = `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg"><path d="M14 14 L36 14 L42 30 L25 56 L8 30 Z" fill="#06b6d4" stroke="#0c4a6e" stroke-width="2"/><path d="M14 14 L36 14 L25 30 Z" fill="#67e8f9"/><path d="M14 14 L8 30 L25 30 Z" fill="#0891b2"/></svg>`;
const FLASK = `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg"><path d="M20 4 L30 4 L30 22 L42 50 Q44 56 38 56 L12 56 Q6 56 8 50 L20 22 Z" fill="#06b6d4" stroke="#0c4a6e" stroke-width="2"/><rect x="18" y="2" width="14" height="6" fill="#171717"/><path d="M22 22 L28 22 L36 48 L14 48 Z" fill="#0891b2" opacity="0.5"/></svg>`;

const RAINBOW_FLAG = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="10" fill="#ef4444"/><rect x="0" y="10" width="100" height="10" fill="#f97316"/><rect x="0" y="20" width="100" height="10" fill="#facc15"/><rect x="0" y="30" width="100" height="10" fill="#22c55e"/><rect x="0" y="40" width="100" height="10" fill="#3b82f6"/><rect x="0" y="50" width="100" height="10" fill="#a855f7"/></svg>`;
const HEART_RAINBOW = `<svg viewBox="0 0 60 50" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ef4444"/><stop offset="0.2" stop-color="#f97316"/><stop offset="0.4" stop-color="#facc15"/><stop offset="0.6" stop-color="#22c55e"/><stop offset="0.8" stop-color="#3b82f6"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs><path d="M30 46 L8 24 Q2 10 14 6 Q22 6 30 16 Q38 6 46 6 Q58 10 52 24 Z" fill="url(#rg)"/></svg>`;

const UBER_CAR = `<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg"><path d="M4 30 L8 22 L20 14 L40 10 L70 12 L84 18 L96 26 L96 32 L4 32 Z" fill="#0a0a0a" stroke="#525252" stroke-width="1.5"/><path d="M20 18 L40 14 L66 16 L80 22 L78 28 L24 28 Z" fill="#fafafa" opacity="0.3"/><circle cx="24" cy="32" r="5" fill="#fafafa" stroke="#525252"/><circle cx="80" cy="32" r="5" fill="#fafafa" stroke="#525252"/></svg>`;
const NINETYNINE_CAR = `<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg"><path d="M4 30 L8 22 L20 14 L40 10 L70 12 L84 18 L96 26 L96 32 L4 32 Z" fill="#facc15" stroke="#713f12" stroke-width="1.5"/><rect x="40" y="14" width="20" height="6" fill="#0a0a0a"/><text x="50" y="19" font-family="Arial Black" font-size="6" fill="#facc15" text-anchor="middle">99</text><circle cx="24" cy="32" r="5" fill="#0a0a0a"/><circle cx="80" cy="32" r="5" fill="#0a0a0a"/></svg>`;

const FOOD_PLATE = `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><ellipse cx="30" cy="32" rx="26" ry="6" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><ellipse cx="30" cy="24" rx="22" ry="10" fill="#fef3c7" stroke="#dc2626" stroke-width="1.5"/><circle cx="22" cy="22" r="4" fill="#16a34a"/><circle cx="30" cy="20" r="3" fill="#facc15"/><circle cx="38" cy="22" r="4" fill="#dc2626"/></svg>`;
const SHOPPING_CART = `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg"><path d="M4 10 L14 10 L20 38 L60 38 L66 18 L24 18" stroke="#dc2626" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="26" cy="50" r="5" fill="#dc2626"/><circle cx="56" cy="50" r="5" fill="#dc2626"/><rect x="26" y="22" width="10" height="14" fill="#facc15"/><rect x="40" y="22" width="10" height="14" fill="#16a34a"/></svg>`;

const MOTO = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="38" r="10" fill="none" stroke="#0a0a0a" stroke-width="3"/><circle cx="80" cy="38" r="10" fill="none" stroke="#0a0a0a" stroke-width="3"/><path d="M20 38 L34 22 L50 18 L66 22 L80 38 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><rect x="40" y="14" width="10" height="10" fill="#171717"/><rect x="22" y="14" width="10" height="6" fill="#0a0a0a"/></svg>`;
const HELMET = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><path d="M8 30 Q8 6 25 6 Q42 6 42 30 L42 36 Q42 40 38 40 L12 40 Q8 40 8 36 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><rect x="12" y="22" width="26" height="8" fill="#0a0a0a"/></svg>`;

const XMAS_TREE = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><path d="M30 4 L18 24 L24 24 L12 44 L20 44 L4 68 L56 68 L40 44 L48 44 L36 24 L42 24 Z" fill="#15803d" stroke="#052e16" stroke-width="2"/><path d="M30 4 L34 10 L32 10 L36 18 L26 18 L26 10 Z" fill="#facc15"/><circle cx="22" cy="32" r="2" fill="#dc2626"/><circle cx="36" cy="34" r="2" fill="#3b82f6"/><circle cx="18" cy="50" r="2" fill="#facc15"/><circle cx="42" cy="52" r="2" fill="#dc2626"/><circle cx="30" cy="60" r="2" fill="#a855f7"/><rect x="26" y="68" width="8" height="12" fill="#92400e"/></svg>`;
const GIFT_BOX = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="22" width="48" height="36" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><rect x="6" y="22" width="48" height="8" fill="#7f1d1d"/><rect x="26" y="22" width="8" height="36" fill="#facc15"/><path d="M24 22 Q24 10 30 10 Q36 10 36 22 L34 14 L30 18 L26 14 Z" fill="#facc15" stroke="#713f12" stroke-width="1.5"/></svg>`;
const SNOWFLAKE = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><g stroke="#fafafa" stroke-width="2" fill="none" stroke-linecap="round"><line x1="20" y1="4" x2="20" y2="36"/><line x1="4" y1="20" x2="36" y2="20"/><line x1="8" y1="8" x2="32" y2="32"/><line x1="32" y1="8" x2="8" y2="32"/><path d="M16 8 L20 4 L24 8 M16 32 L20 36 L24 32 M8 16 L4 20 L8 24 M32 16 L36 20 L32 24"/></g></svg>`;

const MINION = `<svg viewBox="0 0 50 80" xmlns="http://www.w3.org/2000/svg"><path d="M8 26 Q8 8 25 8 Q42 8 42 26 L42 62 Q42 76 25 76 Q8 76 8 62 Z" fill="#facc15" stroke="#713f12" stroke-width="2"/><circle cx="25" cy="32" r="10" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/><circle cx="25" cy="32" r="5" fill="#92400e"/><circle cx="25" cy="32" r="2" fill="#0a0a0a"/><rect x="6" y="44" width="38" height="3" fill="#1e40af"/><rect x="6" y="62" width="38" height="14" fill="#1e40af"/><rect x="16" y="44" width="4" height="18" fill="#0c1d4a"/><rect x="30" y="44" width="4" height="18" fill="#0c1d4a"/></svg>`;
const VECTOR_DUDE = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="22" r="14" fill="#fed7aa" stroke="#7c2d12" stroke-width="1.5"/><rect x="20" y="18" width="20" height="6" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5"/><circle cx="26" cy="21" r="1.5" fill="#0a0a0a"/><circle cx="34" cy="21" r="1.5" fill="#0a0a0a"/><path d="M10 36 L50 36 L52 78 L8 78 Z" fill="#f97316" stroke="#7c2d12" stroke-width="1.5"/><rect x="18" y="36" width="24" height="8" fill="#fed7aa"/><circle cx="30" cy="14" r="6" fill="#1c0a01"/></svg>`;

/* ============== SCENES ============== */

export const SCENES_3: Record<string, Scene> = {
  adega: {
    gradient: "linear-gradient(180deg, rgba(127,29,29,0.20) 0%, transparent 50%, rgba(26,10,10,0.50) 100%)",
    elements: [
      { svg: BOTTLE_WINE, pin: "bottom-left", x: 5, y: 5, size: 130, opacity: 0.6 },
      { svg: BOTTLE_WINE, pin: "bottom-right", x: 5, y: 5, size: 140, opacity: 0.62, rotate: 5 },
      { svg: BOTTLE_WINE, x: 22, y: 40, size: 100, opacity: 0.5, rotate: -8, anim: 0 },
      { svg: BOTTLE_WINE, x: 50, y: 25, size: 110, opacity: 0.55, anim: 1 },
      { svg: BOTTLE_WINE, x: 78, y: 38, size: 105, opacity: 0.52, rotate: 6, anim: 2 },
      { svg: BOTTLE_WINE, x: 30, y: 70, size: 95, opacity: 0.5, anim: 3 },
      { svg: BOTTLE_WINE, x: 70, y: 70, size: 100, opacity: 0.55, rotate: -10, anim: 0 },
      { svg: BOTTLE_BEER, x: 14, y: 22, size: 80, opacity: 0.5, anim: 1 },
      { svg: BOTTLE_BEER, x: 86, y: 22, size: 85, opacity: 0.52, anim: 2 },
      { svg: BOTTLE_BEER, x: 38, y: 55, size: 90, opacity: 0.5, anim: 3 },
      { svg: BOTTLE_BEER, x: 62, y: 55, size: 90, opacity: 0.5, anim: 0 },
      { svg: WINE_GLASS, x: 18, y: 60, size: 80, opacity: 0.55, anim: 1 },
      { svg: WINE_GLASS, x: 82, y: 60, size: 90, opacity: 0.6, anim: 2 },
      { svg: WINE_GLASS, x: 50, y: 88, size: 100, opacity: 0.65, anim: 3 },
    ],
  },

  autismo: {
    gradient: "linear-gradient(135deg, rgba(168,85,247,0.16) 0%, transparent 50%, rgba(131,24,67,0.15) 100%)",
    elements: [
      { svg: INFINITY_RAINBOW, x: 50, y: 30, size: 280, opacity: 0.65, anim: 0 },
      { svg: INFINITY_RAINBOW, x: 22, y: 65, size: 200, opacity: 0.55, anim: 1 },
      { svg: INFINITY_RAINBOW, x: 78, y: 70, size: 220, opacity: 0.58, anim: 2 },
      { svg: INFINITY_RAINBOW, pin: "top-left", x: 5, y: 5, size: 180, opacity: 0.5 },
      { svg: PUZZLE_PIECE, x: 14, y: 25, size: 60, opacity: 0.55, rotate: -15, anim: 0 },
      { svg: PUZZLE_PIECE, x: 30, y: 50, size: 70, opacity: 0.58, rotate: 20, anim: 1 },
      { svg: PUZZLE_PIECE, x: 50, y: 70, size: 65, opacity: 0.55, anim: 2 },
      { svg: PUZZLE_PIECE, x: 70, y: 45, size: 75, opacity: 0.6, rotate: -25, anim: 3 },
      { svg: PUZZLE_PIECE, x: 88, y: 25, size: 60, opacity: 0.55, anim: 0 },
      { svg: PUZZLE_PIECE, x: 12, y: 85, size: 55, opacity: 0.5, anim: 1 },
      { svg: PUZZLE_PIECE, x: 88, y: 88, size: 60, opacity: 0.52, anim: 2 },
    ],
  },

  anonimos: {
    gradient: "radial-gradient(ellipse at top, rgba(132,204,22,0.10) 0%, transparent 50%)",
    elements: [
      { svg: GUY_FAWKES_MASK, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.6 },
      { svg: GUY_FAWKES_MASK, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.65 },
      { svg: GUY_FAWKES_MASK, x: 50, y: 35, size: 160, opacity: 0.5, anim: 0 },
      { svg: GUY_FAWKES_MASK, x: 22, y: 35, size: 130, opacity: 0.45, anim: 1 },
      { svg: GUY_FAWKES_MASK, x: 78, y: 35, size: 140, opacity: 0.48, anim: 2 },
      { svg: NINJA, x: 14, y: 18, size: 100, opacity: 0.55, anim: 0 },
      { svg: NINJA, x: 35, y: 14, size: 110, opacity: 0.58, anim: 1 },
      { svg: NINJA, x: 60, y: 16, size: 105, opacity: 0.56, anim: 2 },
      { svg: NINJA, x: 86, y: 12, size: 115, opacity: 0.6, anim: 3 },
      { svg: NINJA, x: 50, y: 70, size: 120, opacity: 0.55, anim: 0 },
      { svg: NINJA, x: 30, y: 75, size: 110, opacity: 0.5, anim: 1 },
      { svg: NINJA, x: 70, y: 78, size: 115, opacity: 0.52, anim: 2 },
    ],
  },

  down: {
    gradient: "linear-gradient(135deg, rgba(236,72,153,0.16) 0%, transparent 50%, rgba(131,24,67,0.20) 100%)",
    elements: [
      { svg: ARROWS_UP, pin: "top-left", x: 5, y: 5, size: 150, opacity: 0.6 },
      { svg: ARROWS_UP, pin: "top-right", x: 5, y: 5, size: 180, opacity: 0.65 },
      { svg: ARROWS_UP, x: 50, y: 25, size: 200, opacity: 0.55, anim: 0 },
      { svg: ARROWS_UP, x: 22, y: 65, size: 140, opacity: 0.5, anim: 1 },
      { svg: ARROWS_UP, x: 78, y: 70, size: 150, opacity: 0.55, anim: 2 },
      { svg: SOCK_LOTS, x: 14, y: 50, size: 90, opacity: 0.65, rotate: -8, anim: 0 },
      { svg: SOCK_STRIPED, x: 28, y: 80, size: 100, opacity: 0.7, rotate: 12, anim: 1 },
      { svg: SOCK_LOTS, x: 50, y: 85, size: 110, opacity: 0.7, rotate: -5, anim: 2 },
      { svg: SOCK_STRIPED, x: 72, y: 85, size: 95, opacity: 0.65, rotate: 8, anim: 3 },
      { svg: SOCK_LOTS, x: 88, y: 50, size: 85, opacity: 0.6, anim: 0 },
      { svg: SOCK_STRIPED, x: 40, y: 50, size: 80, opacity: 0.55, rotate: 20, anim: 1 },
      { svg: SOCK_LOTS, x: 60, y: 40, size: 75, opacity: 0.6, anim: 2 },
    ],
  },

  macaco: {
    gradient: "radial-gradient(ellipse at top, rgba(124,45,18,0.18) 0%, transparent 60%)",
    elements: [
      { svg: MONKEY, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.6 },
      { svg: MONKEY, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.62 },
      { svg: MONKEY, x: 50, y: 40, size: 160, opacity: 0.55, anim: 0 },
      { svg: MONKEY, x: 22, y: 30, size: 110, opacity: 0.5, anim: 1 },
      { svg: MONKEY, x: 78, y: 30, size: 120, opacity: 0.5, anim: 2 },
      { svg: BANANA, x: 14, y: 18, size: 100, opacity: 0.65, rotate: -15, anim: 0 },
      { svg: BANANA, x: 38, y: 22, size: 110, opacity: 0.68, rotate: 20, anim: 1 },
      { svg: BANANA, x: 62, y: 18, size: 105, opacity: 0.65, rotate: -10, anim: 2 },
      { svg: BANANA, x: 86, y: 22, size: 100, opacity: 0.6, rotate: 25, anim: 3 },
      { svg: BANANA, x: 22, y: 70, size: 90, opacity: 0.6, rotate: 8, anim: 0 },
      { svg: BANANA, x: 50, y: 80, size: 130, opacity: 0.7, anim: 1 },
      { svg: BANANA, x: 78, y: 70, size: 95, opacity: 0.62, rotate: -18, anim: 2 },
    ],
  },

  armas: {
    gradient: "linear-gradient(135deg, rgba(234,88,12,0.10) 0%, transparent 50%, rgba(0,0,0,0.6) 100%)",
    elements: [
      { svg: RIFLE, x: 25, y: 25, size: 240, opacity: 0.55, rotate: -10, anim: 0 },
      { svg: RIFLE, x: 70, y: 25, size: 260, opacity: 0.58, rotate: 8, anim: 1 },
      { svg: RIFLE, x: 40, y: 55, size: 200, opacity: 0.5, rotate: -20, anim: 2 },
      { svg: RIFLE, x: 78, y: 65, size: 220, opacity: 0.55, rotate: 18, anim: 3 },
      { svg: PISTOL_SILH, pin: "bottom-left", x: 5, y: 5, size: 160, opacity: 0.55 },
      { svg: PISTOL_SILH, pin: "bottom-right", x: 5, y: 5, size: 180, opacity: 0.58 },
      { svg: PISTOL_SILH, x: 22, y: 78, size: 140, opacity: 0.5, anim: 0 },
      { svg: PISTOL_SILH, x: 60, y: 85, size: 150, opacity: 0.55, anim: 1 },
      { svg: BULLET, x: 12, y: 50, size: 40, opacity: 0.6, rotate: 30, anim: 2 },
      { svg: BULLET, x: 88, y: 50, size: 45, opacity: 0.62, rotate: -45, anim: 3 },
      { svg: BULLET, x: 50, y: 20, size: 35, opacity: 0.55, anim: 0 },
      { svg: BULLET, x: 30, y: 90, size: 40, opacity: 0.58, rotate: 60, anim: 1 },
    ],
  },

  leadburro: {
    gradient: "radial-gradient(circle at 50% 50%, rgba(6,182,212,0.14) 0%, transparent 60%)",
    elements: [
      { svg: PHONE_PERSON, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.55 },
      { svg: PHONE_PERSON, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.58 },
      { svg: PHONE_PERSON, x: 22, y: 50, size: 140, opacity: 0.5, anim: 0 },
      { svg: PHONE_PERSON, x: 50, y: 45, size: 170, opacity: 0.55, anim: 1 },
      { svg: PHONE_PERSON, x: 78, y: 50, size: 150, opacity: 0.52, anim: 2 },
      { svg: PHONE_PERSON, x: 35, y: 22, size: 110, opacity: 0.45, anim: 3 },
      { svg: PHONE_PERSON, x: 65, y: 22, size: 120, opacity: 0.5, anim: 0 },
      { svg: PHONE_DEVICE, x: 14, y: 25, size: 80, opacity: 0.55, anim: 1 },
      { svg: PHONE_DEVICE, x: 86, y: 25, size: 90, opacity: 0.58, anim: 2 },
      { svg: PHONE_DEVICE, x: 50, y: 78, size: 100, opacity: 0.6, anim: 3 },
    ],
  },

  camisinha: {
    gradient: "radial-gradient(ellipse at top, rgba(236,72,153,0.18) 0%, transparent 60%)",
    elements: [
      { svg: CONDOM_PACK, x: 18, y: 22, size: 90, opacity: 0.65, rotate: -10, anim: 0 },
      { svg: CONDOM_PACK, x: 50, y: 18, size: 100, opacity: 0.7, anim: 1 },
      { svg: CONDOM_PACK, x: 82, y: 22, size: 95, opacity: 0.65, rotate: 12, anim: 2 },
      { svg: CONDOM_PACK, x: 30, y: 50, size: 110, opacity: 0.68, rotate: 25, anim: 3 },
      { svg: CONDOM_PACK, x: 68, y: 50, size: 105, opacity: 0.7, rotate: -20, anim: 0 },
      { svg: CONDOM_PACK, x: 14, y: 75, size: 85, opacity: 0.6, anim: 1 },
      { svg: CONDOM_PACK, x: 50, y: 80, size: 120, opacity: 0.72, anim: 2 },
      { svg: CONDOM_PACK, x: 86, y: 78, size: 90, opacity: 0.62, rotate: 8, anim: 3 },
      { svg: CONDOM_ROUND, x: 25, y: 35, size: 70, opacity: 0.55, anim: 0 },
      { svg: CONDOM_ROUND, x: 75, y: 35, size: 75, opacity: 0.58, anim: 1 },
      { svg: CONDOM_ROUND, x: 40, y: 88, size: 65, opacity: 0.55, anim: 2 },
      { svg: CONDOM_ROUND, x: 60, y: 65, size: 70, opacity: 0.55, anim: 3 },
    ],
  },

  cadeirante: {
    gradient: "radial-gradient(circle at center, rgba(59,130,246,0.18) 0%, transparent 60%)",
    elements: [
      { svg: WHEELCHAIR, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.7 },
      { svg: WHEELCHAIR, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.72 },
      { svg: WHEELCHAIR, x: 50, y: 30, size: 220, opacity: 0.65, anim: 0 },
      { svg: WHEELCHAIR, x: 22, y: 30, size: 150, opacity: 0.55, anim: 1 },
      { svg: WHEELCHAIR, x: 78, y: 30, size: 160, opacity: 0.58, anim: 2 },
      { svg: WHEELCHAIR, x: 22, y: 65, size: 140, opacity: 0.55, anim: 3 },
      { svg: WHEELCHAIR, x: 78, y: 70, size: 130, opacity: 0.52, anim: 0 },
      { svg: WHEELCHAIR, x: 50, y: 75, size: 160, opacity: 0.6, anim: 1 },
    ],
  },

  cego: {
    gradient: "radial-gradient(circle at center, rgba(245,158,11,0.05) 0%, rgba(0,0,0,0.85) 80%)",
    elements: [
      { svg: WHITE_CANE, x: 22, y: 30, size: 160, opacity: 0.7, rotate: -20, anim: 0 },
      { svg: WHITE_CANE, x: 75, y: 28, size: 180, opacity: 0.72, rotate: 25, anim: 1 },
      { svg: WHITE_CANE, x: 30, y: 60, size: 150, opacity: 0.65, rotate: -30, anim: 2 },
      { svg: WHITE_CANE, x: 68, y: 65, size: 170, opacity: 0.7, rotate: 35, anim: 3 },
      { svg: WHITE_CANE, x: 50, y: 80, size: 200, opacity: 0.75, rotate: 0, anim: 0 },
      { svg: WHITE_CANE, pin: "bottom-left", x: 5, y: 5, size: 160, opacity: 0.6 },
      { svg: WHITE_CANE, pin: "bottom-right", x: 5, y: 5, size: 180, opacity: 0.62 },
      { svg: EYE_CLOSED, x: 18, y: 22, size: 80, opacity: 0.55, anim: 0 },
      { svg: EYE_CLOSED, x: 82, y: 22, size: 90, opacity: 0.58, anim: 1 },
      { svg: EYE_CLOSED, x: 50, y: 18, size: 100, opacity: 0.6, anim: 2 },
      { svg: EYE_CLOSED, x: 50, y: 50, size: 110, opacity: 0.55, anim: 3 },
    ],
  },

  coco: {
    gradient: "radial-gradient(ellipse at bottom, rgba(146,64,14,0.20) 0%, transparent 60%)",
    elements: [
      ...Array.from({ length: 30 }, (_, i) => ({
        svg: POOP,
        x: (i * 17 + 5) % 95,
        y: (i * 23 + 8) % 92,
        size: 50 + (i % 5) * 20,
        opacity: 0.55 + (i % 3) * 0.1,
        rotate: i * 23 - 45,
        anim: i % 4,
      })),
    ],
  },

  doacao: {
    gradient: "linear-gradient(135deg, rgba(220,38,38,0.16) 0%, transparent 50%, rgba(168,85,247,0.12) 100%)",
    elements: [
      { svg: DONATION_BOX, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.6 },
      { svg: DONATION_BOX, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.62 },
      { svg: DONATION_BOX, x: 50, y: 50, size: 160, opacity: 0.55, anim: 0 },
      { svg: HEART_HANDS, x: 22, y: 22, size: 110, opacity: 0.6, anim: 0 },
      { svg: HEART_HANDS, x: 50, y: 18, size: 130, opacity: 0.65, anim: 1 },
      { svg: HEART_HANDS, x: 78, y: 25, size: 120, opacity: 0.62, anim: 2 },
      { svg: HEART_HANDS, x: 14, y: 60, size: 95, opacity: 0.55, anim: 3 },
      { svg: HEART_HANDS, x: 86, y: 60, size: 105, opacity: 0.58, anim: 0 },
      { svg: HEART_HANDS, x: 35, y: 80, size: 90, opacity: 0.55, anim: 1 },
      { svg: HEART_HANDS, x: 65, y: 82, size: 100, opacity: 0.6, anim: 2 },
      { svg: HANDS_GIVING, x: 30, y: 45, size: 130, opacity: 0.55, anim: 3 },
      { svg: HANDS_GIVING, x: 70, y: 45, size: 140, opacity: 0.58, anim: 0 },
    ],
  },

  jardim: {
    gradient: "radial-gradient(ellipse at top, rgba(22,163,74,0.18) 0%, transparent 60%)",
    elements: [
      { svg: LEAF_LARGE, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.55, rotate: -15 },
      { svg: LEAF_LARGE, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.58, rotate: 12 },
      { svg: LEAF_LARGE, x: 30, y: 25, size: 130, opacity: 0.5, rotate: -20, anim: 0 },
      { svg: LEAF_LARGE, x: 70, y: 30, size: 140, opacity: 0.55, rotate: 25, anim: 1 },
      { svg: LEAF_LARGE, x: 50, y: 55, size: 150, opacity: 0.55, anim: 2 },
      { svg: SUCCULENT, x: 18, y: 50, size: 90, opacity: 0.65, anim: 0 },
      { svg: SUCCULENT, x: 50, y: 80, size: 110, opacity: 0.7, anim: 1 },
      { svg: SUCCULENT, x: 82, y: 55, size: 100, opacity: 0.68, anim: 2 },
      { svg: SUCCULENT, x: 22, y: 80, size: 80, opacity: 0.6, anim: 3 },
      { svg: SUCCULENT, x: 78, y: 82, size: 95, opacity: 0.65, anim: 0 },
      { svg: POT_PLANT, x: 14, y: 22, size: 100, opacity: 0.6, anim: 1 },
      { svg: POT_PLANT, x: 86, y: 22, size: 110, opacity: 0.62, anim: 2 },
      { svg: POT_PLANT, x: 38, y: 38, size: 90, opacity: 0.55, anim: 3 },
    ],
  },

  ferrari: {
    gradient: "linear-gradient(180deg, rgba(220,38,38,0.15) 0%, transparent 50%, rgba(0,0,0,0.5) 100%)",
    elements: [
      { svg: FERRARI_CAR, pin: "bottom-left", x: 5, y: 5, size: 240, opacity: 0.6 },
      { svg: FERRARI_CAR, pin: "bottom-right", x: 5, y: 5, size: 260, opacity: 0.62 },
      { svg: FERRARI_CAR, x: 50, y: 50, size: 220, opacity: 0.55, anim: 0 },
      { svg: FERRARI_CAR, x: 22, y: 25, size: 160, opacity: 0.5, anim: 1 },
      { svg: FERRARI_CAR, x: 78, y: 25, size: 180, opacity: 0.55, rotate: 3, anim: 2 },
      { svg: PRANCING_HORSE, x: 14, y: 50, size: 100, opacity: 0.65, anim: 0 },
      { svg: PRANCING_HORSE, x: 86, y: 50, size: 110, opacity: 0.7, anim: 1 },
      { svg: PRANCING_HORSE, x: 50, y: 18, size: 90, opacity: 0.6, anim: 2 },
      { svg: PRANCING_HORSE, x: 30, y: 75, size: 95, opacity: 0.6, anim: 3 },
      { svg: PRANCING_HORSE, x: 70, y: 80, size: 100, opacity: 0.65, anim: 0 },
    ],
  },

  lamborghini: {
    gradient: "linear-gradient(135deg, rgba(250,204,21,0.14) 0%, rgba(21,128,61,0.10) 100%)",
    elements: [
      { svg: LAMBO, pin: "bottom-left", x: 5, y: 5, size: 260, opacity: 0.62 },
      { svg: LAMBO, pin: "bottom-right", x: 5, y: 5, size: 280, opacity: 0.65 },
      { svg: LAMBO, x: 50, y: 50, size: 240, opacity: 0.58, anim: 0 },
      { svg: LAMBO, x: 25, y: 22, size: 180, opacity: 0.5, anim: 1 },
      { svg: LAMBO, x: 75, y: 25, size: 200, opacity: 0.55, anim: 2 },
      { svg: LAMBO_BULL, x: 12, y: 50, size: 100, opacity: 0.65, anim: 0 },
      { svg: LAMBO_BULL, x: 88, y: 50, size: 110, opacity: 0.7, anim: 1 },
      { svg: LAMBO_BULL, x: 50, y: 18, size: 95, opacity: 0.6, anim: 2 },
      { svg: LAMBO_BULL, x: 35, y: 78, size: 85, opacity: 0.6, anim: 3 },
      { svg: LAMBO_BULL, x: 65, y: 80, size: 90, opacity: 0.62, anim: 0 },
    ],
  },

  bitcoin: {
    gradient: "radial-gradient(circle at center, rgba(249,115,22,0.20) 0%, transparent 60%)",
    elements: [
      { svg: BITCOIN_COIN, x: 18, y: 22, size: 100, opacity: 0.7, anim: 0 },
      { svg: BITCOIN_COIN, x: 50, y: 18, size: 140, opacity: 0.75, anim: 1 },
      { svg: BITCOIN_COIN, x: 82, y: 22, size: 110, opacity: 0.7, anim: 2 },
      { svg: BITCOIN_COIN, x: 30, y: 45, size: 130, opacity: 0.72, anim: 3 },
      { svg: BITCOIN_COIN, x: 70, y: 45, size: 120, opacity: 0.7, anim: 0 },
      { svg: BITCOIN_COIN, x: 14, y: 60, size: 90, opacity: 0.65, anim: 1 },
      { svg: BITCOIN_COIN, x: 50, y: 65, size: 150, opacity: 0.78, anim: 2 },
      { svg: BITCOIN_COIN, x: 86, y: 60, size: 100, opacity: 0.65, anim: 3 },
      { svg: BITCOIN_COIN, x: 25, y: 85, size: 120, opacity: 0.72, anim: 0 },
      { svg: BITCOIN_COIN, x: 75, y: 85, size: 130, opacity: 0.75, anim: 1 },
      { svg: BITCOIN_COIN, pin: "bottom-left", x: 5, y: 5, size: 160, opacity: 0.65 },
      { svg: BITCOIN_COIN, pin: "bottom-right", x: 5, y: 5, size: 180, opacity: 0.7 },
    ],
  },

  solana: {
    gradient: "linear-gradient(135deg, rgba(168,85,247,0.20) 0%, rgba(6,182,212,0.18) 50%, rgba(34,197,94,0.18) 100%)",
    elements: [
      { svg: SOLANA_COIN, x: 18, y: 22, size: 110, opacity: 0.7, anim: 0 },
      { svg: SOLANA_COIN, x: 50, y: 18, size: 150, opacity: 0.78, anim: 1 },
      { svg: SOLANA_COIN, x: 82, y: 22, size: 120, opacity: 0.72, anim: 2 },
      { svg: SOLANA_COIN, x: 30, y: 45, size: 130, opacity: 0.72, anim: 3 },
      { svg: SOLANA_COIN, x: 70, y: 45, size: 140, opacity: 0.75, anim: 0 },
      { svg: SOLANA_COIN, x: 50, y: 65, size: 160, opacity: 0.78, anim: 1 },
      { svg: SOLANA_COIN, x: 14, y: 70, size: 100, opacity: 0.65, anim: 2 },
      { svg: SOLANA_COIN, x: 86, y: 68, size: 110, opacity: 0.7, anim: 3 },
      { svg: SOLANA_COIN, x: 30, y: 85, size: 120, opacity: 0.7, anim: 0 },
      { svg: SOLANA_COIN, x: 70, y: 85, size: 130, opacity: 0.72, anim: 1 },
    ],
  },

  monero: {
    gradient: "linear-gradient(180deg, rgba(249,115,22,0.12) 0%, transparent 50%, rgba(0,0,0,0.6) 100%)",
    elements: [
      { svg: MONERO_COIN, x: 18, y: 22, size: 110, opacity: 0.7, anim: 0 },
      { svg: MONERO_COIN, x: 50, y: 18, size: 140, opacity: 0.72, anim: 1 },
      { svg: MONERO_COIN, x: 82, y: 22, size: 120, opacity: 0.7, anim: 2 },
      { svg: MONERO_COIN, x: 30, y: 50, size: 130, opacity: 0.7, anim: 3 },
      { svg: MONERO_COIN, x: 70, y: 50, size: 140, opacity: 0.72, anim: 0 },
      { svg: MONERO_COIN, x: 14, y: 75, size: 100, opacity: 0.65, anim: 1 },
      { svg: MONERO_COIN, x: 50, y: 80, size: 150, opacity: 0.75, anim: 2 },
      { svg: MONERO_COIN, x: 86, y: 75, size: 110, opacity: 0.68, anim: 3 },
    ],
  },

  ghosts: {
    gradient: "radial-gradient(ellipse at top, rgba(163,163,163,0.10) 0%, transparent 60%)",
    elements: [
      { svg: GHOST, x: 14, y: 22, size: 90, opacity: 0.7, anim: 0 },
      { svg: GHOST, x: 32, y: 18, size: 110, opacity: 0.75, anim: 1 },
      { svg: GHOST, x: 50, y: 24, size: 130, opacity: 0.8, anim: 2 },
      { svg: GHOST, x: 68, y: 18, size: 110, opacity: 0.75, anim: 3 },
      { svg: GHOST, x: 86, y: 22, size: 95, opacity: 0.7, anim: 0 },
      { svg: GHOST, x: 22, y: 50, size: 120, opacity: 0.75, anim: 1 },
      { svg: GHOST, x: 50, y: 55, size: 150, opacity: 0.82, anim: 2 },
      { svg: GHOST, x: 78, y: 50, size: 125, opacity: 0.75, anim: 3 },
      { svg: GHOST, x: 14, y: 80, size: 100, opacity: 0.7, anim: 0 },
      { svg: GHOST, x: 38, y: 82, size: 115, opacity: 0.72, anim: 1 },
      { svg: GHOST, x: 62, y: 84, size: 110, opacity: 0.72, anim: 2 },
      { svg: GHOST, x: 86, y: 80, size: 105, opacity: 0.7, anim: 3 },
    ],
  },

  cadeia: {
    gradient: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 50%, rgba(0,0,0,0.7) 100%)",
    elements: [
      { svg: PRISON_BARS, x: 50, y: 50, size: 400, opacity: 0.3 },
      { svg: PRISON_BARS, pin: "top-left", x: 3, y: 3, size: 200, opacity: 0.4 },
      { svg: PRISON_BARS, pin: "top-right", x: 3, y: 3, size: 220, opacity: 0.42 },
      { svg: PRISON_BARS, pin: "bottom-left", x: 3, y: 3, size: 240, opacity: 0.45 },
      { svg: PRISON_BARS, pin: "bottom-right", x: 3, y: 3, size: 200, opacity: 0.42 },
      { svg: LOCK, x: 22, y: 50, size: 100, opacity: 0.65, anim: 0 },
      { svg: LOCK, x: 78, y: 50, size: 110, opacity: 0.7, anim: 1 },
      { svg: LOCK, x: 50, y: 30, size: 130, opacity: 0.75, anim: 2 },
      { svg: LOCK, x: 50, y: 75, size: 90, opacity: 0.6, anim: 3 },
      { svg: CHAIN, x: 30, y: 18, size: 150, opacity: 0.55, rotate: -10, anim: 0 },
      { svg: CHAIN, x: 70, y: 22, size: 170, opacity: 0.6, rotate: 8, anim: 1 },
      { svg: CHAIN, x: 30, y: 88, size: 140, opacity: 0.5, rotate: 15, anim: 2 },
      { svg: CHAIN, x: 70, y: 88, size: 160, opacity: 0.55, rotate: -12, anim: 3 },
    ],
  },

  nike: {
    elements: [
      { svg: NIKE_SWOOSH, x: 22, y: 22, size: 180, opacity: 0.55, rotate: -8, anim: 0 },
      { svg: NIKE_SWOOSH, x: 70, y: 18, size: 220, opacity: 0.6, anim: 1 },
      { svg: NIKE_SWOOSH, x: 40, y: 48, size: 260, opacity: 0.65, rotate: 5, anim: 2 },
      { svg: NIKE_SWOOSH, x: 80, y: 60, size: 200, opacity: 0.58, rotate: -12, anim: 3 },
      { svg: NIKE_SWOOSH, x: 18, y: 70, size: 180, opacity: 0.55, rotate: 8, anim: 0 },
      { svg: NIKE_SWOOSH, x: 60, y: 80, size: 240, opacity: 0.62, anim: 1 },
      { svg: NIKE_SWOOSH, pin: "top-right", x: 3, y: 3, size: 160, opacity: 0.5 },
      { svg: NIKE_SWOOSH, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.55 },
      { svg: SHOE, x: 14, y: 40, size: 130, opacity: 0.6, rotate: -5, anim: 0 },
      { svg: SHOE, x: 86, y: 40, size: 140, opacity: 0.62, rotate: 8, anim: 2 },
      { svg: SHOE, x: 50, y: 85, size: 160, opacity: 0.65, anim: 3 },
    ],
  },

  cacto: {
    gradient: "radial-gradient(ellipse at bottom, rgba(22,163,74,0.18) 0%, transparent 60%)",
    ground: { height: "100px", fill: "linear-gradient(180deg, transparent, rgba(146,64,14,0.40))", opacity: 1 },
    elements: [
      { svg: CACTUS, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.7 },
      { svg: CACTUS, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.72 },
      { svg: CACTUS, x: 30, y: 70, size: 160, opacity: 0.65, anim: 0 },
      { svg: CACTUS, x: 50, y: 75, size: 200, opacity: 0.72, anim: 1 },
      { svg: CACTUS, x: 70, y: 70, size: 170, opacity: 0.68, anim: 2 },
      { svg: CACTUS, x: 18, y: 45, size: 130, opacity: 0.6, anim: 3 },
      { svg: CACTUS, x: 50, y: 40, size: 150, opacity: 0.65, anim: 0 },
      { svg: CACTUS, x: 82, y: 45, size: 140, opacity: 0.62, anim: 1 },
      { svg: CACTUS, x: 35, y: 25, size: 110, opacity: 0.55, anim: 2 },
      { svg: CACTUS, x: 65, y: 22, size: 120, opacity: 0.58, anim: 3 },
      { svg: SUN_HORIZON_INLINE(), x: 50, y: 20, size: 400, opacity: 0.4 },
    ],
  },

  kiwify: {
    gradient: "radial-gradient(ellipse at top, rgba(132,204,22,0.20) 0%, transparent 60%)",
    elements: [
      { svg: KIWI_FRUIT, x: 18, y: 22, size: 100, opacity: 0.7, anim: 0 },
      { svg: KIWI_FRUIT, x: 50, y: 18, size: 130, opacity: 0.75, anim: 1 },
      { svg: KIWI_FRUIT, x: 82, y: 22, size: 110, opacity: 0.72, anim: 2 },
      { svg: KIWI_FRUIT, x: 30, y: 45, size: 120, opacity: 0.72, anim: 3 },
      { svg: KIWI_FRUIT, x: 70, y: 48, size: 130, opacity: 0.75, anim: 0 },
      { svg: KIWI_FRUIT, x: 50, y: 65, size: 150, opacity: 0.8, anim: 1 },
      { svg: KIWI_FRUIT, x: 14, y: 70, size: 95, opacity: 0.65, anim: 2 },
      { svg: KIWI_FRUIT, x: 86, y: 72, size: 105, opacity: 0.7, anim: 3 },
      { svg: KIWI_FRUIT, x: 30, y: 88, size: 110, opacity: 0.7, anim: 0 },
      { svg: KIWI_FRUIT, x: 70, y: 88, size: 120, opacity: 0.72, anim: 1 },
    ],
  },

  canetaazul: {
    gradient: "radial-gradient(circle at center, rgba(30,64,175,0.16) 0%, transparent 60%)",
    elements: [
      ...Array.from({ length: 25 }, (_, i) => ({
        svg: PEN_BLUE,
        x: ((i * 19 + 7) % 95),
        y: ((i * 23 + 6) % 92),
        size: 60 + (i % 4) * 20,
        opacity: 0.55 + (i % 3) * 0.08,
        rotate: i * 31 - 45,
        anim: i % 4,
      })),
    ],
  },

  robin: {
    gradient: "linear-gradient(135deg, rgba(220,38,38,0.10) 0%, rgba(21,128,61,0.10) 100%)",
    elements: [
      { svg: SUPERHERO_ROBIN, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.65 },
      { svg: SUPERHERO_ROBIN, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.68 },
      { svg: SUPERHERO_ROBIN, x: 50, y: 40, size: 180, opacity: 0.6, anim: 0 },
      { svg: SUPERHERO_ROBIN, x: 25, y: 30, size: 130, opacity: 0.5, anim: 1 },
      { svg: SUPERHERO_ROBIN, x: 75, y: 32, size: 140, opacity: 0.55, anim: 2 },
      { svg: SUPERHERO_ROBIN, x: 22, y: 70, size: 120, opacity: 0.5, anim: 3 },
      { svg: SUPERHERO_ROBIN, x: 78, y: 72, size: 130, opacity: 0.55, anim: 0 },
    ],
  },

  southpark: {
    elements: [
      { svg: SP_KID, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.7 },
      { svg: SP_KID, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.72 },
      { svg: SP_KID, x: 30, y: 50, size: 160, opacity: 0.65, anim: 0 },
      { svg: SP_KID, x: 50, y: 40, size: 200, opacity: 0.75, anim: 1 },
      { svg: SP_KID, x: 72, y: 50, size: 170, opacity: 0.68, anim: 2 },
      { svg: SP_KID, x: 18, y: 22, size: 120, opacity: 0.55, anim: 3 },
      { svg: SP_KID, x: 50, y: 18, size: 140, opacity: 0.6, anim: 0 },
      { svg: SP_KID, x: 82, y: 22, size: 130, opacity: 0.58, anim: 1 },
      { svg: SNOWFLAKE, x: 14, y: 50, size: 60, opacity: 0.55, anim: 2 },
      { svg: SNOWFLAKE, x: 86, y: 30, size: 55, opacity: 0.5, anim: 3 },
      { svg: SNOWFLAKE, x: 40, y: 75, size: 65, opacity: 0.6, anim: 0 },
      { svg: SNOWFLAKE, x: 60, y: 78, size: 50, opacity: 0.5, anim: 1 },
    ],
  },

  apenasumshow: {
    gradient: "radial-gradient(circle at 30% 30%, rgba(59,130,246,0.18) 0%, transparent 60%)",
    elements: [
      { svg: BLUEJAY, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.7 },
      { svg: BLUEJAY, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.72 },
      { svg: BLUEJAY, x: 50, y: 50, size: 220, opacity: 0.7, anim: 0 },
      { svg: BLUEJAY, x: 22, y: 30, size: 150, opacity: 0.6, anim: 1 },
      { svg: BLUEJAY, x: 78, y: 30, size: 160, opacity: 0.65, anim: 2 },
      { svg: BLUEJAY, x: 30, y: 80, size: 140, opacity: 0.6, anim: 3 },
      { svg: BLUEJAY, x: 70, y: 82, size: 150, opacity: 0.62, anim: 0 },
      { svg: BLUEJAY, x: 50, y: 22, size: 130, opacity: 0.58, anim: 1 },
    ],
  },

  chaves: {
    gradient: "linear-gradient(135deg, rgba(250,204,21,0.14) 0%, transparent 50%, rgba(124,45,18,0.30) 100%)",
    elements: [
      { svg: BARREL_CHAVES, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.65 },
      { svg: BARREL_CHAVES, pin: "bottom-right", x: 5, y: 5, size: 180, opacity: 0.6 },
      { svg: BARREL_CHAVES, x: 50, y: 60, size: 220, opacity: 0.7, anim: 0 },
      { svg: BARREL_CHAVES, x: 22, y: 50, size: 140, opacity: 0.55, anim: 1 },
      { svg: BARREL_CHAVES, x: 78, y: 50, size: 150, opacity: 0.58, anim: 2 },
      { svg: BARREL_CHAVES, x: 18, y: 22, size: 110, opacity: 0.5, anim: 3 },
      { svg: BARREL_CHAVES, x: 50, y: 18, size: 130, opacity: 0.55, anim: 0 },
      { svg: BARREL_CHAVES, x: 82, y: 22, size: 120, opacity: 0.52, anim: 1 },
      { svg: BARREL_CHAVES, x: 35, y: 88, size: 100, opacity: 0.5, anim: 2 },
      { svg: BARREL_CHAVES, x: 65, y: 88, size: 110, opacity: 0.55, anim: 3 },
    ],
  },

  monica: {
    gradient: "radial-gradient(ellipse at top, rgba(220,38,38,0.18) 0%, transparent 60%)",
    elements: [
      { svg: RABBIT_HEAD, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.7 },
      { svg: RABBIT_HEAD, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.72 },
      { svg: RABBIT_HEAD, x: 50, y: 50, size: 240, opacity: 0.7, anim: 0 },
      { svg: RABBIT_HEAD, x: 22, y: 28, size: 150, opacity: 0.6, anim: 1 },
      { svg: RABBIT_HEAD, x: 78, y: 28, size: 160, opacity: 0.65, anim: 2 },
      { svg: RABBIT_HEAD, x: 22, y: 78, size: 140, opacity: 0.6, anim: 3 },
      { svg: RABBIT_HEAD, x: 78, y: 80, size: 150, opacity: 0.62, anim: 0 },
      { svg: RABBIT_HEAD, x: 50, y: 18, size: 130, opacity: 0.55, anim: 1 },
    ],
  },

  lacasadepapel: {
    gradient: "radial-gradient(ellipse at top, rgba(220,38,38,0.20) 0%, transparent 60%)",
    elements: [
      { svg: JUMPSUIT_RED, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.65 },
      { svg: JUMPSUIT_RED, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.68 },
      { svg: JUMPSUIT_RED, x: 50, y: 55, size: 220, opacity: 0.7, anim: 0 },
      { svg: JUMPSUIT_RED, x: 22, y: 40, size: 140, opacity: 0.55, anim: 1 },
      { svg: JUMPSUIT_RED, x: 78, y: 42, size: 150, opacity: 0.58, anim: 2 },
      { svg: DALI_MASK, x: 18, y: 22, size: 120, opacity: 0.7, anim: 0 },
      { svg: DALI_MASK, x: 50, y: 18, size: 140, opacity: 0.75, anim: 1 },
      { svg: DALI_MASK, x: 82, y: 22, size: 130, opacity: 0.72, anim: 2 },
      { svg: DALI_MASK, x: 30, y: 75, size: 110, opacity: 0.65, anim: 3 },
      { svg: DALI_MASK, x: 70, y: 78, size: 120, opacity: 0.68, anim: 0 },
    ],
  },

  tiopatinhas: {
    gradient: "radial-gradient(ellipse at top, rgba(251,191,36,0.20) 0%, transparent 60%)",
    elements: [
      { svg: SCROOGE_HAT, x: 18, y: 22, size: 130, opacity: 0.7, anim: 0 },
      { svg: SCROOGE_HAT, x: 50, y: 28, size: 180, opacity: 0.75, anim: 1 },
      { svg: SCROOGE_HAT, x: 82, y: 22, size: 140, opacity: 0.72, anim: 2 },
      { svg: SCROOGE_HAT, x: 30, y: 60, size: 120, opacity: 0.6, anim: 3 },
      { svg: SCROOGE_HAT, x: 70, y: 60, size: 130, opacity: 0.62, anim: 0 },
      { svg: VAULT, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.6 },
      { svg: VAULT, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.65 },
      { svg: VAULT, x: 50, y: 78, size: 160, opacity: 0.6, anim: 1 },
      ...Array.from({ length: 8 }, (_, i) => ({
        svg: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="17" fill="#fbbf24" stroke="#92400e" stroke-width="2"/><text x="20" y="27" font-family="serif" font-weight="900" font-size="18" fill="#92400e" text-anchor="middle">$</text></svg>`,
        x: ((i * 13 + 8) % 95),
        y: 40 + (i % 3) * 12,
        size: 40,
        opacity: 0.65,
        anim: i % 4,
      })),
    ],
  },

  monalisa: {
    gradient: "linear-gradient(135deg, rgba(161,98,7,0.18) 0%, rgba(26,15,4,0.50) 100%)",
    elements: [
      { svg: MONA_FRAME, x: 30, y: 35, size: 180, opacity: 0.7, anim: 0 },
      { svg: MONA_FRAME, x: 70, y: 38, size: 200, opacity: 0.75, anim: 1 },
      { svg: MONA_FRAME, x: 22, y: 75, size: 150, opacity: 0.6, anim: 2 },
      { svg: MONA_FRAME, x: 78, y: 78, size: 160, opacity: 0.65, anim: 3 },
      { svg: MONA_FRAME, x: 50, y: 50, size: 220, opacity: 0.75, anim: 0 },
      { svg: PALETTE, x: 14, y: 30, size: 100, opacity: 0.55, anim: 1 },
      { svg: PALETTE, x: 86, y: 30, size: 110, opacity: 0.6, anim: 2 },
      { svg: PALETTE, x: 50, y: 88, size: 120, opacity: 0.6, anim: 3 },
    ],
  },

  suits: {
    gradient: "linear-gradient(180deg, rgba(30,64,175,0.10) 0%, transparent 50%, rgba(0,0,0,0.5) 100%)",
    elements: [
      { svg: BRIEFCASE, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.65 },
      { svg: BRIEFCASE, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.68 },
      { svg: BRIEFCASE, x: 50, y: 60, size: 160, opacity: 0.6, anim: 0 },
      { svg: BRIEFCASE, x: 22, y: 40, size: 130, opacity: 0.55, anim: 1 },
      { svg: BRIEFCASE, x: 78, y: 42, size: 140, opacity: 0.58, anim: 2 },
      { svg: TIE, x: 14, y: 25, size: 80, opacity: 0.65, anim: 0 },
      { svg: TIE, x: 38, y: 22, size: 90, opacity: 0.7, rotate: 5, anim: 1 },
      { svg: TIE, x: 62, y: 25, size: 85, opacity: 0.68, anim: 2 },
      { svg: TIE, x: 86, y: 22, size: 95, opacity: 0.72, rotate: -5, anim: 3 },
      { svg: TIE, x: 30, y: 78, size: 75, opacity: 0.6, anim: 0 },
      { svg: TIE, x: 70, y: 80, size: 80, opacity: 0.62, anim: 1 },
      { svg: SCALE_JUSTICE, x: 50, y: 30, size: 180, opacity: 0.55, anim: 2 },
    ],
  },

  breakingbad: {
    gradient: "radial-gradient(circle at 30% 70%, rgba(6,182,212,0.18) 0%, transparent 60%), linear-gradient(180deg, rgba(250,204,21,0.10) 0%, transparent 50%)",
    elements: [
      { svg: HAZMAT, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.65 },
      { svg: HAZMAT, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.68 },
      { svg: HAZMAT, x: 50, y: 50, size: 180, opacity: 0.62, anim: 0 },
      { svg: HAZMAT, x: 22, y: 35, size: 140, opacity: 0.55, anim: 1 },
      { svg: HAZMAT, x: 78, y: 35, size: 150, opacity: 0.58, anim: 2 },
      { svg: CRYSTAL_BLUE, x: 14, y: 25, size: 80, opacity: 0.7, rotate: -10, anim: 0 },
      { svg: CRYSTAL_BLUE, x: 38, y: 18, size: 90, opacity: 0.72, anim: 1 },
      { svg: CRYSTAL_BLUE, x: 62, y: 22, size: 85, opacity: 0.7, rotate: 8, anim: 2 },
      { svg: CRYSTAL_BLUE, x: 86, y: 18, size: 95, opacity: 0.75, anim: 3 },
      { svg: CRYSTAL_BLUE, x: 50, y: 80, size: 100, opacity: 0.78, anim: 0 },
      { svg: CRYSTAL_BLUE, x: 30, y: 88, size: 80, opacity: 0.7, rotate: 20, anim: 1 },
      { svg: CRYSTAL_BLUE, x: 70, y: 88, size: 90, opacity: 0.72, rotate: -15, anim: 2 },
      { svg: FLASK, x: 14, y: 60, size: 90, opacity: 0.65, anim: 0 },
      { svg: FLASK, x: 86, y: 60, size: 100, opacity: 0.7, anim: 1 },
    ],
  },

  lgbt: {
    gradient: "linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(250,204,21,0.10) 33%, rgba(34,197,94,0.10) 66%, rgba(168,85,247,0.10) 100%)",
    elements: [
      { svg: RAINBOW_FLAG, x: 50, y: 30, size: 360, opacity: 0.55, anim: 0 },
      { svg: RAINBOW_FLAG, x: 22, y: 70, size: 220, opacity: 0.5, anim: 1 },
      { svg: RAINBOW_FLAG, x: 78, y: 75, size: 240, opacity: 0.55, anim: 2 },
      { svg: RAINBOW_FLAG, pin: "top-left", x: 5, y: 5, size: 180, opacity: 0.45 },
      { svg: HEART_RAINBOW, x: 14, y: 30, size: 90, opacity: 0.75, anim: 0 },
      { svg: HEART_RAINBOW, x: 38, y: 22, size: 110, opacity: 0.8, anim: 1 },
      { svg: HEART_RAINBOW, x: 62, y: 25, size: 105, opacity: 0.78, anim: 2 },
      { svg: HEART_RAINBOW, x: 86, y: 22, size: 100, opacity: 0.75, anim: 3 },
      { svg: HEART_RAINBOW, x: 30, y: 55, size: 95, opacity: 0.72, anim: 0 },
      { svg: HEART_RAINBOW, x: 70, y: 55, size: 110, opacity: 0.78, anim: 1 },
      { svg: HEART_RAINBOW, x: 50, y: 80, size: 130, opacity: 0.85, anim: 2 },
      { svg: HEART_RAINBOW, x: 18, y: 88, size: 85, opacity: 0.7, anim: 3 },
      { svg: HEART_RAINBOW, x: 82, y: 88, size: 90, opacity: 0.72, anim: 0 },
    ],
  },

  uber: {
    elements: [
      { svg: UBER_CAR, pin: "bottom-left", x: 5, y: 5, size: 220, opacity: 0.7 },
      { svg: UBER_CAR, pin: "bottom-right", x: 5, y: 5, size: 240, opacity: 0.72 },
      { svg: UBER_CAR, x: 30, y: 50, size: 200, opacity: 0.65, anim: 0 },
      { svg: UBER_CAR, x: 70, y: 30, size: 210, opacity: 0.68, anim: 1 },
      { svg: UBER_CAR, x: 50, y: 75, size: 240, opacity: 0.72, anim: 2 },
      { svg: UBER_CAR, x: 22, y: 22, size: 160, opacity: 0.55, anim: 3 },
      { svg: UBER_CAR, x: 80, y: 60, size: 180, opacity: 0.6, anim: 0 },
    ],
  },

  "99pop": {
    gradient: "linear-gradient(135deg, rgba(250,204,21,0.16) 0%, transparent 50%, rgba(0,0,0,0.5) 100%)",
    elements: [
      { svg: NINETYNINE_CAR, pin: "bottom-left", x: 5, y: 5, size: 240, opacity: 0.72 },
      { svg: NINETYNINE_CAR, pin: "bottom-right", x: 5, y: 5, size: 260, opacity: 0.75 },
      { svg: NINETYNINE_CAR, x: 30, y: 50, size: 220, opacity: 0.68, anim: 0 },
      { svg: NINETYNINE_CAR, x: 70, y: 30, size: 230, opacity: 0.72, anim: 1 },
      { svg: NINETYNINE_CAR, x: 50, y: 75, size: 260, opacity: 0.75, anim: 2 },
      { svg: NINETYNINE_CAR, x: 22, y: 22, size: 170, opacity: 0.58, anim: 3 },
      { svg: NINETYNINE_CAR, x: 80, y: 65, size: 190, opacity: 0.65, anim: 0 },
    ],
  },

  ifood: {
    gradient: "radial-gradient(ellipse at top, rgba(220,38,38,0.20) 0%, transparent 60%)",
    elements: [
      { svg: FOOD_PLATE, pin: "bottom-left", x: 5, y: 5, size: 180, opacity: 0.7 },
      { svg: FOOD_PLATE, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.72 },
      { svg: FOOD_PLATE, x: 50, y: 50, size: 220, opacity: 0.7, anim: 0 },
      { svg: FOOD_PLATE, x: 22, y: 25, size: 150, opacity: 0.62, anim: 1 },
      { svg: FOOD_PLATE, x: 78, y: 28, size: 160, opacity: 0.65, anim: 2 },
      { svg: FOOD_PLATE, x: 22, y: 75, size: 140, opacity: 0.6, anim: 3 },
      { svg: FOOD_PLATE, x: 78, y: 80, size: 150, opacity: 0.62, anim: 0 },
      { svg: FOOD_PLATE, x: 50, y: 22, size: 130, opacity: 0.58, anim: 1 },
      { svg: MOTO, x: 18, y: 55, size: 130, opacity: 0.55, anim: 2 },
      { svg: MOTO, x: 82, y: 55, size: 140, opacity: 0.6, anim: 3 },
    ],
  },

  atacadao: {
    gradient: "linear-gradient(135deg, rgba(220,38,38,0.16) 0%, rgba(250,204,21,0.10) 100%)",
    elements: [
      { svg: SHOPPING_CART, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.7 },
      { svg: SHOPPING_CART, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.72 },
      { svg: SHOPPING_CART, x: 50, y: 50, size: 240, opacity: 0.7, anim: 0 },
      { svg: SHOPPING_CART, x: 22, y: 25, size: 160, opacity: 0.6, anim: 1 },
      { svg: SHOPPING_CART, x: 78, y: 28, size: 170, opacity: 0.62, anim: 2 },
      { svg: SHOPPING_CART, x: 22, y: 75, size: 150, opacity: 0.58, anim: 3 },
      { svg: SHOPPING_CART, x: 78, y: 80, size: 160, opacity: 0.6, anim: 0 },
      { svg: SHOPPING_CART, x: 50, y: 22, size: 140, opacity: 0.55, anim: 1 },
    ],
  },

  motoboy: {
    gradient: "linear-gradient(135deg, rgba(220,38,38,0.12) 0%, transparent 50%, rgba(0,0,0,0.5) 100%)",
    elements: [
      { svg: MOTO, pin: "bottom-left", x: 5, y: 5, size: 220, opacity: 0.7 },
      { svg: MOTO, pin: "bottom-right", x: 5, y: 5, size: 240, opacity: 0.72 },
      { svg: MOTO, x: 50, y: 55, size: 240, opacity: 0.72, anim: 0 },
      { svg: MOTO, x: 22, y: 30, size: 180, opacity: 0.6, anim: 1 },
      { svg: MOTO, x: 78, y: 32, size: 200, opacity: 0.65, anim: 2 },
      { svg: MOTO, x: 22, y: 80, size: 170, opacity: 0.6, anim: 3 },
      { svg: MOTO, x: 78, y: 82, size: 190, opacity: 0.65, anim: 0 },
      { svg: HELMET, x: 14, y: 18, size: 90, opacity: 0.7, anim: 1 },
      { svg: HELMET, x: 50, y: 18, size: 110, opacity: 0.75, anim: 2 },
      { svg: HELMET, x: 86, y: 18, size: 95, opacity: 0.7, anim: 3 },
    ],
  },

  natal: {
    gradient: "radial-gradient(ellipse at top, rgba(254,255,255,0.10) 0%, transparent 60%)",
    elements: [
      { svg: XMAS_TREE, pin: "bottom-left", x: 5, y: 5, size: 220, opacity: 0.7 },
      { svg: XMAS_TREE, pin: "bottom-right", x: 5, y: 5, size: 240, opacity: 0.72 },
      { svg: XMAS_TREE, x: 50, y: 55, size: 260, opacity: 0.75, anim: 0 },
      { svg: XMAS_TREE, x: 22, y: 32, size: 180, opacity: 0.6, anim: 1 },
      { svg: XMAS_TREE, x: 78, y: 32, size: 200, opacity: 0.65, anim: 2 },
      { svg: GIFT_BOX, x: 14, y: 70, size: 110, opacity: 0.7, anim: 3 },
      { svg: GIFT_BOX, x: 38, y: 80, size: 130, opacity: 0.75, anim: 0 },
      { svg: GIFT_BOX, x: 62, y: 80, size: 120, opacity: 0.72, anim: 1 },
      { svg: GIFT_BOX, x: 86, y: 75, size: 115, opacity: 0.7, anim: 2 },
      ...Array.from({ length: 18 }, (_, i) => ({
        svg: SNOWFLAKE,
        x: ((i * 11 + 4) % 95),
        y: ((i * 7 + 8) % 60),
        size: 40 + (i % 3) * 15,
        opacity: 0.55 + (i % 3) * 0.12,
        rotate: i * 17,
        anim: i % 4,
      })),
    ],
  },

  minions: {
    gradient: "radial-gradient(ellipse at top, rgba(250,204,21,0.20) 0%, transparent 60%)",
    elements: [
      { svg: MINION, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.75 },
      { svg: MINION, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.78 },
      { svg: MINION, x: 50, y: 50, size: 240, opacity: 0.78, anim: 0 },
      { svg: MINION, x: 22, y: 30, size: 150, opacity: 0.65, anim: 1 },
      { svg: MINION, x: 78, y: 32, size: 160, opacity: 0.68, anim: 2 },
      { svg: MINION, x: 22, y: 75, size: 140, opacity: 0.62, anim: 3 },
      { svg: MINION, x: 78, y: 78, size: 150, opacity: 0.65, anim: 0 },
      { svg: MINION, x: 50, y: 22, size: 130, opacity: 0.58, anim: 1 },
      { svg: BANANA, x: 14, y: 50, size: 90, opacity: 0.7, rotate: 15, anim: 2 },
      { svg: BANANA, x: 86, y: 50, size: 95, opacity: 0.72, rotate: -10, anim: 3 },
      { svg: BANANA, x: 35, y: 88, size: 80, opacity: 0.65, anim: 0 },
      { svg: BANANA, x: 65, y: 88, size: 85, opacity: 0.7, anim: 1 },
    ],
  },

  vector: {
    gradient: "radial-gradient(circle at center, rgba(249,115,22,0.18) 0%, transparent 60%)",
    elements: [
      { svg: VECTOR_DUDE, pin: "bottom-left", x: 5, y: 5, size: 200, opacity: 0.75 },
      { svg: VECTOR_DUDE, pin: "bottom-right", x: 5, y: 5, size: 220, opacity: 0.78 },
      { svg: VECTOR_DUDE, x: 50, y: 50, size: 240, opacity: 0.78, anim: 0 },
      { svg: VECTOR_DUDE, x: 22, y: 30, size: 150, opacity: 0.65, anim: 1 },
      { svg: VECTOR_DUDE, x: 78, y: 30, size: 160, opacity: 0.68, anim: 2 },
      { svg: VECTOR_DUDE, x: 22, y: 78, size: 140, opacity: 0.62, anim: 3 },
      { svg: VECTOR_DUDE, x: 78, y: 80, size: 150, opacity: 0.65, anim: 0 },
      { svg: VECTOR_DUDE, x: 50, y: 22, size: 130, opacity: 0.58, anim: 1 },
    ],
  },
};

function SUN_HORIZON_INLINE() {
  return `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="35" fill="#fbbf24" opacity="0.6"/></svg>`;
}

/* ============== JOKER ============== */

const JOKER_CARD = `<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="56" height="86" rx="4" fill="#fafafa" stroke="#0a0a0a" stroke-width="2"/>
  <rect x="6" y="6" width="48" height="78" rx="2" fill="none" stroke="#a855f7" stroke-width="1.5"/>
  <text x="10" y="18" font-family="Georgia, serif" font-weight="900" font-size="14" fill="#a855f7">J</text>
  <text x="50" y="80" font-family="Georgia, serif" font-weight="900" font-size="14" fill="#a855f7" text-anchor="end">J</text>
  <g transform="translate(30 45)">
    <ellipse cx="0" cy="0" rx="14" ry="18" fill="#bbf7d0" stroke="#0a0a0a" stroke-width="1.5"/>
    <circle cx="-5" cy="-4" r="2" fill="#0a0a0a"/>
    <circle cx="5" cy="-4" r="2" fill="#0a0a0a"/>
    <path d="M-8 4 Q0 14 8 4 L6 8 L-6 8 Z" fill="#dc2626" stroke="#0a0a0a" stroke-width="1"/>
    <path d="M-4 -14 L-8 -22 L-12 -20 L-6 -10 Z M4 -14 L8 -22 L12 -20 L6 -10 Z" fill="#a855f7" stroke="#0a0a0a" stroke-width="1"/>
    <circle cx="-12" cy="-20" r="2" fill="#22c55e"/>
    <circle cx="12" cy="-20" r="2" fill="#dc2626"/>
  </g>
</svg>`;

const JOKER_SMILE = `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 28 Q40 0 72 28 Q66 50 40 50 Q14 50 8 28 Z" fill="#dc2626" stroke="#0a0a0a" stroke-width="2"/>
  <path d="M16 28 Q40 16 64 28" stroke="#fafafa" stroke-width="2" fill="none"/>
  <g fill="#fafafa" stroke="#0a0a0a" stroke-width="1">
    <rect x="18" y="28" width="4" height="14"/>
    <rect x="26" y="28" width="4" height="16"/>
    <rect x="34" y="30" width="4" height="16"/>
    <rect x="42" y="30" width="4" height="16"/>
    <rect x="50" y="28" width="4" height="16"/>
    <rect x="58" y="28" width="4" height="14"/>
  </g>
</svg>`;

const HAHA_BUBBLE = `<svg viewBox="0 0 80 50" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="40" cy="22" rx="36" ry="20" fill="#22c55e" stroke="#0a0a0a" stroke-width="2.5"/>
  <path d="M16 38 L8 48 L24 40 Z" fill="#22c55e" stroke="#0a0a0a" stroke-width="2.5"/>
  <text x="40" y="30" font-family="Impact, Arial Black" font-weight="900" font-size="20" fill="#0a0a0a" text-anchor="middle">HAHA!</text>
</svg>`;

const QUESTION_MARK = `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg">
  <text x="20" y="48" font-family="Impact, Arial Black" font-weight="900" font-size="56" fill="#22c55e" text-anchor="middle" stroke="#0a0a0a" stroke-width="2">?</text>
</svg>`;

const JOKER_FACE = `<svg viewBox="0 0 70 90" xmlns="http://www.w3.org/2000/svg">
  <path d="M35 6 Q56 10 58 36 Q56 70 35 84 Q14 70 12 36 Q14 10 35 6 Z" fill="#bbf7d0" stroke="#0a0a0a" stroke-width="2"/>
  <g fill="#0a0a0a">
    <ellipse cx="24" cy="36" rx="3" ry="5"/>
    <ellipse cx="46" cy="36" rx="3" ry="5"/>
  </g>
  <path d="M30 28 L20 22 L30 26 Z M40 28 L50 22 L40 26 Z" fill="#0a0a0a"/>
  <path d="M16 56 Q35 78 54 56 L48 64 L42 60 L38 64 L32 60 L28 64 L22 60 Z" fill="#dc2626" stroke="#0a0a0a" stroke-width="1.5"/>
  <path d="M22 60 L48 60" stroke="#fafafa" stroke-width="1.5"/>
  <path d="M14 28 Q4 4 22 8 Q14 14 14 28 Z M56 28 Q66 4 48 8 Q56 14 56 28 Z" fill="#a855f7" stroke="#0a0a0a" stroke-width="1.5"/>
</svg>`;

const GUN_FLAG_BANG = `<svg viewBox="0 0 90 50" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 28 L48 28 L48 22 L60 22 L60 30 L64 30 L64 38 L48 38 L48 32 L30 32 L26 42 L18 42 L18 36 L8 36 Z" fill="#171717" stroke="#525252" stroke-width="1.5"/>
  <path d="M64 22 L88 8 L84 16 L88 14 L82 22 L86 22 L78 30 L82 30 L70 32 Z" fill="#dc2626" stroke="#0a0a0a" stroke-width="1.5"/>
  <text x="76" y="22" font-family="Impact" font-weight="900" font-size="10" fill="#fafafa" text-anchor="middle">BANG</text>
</svg>`;

const PURPLE_SPADE = `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
  <path d="M25 4 Q44 22 44 36 Q44 48 32 48 Q28 48 28 44 L30 56 L20 56 L22 44 Q22 48 18 48 Q6 48 6 36 Q6 22 25 4 Z" fill="#a855f7" stroke="#0a0a0a" stroke-width="1.5"/>
</svg>`;

const CHAOS_STAR = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#22c55e" stroke-width="3" stroke-linecap="round">
    <line x1="25" y1="4" x2="25" y2="46"/>
    <line x1="4" y1="25" x2="46" y2="25"/>
    <line x1="10" y1="10" x2="40" y2="40"/>
    <line x1="40" y1="10" x2="10" y2="40"/>
  </g>
  <circle cx="25" cy="25" r="5" fill="#a855f7" stroke="#0a0a0a" stroke-width="1.5"/>
</svg>`;

SCENES_3.joker = {
  gradient:
    "radial-gradient(ellipse at top, rgba(168,85,247,0.25) 0%, transparent 60%), linear-gradient(180deg, rgba(34,197,94,0.10) 0%, rgba(26,10,46,0.80) 100%)",
  elements: [
    { svg: JOKER_FACE, pin: "bottom-left", x: 5, y: 5, size: 220, opacity: 0.7 },
    { svg: JOKER_FACE, pin: "bottom-right", x: 5, y: 5, size: 240, opacity: 0.72 },
    { svg: JOKER_FACE, x: 50, y: 50, size: 200, opacity: 0.65, anim: 0 },
    { svg: JOKER_FACE, x: 22, y: 30, size: 150, opacity: 0.58, anim: 1 },
    { svg: JOKER_FACE, x: 78, y: 30, size: 160, opacity: 0.6, anim: 2 },
    { svg: JOKER_CARD, x: 14, y: 22, size: 100, opacity: 0.75, rotate: -15, anim: 0 },
    { svg: JOKER_CARD, x: 38, y: 16, size: 110, opacity: 0.78, rotate: 12, anim: 1 },
    { svg: JOKER_CARD, x: 62, y: 18, size: 105, opacity: 0.75, rotate: -8, anim: 2 },
    { svg: JOKER_CARD, x: 86, y: 22, size: 115, opacity: 0.8, rotate: 18, anim: 3 },
    { svg: JOKER_CARD, x: 30, y: 78, size: 95, opacity: 0.7, rotate: 25, anim: 0 },
    { svg: JOKER_CARD, x: 70, y: 80, size: 100, opacity: 0.72, rotate: -20, anim: 1 },
    { svg: HAHA_BUBBLE, x: 18, y: 55, size: 130, opacity: 0.75, rotate: -8, anim: 0 },
    { svg: HAHA_BUBBLE, x: 50, y: 22, size: 150, opacity: 0.8, rotate: 5, anim: 1 },
    { svg: HAHA_BUBBLE, x: 82, y: 55, size: 140, opacity: 0.78, rotate: 10, anim: 2 },
    { svg: HAHA_BUBBLE, x: 50, y: 88, size: 160, opacity: 0.82, anim: 3 },
    { svg: QUESTION_MARK, x: 14, y: 70, size: 60, opacity: 0.75, anim: 0 },
    { svg: QUESTION_MARK, x: 86, y: 70, size: 70, opacity: 0.8, rotate: 15, anim: 1 },
    { svg: QUESTION_MARK, x: 35, y: 38, size: 55, opacity: 0.7, rotate: -10, anim: 2 },
    { svg: QUESTION_MARK, x: 65, y: 38, size: 50, opacity: 0.65, anim: 3 },
    { svg: JOKER_SMILE, x: 22, y: 88, size: 110, opacity: 0.72, anim: 0 },
    { svg: JOKER_SMILE, x: 78, y: 88, size: 120, opacity: 0.75, anim: 1 },
    { svg: GUN_FLAG_BANG, x: 50, y: 65, size: 160, opacity: 0.78, rotate: -5, anim: 2 },
    { svg: PURPLE_SPADE, x: 8, y: 38, size: 60, opacity: 0.7, anim: 0 },
    { svg: PURPLE_SPADE, x: 92, y: 38, size: 65, opacity: 0.72, anim: 1 },
    { svg: CHAOS_STAR, x: 50, y: 12, size: 70, opacity: 0.75, anim: 2 },
    { svg: CHAOS_STAR, x: 14, y: 12, size: 55, opacity: 0.65, anim: 3 },
    { svg: CHAOS_STAR, x: 86, y: 14, size: 60, opacity: 0.68, anim: 0 },
  ],
};
