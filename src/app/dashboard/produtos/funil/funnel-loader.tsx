"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/** Resultado do teste A/B de upsell de uma oferta (origem). */
export type OfferAbResult = {
  variants: { label: string; sent: number; converted: number; rate: number }[];
  winner: string | null; // rótulo vencedor, ou null (sem amostra suficiente)
  totalSent: number;
  totalConverted: number;
};

/** Uma OFERTA = um checkout específico (slug próprio, preço próprio). */
export type FunnelOffer = {
  id: string; // checkout id
  slug: string;
  priceCents: number;
  productId: string;
  productName: string;
  productImage: string | null;
  checkoutType: string;
  /** Métricas (opcionais) — vendas pagas e receita desta oferta. */
  sales?: number;
  revenueCents?: number;
  /** Resultado do teste A/B de upsell desta oferta (se houver). */
  ab?: OfferAbResult;
  /** Aceite do upsell ÚNICO (não-A/B): enviados, convertidos e taxa. */
  upsellAcceptance?: { sent: number; converted: number; rate: number };
  /** Quantidade de order bumps configurados neste checkout. */
  bumps?: number;
};

export type FunnelLoaderProps = {
  funnelId: string;
  name: string;
  backHref: string;
  active: boolean;
  offers: FunnelOffer[];
  sellerDomain: string | null;
  initialGraph: Record<string, unknown> | null;
};

/**
 * React Flow precisa de window/medições → carregado client-only (ssr:false).
 * Esse loader (client) faz o dynamic import — não dá pra usar ssr:false
 * direto num server component no App Router.
 */
const FunnelBoard = dynamic(
  () => import("./funnel-board").then((m) => m.FunnelBoard),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="size-4 animate-spin" />
          Carregando canvas…
        </div>
      </div>
    ),
  },
);

export function FunnelLoader(props: FunnelLoaderProps) {
  return <FunnelBoard {...props} />;
}
