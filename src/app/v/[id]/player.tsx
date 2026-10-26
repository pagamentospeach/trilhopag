"use client";

/**
 * Re-export do BturbPlayer pra uso público em /v/[id].
 * Lógica fica em src/components/bturb-player.tsx (compartilhada com o
 * preview do dashboard).
 */
export {
  BturbPlayer,
  type BturbPlayerVideo,
} from "@/components/bturb-player";
