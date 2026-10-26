import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CHECKOUT_HOST, MAIN_HOST } from "@/lib/checkout-url";
import { randomBytes } from "node:crypto";
import { ShieldCheck, Zap, CreditCard, Clock, Star, Award, Lock, Rocket, HeartHandshake } from "lucide-react";
import { CheckoutTemplate } from "@/components/checkout-templates";
import { PixelScripts } from "@/components/checkout-templates/pixel-scripts";
import { UtmCookieWriter } from "@/components/checkout-templates/utm-cookie-writer";
import { StripeInspectorBlocker } from "@/components/checkout-templates/stripe-inspector-blocker";
import { BackRedirectListener } from "@/components/checkout-templates/back-redirect-listener";
import { BannerImage } from "@/components/checkout-templates/banner-image";
import { Testimonials } from "@/components/checkout-templates/testimonials";
import {
  TextBanner,
  ScarcityCountdown,
  SecuritySeals,
  WhatsAppFloat,
  FooterImage,
} from "@/components/checkout-templates/checkout-extras";
// DEFAULT_SEALS vem do módulo NEUTRO: importado via checkout-extras ("use
// client") o array chegaria aqui como proxy de referência e o .map() dentro de
// <SecuritySeals> quebraria o checkout.
import { DEFAULT_SEALS } from "@/components/checkout-templates/configs";
import { VisitTracker } from "@/components/checkout-templates/visit-tracker";
import { PixResumeWatcher } from "@/components/checkout-templates/pix-resume-watcher";
import { prisma } from "@/lib/prisma";
import { formatBRL } from "@/lib/utils";
import { deterministicVariantId } from "@/lib/ab-assign";
import { resolveAbVariant, type AbTestConfig } from "@/lib/ab-test";
import { VslPlayer } from "@/components/vsl-player";
import { PixCheckout } from "@/components/pix-checkout";
import { CountdownBar } from "@/components/checkout-widgets";
import { hasAvailableCardAcquirer } from "@/lib/card-availability";

export const dynamic = "force-dynamic";

type SecuritySealKind = "shield" | "award" | "lock" | "zap" | "rocket" | "handshake";

type ThemeShape = {
  template?: string;

  // Layout (block visibility)
  blockHeader?: boolean;
  blockOrderSummary?: boolean;
  blockOrderBump?: boolean;
  blockCoupon?: boolean;
  blockSecuritySeals?: boolean;
  blockTestimonials?: boolean;

  // Conteúdo
  visibleName?: string;
  productImageOverride?: string;
  headerText?: string;
  summaryTitle?: string;
  summarySafety?: string;

  // Extras
  bannerEnabled?: boolean;
  bannerText?: string;
  bannerBg?: string;
  /** Banner em IMAGEM (mostrado no topo absoluto, antes de tudo).
   *  URL pública (Vercel Blob ou link externo). Se setado, renderiza
   *  full-width preservando aspect ratio da imagem. */
  bannerImageUrl?: string;
  /** Onde linkar quando user clicar no banner (opcional). */
  bannerImageHref?: string;
  bannerColor?: string;
  /** Imagem exibida LOGO ABAIXO do card do checkout (sob o texto de termos). */
  footerImageUrl?: string;
  footerImageHref?: string;
  /** Quando true, a imagem de rodapé estica full-width em vez de max-w-md. */
  footerImageFull?: boolean;
  countdownEnabled?: boolean;
  countdownMinutes?: number;
  countdownText?: string;
  /** Cores do contador de escassez. Vazio = derivado do primaryColor. */
  countdownBg?: string;
  countdownColor?: string;
  whatsappEnabled?: boolean;
  whatsappNumber?: string;
  whatsappText?: string;
  testimonials?: { name: string; text: string; rating?: number }[];
  securitySeals?: { icon: SecuritySealKind; title: string; text?: string }[];

  // Cores
  primaryColor?: string;
  accentColor?: string;
  bgColor?: string;
  cardColor?: string;
  textColor?: string;
  headerBg?: string;
  headerColor?: string;
  ctaText?: string;
  ctaBg?: string;
  ctaColor?: string;

  // Order Bump (configurável no builder, opcional vincular a um produto)
  bumpEnabled?: boolean;
  bumpTitle?: string;
  bumpDescription?: string;
  bumpButtonText?: string;
  bumpBadge?: string;
  bumpPriceOverride?: string;
  bumpOriginalPrice?: string;
  bumpPosition?: "before-form" | "after-form" | "above-cta" | "below-cta";
  bumpAccentColor?: string;
  bumpImageUrl?: string;

  // Legacy
  showTestimonials?: boolean;
  generalShowPriceBig?: boolean;
  generalShowGuaranteeBadge?: boolean;
};

export default async function PublicCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  // SEGURANÇA + MARCA: checkouts só servem em trilhopag.com OU num
  // custom domain verified vinculado a este checkout. Qualquer outro host
  // (ex: someone tentando rodar via vercel preview URL ou domínio aleatório)
  // é redirecionado pro host correto.
  const reqHeaders = await headers();
  const host = (reqHeaders.get("host") ?? "").toLowerCase();
  const isPreview = sp.preview === "1";

  // Carrega checkout com customDomain + poolDomain + userId pra decidir
  // host correto E aplicar gate de "seller tem dominio verificado".
  const domainCheck = await prisma.checkout.findUnique({
    where: { slug },
    select: {
      userId: true,
      customDomain: true,
      poolDomain: { select: { domain: true, active: true } },
    },
  });
  const customDomain = domainCheck?.customDomain?.toLowerCase() ?? null;
  const poolDomain =
    domainCheck?.poolDomain?.active
      ? domainCheck.poolDomain.domain.toLowerCase()
      : null;

  // POLITICA JUN/2026: o gateway NAO fornece mais dominio publico de checkout.
  // Cada seller eh obrigado a conectar dominio proprio em /dashboard/dominios.
  // Sem dominio verificado + useCheckout=true → produto INATIVO em
  // trilhopag.com/c/{slug} (e qualquer host que nao seja dominio
  // verificado do seller). Helpers em src/lib/seller-checkout-url.ts.
  let sellerVerifiedDomains: string[] = [];
  if (domainCheck?.userId) {
    // Sub-account herda dominios do grupo (fix 06/07 — adsriya0 reportou
    // "n da pra usar o dominio, o davi q setou por la"). Sem isso a pagina
    // publica do checkout mostrava "produto inativo" mesmo com o pai da
    // sub tendo dominio verificado.
    const { getUserGroupIds } = await import("@/lib/seller-checkout-url");
    const groupIds = await getUserGroupIds(domainCheck.userId);
    const ds = await prisma.customDomain.findMany({
      where: {
        userId: { in: groupIds },
        status: "verified",
        useCheckout: true,
      },
      select: { domain: true },
    });
    sellerVerifiedDomains = ds.map((d) => d.domain.toLowerCase());
  }

  /**
   * Resolução do HOST FINAL (em ordem de prioridade):
   *  1. Primeiro dominio verificado do seller (politica jun/2026 — fonte
   *     oficial: CustomDomain.status='verified' AND useCheckout=true)
   *  2. customDomain do proprio checkout (legado — string crua salva
   *     diretamente em Checkout.customDomain antes da migracao)
   *  3. poolDomain (legado — antes os checkouts usavam pool da plataforma)
   *  4. Null = produto INATIVO (gate ativado abaixo)
   */
  let resolvedHost: string | null =
    sellerVerifiedDomains[0] ?? customDomain ?? poolDomain;
  if (!resolvedHost) {
    const firstPool = await prisma.adminCheckoutDomain.findFirst({
      where: { active: true },
      orderBy: { domain: "asc" },
      select: { domain: true },
    });
    resolvedHost = firstPool?.domain ?? null;
  }

  const allowedHosts = new Set<string>();
  // O dominio de pagamento da plataforma SEMPRE serve checkout — e o destino
  // padrao de todo link que o painel gera. Sem esta linha, seller sem dominio
  // proprio deixava `allowedHosts` vazio e o proprio paytrilhopag.com caia no
  // ramo de "host nao permitido".
  allowedHosts.add(CHECKOUT_HOST);
  allowedHosts.add(`www.${CHECKOUT_HOST}`);
  if (resolvedHost) {
    allowedHosts.add(resolvedHost);
    allowedHosts.add(`www.${resolvedHost}`);
  }
  // Aceita TODOS os dominios verificados do seller como validos pra esse
  // checkout (caso ele tenha mais de um e o cliente acesse via outro).
  for (const d of sellerVerifiedDomains) {
    allowedHosts.add(d);
    allowedHosts.add(`www.${d}`);
  }

  // Dominio institucional (gateway/dashboard). Nao serve checkout: quem
  // abrir /c/{slug} por aqui e mandado pro dominio de pagamento.
  const isMainDomain =
    host === MAIN_HOST || host === `www.${MAIN_HOST}`;

  const hostOk =
    !host ||
    isPreview ||
    allowedHosts.has(host) ||
    host.startsWith("localhost") ||
    host.endsWith(".vercel.app");

  // 10/08/2026 (davi): "Conecte esse dominio nos checkouts e tire o dominio
  // principal, somente nesse que os checkouts podem carregar:
  // paytrilhopag.com".
  //
  // ── POR QUE REDIRECT E NAO 404 ──────────────────────────────────────────
  //
  // Ate jun/2026 o acesso via trilhopag.com devolvia 404, e isso derrubava
  // venda: link ja mandado pro cliente virava pagina vazia. Agora existe um
  // destino de verdade (CHECKOUT_HOST = paytrilhopag.com), entao o certo e
  // MANDAR PRA LA, nao matar. O checkout continua nao CARREGANDO no dominio
  // principal — quem abre por la sai instantaneamente pro dominio de
  // pagamento, com a query preservada (utm, oferta, tracking).
  //
  // Vale pra QUALQUER host que nao esteja na lista de permitidos, nao so o
  // principal: dominio aleatorio apontado pra ca, preview URL da Vercel
  // mandada por engano, tudo cai no mesmo redirect.
  //
  // Excecao: preview do builder (?preview=1) so pro DONO do checkout ou
  // admin. Sem essa checagem qualquer um veria o checkout no dominio
  // principal so adicionando ?preview=1.
  if (!hostOk || isMainDomain) {
    const ehPreviewAutorizado = await (async () => {
      if (!isPreview) return false;
      const [{ getEffectiveUserId }, { getCurrentAdminSession }] =
        await Promise.all([
          import("@/lib/effective-user"),
          import("@/lib/admin-auth"),
        ]);
      const [viewerId, adminSession] = await Promise.all([
        getEffectiveUserId().catch(() => null),
        getCurrentAdminSession().catch(() => null),
      ]);
      return (!!viewerId && viewerId === domainCheck?.userId) || !!adminSession;
    })();

    if (!ehPreviewAutorizado) {
      const destino = resolvedHost ?? CHECKOUT_HOST;
      // So redireciona se o destino for OUTRO host — senao vira loop
      // infinito (o proprio paytrilhopag.com se redirecionando pra ele).
      if (destino !== host && `www.${destino}` !== host) {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(sp)) {
          if (typeof v === "string") qs.set(k, v);
        }
        const queryString = qs.toString();
        redirect(
          `https://${destino}/c/${slug}${queryString ? "?" + queryString : ""}`,
        );
      }
    }
  }

  let checkout;
  try {
    checkout = await prisma.checkout.findUnique({
      where: { slug },
      include: {
        product: true,
        user: { select: { name: true } },
        variants: { where: { active: true } },
        orderBumps: {
          where: { active: true },
          orderBy: { sortOrder: "asc" },
        },
        shippingOptions: {
          where: { active: true },
          orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
        },
      },
    });
  } catch (err) {
    console.error("[/c/[slug]] db error:", err);
    return <CheckoutErrorFallback />;
  }

  if (!checkout || !checkout.active || !checkout.product.active) notFound();
  // Rejeição pelo admin (anti-fraude): checkout ou produto reprovado → fora do ar.
  if (checkout.adminRejected || checkout.product.adminRejected) notFound();

  // LEGACY single-bump REMOVIDO. Agora os bumps vêm 100% da tabela OrderBump
  // (carregada no findUnique acima com include). Os campos theme.bumpEnabled,
  // bumpTitle, bumpProductId etc são IGNORADOS — alguns checkouts antigos
  // ainda têm esses campos no theme JSON mas não renderizam mais nada.
  const resolvedBump = null;

  // Visitor ID — middleware sets the cookie; here we only READ.
  // Fallback to a per-request random ID if the cookie is missing (won't persist,
  // but prevents the route from crashing).
  const cookieStore = await cookies();
  const visitorId =
    cookieStore.get("tp_vid")?.value ?? randomBytes(16).toString("hex");

  const variant = deterministicVariantId(
    checkout.variants.map((v) => ({ id: v.id, weight: v.weight, raw: v })),
    `${checkout.id}:${visitorId}`,
  );
  const v = variant?.raw ?? null;

  if (v) {
    prisma.checkoutVariant
      .update({ where: { id: v.id }, data: { visits: { increment: 1 } } })
      .catch(() => {});
  }

  const { product } = checkout;
  const headline = v?.headline ?? product.name;
  const ctaText = v?.ctaText ?? "Pagar com Pix";
  // Preço: variante A/B → preço do checkout → preço do produto
  // Politica: produto nao tem preço, oferta tem. Se nenhum estiver setado,
  // retornamos 404 (oferta sem preço nao deve gerar vendas).
  const priceCents =
    v?.priceCentsOverride ??
    checkout.priceCentsOverride ??
    product.priceCents;
  if (!priceCents || priceCents <= 0) {
    notFound();
  }

  const hasPix = checkout.paymentMethods.includes("pix");
  // 22/07/2026 (davi: "Nao pode dar failed!"): mesmo que o seller tenha
  // marcado CARD como aceito no checkout, se a plataforma NÃO tem nenhuma
  // adquirente cartão disponível pro modo/visibility desse seller, ESCONDE
  // o botão. Evita cliente clicar → tx FAILED sem tentativa de PSP.
  const hasCard =
    checkout.paymentMethods.includes("card") &&
    (await hasAvailableCardAcquirer(checkout.userId, "card").catch(() => false));
  // paymentMethods efetivo (o que o cliente REALMENTE vê) — passado pros
  // templates pra que apple_pay/google_pay também sumam quando indisponíveis.
  const effectivePaymentMethods = checkout.paymentMethods.filter((m) => {
    if (m === "pix") return true;
    if (m === "card") return hasCard;
    return true;
  });

  const sessionId =
    (await headers()).get("x-vercel-id")?.slice(0, 32) ??
    randomBytes(16).toString("hex");

  // UTMs: prioridade URL > cookie persistente (tp_utm). Cookie é gravado
  // pelo UtmCookieWriter client-side quando a página carrega com utm_* na
  // URL — sobrevive redirects, navegação interna e refresh.
  const utmCookie = cookieStore.get("tp_utm")?.value;
  let utmFromCookie: Record<string, string | null> = {};
  if (utmCookie) {
    try {
      utmFromCookie = JSON.parse(decodeURIComponent(utmCookie));
    } catch {
      // cookie corrompido, ignora
    }
  }

  const pickUtm = (k: string): string | null =>
    (sp[`utm_${k}`] as string | undefined) ?? utmFromCookie[`utm_${k}`] ?? null;
  const pickClick = (k: string): string | null =>
    (sp[k] as string | undefined) ?? utmFromCookie[k] ?? null;

  const utm = {
    source: pickUtm("source"),
    medium: pickUtm("medium"),
    campaign: pickUtm("campaign"),
    content: pickUtm("content"),
    term: pickUtm("term"),
    fbclid: pickClick("fbclid"),
    ttclid: pickClick("ttclid"),
    gclid: pickClick("gclid"),
  };

  const theme = (checkout.theme as ThemeShape | null) ?? {};

  // ============= Template dispatcher =============
  // Se o tema escolheu um dos 5 templates novos, renderiza fora do builder
  // padrão (sem branding, mobile-first).
  // Em modo preview (?preview=1&t=<template>) o template pode ser sobrescrito
  // pra refletir a seleção atual do builder sem precisar salvar.
  const overrideTemplate =
    sp.preview === "1" && typeof sp.t === "string" ? sp.t : undefined;
  const baseTemplate = (theme as { template?: string }).template;
  // Teste A/B de template: atribui o visitante a A (template atual) ou B
  // (templateB) de forma determinística e sticky (cookie tp_vid). No preview,
  // respeita o override do builder. pix/card routes reproduzem a mesma
  // atribuição pra taggear a venda com o braço correto.
  const ab = overrideTemplate
    ? { template: overrideTemplate, variant: "A" as const }
    : resolveAbVariant(
        (theme as { abTest?: AbTestConfig }).abTest,
        baseTemplate ?? "",
        `${checkout.id}:${visitorId}`,
      );
  const template = overrideTemplate ?? (ab.template || baseTemplate);
  // Whitelist de templates suportados. SEM o "gringa"/"gringa-drop-v1" o
  // dispatcher caia no renderer legado e o publico veia o template antigo
  // (Extra) mesmo com gringa salvo no builder. Bug fix: incluir todos os
  // templates registrados em components/checkout-templates/index.tsx.
  if (
    template &&
    [
      "auto",
      "extra",
      "simple",
      "drop",
      "dropv2",
      "fast",
      "gringa",
      "gringa-drop",
      "gringa-drop-v1",
      "tiktok_shop",
      "mercado_livre",
      "amazon",
      "shopee",
    ].includes(template)
  ) {
    return (
      <TemplateRenderer
        template={template}
        slug={slug}
        product={{
          id: product.id,
          name: theme.visibleName || product.name,
          description: product.description,
          image: theme.productImageOverride || product.image,
          priceCents,
        }}
        priceCents={priceCents}
        ctaLabel={ctaText}
        variantId={v?.id}
        utm={utm as Record<string, string | null>}
        theme={theme}
        bump={resolvedBump}
        fbPixel={checkout.facebookPixelId}
        tkPixel={checkout.tiktokPixelId}
        prefill={{
          name: sp.name ?? undefined,
          email: sp.email ?? undefined,
          phone: sp.phone ?? sp.whatsapp ?? undefined,
          cpf: sp.cpf ?? sp.document ?? undefined,
        }}
        orderBumps={(checkout.orderBumps ?? []).map((b) => ({
          id: b.id,
          title: b.title,
          description: b.description,
          imageUrl: b.imageUrl,
          priceCents: b.priceCents,
          originalPriceCents: b.originalPriceCents,
        }))}
        shippingOptions={(checkout.shippingOptions ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          imageUrl: s.imageUrl,
          priceCents: s.priceCents,
          estimatedTime: s.estimatedTime,
          isDefault: s.isDefault,
        }))}
        paymentMethods={effectivePaymentMethods}
        bumpPosition={checkout.bumpPosition}
        backRedirectUrl={checkout.backRedirectUrl}
        videoUrl={checkout.videoUrl}
        videoHeadline={checkout.videoHeadline}
        checkoutId={checkout.id}
        videoSessionId={`${visitorId}-${sessionId}`}
      />
    );
  }
  // ============= End template dispatcher =============

  const primary = theme.primaryColor || "#22d3ee"; // cyan-400
  const accent = theme.accentColor || "#22d3ee";
  const showHeaderBlock = theme.blockHeader ?? true;
  const showOrderSummary = theme.blockOrderSummary ?? true;
  const showSecuritySeals = theme.blockSecuritySeals ?? true;
  const showTestimonialsBlock = theme.blockTestimonials ?? theme.showTestimonials ?? false;
  const headerText = theme.headerText || "Pagamento 100% Seguro";
  const summaryTitle = theme.summaryTitle || "Você está adquirindo:";
  const summarySafety = theme.summarySafety || "Compra 100% segura. Reembolso garantido em 7 dias.";
  const visibleProductName = theme.visibleName || headline;
  const productImage = theme.productImageOverride || product.image;
  const defaultSeals = [
    { icon: "shield", title: "Compra Segura", text: "Site protegido por SSL." },
    { icon: "lock", title: "Pagamento Criptografado", text: "Dados protegidos." },
    { icon: "award", title: "Garantia 7 dias", text: "Reembolso integral." },
  ] as const;
  const seals = (theme.securitySeals && theme.securitySeals.length > 0
    ? theme.securitySeals
    : defaultSeals) as { icon: SecuritySealKind; title: string; text?: string }[];
  const SEAL_ICONS = {
    shield: ShieldCheck,
    award: Award,
    lock: Lock,
    zap: Zap,
    rocket: Rocket,
    handshake: HeartHandshake,
  } as const;

  return (
    <div
      className="min-h-screen text-zinc-100"
      style={{ background: theme.bgColor || "#000" }}
    >
      <StripeInspectorBlocker />
      <PixelScripts
        fbPixelId={checkout.facebookPixelId}
        tkPixelId={checkout.tiktokPixelId}
        priceCents={priceCents}
        currency={(theme as Record<string, unknown>).currency as string | undefined}
        productId={product.id}
        productName={product.name}
        slug={slug}
      />
      {/* Back redirect também no checkout PADRÃO (legado). Antes só o
          TemplateRenderer montava isto, então em checkouts "standard" o
          "voltar" do navegador não caía no downsell configurado. */}
      {checkout.backRedirectUrl && (
        <BackRedirectListener url={checkout.backRedirectUrl} />
      )}
      {/* Retoma o redirect pós-pagamento se a aba foi recarregada (mobile
          voltando do app do banco) — vale também pro checkout padrão. */}
      <PixResumeWatcher slug={slug} />

      {/* Banner em IMAGEM — aparece antes de TUDO no topo da página.
          Tamanho natural da imagem (width 100%, height auto preservando aspect).
          BannerImage tem fallback: se a imagem falhar (ex: blob store antigo
          bloqueado), esconde em vez de mostrar a caixa quebrada. */}
      {theme.bannerImageUrl && (
        <BannerImage src={theme.bannerImageUrl} href={theme.bannerImageHref} />
      )}

      {theme.bannerEnabled && theme.bannerText && (
        <div
          className="w-full px-4 py-2 text-center text-xs font-medium"
          style={{
            background: theme.bannerBg || "#22d3ee",
            color: theme.bannerColor || "#000",
          }}
        >
          {theme.bannerText}
        </div>
      )}

      {showHeaderBlock && (
        <div
          className="w-full px-4 py-3 text-center text-sm font-semibold"
          style={{ background: primary, color: "#000" }}
        >
          🔒 {headerText}
        </div>
      )}

      <div className="absolute inset-x-0 top-0 h-[500px] grid-bg pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-[500px] glow pointer-events-none" />

      <header className="relative z-10 border-b border-white/[0.06] px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span
              className="inline-flex size-6 items-center justify-center rounded text-black text-xs font-bold"
              style={{ background: primary }}
            >
              B
            </span>
            <span>Trilho</span>
          </Link>
          <div className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
            <ShieldCheck className="size-3.5" style={{ color: primary }} />
            Pagamento seguro
          </div>
        </div>
      </header>

      {theme.countdownEnabled && (
        <CountdownBar
          minutes={theme.countdownMinutes ?? 15}
          label={theme.countdownText ?? "Oferta termina em"}
          primary={primary}
          bg={theme.countdownBg}
          color={theme.countdownColor}
        />
      )}

      <main className="relative z-10 mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-5">
        <section className="lg:col-span-3 space-y-6">
          {checkout.videoUrl && (
            <VslPlayer
              src={checkout.videoUrl}
              sessionId={`${visitorId}-${sessionId}`}
              checkoutId={checkout.id}
              headline={checkout.videoHeadline ?? undefined}
            />
          )}

          {showOrderSummary && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
              <p className="text-xs uppercase tracking-wider text-zinc-500">{summaryTitle}</p>
              <div className="mt-3 flex items-start gap-5">
                {productImage && (
                  <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={productImage}
                      alt={visibleProductName}
                      className="size-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h1 className="mt-1 text-xl font-semibold text-white">{visibleProductName}</h1>
                  {product.description && (
                    <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                      {product.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-6 flex items-end justify-between border-t border-white/[0.06] pt-5">
                <span className="text-sm text-zinc-400">Total</span>
                <span
                  className={`font-semibold tabular-nums ${theme.generalShowPriceBig ? "text-4xl" : "text-3xl"}`}
                  style={{ color: accent }}
                >
                  {formatBRL(priceCents)}
                </span>
              </div>
              {summarySafety && (
                <p className="mt-2 text-[11px] text-zinc-500">✓ {summarySafety}</p>
              )}
            </div>
          )}

          {showSecuritySeals && seals.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {seals.map((s, i) => {
                const Icon = SEAL_ICONS[s.icon] || ShieldCheck;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
                  >
                    <Icon className="size-5 shrink-0" style={{ color: primary }} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{s.title}</p>
                      {s.text && <p className="text-[10px] text-zinc-500 truncate">{s.text}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showTestimonialsBlock && theme.testimonials && theme.testimonials.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Depoimentos</p>
              {theme.testimonials.map((t, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-1">
                    {[...Array(t.rating ?? 5)].map((_, k) => (
                      <Star key={k} className="size-3 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">{t.text}</p>
                  <p className="mt-2 text-xs text-zinc-500">— {t.name}</p>
                </div>
              ))}
            </div>
          )}

          {hasPix && (
            <PixCheckout
              slug={slug}
              variantId={v?.id}
              utm={utm}
              priceCents={priceCents}
              ctaLabel={ctaText}
              bump={null}
            />
          )}

          {hasCard && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                  <CreditCard className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">Cartão de crédito</p>
                  <p className="text-xs text-zinc-500">Em breve — parcele em até 12x</p>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="lg:col-span-2">
          <div className="sticky top-6 space-y-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <h3 className="text-sm font-medium text-white">Resumo</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Produto</dt>
                  <dd className="text-white text-right max-w-[60%] truncate">
                    {product.name}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Vendedor</dt>
                  <dd className="text-white">{checkout.user.name ?? "—"}</dd>
                </div>
                <div className="flex justify-between border-t border-white/[0.06] pt-3">
                  <dt className="text-white font-medium">Total</dt>
                  <dd className="font-semibold" style={{ color: accent }}>
                    {formatBRL(priceCents)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 text-xs text-zinc-500 leading-relaxed">
              <div className="flex items-center gap-2 text-zinc-300">
                <Zap className="size-3.5" style={{ color: primary }} />
                <span>Processado por Trilho</span>
              </div>
              <p className="mt-2">
                Pagamento criptografado e processado de forma segura via Pix.
                Você não nos paga nada — só o vendedor.
              </p>
            </div>
          </div>
        </aside>
      </main>

      {theme.whatsappEnabled && theme.whatsappNumber && (
        <a
          href={`https://wa.me/${theme.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(theme.whatsappText || "Olá, tenho dúvida sobre " + product.name)}`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-green-500 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-green-600 transition"
        >
          <svg viewBox="0 0 24 24" className="size-5 fill-current">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
          Suporte
        </a>
      )}
    </div>
  );
}

function CheckoutErrorFallback() {
  return (
    <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <Clock className="mx-auto size-10 text-yellow-300" />
        <h1 className="mt-3 text-xl font-semibold">Carregando seu checkout...</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Tivemos uma instabilidade momentânea. Por favor, recarregue a página.
        </p>
        <a
          href=""
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2 text-sm font-medium text-black hover:bg-cyan-300"
        >
          Recarregar
        </a>
      </div>
    </div>
  );
}

/** Wrapper que injeta os pixels antes de renderizar o template público. */
function TemplateRenderer({
  template,
  slug,
  product,
  priceCents,
  ctaLabel,
  variantId,
  utm,
  theme,
  bump,
  fbPixel,
  tkPixel,
  prefill,
  orderBumps,
  shippingOptions,
  paymentMethods,
  bumpPosition,
  backRedirectUrl,
  videoUrl,
  videoHeadline,
  checkoutId,
  videoSessionId,
}: {
  template: string;
  slug: string;
  product: {
    id: string;
    name: string;
    description: string | null;
    image: string | null;
    priceCents: number;
  };
  priceCents: number;
  ctaLabel: string;
  variantId?: string;
  utm: Record<string, string | null>;
  theme: ThemeShape;
  bump: {
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    imageUrl?: string | null;
  } | null;
  fbPixel: string | null;
  tkPixel: string | null;
  prefill: {
    name?: string;
    email?: string;
    phone?: string;
    cpf?: string;
  };
  orderBumps: Array<{
    id: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
    priceCents: number;
    originalPriceCents: number | null;
  }>;
  shippingOptions: Array<{
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    priceCents: number;
    estimatedTime: string | null;
    isDefault: boolean;
  }>;
  paymentMethods: string[];
  bumpPosition?: string;
  backRedirectUrl?: string | null;
  videoUrl?: string | null;
  videoHeadline?: string | null;
  checkoutId: string;
  videoSessionId: string;
}) {
  return (
    // 30/07/2026 (davi, repassando o seller: "quando adiciona [imagem sem
    // fundo] a própria plataforma adiciona um fundo").
    //
    // O <body> do site é `bg-black` (root layout). O template pinta o próprio
    // fundo, mas TUDO que o TemplateRenderer monta FORA dele — banner em
    // imagem, VSL, imagem de rodapé — ficava direto em cima desse preto. Aí
    // um PNG transparente aparecia com fundo PRETO em vez de mostrar o fundo
    // do checkout. Este wrapper faz esses blocos herdarem a cor de fundo que
    // o seller escolheu, igual acontece nas outras plataformas.
    <div
      className="min-h-screen"
      style={{ background: theme.bgColor || "#f5f5f5" }}
    >
      <StripeInspectorBlocker />
      <PixelScripts
        fbPixelId={fbPixel}
        tkPixelId={tkPixel}
        priceCents={priceCents}
        currency={(theme as Record<string, unknown>).currency as string | undefined}
        productId={product.id}
        productName={product.name}
        slug={slug}
      />
      <UtmCookieWriter />
      <VisitTracker slug={slug} />
      {backRedirectUrl && <BackRedirectListener url={backRedirectUrl} />}
      {/* Retoma o redirect pós-pagamento se a aba foi recarregada (mobile
          voltando do app do banco). Cobre todos os templates novos. */}
      <PixResumeWatcher slug={slug} />

      {/* Banner em IMAGEM — full-width, antes de tudo. Comum a TODOS os
          templates. BannerImage esconde sozinho se a imagem falhar (blob
          store antigo bloqueado → 403), sem quebrar o layout. */}
      {theme.bannerImageUrl && (
        <BannerImage src={theme.bannerImageUrl} href={theme.bannerImageHref} />
      )}

      {/* 30/07/2026 (davi 'contador, banner, selos nao funcionam mesmo
          ativando'): banner de texto + contador de escassez agora sobem em
          TODOS os templates. Antes só existiam no renderer legado abaixo do
          dispatcher, que na prática nunca roda (default do builder = extra). */}
      {theme.bannerEnabled && theme.bannerText && (
        <TextBanner
          text={theme.bannerText}
          bg={theme.bannerBg}
          color={theme.bannerColor}
        />
      )}

      {theme.countdownEnabled && (
        <ScarcityCountdown
          minutes={theme.countdownMinutes ?? 15}
          label={theme.countdownText || "Oferta termina em"}
          primaryColor={theme.primaryColor || "#16a34a"}
          bg={theme.countdownBg}
          color={theme.countdownColor}
          storageKey={slug}
        />
      )}

      {/* VSL — mesmo problema: o vídeo de vendas do builder (Extras → VSL) só
          era montado no renderer legado. Agora aparece acima de qualquer
          template, com o tracking de progresso (/api/track/video) intacto. */}
      {videoUrl && (
        <div className="mx-auto w-full max-w-md px-4 pt-4">
          <VslPlayer
            src={videoUrl}
            sessionId={videoSessionId}
            checkoutId={checkoutId}
            headline={videoHeadline ?? undefined}
          />
        </div>
      )}

      <CheckoutTemplate
        template={template}
        slug={slug}
        product={product}
        priceCents={priceCents}
        ctaLabel={ctaLabel}
        variantId={variantId}
        utm={utm}
        bgColor={theme.bgColor || "#f5f5f5"}
        cardColor={theme.cardColor || "#ffffff"}
        textColor={theme.textColor || "#18181b"}
        primaryColor={theme.primaryColor || "#16a34a"}
        accentColor={theme.accentColor || "#16a34a"}
        ctaText={theme.ctaText || "PAGAR AGORA"}
        ctaBg={theme.ctaBg || "#16a34a"}
        ctaColor={theme.ctaColor || "#ffffff"}
        headerText={theme.headerText || "Pagamento 100% Seguro"}
        headerBg={theme.headerBg || "#16a34a"}
        headerColor={theme.headerColor || "#ffffff"}
        prefillName={prefill.name}
        prefillEmail={prefill.email}
        prefillPhone={prefill.phone}
        prefillCpf={prefill.cpf}
        // Toggles de campos do builder — cada template respeita.
        // Drop FORCA isPhysical=true (template e stepped, requer endereco).
        // Gringa FORCA cpf=false (e checkout internacional, sem CPF).
        // Gringa-Drop-V1 FORCA isPhysical=true (precisa endereco).
        fields={{
          name: (theme as { fieldName?: boolean }).fieldName ?? true,
          email: (theme as { fieldEmail?: boolean }).fieldEmail ?? true,
          phone: (theme as { fieldPhone?: boolean }).fieldPhone ?? false,
          cpf:
            template === "gringa" ||
            template === "gringa-drop" ||
            template === "gringa-drop-v1"
              ? false
              : (theme as { fieldCpf?: boolean }).fieldCpf ?? false,
          // CEP fica EXCLUSIVAMENTE a servico do isPhysical (toggle "Produto fisico")
          cep:
            template === "drop" ||
            template === "dropv2" ||
            template === "gringa-drop" ||
            template === "gringa-drop-v1"
              ? true
              : (theme as { isPhysical?: boolean }).isPhysical ?? false,
        }}
        showQuantity={(theme as { showQuantity?: boolean }).showQuantity ?? false}
        receiptUpload={
          (theme as { receiptUpload?: boolean }).receiptUpload ?? false
        }
        isPhysical={
          template === "drop" ||
          template === "dropv2" ||
          template === "gringa-drop" ||
          template === "gringa-drop-v1"
            ? true
            : (theme as { isPhysical?: boolean }).isPhysical ?? false
        }
        autoTranslate={
          (theme as { autoTranslate?: boolean }).autoTranslate ?? false
        }
        // Currency: Gringa default USD (sem essa flag, formatacao cai em BRL)
        currency={(theme as Record<string, unknown>).currency as string | undefined}
        bump={
          bump
            ? {
                id: bump.id,
                name: bump.name,
                description: bump.description,
                priceCents: bump.priceCents,
                imageUrl: bump.imageUrl ?? null,
                badge: theme.bumpBadge ?? "OFERTA ESPECIAL",
                buttonText: theme.bumpButtonText ?? "Sim, adicionar",
                originalPrice: theme.bumpOriginalPrice ?? null,
                accentColor: theme.bumpAccentColor ?? "#facc15",
              }
            : null
        }
        autoConfig={(theme as Record<string, unknown>).auto as never}
        extraConfig={(theme as Record<string, unknown>).extra as never}
        simpleConfig={(theme as Record<string, unknown>).simple as never}
        dropConfig={(theme as Record<string, unknown>).drop as never}
        fastConfig={(theme as Record<string, unknown>).fast as never}
        gringaConfig={(theme as Record<string, unknown>).gringa as never}
        gringaDropConfig={
          (theme as Record<string, unknown>).gringaDrop as never
        }
        pixResultConfig={(theme as Record<string, unknown>).pixResult as never}
        tiktokShopConfig={(theme as Record<string, unknown>).tiktokShop as never}
        mercadoLivreConfig={
          (theme as Record<string, unknown>).mercadoLivre as never
        }
        amazonConfig={(theme as Record<string, unknown>).amazon as never}
        shopeeConfig={(theme as Record<string, unknown>).shopee as never}
        orderBumps={orderBumps}
        shippingOptions={shippingOptions}
        paymentMethods={paymentMethods}
        bumpPosition={bumpPosition}
      />

      {/* 30/07/2026 (davi): imagem livre LOGO ABAIXO do card do checkout —
          exatamente o espaço embaixo do texto de termos que o seller marcou
          no print. Usada pra bandeiras de pagamento, selo do Reclame Aqui,
          arte de garantia, etc. Vale pra todos os templates. */}
      {theme.footerImageUrl && (
        <FooterImage
          src={theme.footerImageUrl}
          href={theme.footerImageHref}
          fullWidth={theme.footerImageFull === true}
        />
      )}

      {/* Selos de segurança — mesmo tratamento dos depoimentos.
          OPT-IN explícito (=== true), NÃO `?? true`: os templates Amazon /
          Shopee / Mercado Livre / TikTok Shop são réplicas visuais, e ligar
          selos genéricos por padrão quebraria a semelhança de milhares de
          checkouts já no ar sem ninguém ter pedido. Quem quiser, liga em
          Extras → Selos de Segurança (o toggle agora existe e funciona). */}
      {theme.blockSecuritySeals === true && (
        <SecuritySeals
          items={
            theme.securitySeals && theme.securitySeals.length > 0
              ? theme.securitySeals
              : DEFAULT_SEALS
          }
          primaryColor={theme.primaryColor || "#16a34a"}
        />
      )}

      {/* Depoimentos — agora renderizam pra TODOS os templates (antes só no
          renderer legado). Aparece abaixo do checkout quando o seller liga o
          toggle "Depoimentos" e adiciona ao menos 1. */}
      {(theme.blockTestimonials ?? theme.showTestimonials) &&
        theme.testimonials &&
        theme.testimonials.length > 0 && (
          <Testimonials
            items={theme.testimonials}
            primaryColor={theme.primaryColor || "#16a34a"}
          />
        )}

      {/* Botão flutuante de WhatsApp — também só existia no renderer legado.
          Mensagem inicial cai no mesmo default do legado quando vazia. */}
      {theme.whatsappEnabled && theme.whatsappNumber && (
        <WhatsAppFloat
          number={theme.whatsappNumber}
          text={theme.whatsappText || `Olá, tenho dúvida sobre ${product.name}`}
        />
      )}
    </div>
  );
}
