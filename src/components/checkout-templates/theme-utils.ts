/**
 * Utilitários compartilhados entre todos os templates pra respeitar
 * as cores configuradas no builder.
 *
 * Antes desta lib, cada template tinha cores hardcoded (bg-white,
 * text-zinc-700, etc) — mudanças no builder não refletiam. Agora todos
 * usam essas helpers e inline styles.
 */

import type { TemplateProps } from "./types";

export type ThemeColors = {
  bg: string;
  card: string;
  text: string;
  subtle: string; // texto secundário (60% opacity)
  border: string; // border sutil (10% opacity)
  primary: string;
  accent: string;
  ctaBg: string;
  ctaColor: string;
};

/**
 * Extrai todas as cores do tema com fallbacks razoáveis.
 * Use no top de cada template:
 *
 *   const c = themeColors(p);
 *   <div style={{ background: c.bg, color: c.text }}>...
 */
export function themeColors(p: TemplateProps): ThemeColors {
  const text = p.textColor || "#18181b";
  return {
    bg: p.bgColor || "#f5f5f5",
    card: p.cardColor || "#ffffff",
    text,
    subtle: withOpacity(text, 0.6),
    border: withOpacity(text, 0.1),
    primary: p.primaryColor || p.ctaBg || "#22d3ee",
    accent: p.accentColor || p.primaryColor || p.ctaBg || "#22c55e",
    ctaBg: p.ctaBg || "#22d3ee",
    ctaColor: p.ctaColor || "#000000",
  };
}

/**
 * Mistura cor hex com alpha (cria rgba). Aceita #rgb, #rrggbb, ou
 * retorna o input se não bater o formato.
 */
export function withOpacity(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
