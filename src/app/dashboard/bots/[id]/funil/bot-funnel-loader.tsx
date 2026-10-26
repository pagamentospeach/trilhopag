"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

export type BotFunnelProduct = {
  id: string;
  name: string;
  image: string | null;
  priceCents: number;
};

/**
 * Checkout ativo do seller — usado pelo bloco `payment` (21/07/2026, davi:
 * "ta faltando um blg importante! Pagamentos via o bot do telegram, um bloco
 * de pagamento, sabe? ligacao de pagamento"). O bloco payment usa CHECKOUT
 * (não produto direto) pra respeitar order bump/upsell/A-B configurados no
 * checkout, e pra permitir mandar link do checkout web (não só PIX).
 */
export type BotFunnelCheckout = {
  id: string;
  slug: string;
  name: string;
  productName: string;
  image: string | null;
  priceCents: number;
};

/**
 * Veredito do monitor 24/7 (src/lib/bot-health.ts), gravado no SaleBot pelo
 * cron /api/cron/bot-health. `status` null = ainda não checado.
 */
export type BotHealthProp = {
  status: string | null;
  issue: string | null;
  detail: string | null;
  checkedAt: string | null;
};

export type BotFunnelLoaderProps = {
  funnelId: string;
  name: string;
  backHref: string;
  botId: string;
  botType: "discord" | "telegram";
  active: boolean;
  /** Execução do funil ligada pra este bot (opt-in). */
  runtimeEnabled: boolean;
  /** Saúde real do bot — o selo verde só aparece se isto estiver ok. */
  health?: BotHealthProp;
  products: BotFunnelProduct[];
  checkouts: BotFunnelCheckout[];
  /** Domínio de checkout do seller (customDomain verified) OU host padrão. */
  checkoutHost: string;
  initialGraph: Record<string, unknown> | null;
};

const BotFunnelBoard = dynamic(
  () => import("./bot-funnel-board").then((m) => m.BotFunnelBoard),
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

export function BotFunnelLoader(props: BotFunnelLoaderProps) {
  return <BotFunnelBoard {...props} />;
}
