import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { PixelPanel } from "./panel";

export default async function PixelPage() {
  const userId = await requireUserId();

  // Pixels de CONTA (account-wide, productId = null) — disparam o evento de
  // compra pra TODAS as vendas do seller via fireConversionEvents.
  const pixelsRaw = await prisma.trackingPixel.findMany({
    where: { userId, productId: null, platform: { in: ["FACEBOOK", "TIKTOK"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      platform: true,
      pixelId: true,
      capiToken: true,
      testEventCode: true,
      eventPurchase: true,
      eventInitiateCheckout: true,
      valueMode: true,
      active: true,
    },
  });
  const pixels = pixelsRaw.map((p) => ({ ...p, platform: String(p.platform) }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <Link
          href="/dashboard/integracoes"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
        >
          <ChevronLeft className="size-3" /> Voltar
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Pixel Facebook / TikTok
        </h1>
        <p className="text-sm text-zinc-400">
          Conecte o pixel uma vez e a gente envia o evento de compra (server-side
          via CAPI / Events API) pra <strong>todas as suas vendas</strong>,
          automaticamente — sem configurar produto por produto.
        </p>
      </header>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
        <PixelPanel pixels={pixels} />
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4 text-xs leading-relaxed text-cyan-100/80">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-cyan-300" />
        <p>
          Os eventos saem direto do nosso servidor pra plataforma —{" "}
          <strong>AdBlockers não bloqueiam</strong> e a atribuição fica muito mais
          assertiva. Recomendamos colar o <strong>Access Token (CAPI)</strong> pra
          máxima precisão.
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs leading-relaxed text-zinc-400">
        <p className="mb-2 font-medium text-white">Onde pegar as credenciais</p>
        <ul className="space-y-1.5">
          <li>
            • <strong className="text-zinc-300">Facebook:</strong> Pixel ID no Events
            Manager; Access Token em Configurações → Conjuntos de dados → Token de
            acesso.
          </li>
          <li>
            • <strong className="text-zinc-300">TikTok:</strong> Pixel ID no Ads
            Manager → Events; Access Token em Events → Web Events → API Eventos.
          </li>
        </ul>
      </div>
    </div>
  );
}
