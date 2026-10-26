"use client";

import { useEffect, useState } from "react";
import { SCENES as NEW_SCENES, type Scene, type SceneElement } from "./theme-scenes";
import { SCENES_3 } from "./theme-scenes-3";
import { SCENES_SPECIAL } from "./theme-scenes-special";

/* ============== Cenas antigas (Mario, Bob, Naruto, etc) ============== */

const MARIO_PIPE = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="20" width="56" height="60" fill="#16a34a" stroke="#052e16" stroke-width="3"/><rect x="0" y="14" width="60" height="14" fill="#22c55e" stroke="#052e16" stroke-width="3"/><rect x="8" y="28" width="6" height="40" fill="#15803d"/><rect x="46" y="28" width="6" height="40" fill="#15803d"/></svg>`;
const MARIO_BLOCK_Q = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="46" height="46" fill="#f59e0b" stroke="#7c2d12" stroke-width="3"/><rect x="6" y="6" width="38" height="38" fill="#fbbf24"/><text x="25" y="36" font-family="monospace" font-weight="900" font-size="32" fill="#7c2d12" text-anchor="middle">?</text></svg>`;
const MARIO_COIN = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="17" fill="#fbbf24" stroke="#92400e" stroke-width="2.5"/><ellipse cx="20" cy="20" rx="8" ry="13" fill="none" stroke="#92400e" stroke-width="2"/><text x="20" y="27" font-family="serif" font-weight="900" font-size="18" fill="#92400e" text-anchor="middle">$</text></svg>`;
const MARIO_MUSHROOM = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><path d="M5 28 Q5 8 25 8 Q45 8 45 28 Z" fill="#ef4444" stroke="#7f1d1d" stroke-width="2.5"/><circle cx="17" cy="20" r="5" fill="#fef3c7" stroke="#7f1d1d" stroke-width="2"/><circle cx="33" cy="18" r="4" fill="#fef3c7" stroke="#7f1d1d" stroke-width="2"/><rect x="14" y="28" width="22" height="18" fill="#fef3c7" stroke="#7f1d1d" stroke-width="2.5"/><circle cx="20" cy="36" r="1.5" fill="#7f1d1d"/><circle cx="30" cy="36" r="1.5" fill="#7f1d1d"/></svg>`;
const MARIO_CLOUD = `<svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg"><path d="M10 28 Q10 18 20 18 Q22 10 32 12 Q36 6 48 10 Q60 8 64 18 Q72 18 72 28 Z" fill="#fff" stroke="#cbd5e1" stroke-width="2"/></svg>`;
const MARIO_BRICK = `<svg viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="30" fill="#b45309" stroke="#451a03" stroke-width="2"/><line x1="0" y1="15" x2="60" y2="15" stroke="#451a03" stroke-width="2"/><line x1="20" y1="0" x2="20" y2="15" stroke="#451a03" stroke-width="2"/><line x1="40" y1="15" x2="40" y2="30" stroke="#451a03" stroke-width="2"/></svg>`;

const BOBESPONJA_BUBBLE = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="17" fill="none" stroke="#67e8f9" stroke-width="2"/><circle cx="20" cy="20" r="17" fill="#22d3ee" opacity="0.18"/><ellipse cx="14" cy="14" rx="4" ry="3" fill="#fff" opacity="0.6"/></svg>`;
const BOBESPONJA_PINEAPPLE = `<svg viewBox="0 0 80 110" xmlns="http://www.w3.org/2000/svg"><path d="M30 8 L40 2 L50 8 L46 22 L34 22 Z" fill="#16a34a" stroke="#052e16" stroke-width="2"/><path d="M22 22 L40 14 L58 22 L60 30 L20 30 Z" fill="#15803d" stroke="#052e16" stroke-width="2"/><ellipse cx="40" cy="68" rx="32" ry="38" fill="#fbbf24" stroke="#78350f" stroke-width="2"/><g stroke="#78350f" stroke-width="1.5" fill="none"><line x1="20" y1="40" x2="60" y2="60"/><line x1="20" y1="60" x2="60" y2="80"/><line x1="20" y1="80" x2="60" y2="100"/><line x1="60" y1="40" x2="20" y2="60"/><line x1="60" y1="60" x2="20" y2="80"/><line x1="60" y1="80" x2="20" y2="100"/></g></svg>`;
const BOBESPONJA_JELLYFISH = `<svg viewBox="0 0 50 70" xmlns="http://www.w3.org/2000/svg"><path d="M5 25 Q5 8 25 8 Q45 8 45 25 L42 32 L38 28 L34 32 L30 28 L26 32 L22 28 L18 32 L14 28 L10 32 L8 32 Z" fill="#f9a8d4" stroke="#831843" stroke-width="1.5"/><path d="M12 32 Q14 50 16 64" stroke="#831843" stroke-width="1.5" fill="none"/><path d="M20 32 Q22 50 20 66" stroke="#831843" stroke-width="1.5" fill="none"/><path d="M28 32 Q30 50 30 65" stroke="#831843" stroke-width="1.5" fill="none"/><path d="M36 32 Q40 50 38 64" stroke="#831843" stroke-width="1.5" fill="none"/></svg>`;
const BOBESPONJA_CORAL = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><path d="M30 58 L30 20 M22 30 L30 30 L22 22 M38 28 L30 28 L38 18 M20 50 L30 50 L18 40 M40 48 L30 48 L42 38" stroke="#fb923c" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;

const NARUTO_LEAF = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><path d="M25 5 Q40 15 38 28 Q35 40 25 42 Q15 40 12 28 Q10 15 25 5 Z" fill="#16a34a" stroke="#052e16" stroke-width="2"/><path d="M25 14 Q33 22 25 38 Q17 22 25 14 Z" fill="#bbf7d0" opacity="0.6"/><path d="M25 5 L25 42" stroke="#052e16" stroke-width="1.5"/></svg>`;
const NARUTO_SWIRL = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="#ea580c" stroke="#7c2d12" stroke-width="2.5"/><path d="M30 8 Q52 30 30 52 Q22 38 30 30 Q38 22 30 8 Z" fill="#fff" opacity="0.85"/><circle cx="30" cy="30" r="4" fill="#7c2d12"/></svg>`;
const NARUTO_KUNAI = `<svg viewBox="0 0 30 80" xmlns="http://www.w3.org/2000/svg"><path d="M15 4 L25 30 L19 30 L19 52 L11 52 L11 30 L5 30 Z" fill="#94a3b8" stroke="#0f172a" stroke-width="1.5"/><rect x="11" y="52" width="8" height="22" fill="#7c2d12" stroke="#0f172a" stroke-width="1.5"/><circle cx="15" cy="76" r="3" fill="none" stroke="#0f172a" stroke-width="1.5"/></svg>`;
const NARUTO_BLOSSOM = `<svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg"><g fill="#fda4af" stroke="#9f1239" stroke-width="0.8"><ellipse cx="15" cy="6" rx="4" ry="6"/><ellipse cx="24" cy="13" rx="6" ry="4"/><ellipse cx="20" cy="24" rx="4" ry="5"/><ellipse cx="10" cy="24" rx="4" ry="5"/><ellipse cx="6" cy="13" rx="6" ry="4"/></g><circle cx="15" cy="15" r="2.5" fill="#fbbf24"/></svg>`;

const VALORANT_HEX = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><polygon points="25,3 45,15 45,35 25,47 5,35 5,15" fill="none" stroke="#ef4444" stroke-width="2"/><polygon points="25,10 38,18 38,32 25,40 12,32 12,18" fill="#ef4444" opacity="0.2"/></svg>`;
const VALORANT_CROSSHAIR = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="none" stroke="#fff" stroke-width="1.5"/><line x1="30" y1="2" x2="30" y2="14" stroke="#fff" stroke-width="2"/><line x1="30" y1="46" x2="30" y2="58" stroke="#fff" stroke-width="2"/><line x1="2" y1="30" x2="14" y2="30" stroke="#fff" stroke-width="2"/><line x1="46" y1="30" x2="58" y2="30" stroke="#fff" stroke-width="2"/><circle cx="30" cy="30" r="3" fill="#ef4444"/></svg>`;
const VALORANT_SHELL = `<svg viewBox="0 0 20 60" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="10" width="14" height="44" fill="#eab308" stroke="#713f12" stroke-width="1.5"/><ellipse cx="10" cy="10" rx="7" ry="3" fill="#a16207"/><ellipse cx="10" cy="54" rx="7" ry="3" fill="#713f12"/></svg>`;

const FORTNITE_LLAMA = `<svg viewBox="0 0 70 80" xmlns="http://www.w3.org/2000/svg"><rect x="15" y="20" width="40" height="50" rx="4" fill="#a855f7" stroke="#581c87" stroke-width="2.5"/><rect x="22" y="6" width="26" height="22" rx="3" fill="#a855f7" stroke="#581c87" stroke-width="2.5"/><rect x="24" y="0" width="6" height="10" fill="#a855f7" stroke="#581c87" stroke-width="2"/><rect x="40" y="0" width="6" height="10" fill="#a855f7" stroke="#581c87" stroke-width="2"/><circle cx="28" cy="16" r="2" fill="#fff"/><circle cx="42" cy="16" r="2" fill="#fff"/><circle cx="28" cy="16" r="1" fill="#000"/><circle cx="42" cy="16" r="1" fill="#000"/><path d="M30 22 L40 22 L35 26 Z" fill="#fbbf24"/><rect x="20" y="70" width="6" height="10" fill="#581c87"/><rect x="44" y="70" width="6" height="10" fill="#581c87"/></svg>`;
const FORTNITE_VBUCK = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><circle cx="25" cy="25" r="22" fill="#3b82f6" stroke="#1e3a8a" stroke-width="2.5"/><circle cx="25" cy="25" r="16" fill="none" stroke="#1e3a8a" stroke-width="1.5"/><text x="25" y="33" font-family="Arial Black, sans-serif" font-weight="900" font-size="22" fill="#fff" text-anchor="middle">V</text></svg>`;
const FORTNITE_PICKAXE = `<svg viewBox="0 0 50 80" xmlns="http://www.w3.org/2000/svg"><path d="M25 6 L42 22 L34 30 L26 22 L18 30 L10 22 L25 6 Z" fill="#a3a3a3" stroke="#171717" stroke-width="2"/><rect x="22" y="22" width="6" height="56" fill="#92400e" stroke="#451a03" stroke-width="1.5"/></svg>`;

const SIMPSONS_DONUT = `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="26" fill="#f59e0b"/><circle cx="30" cy="30" r="9" fill="transparent" stroke="#92400e" stroke-width="2"/><path d="M5 18 Q8 12 18 14 Q26 8 34 12 Q44 6 52 16 Q58 22 54 30 Q58 38 50 44 Q52 52 42 50 Q34 54 26 50 Q18 54 12 48 Q4 44 6 36 Q2 28 5 18 Z" fill="#ec4899" stroke="#831843" stroke-width="1.5"/><circle cx="30" cy="30" r="11" fill="#f59e0b"/><circle cx="14" cy="22" r="1.5" fill="#fbbf24"/><circle cx="44" cy="20" r="1.5" fill="#22c55e"/><circle cx="48" cy="36" r="1.5" fill="#3b82f6"/><circle cx="18" cy="42" r="1.5" fill="#ef4444"/><circle cx="38" cy="44" r="1.5" fill="#fff"/></svg>`;
const SIMPSONS_TV = `<svg viewBox="0 0 80 70" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="72" height="50" rx="6" fill="#9ca3af" stroke="#1f2937" stroke-width="2.5"/><rect x="10" y="10" width="60" height="38" fill="#1e293b"/><rect x="14" y="14" width="52" height="30" fill="#fbbf24" opacity="0.4"/><circle cx="34" cy="60" r="3" fill="#1f2937"/><circle cx="46" cy="60" r="3" fill="#1f2937"/><line x1="20" y1="64" x2="60" y2="64" stroke="#1f2937" stroke-width="2"/></svg>`;

const STEVEN_GEM_PINK = `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg"><path d="M25 4 L42 18 L42 42 L25 56 L8 42 L8 18 Z" fill="#ec4899" stroke="#831843" stroke-width="2"/><path d="M25 4 L42 18 L25 30 L8 18 Z" fill="#f9a8d4" opacity="0.7"/><path d="M25 30 L42 18 L42 42 Z" fill="#fff" opacity="0.25"/></svg>`;
const STEVEN_GEM_BLUE = `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg"><path d="M25 4 L42 30 L25 56 L8 30 Z" fill="#3b82f6" stroke="#1e3a8a" stroke-width="2"/><path d="M25 4 L42 30 L25 30 Z" fill="#93c5fd" opacity="0.7"/><path d="M25 30 L42 30 L25 56 Z" fill="#fff" opacity="0.2"/></svg>`;
const STEVEN_STAR = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><path d="M25 2 L31 18 L48 18 L34 28 L40 45 L25 35 L10 45 L16 28 L2 18 L19 18 Z" fill="#fbbf24" stroke="#78350f" stroke-width="2"/></svg>`;

const FREEFIRE_PARACHUTE = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><path d="M6 40 Q6 12 40 12 Q74 12 74 40 L66 40 L58 36 L50 40 L42 36 L34 40 L26 36 L18 40 L10 36 Z" fill="#ef4444" stroke="#7f1d1d" stroke-width="2"/><line x1="10" y1="40" x2="34" y2="62" stroke="#1f2937" stroke-width="1.5"/><line x1="26" y1="40" x2="34" y2="62" stroke="#1f2937" stroke-width="1.5"/><line x1="42" y1="40" x2="44" y2="62" stroke="#1f2937" stroke-width="1.5"/><line x1="58" y1="40" x2="44" y2="62" stroke="#1f2937" stroke-width="1.5"/><line x1="74" y1="40" x2="44" y2="62" stroke="#1f2937" stroke-width="1.5"/><rect x="32" y="62" width="14" height="12" fill="#374151" stroke="#0f172a" stroke-width="1.5"/></svg>`;
const FREEFIRE_FLAME = `<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg"><path d="M20 4 Q30 18 28 30 Q34 26 32 38 Q36 40 32 50 Q26 58 20 58 Q14 58 8 50 Q4 40 8 38 Q6 26 12 30 Q10 18 20 4 Z" fill="#f97316" stroke="#7c2d12" stroke-width="1.5"/><path d="M20 18 Q26 28 24 38 Q22 48 20 50 Q18 48 16 38 Q14 28 20 18 Z" fill="#fbbf24" opacity="0.8"/></svg>`;
const FREEFIRE_CRATE = `<svg viewBox="0 0 70 60" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="14" width="58" height="42" fill="#92400e" stroke="#451a03" stroke-width="2.5"/><rect x="6" y="14" width="58" height="10" fill="#b45309" stroke="#451a03" stroke-width="2.5"/><rect x="32" y="14" width="6" height="42" fill="#451a03"/><rect x="6" y="32" width="58" height="3" fill="#451a03"/><circle cx="35" cy="22" r="2" fill="#fbbf24"/></svg>`;

/* ============ SCENES antigas ============ */
const LEGACY_SCENES: Record<string, Scene> = {
  mariobros: {
    gradient: "linear-gradient(180deg, rgba(99,102,241,0.10) 0%, transparent 50%)",
    ground: {
      height: "120px",
      fill: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='30' viewBox='0 0 60 30'><rect width='60' height='30' fill='%23b45309'/><line x1='0' y1='15' x2='60' y2='15' stroke='%23451a03' stroke-width='2'/><line x1='20' y1='0' x2='20' y2='15' stroke='%23451a03' stroke-width='2'/><line x1='40' y1='15' x2='40' y2='30' stroke='%23451a03' stroke-width='2'/></svg>") repeat`,
      opacity: 0.18,
    },
    elements: [
      { svg: MARIO_CLOUD, x: 10, y: 14, size: 110, opacity: 0.22, anim: 0 },
      { svg: MARIO_CLOUD, x: 78, y: 8, size: 90, opacity: 0.2, anim: 1 },
      { svg: MARIO_CLOUD, x: 45, y: 22, size: 100, opacity: 0.18, anim: 2 },
      { svg: MARIO_CLOUD, x: 92, y: 32, size: 85, opacity: 0.16, anim: 3 },
      { svg: MARIO_PIPE, pin: "bottom-left", x: 5, y: 5, size: 120, opacity: 0.22 },
      { svg: MARIO_PIPE, pin: "bottom-right", x: 5, y: 5, size: 140, opacity: 0.24 },
      { svg: MARIO_BLOCK_Q, x: 22, y: 55, size: 60, opacity: 0.28, rotate: -4, anim: 0 },
      { svg: MARIO_BLOCK_Q, x: 70, y: 50, size: 70, opacity: 0.3, rotate: 6, anim: 1 },
      { svg: MARIO_BLOCK_Q, x: 88, y: 70, size: 55, opacity: 0.24, rotate: -3, anim: 2 },
      { svg: MARIO_COIN, x: 30, y: 35, size: 32, opacity: 0.4, anim: 0 },
      { svg: MARIO_COIN, x: 55, y: 65, size: 28, opacity: 0.36, anim: 1 },
      { svg: MARIO_COIN, x: 82, y: 38, size: 30, opacity: 0.38, anim: 2 },
      { svg: MARIO_COIN, x: 15, y: 70, size: 26, opacity: 0.32, anim: 3 },
      { svg: MARIO_MUSHROOM, x: 38, y: 80, size: 55, opacity: 0.3, anim: 0 },
      { svg: MARIO_MUSHROOM, x: 65, y: 82, size: 48, opacity: 0.28, anim: 2 },
      { svg: MARIO_BRICK, x: 18, y: 42, size: 70, opacity: 0.22, anim: 1 },
      { svg: MARIO_BRICK, x: 50, y: 78, size: 80, opacity: 0.2, anim: 3 },
    ],
  },

  bobesponja: {
    gradient: "radial-gradient(ellipse at top, rgba(34,211,238,0.16) 0%, transparent 60%)",
    ground: {
      height: "100px",
      fill: "linear-gradient(180deg, transparent 0%, rgba(254,215,170,0.25) 60%, rgba(254,215,170,0.45) 100%)",
      opacity: 1,
    },
    elements: [
      { svg: BOBESPONJA_BUBBLE, x: 10, y: 80, size: 40, opacity: 0.5, anim: 0 },
      { svg: BOBESPONJA_BUBBLE, x: 18, y: 55, size: 26, opacity: 0.45, anim: 1 },
      { svg: BOBESPONJA_BUBBLE, x: 28, y: 75, size: 34, opacity: 0.48, anim: 2 },
      { svg: BOBESPONJA_BUBBLE, x: 38, y: 40, size: 22, opacity: 0.4, anim: 3 },
      { svg: BOBESPONJA_BUBBLE, x: 52, y: 65, size: 30, opacity: 0.5, anim: 0 },
      { svg: BOBESPONJA_BUBBLE, x: 62, y: 30, size: 38, opacity: 0.42, anim: 1 },
      { svg: BOBESPONJA_BUBBLE, x: 72, y: 78, size: 28, opacity: 0.46, anim: 2 },
      { svg: BOBESPONJA_BUBBLE, x: 82, y: 50, size: 36, opacity: 0.44, anim: 3 },
      { svg: BOBESPONJA_BUBBLE, x: 90, y: 70, size: 24, opacity: 0.4, anim: 0 },
      { svg: BOBESPONJA_BUBBLE, x: 5, y: 25, size: 32, opacity: 0.36, anim: 1 },
      { svg: BOBESPONJA_PINEAPPLE, pin: "bottom-right", x: 5, y: 5, size: 200, opacity: 0.28 },
      { svg: BOBESPONJA_JELLYFISH, x: 25, y: 30, size: 70, opacity: 0.35, anim: 0 },
      { svg: BOBESPONJA_JELLYFISH, x: 78, y: 22, size: 60, opacity: 0.32, anim: 2 },
      { svg: BOBESPONJA_CORAL, pin: "bottom-left", x: 5, y: 5, size: 110, opacity: 0.35 },
      { svg: BOBESPONJA_CORAL, x: 50, y: 92, size: 80, opacity: 0.3 },
    ],
  },

  naruto: {
    gradient: "radial-gradient(circle at 20% 80%, rgba(234,88,12,0.10) 0%, transparent 50%)",
    elements: [
      { svg: NARUTO_SWIRL, pin: "top-right", x: 3, y: 3, size: 140, opacity: 0.18 },
      { svg: NARUTO_SWIRL, x: 22, y: 78, size: 90, opacity: 0.16, anim: 0 },
      { svg: NARUTO_LEAF, x: 12, y: 25, size: 50, opacity: 0.4, rotate: 20, anim: 0 },
      { svg: NARUTO_LEAF, x: 45, y: 18, size: 60, opacity: 0.42, rotate: -15, anim: 1 },
      { svg: NARUTO_LEAF, x: 72, y: 35, size: 45, opacity: 0.36, rotate: 30, anim: 2 },
      { svg: NARUTO_LEAF, x: 88, y: 65, size: 55, opacity: 0.4, rotate: -25, anim: 3 },
      { svg: NARUTO_LEAF, x: 30, y: 60, size: 42, opacity: 0.35, rotate: 45, anim: 0 },
      { svg: NARUTO_LEAF, x: 58, y: 75, size: 48, opacity: 0.38, rotate: -40, anim: 1 },
      { svg: NARUTO_KUNAI, x: 38, y: 40, size: 70, opacity: 0.28, rotate: 25, anim: 2 },
      { svg: NARUTO_KUNAI, x: 80, y: 25, size: 60, opacity: 0.26, rotate: -20, anim: 3 },
      { svg: NARUTO_BLOSSOM, x: 15, y: 55, size: 28, opacity: 0.5, anim: 0 },
      { svg: NARUTO_BLOSSOM, x: 55, y: 32, size: 24, opacity: 0.45, anim: 1 },
      { svg: NARUTO_BLOSSOM, x: 92, y: 18, size: 26, opacity: 0.48, anim: 2 },
      { svg: NARUTO_BLOSSOM, x: 8, y: 88, size: 22, opacity: 0.4, anim: 3 },
      { svg: NARUTO_BLOSSOM, x: 68, y: 55, size: 28, opacity: 0.46, anim: 0 },
      { svg: NARUTO_BLOSSOM, x: 42, y: 88, size: 20, opacity: 0.42, anim: 1 },
    ],
  },

  valorant: {
    gradient: "linear-gradient(135deg, rgba(239,68,68,0.10) 0%, transparent 50%, rgba(15,23,42,0.20) 100%)",
    elements: [
      { svg: VALORANT_HEX, x: 10, y: 15, size: 80, opacity: 0.25, anim: 0 },
      { svg: VALORANT_HEX, x: 18, y: 35, size: 70, opacity: 0.22, rotate: 30, anim: 1 },
      { svg: VALORANT_HEX, x: 88, y: 22, size: 90, opacity: 0.28, anim: 2 },
      { svg: VALORANT_HEX, x: 82, y: 70, size: 75, opacity: 0.24, rotate: 15, anim: 3 },
      { svg: VALORANT_HEX, x: 50, y: 88, size: 65, opacity: 0.22, anim: 0 },
      { svg: VALORANT_HEX, x: 35, y: 65, size: 60, opacity: 0.2, anim: 1 },
      { svg: VALORANT_CROSSHAIR, x: 50, y: 30, size: 100, opacity: 0.18, anim: 0 },
      { svg: VALORANT_CROSSHAIR, x: 72, y: 55, size: 70, opacity: 0.2, anim: 2 },
      { svg: VALORANT_SHELL, x: 25, y: 80, size: 50, opacity: 0.3, rotate: 35, anim: 1 },
      { svg: VALORANT_SHELL, x: 45, y: 55, size: 42, opacity: 0.28, rotate: -45, anim: 3 },
      { svg: VALORANT_SHELL, x: 62, y: 25, size: 46, opacity: 0.26, rotate: 60, anim: 0 },
      { svg: VALORANT_SHELL, x: 90, y: 88, size: 38, opacity: 0.24, rotate: -30, anim: 2 },
    ],
  },

  fortnite: {
    gradient: "radial-gradient(circle at 70% 30%, rgba(168,85,247,0.14) 0%, transparent 55%)",
    elements: [
      { svg: FORTNITE_LLAMA, pin: "bottom-right", x: 5, y: 5, size: 180, opacity: 0.28 },
      { svg: FORTNITE_LLAMA, x: 20, y: 75, size: 90, opacity: 0.22, anim: 0 },
      { svg: FORTNITE_VBUCK, x: 30, y: 20, size: 50, opacity: 0.4, anim: 0 },
      { svg: FORTNITE_VBUCK, x: 65, y: 15, size: 60, opacity: 0.42, anim: 1 },
      { svg: FORTNITE_VBUCK, x: 50, y: 50, size: 45, opacity: 0.36, anim: 2 },
      { svg: FORTNITE_VBUCK, x: 12, y: 50, size: 40, opacity: 0.34, anim: 3 },
      { svg: FORTNITE_VBUCK, x: 85, y: 60, size: 48, opacity: 0.38, anim: 0 },
      { svg: FORTNITE_VBUCK, x: 42, y: 80, size: 36, opacity: 0.32, anim: 1 },
      { svg: FORTNITE_PICKAXE, x: 25, y: 40, size: 80, opacity: 0.25, rotate: -20, anim: 2 },
      { svg: FORTNITE_PICKAXE, x: 78, y: 38, size: 90, opacity: 0.28, rotate: 25, anim: 3 },
    ],
  },

  simpsons: {
    gradient: "linear-gradient(180deg, rgba(251,191,36,0.14) 0%, rgba(251,191,36,0.04) 50%, transparent 100%)",
    elements: [
      { svg: SIMPSONS_DONUT, x: 15, y: 20, size: 70, opacity: 0.4, anim: 0 },
      { svg: SIMPSONS_DONUT, x: 38, y: 38, size: 90, opacity: 0.42, rotate: 15, anim: 1 },
      { svg: SIMPSONS_DONUT, x: 65, y: 18, size: 80, opacity: 0.4, rotate: -10, anim: 2 },
      { svg: SIMPSONS_DONUT, x: 85, y: 45, size: 65, opacity: 0.38, anim: 3 },
      { svg: SIMPSONS_DONUT, x: 25, y: 65, size: 75, opacity: 0.4, rotate: 25, anim: 0 },
      { svg: SIMPSONS_DONUT, x: 55, y: 72, size: 60, opacity: 0.36, rotate: -20, anim: 1 },
      { svg: SIMPSONS_DONUT, x: 80, y: 80, size: 85, opacity: 0.42, anim: 2 },
      { svg: SIMPSONS_DONUT, x: 8, y: 88, size: 55, opacity: 0.34, anim: 3 },
      { svg: SIMPSONS_TV, x: 48, y: 88, size: 110, opacity: 0.2, anim: 0 },
      { svg: SIMPSONS_TV, x: 92, y: 70, size: 80, opacity: 0.18, anim: 2 },
    ],
  },

  steven: {
    gradient: "radial-gradient(ellipse at 30% 30%, rgba(236,72,153,0.14) 0%, transparent 50%), radial-gradient(ellipse at 70% 70%, rgba(59,130,246,0.12) 0%, transparent 50%)",
    elements: [
      { svg: STEVEN_GEM_PINK, x: 18, y: 22, size: 70, opacity: 0.4, anim: 0 },
      { svg: STEVEN_GEM_PINK, x: 70, y: 55, size: 80, opacity: 0.42, rotate: -10, anim: 1 },
      { svg: STEVEN_GEM_PINK, x: 35, y: 75, size: 60, opacity: 0.36, rotate: 15, anim: 2 },
      { svg: STEVEN_GEM_BLUE, x: 60, y: 25, size: 75, opacity: 0.4, anim: 1 },
      { svg: STEVEN_GEM_BLUE, x: 12, y: 65, size: 65, opacity: 0.36, rotate: 10, anim: 3 },
      { svg: STEVEN_GEM_BLUE, x: 88, y: 80, size: 55, opacity: 0.34, anim: 0 },
      { svg: STEVEN_STAR, x: 45, y: 18, size: 50, opacity: 0.42, anim: 0 },
      { svg: STEVEN_STAR, x: 82, y: 38, size: 60, opacity: 0.4, rotate: 20, anim: 2 },
      { svg: STEVEN_STAR, x: 25, y: 50, size: 40, opacity: 0.35, anim: 3 },
      { svg: STEVEN_STAR, x: 92, y: 18, size: 35, opacity: 0.32, anim: 1 },
      { svg: STEVEN_STAR, x: 8, y: 38, size: 45, opacity: 0.38, rotate: -15, anim: 2 },
      { svg: STEVEN_STAR, x: 52, y: 88, size: 38, opacity: 0.34, anim: 0 },
    ],
  },

  freefire: {
    gradient: "radial-gradient(circle at 50% 100%, rgba(249,115,22,0.16) 0%, transparent 60%)",
    elements: [
      { svg: FREEFIRE_PARACHUTE, x: 18, y: 18, size: 100, opacity: 0.3, anim: 0 },
      { svg: FREEFIRE_PARACHUTE, x: 72, y: 12, size: 110, opacity: 0.32, rotate: -5, anim: 2 },
      { svg: FREEFIRE_PARACHUTE, x: 48, y: 30, size: 80, opacity: 0.26, anim: 1 },
      { svg: FREEFIRE_FLAME, x: 25, y: 65, size: 60, opacity: 0.4, anim: 0 },
      { svg: FREEFIRE_FLAME, x: 60, y: 70, size: 70, opacity: 0.42, anim: 1 },
      { svg: FREEFIRE_FLAME, x: 85, y: 55, size: 55, opacity: 0.38, anim: 2 },
      { svg: FREEFIRE_FLAME, x: 10, y: 80, size: 65, opacity: 0.4, anim: 3 },
      { svg: FREEFIRE_FLAME, x: 42, y: 88, size: 50, opacity: 0.36, anim: 0 },
      { svg: FREEFIRE_CRATE, pin: "bottom-left", x: 5, y: 5, size: 130, opacity: 0.3 },
      { svg: FREEFIRE_CRATE, x: 78, y: 88, size: 100, opacity: 0.28, rotate: 8 },
    ],
  },
};

/** Merge: legacy → pack #2 → pack #3 → especiais (mais recente vence). */
const SCENES: Record<string, Scene> = {
  ...LEGACY_SCENES,
  ...NEW_SCENES,
  ...SCENES_3,
  ...SCENES_SPECIAL,
};

/* ============== Component ============== */

/**
 * Cap de elementos animados por scene — perf protection.
 * Antes (jun/2026) scenes pesadas tinham 8-15 svgs com animation infinite
 * cada, em fixed inset-0 zIndex 0. Em PCs medianos isso travava 60fps.
 * Agora limita a 5 elementos animados; o resto vira estatico (sem animation).
 */
const MAX_ANIMATED = 5;

export function ThemeIcons() {
  const [theme, setTheme] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    function update() {
      const wrapper = document.querySelector<HTMLElement>("[data-theme]");
      setTheme(wrapper?.getAttribute("data-theme") ?? null);
    }
    update();
    const wrapper = document.querySelector<HTMLElement>("[data-theme]");
    if (!wrapper) return;
    const obs = new MutationObserver(update);
    obs.observe(wrapper, { attributes: true, attributeFilter: ["data-theme"] });

    // Respeita prefers-reduced-motion: sistema sinaliza que user nao quer
    // animacao (acessibilidade ou perf-constrained). Pular animacoes
    // economiza GPU/CPU em PCs fracos.
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq) {
      setReducedMotion(mq.matches);
      const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mq.addEventListener?.("change", onChange);
      return () => {
        obs.disconnect();
        mq.removeEventListener?.("change", onChange);
      };
    }
    return () => obs.disconnect();
  }, []);

  const scene = theme ? SCENES[theme] : null;
  if (!scene) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{
        zIndex: 0,
        opacity: 0.55,
        // contain isola layout/paint deste subtree — mudanças nele nao
        // forcam reflow no resto da pagina. Crucial pra animacoes infinitas.
        contain: "layout paint style",
      }}
    >
      {scene.gradient && (
        <div
          className="absolute inset-0"
          style={{ background: scene.gradient, mixBlendMode: "screen" }}
        />
      )}

      {scene.ground && (
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: scene.ground.height,
            background: scene.ground.fill,
            opacity: scene.ground.opacity ?? 0.12,
          }}
        />
      )}

      {(() => {
        // Cap de animados por scene + ordem-estavel pra reducao deterministica.
        // Elementos sem `anim` (background/decor estaticos) ficam sempre.
        // Elementos com `anim` ficam ate MAX_ANIMATED; resto vira estatico.
        let animatedSoFar = 0;
        return scene.elements.map((el: SceneElement, i: number) => {
          const pinStyle: React.CSSProperties = {};
          if (el.pin === "bottom-left") {
            pinStyle.left = "2%";
            pinStyle.bottom = "5%";
          } else if (el.pin === "bottom-right") {
            pinStyle.right = "2%";
            pinStyle.bottom = "5%";
          } else if (el.pin === "bottom") {
            pinStyle.left = `${el.x}%`;
            pinStyle.bottom = `${el.y}%`;
            pinStyle.transform = "translateX(-50%)";
          } else if (el.pin === "top-right") {
            pinStyle.right = "3%";
            pinStyle.top = "3%";
          } else if (el.pin === "top-left") {
            pinStyle.left = "3%";
            pinStyle.top = "3%";
          } else {
            pinStyle.left = `${el.x}%`;
            pinStyle.top = `${el.y}%`;
            pinStyle.transform = `translate(-50%, -50%) rotate(${el.rotate ?? 0}deg)`;
          }
          const wantsAnim = el.anim !== undefined && !reducedMotion;
          const canAnim = wantsAnim && animatedSoFar < MAX_ANIMATED;
          if (canAnim) animatedSoFar++;
          return (
            <div
              key={i}
              className="absolute"
              style={{
                ...pinStyle,
                width: `${el.size}px`,
                height: `${el.size}px`,
                opacity: el.opacity,
                animation: canAnim
                  ? `bp-float-${(el.anim ?? 0) % 4} ${10 + (i % 5)}s ease-in-out infinite`
                  : undefined,
                animationDelay: canAnim ? `${i * 0.4}s` : undefined,
                // willChange + transform3d forcam GPU acceleration; sem isso
                // o browser anima na CPU e mata fps em laptops sem GPU.
                willChange: canAnim ? "transform" : undefined,
              }}
              dangerouslySetInnerHTML={{ __html: el.svg }}
            />
          );
        });
      })()}

      {/* Keyframes usam translate3d pra forcar GPU compositing layer.
          `translate:` (CSS property) tambem funciona em browsers modernos
          mas translate3d garante GPU layer em browsers velhos tambem. */}
      <style>{`
        @keyframes bp-float-0 {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -14px, 0); }
        }
        @keyframes bp-float-1 {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(-8px, -10px, 0); }
        }
        @keyframes bp-float-2 {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(8px, -18px, 0); }
        }
        @keyframes bp-float-3 {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(-4px, -8px, 0); }
        }
      `}</style>
    </div>
  );
}
