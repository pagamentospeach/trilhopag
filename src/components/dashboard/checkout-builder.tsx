"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  LayoutTemplate,
  FileText,
  Type,
  Tag,
  Sparkles,
  Palette,
  Plug,
  ExternalLink,
  FlaskConical,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Monitor,
  Smartphone,
  Plus,
  Trash2,
  Loader2,
  Check,
  Award,
  Lock,
  Zap,
  Rocket,
  HeartHandshake,
  Eye,
  GripVertical,
  CheckCircle2,
  Columns2,
  Square,
} from "lucide-react";
import { cn, formatBRL } from "@/lib/utils";
import { parseBRLToCents, centsToBRLInput } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/file-upload";
import { CheckoutTemplate as RealCheckoutTemplate } from "@/components/checkout-templates";
import { BannerImage } from "@/components/checkout-templates/banner-image";
import { Testimonials } from "@/components/checkout-templates/testimonials";
import {
  TextBanner,
  ScarcityCountdown,
  SecuritySeals,
  FooterImage,
  DEFAULT_SEALS,
} from "@/components/checkout-templates/checkout-extras";
import {
  BumpsShippingManager,
  type OrderBumpItem,
  type ShippingItem,
} from "@/components/dashboard/bumps-shipping-manager";
import type { ActionResult } from "@/app/dashboard/checkouts/actions";
import type { AbTestConfig } from "@/lib/ab-test";
import type {
  AutoConfig,
  ExtraConfig,
  SimpleConfig,
  DropConfig,
  FastConfig,
  PixResultConfig,
  TiktokShopConfig,
  MercadoLivreConfig,
  AmazonConfig,
  ShopeeConfig,
} from "@/components/checkout-templates/configs";
import {
  DEFAULT_AUTO,
  DEFAULT_EXTRA,
  DEFAULT_SIMPLE,
  DEFAULT_DROP,
  DEFAULT_FAST,
  DEFAULT_PIX_RESULT,
  DEFAULT_TIKTOK_SHOP,
  DEFAULT_MERCADO_LIVRE,
  DEFAULT_AMAZON,
  DEFAULT_SHOPEE,
} from "@/components/checkout-templates/configs";

type Product = {
  id: string;
  name: string;
  slug: string;
  priceCents?: number;
  image?: string | null;
};
type ProductDetails = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  image: string | null;
};

export type Testimonial = { name: string; text: string; rating?: number };
export type SecuritySeal = {
  icon: "shield" | "award" | "lock" | "zap" | "rocket" | "handshake";
  title: string;
  text?: string;
};

export type BlockKey =
  | "header"
  | "summary"
  | "identification"
  | "payment"
  | "seals"
  | "testimonials"
  | "coupon"
  | "bump";

export type CheckoutTemplate =
  | "auto"           // Gera Pix automaticamente, sem cliques
  | "extra"          // Padrão renda extra — compacto
  | "simple"         // Simples — minimalista
  | "drop"           // Drop — com carrinho + stepper + garantias
  | "dropv2"         // Drop V2 — variação avançada com pré-warm de PIX
  | "fast"           // Fast — ultra-compacto
  | "gringa"         // Gringa — internacional EN (card+Apple/Google Pay)
  | "gringa-drop-v1" // Gringa Drop v1 — internacional + endereço físico
  | "tiktok_shop"    // TikTok Shop — réplica do checkout do TikTok Shop
  | "mercado_livre"  // Mercado Livre — réplica do checkout do ML (sem logo)
  | "amazon"         // Amazon — réplica do checkout da Amazon (sem logo)
  | "shopee";        // Shopee — réplica do checkout da Shopee (sem logo)

export type CheckoutTheme = {
  /* Template macro */
  template?: CheckoutTemplate;

  /* Layout */
  layoutColumns?: 1 | 2;
  blockOrder?: BlockKey[];

  /* Blocks visibility */
  blockHeader?: boolean;
  blockOrderSummary?: boolean;
  blockOrderBump?: boolean;
  blockCoupon?: boolean;
  blockSecuritySeals?: boolean;
  blockTestimonials?: boolean;

  /* Conteúdo */
  internalName?: string;
  visibleName?: string;
  productImageOverride?: string;
  headerText?: string;
  summaryTitle?: string;
  summarySafety?: string;

  /* Campos */
  fieldName?: boolean;
  fieldEmail?: boolean;
  fieldPhone?: boolean;
  fieldCpf?: boolean;
  fieldCep?: boolean;
  showQuantity?: boolean;
  isPhysical?: boolean;
  /** Mostra na tela de PIX um campo pra o lead enviar o comprovante. Off por padrão. */
  receiptUpload?: boolean;
  autoTranslate?: boolean;
  /** Moeda do checkout: BRL, USD ou EUR. Default BRL. Modifica formatador
   *  de preco (formatMoney) usado em TODOS os templates + symbol exibido. */
  currency?: string;

  /* Extras */
  bannerEnabled?: boolean;
  bannerText?: string;
  bannerBg?: string;
  bannerColor?: string;
  /* Order Bump customização (avançado) */
  bumpEnabled?: boolean;       // master switch — quando false, NUNCA mostra
  bumpTitle?: string;          // título exibido (default: nome do produto)
  bumpDescription?: string;    // descrição/copy de venda
  bumpButtonText?: string;     // texto da label do checkbox (default "Sim, adicionar")
  bumpBadge?: string;          // badge tipo "OFERTA ESPECIAL"
  bumpPriceOverride?: string;  // preço diferente (BRL string) — obrigatório se sem produto
  bumpOriginalPrice?: string;  // preço "de" (riscado, BRL)
  bumpPosition?: "before-form" | "after-form" | "above-cta" | "below-cta"; // onde aparece
  bumpAccentColor?: string;    // cor do destaque (border + button)
  bumpImageUrl?: string;       // imagem do bump (URL ou data:image)
  /** Banner em IMAGEM (URL pública ou data:image). Renderizado full-width
   *  no topo absoluto, preservando aspect ratio. Funciona em TODOS os templates. */
  bannerImageUrl?: string;
  /** Opcional: URL para abrir quando o banner é clicado. */
  bannerImageHref?: string;

  /** 30/07/2026 (davi): imagem LOGO ABAIXO do card do checkout — embaixo do
   *  texto de termos, antes dos selos. Funciona em TODOS os templates. */
  footerImageUrl?: string;
  footerImageHref?: string;
  /** true = estica full-width. false (default) = acompanha o card (max-w-md). */
  footerImageFull?: boolean;

  countdownEnabled?: boolean;
  countdownMinutes?: number;
  countdownText?: string;
  /** 30/07/2026 (davi 'o contador ta sem opcao de selecionar as cores').
   *  Vazio = comportamento antigo (derivado do primaryColor). */
  countdownBg?: string;
  countdownColor?: string;

  whatsappEnabled?: boolean;
  whatsappNumber?: string;
  whatsappText?: string;

  testimonials?: Testimonial[];
  securitySeals?: SecuritySeal[];

  /* Cores globais */
  bgColor?: string;
  cardColor?: string;
  textColor?: string;
  primaryColor?: string;   // botões CTA
  accentColor?: string;    // preço
  cardRadius?: number;     // border radius dos cards (px)

  /* Cores cabeçalho */
  headerBg?: string;
  headerColor?: string;

  /* Estilo botão CTA */
  ctaText?: string;        // "PAGAR AGORA"
  ctaBg?: string;
  ctaColor?: string;

  /* Estilo modal PIX */
  pixModalTitle?: string;        // "Pagamento via PIX"
  pixModalCopyText?: string;     // "Copiar código PIX"
  pixModalValueLabel?: string;   // "Valor:"
  pixModalExpiryLabel?: string;  // "Válido até:"
  pixModalSafetyText?: string;   // "Pagamento 100% seguro via PIX"
  pixExpiryMinutes?: number;     // tempo de validade do Pix (min)
  pixModalBg?: string;
  pixModalTitleColor?: string;
  pixModalInfoColor?: string;
  pixModalSafetyColor?: string;

  /* Campo de código PIX */
  pixFieldBg?: string;
  pixFieldBorder?: string;
  pixFieldColor?: string;

  /* Configs específicas por template */
  auto?: AutoConfig;
  extra?: ExtraConfig;
  simple?: SimpleConfig;
  drop?: DropConfig;
  fast?: FastConfig;
  pixResult?: PixResultConfig;
  tiktokShop?: TiktokShopConfig;
  mercadoLivre?: MercadoLivreConfig;
  amazon?: AmazonConfig;
  shopee?: ShopeeConfig;
  abTest?: AbTestConfig;
};

type Defaults = {
  productId?: string;
  slug?: string;
  active?: boolean;
  paymentMethods?: string[];
  priceCentsOverride?: number | null;
  bumpProductId?: string | null;
  bumpPosition?: string | null;
  upsellUrl?: string | null;
  thankYouUrl?: string | null;
  backRedirectUrl?: string | null;
  facebookPixelId?: string | null;
  tiktokPixelId?: string | null;
  videoUrl?: string | null;
  videoHeadline?: string | null;
  theme: CheckoutTheme;
};

const ALL_TABS = [
  { key: "template", label: "Template", Icon: LayoutTemplate },
  { key: "layout", label: "Layout", Icon: Columns2 },
  { key: "conteudo", label: "Conteúdo", Icon: FileText },
  { key: "campos", label: "Campos", Icon: Type },
  { key: "ofertas", label: "Ofertas", Icon: Tag },
  { key: "extras", label: "Extras", Icon: Sparkles },
  { key: "cores", label: "Cores", Icon: Palette },
  { key: "pos", label: "Pós-Pagamento", Icon: CheckCircle2 },
  { key: "integracoes", label: "Integrações", Icon: Plug },
] as const;

type TabKey = (typeof ALL_TABS)[number]["key"];

/**
 * Cada template define quais abas do builder fazem sentido pra ele.
 * - "auto": super simples — só template, campos, cores, pos, integrações
 * - "extra"/"simple"/"drop"/"dropv2": padrão (quase tudo)
 * - "fast": minimalista — sem extras de vídeo/timer
 */
/**
 * 30/07/2026 (davi 'reveja TODAS as funcoes'): a aba "integracoes" (Pixel do
 * Facebook/TikTok por checkout) estava fora de TODOS os templates — ou seja,
 * ninguém conseguia setar pixel por oferta. Como a aba Pixels do produto foi
 * deletada em 29/07, os pixels tinham ficado sem NENHUM lugar pra configurar.
 * Reativada em todos os templates.
 *
 * A aba "layout" continua fora de propósito: layoutColumns/blockOrder/
 * blockHeader/blockOrderSummary/blockCoupon não são lidos por nenhum template
 * público (só pelo preview do builder), então exibi-la só geraria opção que
 * não faz nada. Os 2 toggles que FUNCIONAM (selos + depoimentos) migraram
 * pra aba Extras, ao lado dos editores deles.
 */
const TEMPLATE_TABS: Record<CheckoutTemplate, TabKey[]> = {
  // Automático: PIX direto sem clique — sem campos do comprador, sem ofertas
  // (a aba "Conteúdo" mostra a config do loading + modal PIX)
  // (30/07/2026: "extras" liberado aqui também — banner, contador, imagem de
  // rodapé, selos e WhatsApp renderizam no auto igual nos outros templates,
  // então esconder a aba só tirava o controle do seller.)
  auto: ["template", "conteudo", "extras", "cores", "pos", "integracoes"],
  // Fast: ultra-rápido — nome+email + botão
  fast: ["template", "conteudo", "campos", "ofertas", "extras", "cores", "pos", "integracoes"],
  // Simples: mínimo necessário
  simple: ["template", "conteudo", "campos", "ofertas", "extras", "cores", "pos", "integracoes"],
  // Padrão Renda Extra: padrão completo
  extra: ["template", "conteudo", "campos", "ofertas", "extras", "cores", "pos", "integracoes"],
  // Drop: stepper completo com endereço
  drop: ["template", "conteudo", "campos", "ofertas", "extras", "cores", "pos", "integracoes"],
  // Drop V2: variação avançada com pré-warm de PIX
  dropv2: ["template", "conteudo", "campos", "ofertas", "extras", "cores", "pos", "integracoes"],
  // Gringa: internacional EN — sem PIX, padrão completo
  gringa: ["template", "conteudo", "campos", "ofertas", "extras", "cores", "pos", "integracoes"],
  // Gringa Drop v1: internacional + endereço físico
  "gringa-drop-v1": ["template", "conteudo", "campos", "ofertas", "extras", "cores", "pos", "integracoes"],
  // TikTok Shop: réplica do checkout do TikTok Shop
  tiktok_shop: ["template", "conteudo", "campos", "ofertas", "extras", "cores", "pos", "integracoes"],
  // Mercado Livre: réplica do checkout do ML (sem logo)
  mercado_livre: ["template", "conteudo", "campos", "ofertas", "extras", "cores", "pos", "integracoes"],
  // Amazon: réplica do checkout da Amazon (sem logo)
  amazon: ["template", "conteudo", "campos", "ofertas", "extras", "cores", "pos", "integracoes"],
  // Shopee: réplica do checkout da Shopee (sem logo)
  shopee: ["template", "conteudo", "campos", "ofertas", "extras", "cores", "pos", "integracoes"],
};

function getTabsForTemplate(t: CheckoutTemplate): typeof ALL_TABS {
  const allowed = new Set(TEMPLATE_TABS[t] ?? TEMPLATE_TABS.extra);
  return ALL_TABS.filter((x) => allowed.has(x.key)) as unknown as typeof ALL_TABS;
}

/**
 * Xadrez de transparência nos previews de imagem. O painel do builder é
 * escuro; sem isso, um PNG sem fundo parecia ter fundo preto e o seller não
 * tinha como saber se a transparência sobreviveu ao upload.
 */
const TRANSPARENCY_CHECKER =
  "repeating-conic-gradient(#3f3f46 0% 25%, #27272a 0% 50%) 50% / 16px 16px";

const SEAL_ICONS = {
  shield: ShieldCheck,
  award: Award,
  lock: Lock,
  zap: Zap,
  rocket: Rocket,
  handshake: HeartHandshake,
};

const DEFAULT_BLOCK_ORDER: BlockKey[] = [
  "header",
  "summary",
  "identification",
  "payment",
  "seals",
  "testimonials",
];

const BLOCK_LABELS: Record<BlockKey, string> = {
  header: "Cabeçalho",
  summary: "Resumo do Pedido",
  identification: "Identificação",
  payment: "Pagamento",
  seals: "Selos de Segurança",
  testimonials: "Depoimentos",
  coupon: "Cupom",
  bump: "Order Bump",
};

function withDefaults(t: CheckoutTheme) {
  return {
    template: (t.template ?? "extra") as CheckoutTemplate,
    layoutColumns: (t.layoutColumns ?? 1) as 1 | 2,
    blockOrder: (t.blockOrder && t.blockOrder.length > 0
      ? t.blockOrder
      : DEFAULT_BLOCK_ORDER) as BlockKey[],

    blockHeader: t.blockHeader ?? true,
    blockOrderSummary: t.blockOrderSummary ?? true,
    blockOrderBump: t.blockOrderBump ?? false,
    blockCoupon: t.blockCoupon ?? true,
    // 30/07/2026: default OFF (era true) pra bater EXATAMENTE com o que o
    // /c/[slug] renderiza. Como os selos nunca apareceram nos templates, um
    // default ON aqui só faria o toggle mentir de novo — e ligar selos
    // retroativamente em todo checkout no ar quebraria as réplicas
    // (Amazon/Shopee/ML/TikTok). Opt-in.
    blockSecuritySeals: t.blockSecuritySeals ?? false,
    blockTestimonials: t.blockTestimonials ?? false,

    internalName: t.internalName ?? "",
    visibleName: t.visibleName ?? "",
    productImageOverride: t.productImageOverride ?? "",
    headerText: t.headerText ?? "Pagamento 100% Seguro",
    summaryTitle: t.summaryTitle ?? "Você está adquirindo:",
    summarySafety: t.summarySafety ?? "Compra 100% segura. Reembolso garantido em 7 dias.",

    fieldName: t.fieldName ?? true,
    fieldEmail: t.fieldEmail ?? true,
    fieldPhone: t.fieldPhone ?? false,
    fieldCpf: t.fieldCpf ?? false,
    fieldCep: t.fieldCep ?? false,
    showQuantity: t.showQuantity ?? false,
    isPhysical: t.isPhysical ?? false,
    receiptUpload: t.receiptUpload ?? false,
    autoTranslate: t.autoTranslate ?? false,
    currency: (t.currency || "BRL").toUpperCase(),

    bannerEnabled: t.bannerEnabled ?? false,
    bannerText: t.bannerText ?? "",
    bannerBg: t.bannerBg ?? "#22d3ee",
    bannerColor: t.bannerColor ?? "#000000",
    bannerImageUrl: t.bannerImageUrl ?? "",
    bannerImageHref: t.bannerImageHref ?? "",
    // Order Bump
    bumpEnabled: t.bumpEnabled ?? false,
    bumpTitle: t.bumpTitle ?? "",
    bumpDescription: t.bumpDescription ?? "",
    bumpButtonText: t.bumpButtonText ?? "Sim, adicionar à compra",
    bumpBadge: t.bumpBadge ?? "OFERTA ESPECIAL",
    bumpPriceOverride: t.bumpPriceOverride ?? "",
    bumpOriginalPrice: t.bumpOriginalPrice ?? "",
    bumpPosition: t.bumpPosition ?? "above-cta",
    bumpAccentColor: t.bumpAccentColor ?? "#facc15",
    bumpImageUrl: t.bumpImageUrl ?? "",

    footerImageUrl: t.footerImageUrl ?? "",
    footerImageHref: t.footerImageHref ?? "",
    footerImageFull: t.footerImageFull ?? false,

    countdownEnabled: t.countdownEnabled ?? false,
    countdownMinutes: t.countdownMinutes ?? 15,
    countdownText: t.countdownText ?? "Oferta termina em",
    // Vazio de propósito: sem cor escolhida o contador segue derivando do
    // primaryColor, que é como milhares de checkouts já no ar se parecem.
    countdownBg: t.countdownBg ?? "",
    countdownColor: t.countdownColor ?? "",

    whatsappEnabled: t.whatsappEnabled ?? false,
    whatsappNumber: t.whatsappNumber ?? "",
    whatsappText: t.whatsappText ?? "",

    testimonials: t.testimonials ?? [],
    securitySeals:
      t.securitySeals ?? [
        { icon: "shield", title: "Compra Segura", text: "Site protegido por SSL." },
        { icon: "lock", title: "Pagamento Criptografado", text: "Dados protegidos." },
        { icon: "award", title: "Garantia 7 dias", text: "Reembolso integral." },
      ],

    bgColor: t.bgColor ?? "#0a0a0a",
    cardColor: t.cardColor ?? "#141414",
    textColor: t.textColor ?? "#fafafa",
    primaryColor: t.primaryColor ?? "#22d3ee",
    accentColor: t.accentColor ?? "#22d3ee",
    cardRadius: t.cardRadius ?? 16,

    headerBg: t.headerBg ?? "#22d3ee",
    headerColor: t.headerColor ?? "#000000",

    ctaText: t.ctaText ?? "Gerar Pix",
    ctaBg: t.ctaBg ?? "#16a34a", // verde-bandeira (pix-style)
    ctaColor: t.ctaColor ?? "#ffffff",

    pixModalTitle: t.pixModalTitle ?? "Pagamento via PIX",
    pixModalCopyText: t.pixModalCopyText ?? "Copiar código PIX",
    pixModalValueLabel: t.pixModalValueLabel ?? "Valor:",
    pixModalExpiryLabel: t.pixModalExpiryLabel ?? "Válido até:",
    pixModalSafetyText: t.pixModalSafetyText ?? "Pagamento 100% seguro via PIX",
    pixExpiryMinutes: t.pixExpiryMinutes ?? 5,
    pixModalBg: t.pixModalBg ?? "#ffffff",
    pixModalTitleColor: t.pixModalTitleColor ?? "#18181b",
    pixModalInfoColor: t.pixModalInfoColor ?? "#52525b",
    pixModalSafetyColor: t.pixModalSafetyColor ?? "#16a34a",

    pixFieldBg: t.pixFieldBg ?? "#fafafa",
    pixFieldBorder: t.pixFieldBorder ?? "#e4e4e7",
    pixFieldColor: t.pixFieldColor ?? "#18181b",

    // Per-template configs — pass-through (templates fazem own merge com defaults)
    auto: t.auto,
    extra: t.extra,
    simple: t.simple,
    drop: t.drop,
    fast: t.fast,
    pixResult: t.pixResult,
    tiktokShop: t.tiktokShop,
    mercadoLivre: t.mercadoLivre,
    amazon: t.amazon,
    shopee: t.shopee,
    abTest: t.abTest,
  };
}

export function CheckoutBuilder({
  productId,
  checkoutId,
  slug,
  variantCount,
  defaults,
  products,
  product,
  action,
  orderBumps = [],
  shippingOptions = [],
}: {
  productId: string;
  checkoutId: string;
  slug: string;
  variantCount: number;
  defaults: Defaults;
  products: Product[];
  product: ProductDetails;
  action: (formData: FormData) => Promise<ActionResult>;
  orderBumps?: OrderBumpItem[];
  shippingOptions?: ShippingItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("template");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [isPending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Form state
  const [theme, setTheme] = useState<CheckoutTheme>(defaults.theme ?? {});
  const [selectedProductId, setSelectedProductId] = useState(defaults.productId ?? productId);
  const [methods, setMethods] = useState<string[]>(defaults.paymentMethods ?? ["pix"]);
  const [priceOverride, setPriceOverride] = useState(
    defaults.priceCentsOverride ? centsToBRLInput(defaults.priceCentsOverride) : "",
  );
  const [bumpId, setBumpId] = useState(defaults.bumpProductId ?? "");
  const [bumpPosition, setBumpPosition] = useState(
    defaults.bumpPosition ?? "below_payment",
  );
  const [upsellUrl, setUpsellUrl] = useState(defaults.upsellUrl ?? "");
  const [thankYouUrl, setThankYouUrl] = useState(defaults.thankYouUrl ?? "");
  const [backRedirectUrl, setBackRedirectUrl] = useState(defaults.backRedirectUrl ?? "");
  const [fbPixel, setFbPixel] = useState(defaults.facebookPixelId ?? "");
  const [tkPixel, setTkPixel] = useState(defaults.tiktokPixelId ?? "");
  const [videoUrl, setVideoUrl] = useState(defaults.videoUrl ?? "");
  const [videoHeadline, setVideoHeadline] = useState(defaults.videoHeadline ?? "");
  const [slugVal, setSlugVal] = useState(defaults.slug ?? "");
  const [activeChk, setActiveChk] = useState(defaults.active ?? true);
  const [dirty, setDirty] = useState(false);
  const [savedCounter, setSavedCounter] = useState(0);

  const t = withDefaults(theme);
  const currentTabs = getTabsForTemplate(t.template);

  // Se a aba ativa não existe pro template atual, volta pra "template"
  if (!currentTabs.find((x) => x.key === tab)) {
    setTimeout(() => setTab("template"), 0);
  }

  function setT<K extends keyof CheckoutTheme>(k: K, v: CheckoutTheme[K]) {
    setTheme((s) => {
      // Side effect: quando o user TROCA pra Gringa/Gringa Drop, aplicamos
      // defaults visuais limpos pro mercado internacional (cards brancos,
      // texto preto, accent azul moderno, header com lock icon — tudo o
      // que os templates internacionais esperam). Antes ficava herdando
      // as cores "Pagamento 100% Seguro" verde do Extra, que fica horrivel
      // em UI EN-US/sem PIX.
      if (k === "template") {
        const next = v as string;
        const isGringa = next === "gringa" || next === "gringa-drop-v1";
        if (isGringa) {
          // Força paleta moderna apenas se ainda for o default antigo
          // (nao sobrescreve customizacoes intencionais do user).
          const isDefaultBg = !s.bgColor || s.bgColor === "#f5f5f5";
          const isDefaultPrimary =
            !s.primaryColor ||
            s.primaryColor === "#16a34a" ||
            s.primaryColor === "#22c55e";
          const isDefaultHeaderBg =
            !s.headerBg || s.headerBg === "#16a34a";
          const isDefaultCtaBg = !s.ctaBg || s.ctaBg === "#16a34a";
          return {
            ...s,
            [k]: v,
            ...(isDefaultBg && { bgColor: "#f7f8fa", cardColor: "#ffffff" }),
            textColor: "#0a0a0a",
            ...(isDefaultPrimary && {
              primaryColor: "#0a0a0a",
              accentColor: "#3b82f6",
            }),
            ...(isDefaultHeaderBg && {
              headerBg: "#ffffff",
              headerColor: "#0a0a0a",
              headerText: "Secure checkout",
            }),
            ...(isDefaultCtaBg && {
              ctaBg: "#0a0a0a",
              ctaColor: "#ffffff",
              ctaText: "Pay {AMOUNT}",
            }),
            // Em Gringa CPF nunca rola
            fieldCpf: false,
            // CEP fica a critério de isPhysical (drop v1)
            isPhysical: next === "gringa-drop-v1",
          } as typeof s;
        }
      }
      return { ...s, [k]: v };
    });
    setDirty(true);
  }

  function toggleMethod(m: string) {
    setMethods((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
    setDirty(true);
  }

  function moveMethod(key: string, dir: "up" | "down") {
    setMethods((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
    setDirty(true);
  }

  function setAsDefaultMethod(key: string) {
    setMethods((prev) => {
      if (!prev.includes(key)) return prev;
      return [key, ...prev.filter((m) => m !== key)];
    });
    setDirty(true);
  }

  function save(target: "save" | "publish" = "save") {
    setErr(null);
    setSavedMsg(null);
    const fd = new FormData();
    fd.set("productId", selectedProductId);
    fd.set("slug", slugVal);
    fd.set("active", activeChk || target === "publish" ? "on" : "");
    if (methods.includes("pix")) fd.set("method_pix", "on");
    if (methods.includes("card")) fd.set("method_card", "on");
    if (methods.includes("apple_pay")) fd.set("method_apple_pay", "on");
    if (methods.includes("google_pay")) fd.set("method_google_pay", "on");
    if (priceOverride) {
      const cents = parseBRLToCents(priceOverride);
      if (cents > 0) fd.set("priceCentsOverride", String(cents));
    }
    if (videoUrl) fd.set("videoUrl", videoUrl);
    if (videoHeadline) fd.set("videoHeadline", videoHeadline);
    if (bumpId) fd.set("bumpProductId", bumpId);
    fd.set("bumpPosition", bumpPosition);
    if (upsellUrl) fd.set("upsellUrl", upsellUrl);
    if (thankYouUrl) fd.set("thankYouUrl", thankYouUrl);
    if (backRedirectUrl) fd.set("backRedirectUrl", backRedirectUrl);
    if (fbPixel) fd.set("facebookPixelId", fbPixel);
    if (tkPixel) fd.set("tiktokPixelId", tkPixel);
    fd.set("themeJson", JSON.stringify(theme));

    startTransition(async () => {
      const r = await action(fd);
      if (r.ok) {
        if (target === "publish" && !activeChk) setActiveChk(true);
        setSavedMsg(target === "publish" ? "Publicado!" : "Salvo!");
        setDirty(false);
        setSavedCounter((c) => c + 1);
        router.refresh();
        setTimeout(() => setSavedMsg(null), 2000);
      } else {
        setErr(r.error || "Erro ao salvar.");
      }
    });
  }

  /* ============ AUTO-SAVE DESATIVADO ============
   * Antes salvava automaticamente após cada mudança — confundia sellers
   * que viam alterações irem direto pro checkout público sem chance de
   * testar. Agora: mudanças refletem no preview LIVE (state local),
   * mas só vão pro DB quando o seller clica em "Publicar".
   *
   * O preview é INLINE (não iframe) — atualiza em tempo real conforme
   * o state muda, sem reload, sem postMessage.
   */

  return (
    <div className="-m-6 sm:-m-8 grid h-[calc(100vh-60px)] grid-cols-[260px_1fr] overflow-hidden bg-[#0a0a0a] text-white">
      {/* ============== LEFT SIDEBAR ============== */}
      <aside className="flex flex-col border-r border-white/[0.06] bg-black/40">
        <header className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
          <Link
            href={`/dashboard/produtos/${productId}`}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="size-3.5" /> Sair
          </Link>
          <div className="ml-2 border-l border-white/[0.08] pl-3 min-w-0">
            <p className="text-sm font-semibold truncate">Checkout Builder</p>
            <p className="text-[10px] text-zinc-500 font-mono truncate">/{slug}</p>
          </div>
        </header>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {currentTabs.map(({ key, label, Icon }) => {
            const isActive = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive
                    ? "bg-cyan-400/10 text-cyan-300"
                    : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="size-4" />
                  {label}
                </span>
                <ChevronRight
                  className={`size-3.5 transition ${
                    isActive ? "text-cyan-300" : "text-zinc-600"
                  }`}
                />
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] p-4 space-y-2">
          {/* Status + botão Publicar */}
          {dirty ? (
            <button
              type="button"
              onClick={() => save("publish")}
              disabled={isPending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3 py-2.5 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Publicando…
                </>
              ) : (
                <>
                  <Check className="size-3.5" />
                  Publicar alterações
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/[0.05] px-3 py-2.5 text-xs text-cyan-300">
              <Check className="size-3.5" />
              Tudo publicado
            </div>
          )}
          {savedMsg && (
            <p className="text-center text-[11px] text-cyan-300 flex items-center justify-center gap-1">
              <Check className="size-3" /> {savedMsg}
            </p>
          )}
          {err && <p className="text-center text-[11px] text-red-300">{err}</p>}
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/[0.05] pt-3 text-[10px] text-zinc-500">
            <a
              href={`https://trilhopag.com/c/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-white"
              title="Abrir checkout em trilhopag.com"
            >
              <ExternalLink className="size-3" /> Abrir
            </a>
            <Link
              href={`/dashboard/produtos/${productId}/ofertas/${checkoutId}/variantes`}
              className="inline-flex items-center gap-1 hover:text-white"
            >
              <FlaskConical className="size-3" /> A/B ({variantCount})
            </Link>
            <span className="inline-flex items-center gap-1">
              <span className={`size-1.5 rounded-full ${activeChk ? "bg-cyan-400" : "bg-zinc-500"}`} />
              {activeChk ? "Ativo" : "Inativo"}
            </span>
          </div>
        </div>
      </aside>

      {/* ============== RIGHT: SETTINGS + PREVIEW ============== */}
      <div className="grid grid-cols-[440px_1fr] overflow-hidden">
        {/* SETTINGS PANEL */}
        <section className="overflow-y-auto border-r border-white/[0.06] bg-black/20">
          <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-black/60 px-6 py-4 backdrop-blur">
            <h2 className="text-base font-semibold text-white">
              {ALL_TABS.find((x) => x.key === tab)?.label}
            </h2>
          </header>

          <div className="p-6">
            {tab === "template" && (
              <TemplateTab
                current={t.template}
                onChange={(v) => setT("template", v)}
                theme={t}
                setT={setT}
              />
            )}
            {tab === "layout" && (
              <LayoutTab
                theme={t}
                setT={setT}
                slug={slugVal}
                setSlug={(v) => {
                  setSlugVal(v);
                  setDirty(true);
                }}
                active={activeChk}
                setActive={(v) => {
                  setActiveChk(v);
                  setDirty(true);
                }}
                methods={methods}
                toggleMethod={toggleMethod}
                hasBump={!!bumpId}
              />
            )}
            {tab === "conteudo" && (
              <ConteudoTab
                theme={t}
                setT={setT}
                products={products}
                selectedProductId={selectedProductId}
                setProductId={(v) => {
                  setSelectedProductId(v);
                  setDirty(true);
                }}
                priceOverride={priceOverride}
                setPriceOverride={(v) => {
                  setPriceOverride(v);
                  setDirty(true);
                }}
                productPriceCents={product.priceCents}
              />
            )}
            {tab === "campos" && <CamposTab theme={t} setT={setT} />}
            {tab === "ofertas" && (
              <OfertasTab
                products={products}
                selectedProductId={selectedProductId}
                bumpId={bumpId}
                setBumpId={(v) => {
                  setBumpId(v);
                  setDirty(true);
                }}
                bumpPosition={bumpPosition}
                setBumpPosition={(v) => {
                  setBumpPosition(v);
                  setDirty(true);
                }}
                variantsLink={`/dashboard/produtos/${productId}/ofertas/${checkoutId}/variantes`}
                variantCount={variantCount}
                theme={t}
                setT={setT}
                methods={methods}
                toggleMethod={toggleMethod}
                moveMethod={moveMethod}
                setAsDefaultMethod={setAsDefaultMethod}
                checkoutId={checkoutId}
                orderBumps={orderBumps}
                shippingOptions={shippingOptions}
              />
            )}
            {tab === "extras" && (
              <ExtrasTab
                theme={t}
                setT={setT}
                videoUrl={videoUrl}
                setVideoUrl={(v) => {
                  setVideoUrl(v);
                  setDirty(true);
                }}
                videoHeadline={videoHeadline}
                setVideoHeadline={(v) => {
                  setVideoHeadline(v);
                  setDirty(true);
                }}
              />
            )}
            {tab === "cores" && <CoresTab theme={t} setT={setT} />}
            {tab === "pos" && (
              <PosPagamentoTab
                backRedirectUrl={backRedirectUrl}
                setBackRedirectUrl={(v) => {
                  setBackRedirectUrl(v);
                  setDirty(true);
                }}
                upsellUrl={upsellUrl}
                setUpsellUrl={(v) => {
                  setUpsellUrl(v);
                  setDirty(true);
                }}
              />
            )}
            {tab === "integracoes" && (
              <IntegracoesTab
                productId={productId}
                fbPixel={fbPixel}
                setFbPixel={(v) => {
                  setFbPixel(v);
                  setDirty(true);
                }}
                tkPixel={tkPixel}
                setTkPixel={(v) => {
                  setTkPixel(v);
                  setDirty(true);
                }}
              />
            )}
          </div>
        </section>

        {/* PREVIEW */}
        <section className="flex flex-col overflow-hidden bg-zinc-950">
          <header className="flex items-center justify-between border-b border-white/[0.06] bg-black/60 px-6 py-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-cyan-400" />
              <div>
                <p className="text-sm font-semibold">Preview ao vivo</p>
                <p className="text-[11px] text-zinc-500">Reflete suas mudanças em tempo real</p>
              </div>
            </div>
            <div className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.02] p-0.5">
              <button
                type="button"
                onClick={() => setPreviewMode("desktop")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] transition ${
                  previewMode === "desktop"
                    ? "bg-cyan-400 text-black font-medium"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Monitor className="size-3" /> Desktop
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("mobile")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] transition ${
                  previewMode === "mobile"
                    ? "bg-cyan-400 text-black font-medium"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Smartphone className="size-3" /> Mobile
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            <div
              className={`mx-auto transition-all ${
                previewMode === "mobile" ? "max-w-[380px]" : "max-w-[760px]"
              }`}
            >
              {t.template ? (
                <TemplatePreview
                  template={t.template}
                  slug={slug}
                  product={product}
                  priceCents={
                    priceOverride
                      ? parseBRLToCents(priceOverride)
                      : product.priceCents
                  }
                  previewMode={previewMode}
                  theme={t}
                  orderBumps={orderBumps}
                  shippingOptions={shippingOptions}
                  paymentMethods={methods}
                />
              ) : (
                <Preview
                  product={product}
                  priceCentsOverride={
                    priceOverride ? parseBRLToCents(priceOverride) : null
                  }
                  theme={t}
                  methods={methods}
                  mode={previewMode}
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============================ TABS ============================ */

const TEMPLATES_META: Array<{
  key: CheckoutTemplate;
  name: string;
  desc: string;
  badge?: string;
}> = [
  {
    key: "auto",
    name: "Automático",
    desc: "Gera o Pix sozinho, sem cliques. Ideal pra tráfego pago direto pro QR Code.",
  },
  {
    key: "extra",
    name: "Padrão Renda Extra",
    desc: "Cards compactos: produto + identificação + pagamento. Bom equilíbrio.",
  },
  {
    key: "simple",
    name: "Simples",
    desc: "Minimalista: pedido + dados + Pix. Direto ao ponto.",
  },
  {
    key: "drop",
    name: "Drop",
    desc: "Carrinho + stepper (Identificação → Entrega → Pagamento). Mais elementos.",
  },
  {
    key: "dropv2",
    name: "Drop V2",
    desc: "Variação avançada do Drop com pré-warm de PIX (mais rápido) e visual otimizado pra dropshipping.",
    badge: "Novo",
  },
  {
    key: "fast",
    name: "Fast",
    desc: "Ultra-rápido: produto + nome + email + botão. 1 só tela.",
  },
  {
    key: "gringa",
    name: "Gringa (EN)",
    desc: "Checkout internacional em inglês. Card + Apple Pay + Google Pay. Layout 2 colunas com order summary lateral. NÃO inclui PIX — usar pra vender pra fora do Brasil em USD/EUR/GBP.",
    badge: "INTL",
  },
  {
    key: "gringa-drop-v1",
    name: "Gringa Drop v1 (EN)",
    desc: "Gringa pra produto físico/dropshipping internacional. 3 steps (Contact → Shipping → Payment) com endereço completo + shipping options. Cobra em USD/EUR/GBP via Stripe.",
    badge: "INTL",
  },
  {
    key: "tiktok_shop",
    name: "TikTok Shop",
    desc: "Réplica do checkout do TikTok Shop: galeria do produto, badge de desconto, countdown, 'Proteção do cliente' e avaliações. Visual de marketplace que converte tráfego TikTok.",
    badge: "Novo",
  },
  {
    key: "mercado_livre",
    name: "Mercado Livre",
    desc: "Réplica do checkout do Mercado Livre (sem logo): resumo da compra, dados, pagamento e selo 'Compra Garantida'. Passa confiança de marketplace conhecido.",
    badge: "Novo",
  },
  {
    key: "amazon",
    name: "Amazon Checkout",
    desc: "Réplica do checkout da Amazon (sem logo): 2 colunas (passos à esquerda, resumo do pedido à direita), CTA amarelo, entrega GRÁTIS e total em vermelho. Confiança de e-commerce premium.",
    badge: "Novo",
  },
  {
    key: "shopee",
    name: "Shopee Checkout",
    desc: "Réplica do checkout da Shopee (sem logo): mobile-first laranja, card de endereço com faixa colorida, voucher, frete grátis, garantia e barra fixa 'Fazer pedido'. Ideal pra tráfego social.",
    badge: "Novo",
  },
];

function TemplateTab({
  current,
  onChange,
}: {
  current: CheckoutTemplate;
  onChange: (v: CheckoutTemplate) => void;
  theme: ReturnType<typeof withDefaults>;
  setT: <K extends keyof CheckoutTheme>(k: K, v: CheckoutTheme[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <Section
        title="Escolha o template"
        desc="Selecione o estilo de checkout. As configurações de cada template ficam nas outras abas do builder."
      >
        <div className="space-y-2">
          {TEMPLATES_META.map((t) => {
            const isActive = current === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onChange(t.key)}
                className={`flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition ${
                  isActive
                    ? "border-cyan-400 bg-cyan-400/[0.05]"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]"
                }`}
              >
                <div
                  className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    isActive ? "border-cyan-400 bg-cyan-400" : "border-zinc-600 bg-transparent"
                  }`}
                >
                  {isActive && <Check className="size-3 text-black" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-semibold ${isActive ? "text-cyan-300" : "text-white"}`}>
                      {t.name}
                    </p>
                    {t.badge && (
                      <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="rounded-xl border border-blue-400/20 bg-blue-400/[0.04] p-4 text-xs text-blue-100/80">
        💡 As configurações específicas de cada template (textos, cores, comportamento)
        estão nas abas <strong>Conteúdo</strong>, <strong>Cores</strong> e nas demais
        abas do builder.
      </div>
    </div>
  );
}

type EditorProps = {
  theme: ReturnType<typeof withDefaults>;
  setT: <K extends keyof CheckoutTheme>(k: K, v: CheckoutTheme[K]) => void;
};

function AutoEditor({ theme, setT }: EditorProps) {
  const c = { ...DEFAULT_AUTO, ...(theme.auto ?? {}) };
  function update<K extends keyof AutoConfig>(k: K, v: AutoConfig[K]) {
    setT("auto", { ...(theme.auto ?? {}), [k]: v });
  }
  return (
    <Section title="Customizar — Automático" desc="Tela de loading enquanto o Pix é gerado.">
      <div>
        <Label>Texto principal</Label>
        <Input value={c.loadingText} onChange={(e) => update("loadingText", e.target.value)} />
      </div>
      <div>
        <Label>Subtexto</Label>
        <Input value={c.loadingSubtext} onChange={(e) => update("loadingSubtext", e.target.value)} />
      </div>
      <div>
        <Label>Botão &ldquo;Tentar de novo&rdquo;</Label>
        <Input value={c.errorRetryLabel} onChange={(e) => update("errorRetryLabel", e.target.value)} />
      </div>
    </Section>
  );
}

function ExtraEditor({ theme, setT }: EditorProps) {
  const c = { ...DEFAULT_EXTRA, ...(theme.extra ?? {}) };
  function update<K extends keyof ExtraConfig>(k: K, v: ExtraConfig[K]) {
    setT("extra", { ...(theme.extra ?? {}), [k]: v });
  }
  return (
    <>
      <Section title="Customizar — Padrão Renda Extra" desc="Textos da tela.">
        <div>
          <Label>Título da identificação</Label>
          <Input value={c.identTitle} onChange={(e) => update("identTitle", e.target.value)} />
        </div>
        <div>
          <Label>Título do pagamento</Label>
          <Input value={c.paymentTitle} onChange={(e) => update("paymentTitle", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Label email</Label>
            <Input value={c.emailLabel} onChange={(e) => update("emailLabel", e.target.value)} />
          </div>
          <div>
            <Label>Placeholder email</Label>
            <Input value={c.emailPlaceholder} onChange={(e) => update("emailPlaceholder", e.target.value)} />
          </div>
          <div>
            <Label>Label nome</Label>
            <Input value={c.nameLabel} onChange={(e) => update("nameLabel", e.target.value)} />
          </div>
          <div>
            <Label>Placeholder nome</Label>
            <Input value={c.namePlaceholder} onChange={(e) => update("namePlaceholder", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Título da opção Pix</Label>
          <Input value={c.pixOptionTitle} onChange={(e) => update("pixOptionTitle", e.target.value)} />
        </div>
        <div>
          <Label>Subtítulo da opção Pix</Label>
          <Input value={c.pixOptionSubtitle} onChange={(e) => update("pixOptionSubtitle", e.target.value)} />
        </div>
        <div>
          <Label>Botão CTA</Label>
          <Input value={c.ctaLabel} onChange={(e) => update("ctaLabel", e.target.value)} />
        </div>
        <div>
          <Label>Texto de termos (rodapé)</Label>
          <Input value={c.termsText} onChange={(e) => update("termsText", e.target.value)} />
        </div>
      </Section>
      <Section title="Cores específicas" desc="Cores únicas deste template.">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fundo dos ícones</Label>
            <ColorInput value={c.iconBg} onChange={(v) => update("iconBg", v)} />
          </div>
          <div>
            <Label>Cor do ícone</Label>
            <ColorInput value={c.iconColor} onChange={(v) => update("iconColor", v)} />
          </div>
          <div className="col-span-2">
            <Label>Cor do check do Pix (canto direito)</Label>
            <ColorInput value={c.pixOptionCheckBg} onChange={(v) => update("pixOptionCheckBg", v)} />
          </div>
        </div>
      </Section>
    </>
  );
}

function SimpleEditor({ theme, setT }: EditorProps) {
  const c = { ...DEFAULT_SIMPLE, ...(theme.simple ?? {}) };
  function update<K extends keyof SimpleConfig>(k: K, v: SimpleConfig[K]) {
    setT("simple", { ...(theme.simple ?? {}), [k]: v });
  }
  return (
    <>
      <Section title="Customizar — Simples" desc="Textos da tela.">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label>Título do pedido</Label>
            <Input value={c.pedidoTitle} onChange={(e) => update("pedidoTitle", e.target.value)} />
          </div>
          <div>
            <Label>Título dos dados</Label>
            <Input value={c.dadosTitle} onChange={(e) => update("dadosTitle", e.target.value)} />
          </div>
          <div>
            <Label>Título de pagamento</Label>
            <Input value={c.paymentTitle} onChange={(e) => update("paymentTitle", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Label email</Label>
            <Input value={c.emailLabel} onChange={(e) => update("emailLabel", e.target.value)} />
          </div>
          <div>
            <Label>Placeholder email</Label>
            <Input value={c.emailPlaceholder} onChange={(e) => update("emailPlaceholder", e.target.value)} />
          </div>
          <div>
            <Label>Label nome</Label>
            <Input value={c.nameLabel} onChange={(e) => update("nameLabel", e.target.value)} />
          </div>
          <div>
            <Label>Placeholder nome</Label>
            <Input value={c.namePlaceholder} onChange={(e) => update("namePlaceholder", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Texto do badge PIX</Label>
          <Input value={c.pixBadgeText} onChange={(e) => update("pixBadgeText", e.target.value)} />
        </div>
        <div>
          <Label>Nota abaixo do PIX</Label>
          <Input value={c.pixBadgeNote} onChange={(e) => update("pixBadgeNote", e.target.value)} />
        </div>
        <div>
          <Label>Botão CTA</Label>
          <Input value={c.ctaLabel} onChange={(e) => update("ctaLabel", e.target.value)} />
        </div>
      </Section>
      <Section title="Cores específicas">
        <div>
          <Label>Cor da borda do box PIX</Label>
          <ColorInput value={c.pixBadgeBorderColor} onChange={(v) => update("pixBadgeBorderColor", v)} />
        </div>
      </Section>
    </>
  );
}

function DropEditor({ theme, setT }: EditorProps) {
  const c = { ...DEFAULT_DROP, ...(theme.drop ?? {}) };
  function update<K extends keyof DropConfig>(k: K, v: DropConfig[K]) {
    setT("drop", { ...(theme.drop ?? {}), [k]: v });
  }
  function updateWarranty(i: number, val: string) {
    const items = c.warrantyItems.slice();
    items[i] = val;
    update("warrantyItems", items);
  }
  function addWarranty() {
    update("warrantyItems", [...c.warrantyItems, ""]);
  }
  function removeWarranty(i: number) {
    update("warrantyItems", c.warrantyItems.filter((_, k) => k !== i));
  }
  return (
    <>
      <Section title="Customizar — Drop" desc="Textos da barra superior + carrinho + stepper.">
        <div>
          <Label>Faixa de segurança (topo)</Label>
          <Input value={c.safetyHeaderText} onChange={(e) => update("safetyHeaderText", e.target.value)} />
        </div>
        <div>
          <Label>Título do carrinho</Label>
          <Input value={c.cartTitle} onChange={(e) => update("cartTitle", e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>Step 1</Label>
            <Input value={c.step1Label} onChange={(e) => update("step1Label", e.target.value)} />
          </div>
          <div>
            <Label>Step 2</Label>
            <Input value={c.step2Label} onChange={(e) => update("step2Label", e.target.value)} />
          </div>
          <div>
            <Label>Step 3</Label>
            <Input value={c.step3Label} onChange={(e) => update("step3Label", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Título da identificação</Label>
          <Input value={c.identTitle} onChange={(e) => update("identTitle", e.target.value)} />
        </div>
        <div>
          <Label>Checkbox &ldquo;Não tenho e-mail&rdquo;</Label>
          <Input value={c.noEmailLabel} onChange={(e) => update("noEmailLabel", e.target.value)} />
        </div>
        <div>
          <Label>Prefixo do botão (Continuar — )</Label>
          <Input value={c.ctaLabelPrefix} onChange={(e) => update("ctaLabelPrefix", e.target.value)} />
        </div>
      </Section>

      <Section title="Bloco de garantia" desc="Texto e bullets.">
        <div>
          <Label>Título</Label>
          <Input value={c.warrantyTitle} onChange={(e) => update("warrantyTitle", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Itens</Label>
          {c.warrantyItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={item} onChange={(e) => updateWarranty(i, e.target.value)} />
              <button
                type="button"
                onClick={() => removeWarranty(i)}
                className="shrink-0 text-zinc-500 hover:text-red-300"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addWarranty}
            className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-white/[0.1] py-2 text-xs text-zinc-400 hover:bg-white/[0.03] hover:text-white"
          >
            <Plus className="size-3" /> Adicionar item
          </button>
        </div>
      </Section>

      <Section title="Cores específicas">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Cor da faixa de segurança</Label>
            <ColorInput value={c.safetyHeaderColor} onChange={(v) => update("safetyHeaderColor", v)} />
          </div>
          <div>
            <Label>Cor do badge do carrinho</Label>
            <ColorInput value={c.cartBadgeColor} onChange={(v) => update("cartBadgeColor", v)} />
          </div>
          <div className="col-span-2">
            <Label>Cor do stepper ativo</Label>
            <ColorInput value={c.stepperActiveColor} onChange={(v) => update("stepperActiveColor", v)} />
          </div>
        </div>
      </Section>
    </>
  );
}

function FastEditor({ theme, setT }: EditorProps) {
  const c = { ...DEFAULT_FAST, ...(theme.fast ?? {}) };
  function update<K extends keyof FastConfig>(k: K, v: FastConfig[K]) {
    setT("fast", { ...(theme.fast ?? {}), [k]: v });
  }
  return (
    <>
      <Section title="Customizar — Fast" desc="Textos da tela.">
        <div>
          <Label>Label de obrigatoriedade</Label>
          <Input value={c.obrigatorioLabel} onChange={(e) => update("obrigatorioLabel", e.target.value)} />
        </div>
        <div>
          <Label>Título da identificação</Label>
          <Input value={c.identTitle} onChange={(e) => update("identTitle", e.target.value)} />
        </div>
        <div>
          <Label>Título do pagamento</Label>
          <Input value={c.paymentTitle} onChange={(e) => update("paymentTitle", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Label nome</Label>
            <Input value={c.nameLabel} onChange={(e) => update("nameLabel", e.target.value)} />
          </div>
          <div>
            <Label>Placeholder nome</Label>
            <Input value={c.namePlaceholder} onChange={(e) => update("namePlaceholder", e.target.value)} />
          </div>
          <div>
            <Label>Label email</Label>
            <Input value={c.emailLabel} onChange={(e) => update("emailLabel", e.target.value)} />
          </div>
          <div>
            <Label>Placeholder email</Label>
            <Input value={c.emailPlaceholder} onChange={(e) => update("emailPlaceholder", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Botão CTA</Label>
          <Input value={c.ctaLabel} onChange={(e) => update("ctaLabel", e.target.value)} />
        </div>
        <div>
          <Label>Texto de segurança (rodapé)</Label>
          <Input value={c.safetyText} onChange={(e) => update("safetyText", e.target.value)} />
        </div>
      </Section>
      <Section title="Cores específicas">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fundo dos ícones</Label>
            <ColorInput value={c.iconBg} onChange={(v) => update("iconBg", v)} />
          </div>
          <div>
            <Label>Cor dos ícones</Label>
            <ColorInput value={c.iconColor} onChange={(v) => update("iconColor", v)} />
          </div>
        </div>
      </Section>
    </>
  );
}

function PixResultEditor({ theme, setT }: EditorProps) {
  const c = { ...DEFAULT_PIX_RESULT, ...(theme.pixResult ?? {}) };
  function update<K extends keyof PixResultConfig>(k: K, v: PixResultConfig[K]) {
    setT("pixResult", { ...(theme.pixResult ?? {}), [k]: v });
  }
  return (
    <Section title="Tela do QR Code (após gerar)" desc="Textos e botões da tela com o Pix.">
      <div>
        <Label>Texto &ldquo;Valor total:&rdquo;</Label>
        <Input value={c.valueTotalLabel} onChange={(e) => update("valueTotalLabel", e.target.value)} />
      </div>
      <div>
        <Label>Instrução &ldquo;Escaneie o QR Code...&rdquo;</Label>
        <Input value={c.scanText} onChange={(e) => update("scanText", e.target.value)} />
      </div>
      <div>
        <Label>Botão copiar (normal)</Label>
        <Input value={c.copyLabel} onChange={(e) => update("copyLabel", e.target.value)} />
      </div>
      <div>
        <Label>Botão copiar (depois do click)</Label>
        <Input value={c.copiedLabel} onChange={(e) => update("copiedLabel", e.target.value)} />
      </div>
      <div>
        <Label>Título &ldquo;Como pagar?&rdquo;</Label>
        <Input value={c.comoPagarTitle} onChange={(e) => update("comoPagarTitle", e.target.value)} />
      </div>
      <div>
        <Label>Passo 1</Label>
        <Input value={c.comoPagarStep1} onChange={(e) => update("comoPagarStep1", e.target.value)} />
      </div>
      <div>
        <Label>Passo 2</Label>
        <Input value={c.comoPagarStep2} onChange={(e) => update("comoPagarStep2", e.target.value)} />
      </div>
    </Section>
  );
}

function LayoutTab({
  theme,
  setT,
  slug,
  setSlug,
  active,
  setActive,
  methods,
  toggleMethod,
  hasBump,
}: {
  theme: ReturnType<typeof withDefaults>;
  setT: <K extends keyof CheckoutTheme>(k: K, v: CheckoutTheme[K]) => void;
  slug: string;
  setSlug: (v: string) => void;
  active: boolean;
  setActive: (v: boolean) => void;
  methods: string[];
  toggleMethod: (m: string) => void;
  hasBump: boolean;
}) {
  return (
    <div className="space-y-6">
      <Section title="Status & URL" desc="Configurações básicas do checkout.">
        <div>
          <Label>Slug público</Label>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="meu-checkout"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            trilhopag.com/c/<span className="font-mono text-zinc-400">{slug || "..."}</span>
          </p>
        </div>
        <Toggle
          label="Checkout ativo"
          desc="Se desligar, o link público volta indisponível."
          value={active}
          onChange={setActive}
        />
        <div>
          <Label>Métodos de pagamento</Label>
          <p className="text-[11px] text-zinc-500">
            Configure os métodos disponíveis na aba <strong>Ofertas</strong>.
          </p>
        </div>
      </Section>

      <Section title="Layout do checkout" desc="Escolha a estrutura visual.">
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 1 as const, label: "1 Coluna", Icon: Square },
            { key: 2 as const, label: "2 Colunas", Icon: Columns2 },
          ].map((opt) => {
            const isActive = theme.layoutColumns === opt.key;
            const Icon = opt.Icon;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setT("layoutColumns", opt.key)}
                className={`group flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition ${
                  isActive
                    ? "border-cyan-400 bg-cyan-400/[0.05]"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
                }`}
              >
                <Icon
                  className={`size-10 ${
                    isActive ? "text-cyan-300" : "text-zinc-500 group-hover:text-zinc-300"
                  }`}
                  strokeWidth={1.5}
                />
                <span className={`text-xs font-medium ${isActive ? "text-cyan-300" : "text-zinc-300"}`}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Ordem dos blocos" desc="Arraste pra reorganizar a ordem dos blocos no checkout.">
        <BlockOrderEditor
          order={theme.blockOrder}
          onChange={(arr) => setT("blockOrder", arr)}
        />
      </Section>

      <Section title="Blocos opcionais" desc="Mostre/oculte blocos individuais.">
        <BlockToggle
          label="Cabeçalho Padrão"
          desc="Faixa de segurança colorida no topo."
          value={theme.blockHeader}
          onChange={(v) => setT("blockHeader", v)}
        />
        <BlockToggle
          label="Resumo do Pedido"
          desc="Card com produto + preço + texto de garantia."
          value={theme.blockOrderSummary}
          onChange={(v) => setT("blockOrderSummary", v)}
        />
        <BlockToggle
          label="Order Bump"
          desc={hasBump ? "Mostra o produto adicional configurado em Ofertas." : "Configure um order bump na aba Ofertas pra ativar."}
          value={theme.blockOrderBump}
          onChange={(v) => setT("blockOrderBump", v)}
          disabled={!hasBump}
        />
        <BlockToggle
          label="Campo de Cupom"
          desc="Caixa pro cliente digitar cupom de desconto."
          value={theme.blockCoupon}
          onChange={(v) => setT("blockCoupon", v)}
        />
        <BlockToggle
          label="Selos de Segurança"
          desc="Selos SSL, criptografia, garantia."
          value={theme.blockSecuritySeals}
          onChange={(v) => setT("blockSecuritySeals", v)}
        />
        <BlockToggle
          label="Depoimentos"
          desc="Prova social — clientes que compraram."
          value={theme.blockTestimonials}
          onChange={(v) => setT("blockTestimonials", v)}
        />
      </Section>
    </div>
  );
}

function TiktokShopEditor({ theme, setT }: EditorProps) {
  const c = { ...DEFAULT_TIKTOK_SHOP, ...(theme.tiktokShop ?? {}) };
  function update<K extends keyof TiktokShopConfig>(
    k: K,
    v: TiktokShopConfig[K],
  ) {
    setT("tiktokShop", { ...(theme.tiktokShop ?? {}), [k]: v });
  }
  return (
    <>
      <Section
        title="Galeria de imagens"
        desc="Carrossel do produto (estilo TikTok Shop). Sem imagens aqui, usa a imagem do produto."
      >
        {c.gallery.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {c.gallery.map((img, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="size-16 rounded-lg object-cover border border-white/10" />
                <button
                  type="button"
                  onClick={() => update("gallery", c.gallery.filter((_, idx) => idx !== i))}
                  className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-red-500 text-white text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <FileUpload
          purpose="gallery"
          accept="image/*"
          currentUrl={null}
          onUploaded={(r) => update("gallery", [...c.gallery, r.url])}
          onCleared={() => {}}
          label="Adicionar imagem à galeria"
          helper="JPG, PNG, WEBP — pode adicionar várias"
        />
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <Label>Vídeo do produto (1º slide do carrossel)</Label>
          <Input
            value={c.galleryVideo}
            placeholder="Cole o link do vídeo (mp4/webm)…"
            onChange={(e) => update("galleryVideo", e.target.value)}
          />
          <div className="mt-2">
            <FileUpload
              purpose="gallery"
              accept="video/mp4,video/webm"
              currentUrl={c.galleryVideo || null}
              onUploaded={(r) => update("galleryVideo", r.url)}
              onCleared={() => update("galleryVideo", "")}
              label="ou enviar vídeo (curto, até 10MB)"
              helper="MP4 ou WEBM. Toca mudo em loop, como no TikTok Shop."
            />
          </div>
        </div>
      </Section>

      <Section title="Oferta" desc="Desconto, contador de escassez, nota e vendidos.">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>% de desconto (mostra preço &quot;de&quot;)</Label>
            <Input
              type="number"
              value={String(c.discountPercent)}
              onChange={(e) => update("discountPercent", Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
            />
          </div>
          <div>
            <Label>Countdown (minutos)</Label>
            <Input
              type="number"
              value={String(c.countdownMinutes)}
              onChange={(e) => update("countdownMinutes", Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <Label>Nota (ex 4.9)</Label>
            <Input value={c.ratingValue} onChange={(e) => update("ratingValue", e.target.value)} />
          </div>
          <div>
            <Label>Qtd avaliações</Label>
            <Input
              type="number"
              value={String(c.ratingCount)}
              onChange={(e) => update("ratingCount", Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="col-span-2">
            <Label>Texto de vendidos (ex &quot;1.2mil vendidos&quot;)</Label>
            <Input value={c.soldText} onChange={(e) => update("soldText", e.target.value)} />
          </div>
        </div>
      </Section>

      <Section title="Proteção do cliente" desc="Itens de garantia exibidos em destaque.">
        <div className="space-y-2">
          {c.protection.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={t}
                onChange={(e) => update("protection", c.protection.map((x, idx) => (idx === i ? e.target.value : x)))}
              />
              <button
                type="button"
                onClick={() => update("protection", c.protection.filter((_, idx) => idx !== i))}
                className="shrink-0 rounded-md border border-white/10 px-2 py-1.5 text-xs text-zinc-400 hover:text-red-300"
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => update("protection", [...c.protection, "Novo item de proteção"])}
            className="rounded-md border border-dashed border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.04]"
          >
            + Adicionar item
          </button>
        </div>
      </Section>

      <Section title="Avaliações" desc="Reviews com nota e foto opcional.">
        <div className="space-y-3">
          {c.reviews.map((r, i) => (
            <div key={i} className="rounded-lg border border-white/10 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={r.name}
                  placeholder="Nome"
                  onChange={(e) => update("reviews", c.reviews.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
                />
                <Input
                  type="number"
                  value={String(r.stars)}
                  placeholder="Estrelas (1-5)"
                  onChange={(e) => update("reviews", c.reviews.map((x, idx) => (idx === i ? { ...x, stars: Math.max(1, Math.min(5, Number(e.target.value) || 5)) } : x)))}
                />
              </div>
              <Input
                value={r.text}
                placeholder="Texto da avaliação"
                onChange={(e) => update("reviews", c.reviews.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))}
              />
              <FileUpload
                purpose="review"
                accept="image/*"
                currentUrl={r.photo || null}
                onUploaded={(up) => update("reviews", c.reviews.map((x, idx) => (idx === i ? { ...x, photo: up.url } : x)))}
                onCleared={() => update("reviews", c.reviews.map((x, idx) => (idx === i ? { ...x, photo: undefined } : x)))}
                label="Foto (opcional)"
                helper="JPG/PNG"
              />
              <button
                type="button"
                onClick={() => update("reviews", c.reviews.filter((_, idx) => idx !== i))}
                className="text-xs text-zinc-400 hover:text-red-300"
              >
                Remover avaliação
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => update("reviews", [...c.reviews, { name: "Cliente", stars: 5, text: "" }])}
            className="rounded-md border border-dashed border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.04]"
          >
            + Adicionar avaliação
          </button>
          <BulkReviewImport
            onImport={(rows) => update("reviews", [...c.reviews, ...rows])}
          />
        </div>
      </Section>

      <Section
        title="Variantes"
        desc="Opções (cor/modelo) — trocam a imagem principal e podem ajustar o preço (cobrado de verdade)."
      >
        <div>
          <Label>Título do bloco (ex &quot;Cor&quot;)</Label>
          <Input value={c.variantsLabel} onChange={(e) => update("variantsLabel", e.target.value)} />
        </div>
        <div className="mt-2 space-y-2">
          {c.variants.map((v, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] p-2">
              <Input
                value={v.label}
                placeholder="Nome da opção"
                onChange={(e) => update("variants", c.variants.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
              />
              <div className="w-28 shrink-0">
                <Input
                  type="number"
                  value={v.priceDeltaCents != null ? String(v.priceDeltaCents / 100) : ""}
                  placeholder="+R$ 0"
                  onChange={(e) => {
                    const reais = e.target.value;
                    const cents = reais === "" ? undefined : Math.round(Number(reais) * 100);
                    update("variants", c.variants.map((x, idx) => (idx === i ? { ...x, priceDeltaCents: Number.isFinite(cents as number) ? cents : undefined } : x)));
                  }}
                />
              </div>
              <div className="w-40 shrink-0">
                <FileUpload
                  purpose="variant"
                  accept="image/*"
                  currentUrl={v.image || null}
                  onUploaded={(up) => update("variants", c.variants.map((x, idx) => (idx === i ? { ...x, image: up.url } : x)))}
                  onCleared={() => update("variants", c.variants.map((x, idx) => (idx === i ? { ...x, image: undefined } : x)))}
                  label="Imagem"
                  helper=""
                />
              </div>
              <button
                type="button"
                onClick={() => update("variants", c.variants.filter((_, idx) => idx !== i))}
                className="shrink-0 rounded-md border border-white/10 px-2 py-1.5 text-xs text-zinc-400 hover:text-red-300"
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => update("variants", [...c.variants, { label: "Opção" }])}
            className="rounded-md border border-dashed border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.04]"
          >
            + Adicionar variante
          </button>
        </div>
      </Section>

      <Section
        title="Prova social ao vivo"
        desc="Pop-ups de venda recente + contador de pessoas vendo agora."
      >
        <BlockToggle
          label="Ativar prova social"
          desc="Mostra notificações de compra e o contador de viewers."
          value={c.socialProofEnabled}
          onChange={(v) => update("socialProofEnabled", v)}
        />
        {c.socialProofEnabled && (
          <div className="mt-3 space-y-3">
            <div>
              <Label>Nomes dos pop-ups (um por linha)</Label>
              <textarea
                value={c.socialProofNames.join("\n")}
                onChange={(e) =>
                  update(
                    "socialProofNames",
                    e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  )
                }
                rows={5}
                placeholder={"João de São Paulo\nMaria do Rio de Janeiro"}
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/40 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Cada linha vira um pop-up &quot;Fulano comprou agora&quot;.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Viewers — mínimo</Label>
                <Input
                  type="number"
                  value={String(c.viewersMin)}
                  onChange={(e) => update("viewersMin", Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div>
                <Label>Viewers — máximo</Label>
                <Input
                  type="number"
                  value={String(c.viewersMax)}
                  onChange={(e) => update("viewersMax", Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}

/**
 * Importação em massa de avaliações. Cola um bloco de texto, uma review por
 * linha no formato "Nome | estrelas | texto" (estrelas e texto opcionais).
 * Ex: "Ana C. | 5 | Produto excelente, recomendo!".
 */
function BulkReviewImport({
  onImport,
}: {
  onImport: (rows: { name: string; stars: number; text: string }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");

  function parse() {
    const rows = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((p) => p.trim());
        const name = parts[0] || "Cliente";
        let stars = 5;
        let text = "";
        if (parts.length >= 3) {
          // "Nome | estrelas | texto"
          stars = Math.max(1, Math.min(5, Number(parts[1]) || 5));
          text = parts.slice(2).join(" | ");
        } else if (parts.length === 2) {
          // "Nome | estrelas" OU "Nome | texto"
          const n = Number(parts[1]);
          if (!Number.isNaN(n) && n >= 1 && n <= 5 && parts[1].length <= 2) {
            stars = n;
          } else {
            text = parts[1];
          }
        }
        return { name, stars, text };
      });
    if (rows.length > 0) onImport(rows);
    setRaw("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-2 rounded-md border border-dashed border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.04]"
      >
        ⇩ Importar em massa
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-white/10 p-3 space-y-2">
      <Label>Cole as avaliações — uma por linha</Label>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={6}
        placeholder={"Ana C. | 5 | Produto excelente, recomendo!\nMarcos R. | 4 | Chegou rápido."}
        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/40 focus:outline-none"
      />
      <p className="text-[11px] text-zinc-500">
        Formato: <code>Nome | estrelas | texto</code>. Estrelas e texto opcionais.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={parse}
          className="rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-cyan-300"
        >
          Importar
        </button>
        <button
          type="button"
          onClick={() => {
            setRaw("");
            setOpen(false);
          }}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function MercadoLivreEditor({ theme, setT }: EditorProps) {
  const c = { ...DEFAULT_MERCADO_LIVRE, ...(theme.mercadoLivre ?? {}) };
  function update<K extends keyof MercadoLivreConfig>(
    k: K,
    v: MercadoLivreConfig[K],
  ) {
    setT("mercadoLivre", { ...(theme.mercadoLivre ?? {}), [k]: v });
  }
  return (
    <>
      <Section title="Customizar — Mercado Livre" desc="Títulos das seções.">
        <div className="space-y-3">
          <div>
            <Label>Título do resumo</Label>
            <Input value={c.summaryTitle} onChange={(e) => update("summaryTitle", e.target.value)} />
          </div>
          <div>
            <Label>Título do pagamento</Label>
            <Input value={c.payTitle} onChange={(e) => update("payTitle", e.target.value)} />
          </div>
          <div>
            <Label>Título da garantia</Label>
            <Input value={c.guaranteeTitle} onChange={(e) => update("guaranteeTitle", e.target.value)} />
          </div>
        </div>
      </Section>
      <Section title="Compra Garantida" desc="Itens do selo de garantia.">
        <div className="space-y-2">
          {c.guarantees.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={g}
                onChange={(e) => update("guarantees", c.guarantees.map((x, idx) => (idx === i ? e.target.value : x)))}
              />
              <button
                type="button"
                onClick={() => update("guarantees", c.guarantees.filter((_, idx) => idx !== i))}
                className="shrink-0 rounded-md border border-white/10 px-2 py-1.5 text-xs text-zinc-400 hover:text-red-300"
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => update("guarantees", [...c.guarantees, "Nova garantia"])}
            className="rounded-md border border-dashed border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.04]"
          >
            + Adicionar garantia
          </button>
        </div>
      </Section>
    </>
  );
}

function AmazonEditor({ theme, setT }: EditorProps) {
  const c = { ...DEFAULT_AMAZON, ...(theme.amazon ?? {}) };
  function update<K extends keyof AmazonConfig>(k: K, v: AmazonConfig[K]) {
    setT("amazon", { ...(theme.amazon ?? {}), [k]: v });
  }
  return (
    <>
      <Section title="Customizar — Amazon" desc="Títulos das seções e do resumo do pedido.">
        <div className="space-y-3">
          <div>
            <Label>Título do topo</Label>
            <Input value={c.headerTitle} onChange={(e) => update("headerTitle", e.target.value)} />
          </div>
          <div>
            <Label>Título do endereço</Label>
            <Input value={c.addressTitle} onChange={(e) => update("addressTitle", e.target.value)} />
          </div>
          <div>
            <Label>Título do pagamento</Label>
            <Input value={c.paymentTitle} onChange={(e) => update("paymentTitle", e.target.value)} />
          </div>
          <div>
            <Label>Título da revisão dos itens</Label>
            <Input value={c.reviewTitle} onChange={(e) => update("reviewTitle", e.target.value)} />
          </div>
          <div>
            <Label>Título do resumo</Label>
            <Input value={c.summaryTitle} onChange={(e) => update("summaryTitle", e.target.value)} />
          </div>
          <div>
            <Label>Texto do botão</Label>
            <Input value={c.ctaText} onChange={(e) => update("ctaText", e.target.value)} />
          </div>
        </div>
      </Section>
      <Section title="Entrega & segurança" desc="Selos de entrega e garantia (estilo Amazon).">
        <div className="space-y-3">
          <div>
            <Label>Selo de entrega</Label>
            <Input value={c.deliveryBadge} onChange={(e) => update("deliveryBadge", e.target.value)} />
          </div>
          <div>
            <Label>Observação de entrega</Label>
            <Input value={c.deliveryNote} onChange={(e) => update("deliveryNote", e.target.value)} />
          </div>
          <div>
            <Label>Texto de frete grátis</Label>
            <Input value={c.freeShippingText} onChange={(e) => update("freeShippingText", e.target.value)} />
          </div>
          <div>
            <Label>Texto de segurança</Label>
            <Input value={c.securityText} onChange={(e) => update("securityText", e.target.value)} />
          </div>
        </div>
      </Section>
    </>
  );
}

function ShopeeEditor({ theme, setT }: EditorProps) {
  const c = { ...DEFAULT_SHOPEE, ...(theme.shopee ?? {}) };
  function update<K extends keyof ShopeeConfig>(k: K, v: ShopeeConfig[K]) {
    setT("shopee", { ...(theme.shopee ?? {}), [k]: v });
  }
  return (
    <>
      <Section title="Customizar — Shopee" desc="Cor da marca, títulos das seções e do botão.">
        <div className="space-y-3">
          <div>
            <Label>Cor da marca (header, total, botão)</Label>
            <ColorInput value={c.brandColor} onChange={(v) => update("brandColor", v)} />
          </div>
          <div>
            <Label>Título do topo</Label>
            <Input value={c.headerTitle} onChange={(e) => update("headerTitle", e.target.value)} />
          </div>
          <div>
            <Label>Título do endereço</Label>
            <Input value={c.addressTitle} onChange={(e) => update("addressTitle", e.target.value)} />
          </div>
          <div>
            <Label>Título do pagamento</Label>
            <Input value={c.paymentTitle} onChange={(e) => update("paymentTitle", e.target.value)} />
          </div>
          <div>
            <Label>Título do resumo</Label>
            <Input value={c.summaryTitle} onChange={(e) => update("summaryTitle", e.target.value)} />
          </div>
          <div>
            <Label>Texto do botão</Label>
            <Input value={c.ctaText} onChange={(e) => update("ctaText", e.target.value)} />
          </div>
        </div>
      </Section>
      <Section title="Voucher, frete & garantia" desc="Elementos de confiança no estilo Shopee.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Label do voucher</Label>
              <Input value={c.voucherLabel} onChange={(e) => update("voucherLabel", e.target.value)} />
            </div>
            <div>
              <Label>Placeholder do voucher</Label>
              <Input value={c.voucherPlaceholder} onChange={(e) => update("voucherPlaceholder", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Texto de frete grátis</Label>
            <Input value={c.shippingFreeText} onChange={(e) => update("shippingFreeText", e.target.value)} />
          </div>
          <div>
            <Label>Texto da garantia</Label>
            <Input value={c.guaranteeText} onChange={(e) => update("guaranteeText", e.target.value)} />
          </div>
          <div>
            <Label>Texto de cashback (vazio = esconde)</Label>
            <Input value={c.cashbackText} onChange={(e) => update("cashbackText", e.target.value)} />
          </div>
        </div>
      </Section>
    </>
  );
}

function AbTestEditor({ theme, setT }: EditorProps) {
  const ab = theme.abTest ?? {};
  const enabled = ab.enabled ?? false;
  const templateA = theme.template ?? "extra";
  const split = ab.splitPercent ?? 50;
  function update<K extends keyof AbTestConfig>(k: K, v: AbTestConfig[K]) {
    setT("abTest", { ...(theme.abTest ?? {}), [k]: v });
  }
  return (
    <Section
      title="Teste A/B de template"
      desc="Divide o tráfego entre o template atual (A) e um segundo template (B) pra descobrir qual converte mais. Cada visitante vê sempre o mesmo (sticky)."
    >
      <BlockToggle
        label="Ativar teste A/B"
        desc="As vendas vêm marcadas com o braço (A/B) na aba Vendas."
        value={enabled}
        onChange={(v) => update("enabled", v)}
      />
      {enabled && (
        <div className="mt-3 space-y-3">
          <div>
            <Label>Template B (o A é o atual: {templateA})</Label>
            <Select
              value={ab.templateB ?? ""}
              onChange={(v) => update("templateB", v)}
            >
              <option value="">Selecione um template…</option>
              {TEMPLATES_META.filter((t) => t.key !== templateA).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>% do tráfego no B</Label>
            <Input
              type="number"
              value={String(split)}
              onChange={(e) =>
                update(
                  "splitPercent",
                  Math.max(1, Math.min(99, Number(e.target.value) || 50)),
                )
              }
            />
          </div>
          {ab.templateB && (
            <p className="text-[11px] text-zinc-500">
              A: <strong>{templateA}</strong> ({100 - split}%) · B:{" "}
              <strong>{ab.templateB}</strong> ({split}%)
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

function ConteudoTab({
  theme,
  setT,
  products,
  selectedProductId,
  setProductId,
  priceOverride,
  setPriceOverride,
  productPriceCents,
}: {
  theme: ReturnType<typeof withDefaults>;
  setT: <K extends keyof CheckoutTheme>(k: K, v: CheckoutTheme[K]) => void;
  products: Product[];
  selectedProductId: string;
  setProductId: (v: string) => void;
  priceOverride: string;
  setPriceOverride: (v: string) => void;
  productPriceCents: number;
}) {
  const tpl = theme.template;
  return (
    <div className="space-y-6">
      {/* Configurações específicas do template no topo */}
      {tpl === "auto" && <AutoEditor theme={theme} setT={setT} />}
      {tpl === "extra" && <ExtraEditor theme={theme} setT={setT} />}
      {tpl === "simple" && <SimpleEditor theme={theme} setT={setT} />}
      {tpl === "drop" && <DropEditor theme={theme} setT={setT} />}
      {tpl === "fast" && <FastEditor theme={theme} setT={setT} />}
      {tpl === "tiktok_shop" && <TiktokShopEditor theme={theme} setT={setT} />}
      {tpl === "mercado_livre" && <MercadoLivreEditor theme={theme} setT={setT} />}
      {tpl === "amazon" && <AmazonEditor theme={theme} setT={setT} />}
      {tpl === "shopee" && <ShopeeEditor theme={theme} setT={setT} />}
      {/* PixResultEditor sempre aparece — não há mais template "custom" */}
      <PixResultEditor theme={theme} setT={setT} />

      {/* Teste A/B de template — divide o tráfego entre 2 templates */}
      <AbTestEditor theme={theme} setT={setT} />

      <Section title="Produto vinculado" desc="Qual produto este checkout vai vender (define o entregável).">
        <Select value={selectedProductId} onChange={setProductId}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <p className="text-[11px] text-zinc-500">
          O <strong>produto</strong> define o entregável (PDF, link, conteúdo). Este{" "}
          <strong>checkout</strong> define o preço, o estilo e os funis (bump, upsell).
        </p>
      </Section>

      <Section title="Preço deste checkout" desc="Cada checkout pode ter um preço próprio. Deixe vazio pra usar o preço do produto.">
        <div>
          <Label>Preço (R$)</Label>
          <Input
            value={priceOverride}
            onChange={(e) => setPriceOverride(e.target.value)}
            placeholder={centsToBRLInput(productPriceCents)}
            inputMode="decimal"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Preço do produto: <strong className="font-mono">{formatBRL(productPriceCents)}</strong>
            {priceOverride && parseBRLToCents(priceOverride) > 0 && (
              <>
                {" · "}
                <span className="text-cyan-300">
                  Este checkout: {formatBRL(parseBRLToCents(priceOverride))}
                </span>
              </>
            )}
          </p>
        </div>
      </Section>

      <Section title="Identificação interna" desc="Pra organizar suas campanhas (não aparece pro cliente).">
        <div>
          <Label>Nome interno</Label>
          <Input
            value={theme.internalName}
            onChange={(e) => setT("internalName", e.target.value)}
            placeholder="Ex.: Campanha junho 2026 — Facebook"
          />
        </div>
      </Section>

      <Section title="Conteúdo visível" desc="O que o cliente vê.">
        <div>
          <Label>Nome visível (substitui nome do produto)</Label>
          <Input
            value={theme.visibleName}
            onChange={(e) => setT("visibleName", e.target.value)}
            placeholder="Deixe vazio pra usar o nome do produto"
          />
        </div>
        <div>
          <Label>Imagem do produto (override)</Label>
          <FileUpload
            purpose="cover"
            accept="image/*"
            currentUrl={theme.productImageOverride || null}
            onUploaded={(r) => setT("productImageOverride", r.url)}
            onCleared={() => setT("productImageOverride", "")}
            label="Enviar imagem"
            helper="Substitui só neste checkout. JPG/PNG/WEBP — máx. 10MB."
          />
        </div>
      </Section>

      {/* 30/07/2026 (davi 'reveja TODAS as funcoes'): "Título do resumo" e
          "Texto de garantia" foram REMOVIDOS daqui — nenhum template público
          lia theme.summaryTitle/summarySafety (cada template tem a própria
          copy de resumo, editável na seção do template lá em cima). Eram
          campos que o seller preenchia e não mudavam nada no checkout.
          headerText continua, esse SIM é aplicado em todos os templates. */}
      <Section title="Textos do checkout" desc="Copy do cabeçalho de segurança.">
        <div>
          <Label>Texto do cabeçalho</Label>
          <Input
            value={theme.headerText}
            onChange={(e) => setT("headerText", e.target.value)}
            placeholder="Pagamento 100% Seguro"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Os demais textos (resumo, botões, garantias) ficam na seção do seu
            template, no topo desta aba.
          </p>
        </div>
      </Section>
    </div>
  );
}

function CamposTab({
  theme,
  setT,
}: {
  theme: ReturnType<typeof withDefaults>;
  setT: <K extends keyof CheckoutTheme>(k: K, v: CheckoutTheme[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <Section title="Dados do comprador" desc="Escolha quais campos aparecem.">
        <FieldToggle label="Nome" value={theme.fieldName} onChange={(v) => setT("fieldName", v)} />
        <FieldToggle label="E-mail" value={theme.fieldEmail} onChange={(v) => setT("fieldEmail", v)} />
        <FieldToggle label="Telefone / WhatsApp" value={theme.fieldPhone} onChange={(v) => setT("fieldPhone", v)} />
        <FieldToggle label="CPF" value={theme.fieldCpf} onChange={(v) => setT("fieldCpf", v)} />
        {/*
          CEP REMOVIDO daqui de propósito. Endereço completo (CEP + rua + nº +
          bairro + cidade + UF) é controlado EXCLUSIVAMENTE pelo toggle
          "Produto físico" abaixo — separar deixa o builder mais previsível.
        */}
      </Section>

      <Section title="Produto" desc="Comportamento do produto principal.">
        {/* Moeda do checkout — modifica o simbolo exibido em todos os templates */}
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Moeda do checkout
          </label>
          <p className="text-[11px] text-zinc-500 mb-2">
            Define símbolo + formatação exibida (preço, bumps, total).
            Cliente vê <code className="text-zinc-300">R$</code>,{" "}
            <code className="text-zinc-300">$</code> ou{" "}
            <code className="text-zinc-300">€</code> conforme o setting aqui.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { key: "BRL", label: "Real", symbol: "R$", flag: "🇧🇷" },
                { key: "USD", label: "Dollar", symbol: "$", flag: "🇺🇸" },
                { key: "EUR", label: "Euro", symbol: "€", flag: "🇪🇺" },
              ] as const
            ).map((c) => {
              const active = (theme.currency || "BRL") === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setT("currency", c.key)}
                  className={`flex items-center gap-2 rounded-lg border-2 px-2.5 py-2 text-sm transition ${
                    active
                      ? "border-cyan-400 bg-cyan-400/[0.08] text-white"
                      : "border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:border-white/[0.16]"
                  }`}
                >
                  <span className="text-lg">{c.flag}</span>
                  <span className="font-medium">{c.symbol}</span>
                  <span className="text-[10px] text-zinc-500">{c.key}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Toggle
          label="Habilitar seletor de quantidade"
          desc="Cliente pode comprar múltiplas unidades."
          value={theme.showQuantity}
          onChange={(v) => setT("showQuantity", v)}
        />
        {theme.template === "drop" || theme.template === "dropv2" ? (
          <Toggle
            label="Produto físico (requer endereço)"
            desc="🔒 Travado em ON: templates Drop/Drop V2 SEMPRE exigem endereço (são checkouts de etapas pra dropshipping/produto físico)."
            value={true}
            onChange={() => {
              /* no-op — drop/dropv2 sempre força true */
            }}
            disabled
          />
        ) : (
          <Toggle
            label="Produto físico (requer endereço)"
            desc="Pede CEP + endereço completo na entrega. Único modo de pedir CEP."
            value={theme.isPhysical}
            onChange={(v) => setT("isPhysical", v)}
          />
        )}
      </Section>

      <Section
        title="Envio de comprovante"
        desc="Deixa o lead anexar o comprovante do PIX na tela de pagamento. Os comprovantes aparecem na aba Vendas, em cada venda."
      >
        <Toggle
          label="📎 Receber comprovante do lead"
          desc="Mostra um campo 'Enviar comprovante' na tela do PIX. Desligado por padrão."
          value={theme.receiptUpload}
          onChange={(v) => setT("receiptUpload", v)}
        />
      </Section>

      <Section
        title="Tradução automática"
        desc="Traduz o checkout pro idioma do navegador do cliente automaticamente."
      >
        <Toggle
          label="🌐 Ativar tradução automática"
          desc={
            "Detecta navigator.language do cliente. Cobre EN/ES/FR/IT/DE com dicionário interno (títulos, labels, CTAs, PIX result, placeholders). Brasileiros (pt) continuam vendo em PT. Outros idiomas: marca <html lang=\"pt-BR\"> pra Chrome/Edge oferecer tradução completa da página."
          }
          value={theme.autoTranslate}
          onChange={(v) => setT("autoTranslate", v)}
        />
      </Section>
    </div>
  );
}

const PAYMENT_METHOD_OPTIONS: {
  key: string;
  label: string;
  desc: string;
}[] = [
  { key: "pix", label: "Pix", desc: "BR — instantâneo" },
  { key: "card", label: "Cartão", desc: "Crédito/débito" },
  { key: "apple_pay", label: "Apple Pay", desc: "Wallet iOS" },
  { key: "google_pay", label: "Google Pay", desc: "Wallet Android" },
];

/**
 * Gerenciador dos métodos de pagamento: lista os ATIVOS em ordem (drag-ish
 * via setas up/down) + chips dos INATIVOS embaixo pra ativar. Primeiro da
 * lista ativa = método pré-selecionado pro comprador.
 */
function PaymentMethodsManager({
  methods,
  toggleMethod,
  moveMethod,
  setAsDefault,
}: {
  methods: string[];
  toggleMethod: (m: string) => void;
  moveMethod: (key: string, dir: "up" | "down") => void;
  setAsDefault: (key: string) => void;
}) {
  const active = methods
    .map((m) => PAYMENT_METHOD_OPTIONS.find((o) => o.key === m))
    .filter((x): x is (typeof PAYMENT_METHOD_OPTIONS)[number] => !!x);
  const inactive = PAYMENT_METHOD_OPTIONS.filter(
    (o) => !methods.includes(o.key),
  );
  return (
    <div className="space-y-4">
      {/* Ativos — em ordem */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
          Métodos ativos · arraste pra reordenar
        </p>
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-6 text-center text-xs text-zinc-500">
            Nenhum método ativo. Ative um abaixo.
          </div>
        ) : (
          <div className="space-y-1.5">
            {active.map((m, idx) => {
              const isDefault = idx === 0;
              return (
                <div
                  key={m.key}
                  className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 ${
                    isDefault
                      ? "border-cyan-400/50 bg-cyan-400/[0.06]"
                      : "border-white/[0.06] bg-black/30"
                  }`}
                >
                  <span className="text-zinc-500 text-xs w-5 text-center tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">
                        {m.label}
                      </p>
                      {isDefault && (
                        <span className="rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300 uppercase tracking-wider">
                          Pré-selecionado
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500">{m.desc}</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveMethod(m.key, "up")}
                      disabled={idx === 0}
                      className="rounded p-1 text-zinc-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Mover pra cima"
                    >
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMethod(m.key, "down")}
                      disabled={idx === active.length - 1}
                      className="rounded p-1 text-zinc-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Mover pra baixo"
                    >
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() => setAsDefault(m.key)}
                        className="rounded p-1 text-zinc-400 hover:bg-white/[0.05] hover:text-yellow-300"
                        title="Marcar como pré-selecionado"
                      >
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleMethod(m.key)}
                      className="rounded p-1 text-zinc-400 hover:bg-red-500/15 hover:text-red-300"
                      title="Desativar"
                    >
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
                        <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inativos — chips clicáveis */}
      {inactive.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
            Disponíveis · clique pra ativar
          </p>
          <div className="flex flex-wrap gap-2">
            {inactive.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleMethod(m.key)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:border-cyan-400/40 hover:text-white transition"
              >
                <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
                  <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
                </svg>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OfertasTab({
  products,
  selectedProductId,
  bumpId,
  setBumpId,
  bumpPosition,
  setBumpPosition,
  variantsLink,
  variantCount,
  theme,
  setT,
  methods,
  toggleMethod,
  moveMethod,
  setAsDefaultMethod,
  checkoutId,
  orderBumps,
  shippingOptions,
}: {
  products: Product[];
  selectedProductId: string;
  bumpId: string;
  setBumpId: (v: string) => void;
  bumpPosition: string;
  setBumpPosition: (v: string) => void;
  upsellUrl?: string;
  setUpsellUrl?: (v: string) => void;
  variantsLink: string;
  variantCount: number;
  theme: ReturnType<typeof withDefaults>;
  setT: <K extends keyof CheckoutTheme>(k: K, v: CheckoutTheme[K]) => void;
  methods: string[];
  toggleMethod: (m: string) => void;
  moveMethod: (key: string, dir: "up" | "down") => void;
  setAsDefaultMethod: (key: string) => void;
  checkoutId: string;
  orderBumps: OrderBumpItem[];
  shippingOptions: ShippingItem[];
}) {
  return (
    <div className="space-y-6">
      <Section
        title="Métodos de pagamento"
        desc="Ative apenas os métodos que esse checkout aceita. O primeiro da lista vira o método pré-selecionado pro comprador. Arraste/reordene pelas setas."
      >
        <PaymentMethodsManager
          methods={methods}
          toggleMethod={toggleMethod}
          moveMethod={moveMethod}
          setAsDefault={setAsDefaultMethod}
        />
        {methods.length === 0 && (
          <p className="mt-3 text-[11px] text-red-300">
            ⚠️ Nenhum método ativo — o checkout não vai funcionar.
          </p>
        )}
      </Section>

      <BumpsShippingManager
        checkoutId={checkoutId}
        bumps={orderBumps}
        shipping={shippingOptions}
      />

      {orderBumps.length > 0 && (
        <Section
          title="Posicao dos Order Bumps"
          desc="Onde os bumps aparecem no checkout. Escolha o local que converte mais pra sua oferta."
        >
          <BumpPositionPicker
            value={bumpPosition}
            onChange={setBumpPosition}
          />
        </Section>
      )}

      <Section title="A/B Testing" desc="Variantes pra testar headlines, preços e CTAs.">
        <Link
          href={variantsLink}
          className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm hover:border-cyan-400/30 hover:bg-white/[0.04] transition"
        >
          <div className="flex items-center gap-3">
            <FlaskConical className="size-4 text-cyan-400" />
            <div>
              <p className="text-white">Gerenciar variantes</p>
              <p className="text-[11px] text-zinc-500">{variantCount} ativa{variantCount !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <ChevronRight className="size-4 text-zinc-500" />
        </Link>
      </Section>
    </div>
  );
}

function ExtrasTab({
  theme,
  setT,
  videoUrl,
  setVideoUrl,
  videoHeadline,
  setVideoHeadline,
}: {
  theme: ReturnType<typeof withDefaults>;
  setT: <K extends keyof CheckoutTheme>(k: K, v: CheckoutTheme[K]) => void;
  videoUrl: string;
  setVideoUrl: (v: string) => void;
  videoHeadline: string;
  setVideoHeadline: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <Collapsible title="Banner de anúncio">
        <Toggle label="Mostrar banner" value={theme.bannerEnabled} onChange={(v) => setT("bannerEnabled", v)} />
        <div>
          <Label>Texto</Label>
          <Input value={theme.bannerText} onChange={(e) => setT("bannerText", e.target.value)} placeholder="🔥 Últimas vagas — leve hoje" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fundo</Label>
            <ColorInput value={theme.bannerBg} onChange={(v) => setT("bannerBg", v)} />
          </div>
          <div>
            <Label>Texto</Label>
            <ColorInput value={theme.bannerColor} onChange={(v) => setT("bannerColor", v)} />
          </div>
        </div>
      </Collapsible>

      <Collapsible title="Banner em imagem (topo absoluto)">
        <p className="text-[11px] text-zinc-400">
          Renderiza uma imagem full-width ANTES de tudo no checkout (em cima
          de todo o conteúdo). O tamanho é o natural da imagem que você
          enviar — preserva proporção. Funciona em todos os templates.
        </p>

        <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.07] p-3">
          <p className="text-[12px] font-semibold text-amber-200">
            Banner não está aparecendo no checkout?
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
            É só <strong>reenviar a imagem aqui embaixo</strong>. Banners
            antigos (enviados antes da última atualização do sistema) podem ter
            parado de carregar. Ao reenviar, a imagem vai pro armazenamento
            novo e volta a funcionar na hora — em todos os checkouts.
          </p>
        </div>

        <div>
          <Label>Imagem do banner</Label>
          <BannerImageInput
            value={theme.bannerImageUrl}
            onChange={(url) => setT("bannerImageUrl", url)}
          />
        </div>

        <div>
          <Label>Link ao clicar (opcional)</Label>
          <Input
            value={theme.bannerImageHref}
            onChange={(e) => setT("bannerImageHref", e.target.value)}
            placeholder="https://… (deixe vazio se o banner não for clicável)"
          />
        </div>

        {theme.bannerImageUrl && (
          <div className="rounded-lg border border-white/[0.06] bg-black/30 p-2">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
              Preview <span className="normal-case tracking-normal">(o xadrez marca as áreas transparentes)</span>
            </p>
            <div style={{ background: TRANSPARENCY_CHECKER }}>
              <BannerImage
                src={theme.bannerImageUrl}
                fallback={
                  <div className="rounded border border-amber-400/30 bg-amber-400/[0.07] p-3 text-center text-[11px] text-amber-100/80">
                    Esta imagem não carregou. Reenvie o banner acima pra
                    consertar.
                  </div>
                }
              />
            </div>
          </div>
        )}
      </Collapsible>

      <Collapsible title="Contador de escassez">
        <Toggle label="Mostrar contador" value={theme.countdownEnabled} onChange={(v) => setT("countdownEnabled", v)} />
        <div>
          <Label>Duração (minutos)</Label>
          <Input type="number" min={1} max={1440} value={theme.countdownMinutes} onChange={(e) => setT("countdownMinutes", Number(e.target.value) || 15)} />
        </div>
        <div>
          <Label>Texto</Label>
          <Input value={theme.countdownText} onChange={(e) => setT("countdownText", e.target.value)} placeholder="Oferta termina em" />
        </div>

        {/* 30/07/2026 (davi 'o contador ta sem opcao de selecionar as cores').
            Em branco, o contador continua derivando do primaryColor — que é
            como todos os checkouts já publicados se parecem hoje. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fundo da barra</Label>
            <OptionalColorInput
              value={theme.countdownBg ?? ""}
              onChange={(v) => setT("countdownBg", v)}
              fallback={theme.primaryColor || "#16a34a"}
            />
          </div>
          <div>
            <Label>Cor do texto</Label>
            <OptionalColorInput
              value={theme.countdownColor ?? ""}
              onChange={(v) => setT("countdownColor", v)}
              fallback={theme.primaryColor || "#16a34a"}
            />
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Em branco = o contador usa a cor principal do checkout (padrão de
          sempre). Clique em <strong className="text-zinc-400">Auto</strong> pra
          voltar pro padrão a qualquer momento.
        </p>
      </Collapsible>

      {/* 30/07/2026 (davi): "botar uma imagem logo abaixo da mensagem" — o
          espaço embaixo do texto de termos, abaixo do botão de gerar PIX. */}
      <Collapsible title="Imagem abaixo do checkout">
        <p className="text-[11px] leading-relaxed text-zinc-400">
          Aparece logo <strong>abaixo do card do checkout</strong> — embaixo do
          texto de termos, antes dos selos. Boa pra bandeiras de pagamento,
          selo do Reclame Aqui ou arte de garantia. Funciona em todos os
          templates.
        </p>

        <div>
          <Label>Imagem</Label>
          <BannerImageInput
            value={theme.footerImageUrl ?? ""}
            onChange={(url) => setT("footerImageUrl", url)}
          />
        </div>

        <div>
          <Label>Link ao clicar (opcional)</Label>
          <Input
            value={theme.footerImageHref}
            onChange={(e) => setT("footerImageHref", e.target.value)}
            placeholder="https://… (deixe vazio se não for clicável)"
          />
        </div>

        <Toggle
          label="Esticar em tela cheia"
          desc="Desligado, a imagem acompanha a largura do checkout. Ligado, vai de ponta a ponta."
          value={theme.footerImageFull}
          onChange={(v) => setT("footerImageFull", v)}
        />

        {theme.footerImageUrl && (
          <div className="rounded-lg border border-white/[0.06] bg-black/30 p-2">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
              Preview <span className="normal-case tracking-normal">(o xadrez marca as áreas transparentes)</span>
            </p>
            <div style={{ background: TRANSPARENCY_CHECKER }}>
              <BannerImage
                src={theme.footerImageUrl}
                fallback={
                  <div className="rounded border border-amber-400/30 bg-amber-400/[0.07] p-3 text-center text-[11px] text-amber-100/80">
                    Esta imagem não carregou. Reenvie ela aqui em cima pra
                    consertar.
                  </div>
                }
              />
            </div>
          </div>
        )}
      </Collapsible>

      <Collapsible title="VSL — Vídeo de vendas">
        <BturbVideoPicker value={videoUrl} onChange={setVideoUrl} />
        <div>
          <Label>Ou cole uma URL direta (MP4/HLS)</Label>
          <Input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://cdn.exemplo.com/video.mp4"
          />
        </div>
        <div>
          <Label>Headline acima do vídeo</Label>
          <Input value={videoHeadline} onChange={(e) => setVideoHeadline(e.target.value)} placeholder="Assista antes de comprar" />
        </div>
      </Collapsible>

      <Collapsible title="Suporte WhatsApp">
        <Toggle label="Botão flutuante" value={theme.whatsappEnabled} onChange={(v) => setT("whatsappEnabled", v)} />
        <div>
          <Label>Número (com DDI/DDD)</Label>
          <Input value={theme.whatsappNumber} onChange={(e) => setT("whatsappNumber", e.target.value)} placeholder="5511999999999" />
        </div>
        <div>
          <Label>Mensagem inicial</Label>
          <Input value={theme.whatsappText} onChange={(e) => setT("whatsappText", e.target.value)} placeholder="Olá, tenho dúvida sobre…" />
        </div>
      </Collapsible>

      {/* 30/07/2026 (davi 'reveja TODAS as funcoes'): os toggles ON/OFF de
          selos e depoimentos moravam na aba "Layout", que NÃO aparece pra
          nenhum template (ver TEMPLATE_TABS). Ou seja: era impossível ligar
          depoimentos (default OFF) ou desligar selos. Trouxe os toggles pra
          cá, ao lado dos editores que eles controlam. */}
      <Collapsible title="Selos de Segurança">
        <Toggle
          label="Mostrar selos no checkout"
          desc="Faixa de garantias abaixo do formulário."
          value={theme.blockSecuritySeals}
          onChange={(v) => setT("blockSecuritySeals", v)}
        />
        <SealsEditor value={theme.securitySeals} onChange={(v) => setT("securitySeals", v)} />
      </Collapsible>

      <Collapsible title="Depoimentos">
        <Toggle
          label="Mostrar depoimentos no checkout"
          desc="Prova social abaixo do checkout. Precisa de pelo menos 1."
          value={theme.blockTestimonials}
          onChange={(v) => setT("blockTestimonials", v)}
        />
        <TestimonialsEditor value={theme.testimonials} onChange={(v) => setT("testimonials", v)} />
      </Collapsible>
    </div>
  );
}

function CoresTab({
  theme,
  setT,
}: {
  theme: ReturnType<typeof withDefaults>;
  setT: <K extends keyof CheckoutTheme>(k: K, v: CheckoutTheme[K]) => void;
}) {
  const PRESETS = [
    { name: "Trilho", primary: "#22d3ee", accent: "#22d3ee", bg: "#0a0a0a", card: "#141414", text: "#fafafa", headerBg: "#22d3ee", headerColor: "#000000", ctaBg: "#22d3ee", ctaColor: "#000000" },
    { name: "Ciano", primary: "#22d3ee", accent: "#22d3ee", bg: "#0c1e2e", card: "#0f2940", text: "#cffafe", headerBg: "#22d3ee", headerColor: "#000", ctaBg: "#22d3ee", ctaColor: "#000" },
    { name: "Rosa", primary: "#ec4899", accent: "#f472b6", bg: "#1a0a14", card: "#2a0f1e", text: "#fce7f3", headerBg: "#ec4899", headerColor: "#fff", ctaBg: "#ec4899", ctaColor: "#fff" },
    { name: "Roxo", primary: "#a855f7", accent: "#c084fc", bg: "#170a1f", card: "#28113a", text: "#f3e8ff", headerBg: "#a855f7", headerColor: "#fff", ctaBg: "#a855f7", ctaColor: "#fff" },
    { name: "Laranja", primary: "#f97316", accent: "#fb923c", bg: "#1a0e0a", card: "#2a160e", text: "#fed7aa", headerBg: "#f97316", headerColor: "#fff", ctaBg: "#f97316", ctaColor: "#fff" },
    { name: "Light", primary: "#0a84ff", accent: "#0a84ff", bg: "#fafafa", card: "#ffffff", text: "#0a0a0a", headerBg: "#0a84ff", headerColor: "#fff", ctaBg: "#0a84ff", ctaColor: "#fff" },
  ];
  return (
    <div className="space-y-6">
      <Section title="Presets" desc="Comece com uma paleta pronta.">
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setT("primaryColor", p.primary);
                setT("accentColor", p.accent);
                setT("bgColor", p.bg);
                setT("cardColor", p.card);
                setT("textColor", p.text);
                setT("headerBg", p.headerBg);
                setT("headerColor", p.headerColor);
                setT("ctaBg", p.ctaBg);
                setT("ctaColor", p.ctaColor);
              }}
              className="group rounded-lg border border-white/[0.08] p-2 hover:border-cyan-400/30 transition"
            >
              <div className="h-10 rounded-md overflow-hidden flex" style={{ background: p.bg }}>
                <div className="flex-1" style={{ background: p.card }} />
                <div className="flex-1" style={{ background: p.primary }} />
                <div className="flex-1" style={{ background: p.accent }} />
              </div>
              <p className="mt-1.5 text-[10px] text-zinc-400 group-hover:text-white">{p.name}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Cores gerais" desc="Paleta base do checkout.">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fundo da página</Label>
            <ColorInput value={theme.bgColor} onChange={(v) => setT("bgColor", v)} />
          </div>
          <div>
            <Label>Fundo dos cards</Label>
            <ColorInput value={theme.cardColor} onChange={(v) => setT("cardColor", v)} />
          </div>
          <div>
            <Label>Cor do texto</Label>
            <ColorInput value={theme.textColor} onChange={(v) => setT("textColor", v)} />
          </div>
          <div>
            <Label>Cor de destaque (preço)</Label>
            <ColorInput value={theme.accentColor} onChange={(v) => setT("accentColor", v)} />
          </div>
        </div>
        {/* 30/07/2026: "Arredondamento dos cards" removido — só afetava o
            preview antigo do builder, nenhum template público lia cardRadius.
            Cada template tem o próprio raio fixo (é parte da réplica visual
            de ML/Amazon/Shopee/TikTok, mexer quebraria a semelhança). */}
      </Section>

      <Section title="Cabeçalho de segurança" desc="Faixa colorida no topo do checkout.">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fundo</Label>
            <ColorInput value={theme.headerBg} onChange={(v) => setT("headerBg", v)} />
          </div>
          <div>
            <Label>Texto</Label>
            <ColorInput value={theme.headerColor} onChange={(v) => setT("headerColor", v)} />
          </div>
        </div>
      </Section>

      <Section title="Botão de pagar (CTA) — cores" desc="Texto do botão fica em Conteúdo (por template).">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fundo</Label>
            <ColorInput value={theme.ctaBg} onChange={(v) => setT("ctaBg", v)} />
          </div>
          <div>
            <Label>Texto</Label>
            <ColorInput value={theme.ctaColor} onChange={(v) => setT("ctaColor", v)} />
          </div>
        </div>
      </Section>

      <Section title="Tempo de expiração do PIX" desc="Quantos minutos o QR Code fica válido.">
        <div>
          <Label>Validade do Pix (minutos)</Label>
          <Input
            type="number"
            min={1}
            max={60}
            value={theme.pixExpiryMinutes}
            onChange={(e) => setT("pixExpiryMinutes", Number(e.target.value) || 5)}
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Textos da tela do QR Code estão em <strong>Conteúdo → Tela do QR Code</strong>.
          </p>
        </div>
      </Section>
    </div>
  );
}

function PosPagamentoTab({
  backRedirectUrl,
  setBackRedirectUrl,
  upsellUrl,
  setUpsellUrl,
}: {
  thankYouUrl?: string;
  setThankYouUrl?: (v: string) => void;
  backRedirectUrl: string;
  setBackRedirectUrl: (v: string) => void;
  upsellUrl: string;
  setUpsellUrl: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <Section
        title="URL após o pagamento"
        desc="Pra onde o cliente vai imediatamente depois de pagar — pode ser outra oferta (upsell) ou sua própria página de obrigado."
      >
        <div>
          <Label>URL de destino</Label>
          <Input
            type="url"
            value={upsellUrl}
            onChange={(e) => setUpsellUrl(e.target.value)}
            placeholder="https://seudominio.com/upsell-ou-obrigado"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Qualquer URL externa. Vazio = vai pra tela /obrigado padrão do Trilho.
          </p>
        </div>
      </Section>

      <Section title="Saída sem pagar (back redirect)" desc="Pra onde o cliente vai se apertar 'voltar' no navegador.">
        <div>
          <Label>URL do back redirect</Label>
          <Input
            type="url"
            value={backRedirectUrl}
            onChange={(e) => setBackRedirectUrl(e.target.value)}
            placeholder="https://seudominio.com/oferta-especial"
          />
        </div>
      </Section>

      {/*
        Texto de garantia removido daqui — vive em Conteúdo → "Textos do checkout"
        (era duplicado, dava bug de qual valor ganhava).
      */}
    </div>
  );
}

function IntegracoesTab({
  productId,
  fbPixel,
  setFbPixel,
  tkPixel,
  setTkPixel,
}: {
  productId: string;
  fbPixel: string;
  setFbPixel: (v: string) => void;
  tkPixel: string;
  setTkPixel: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <Section title="Pixels de rastreamento" desc="Pixel IDs específicos deste checkout. Sobrescrevem os pixels globais.">
        <div className="rounded-lg border border-blue-400/20 bg-blue-400/[0.04] p-3 text-[11px] leading-relaxed text-blue-200">
          💡 Salvando o Pixel ID aqui, os eventos disparam sozinhos:{" "}
          <strong>PageView</strong>, <strong>ViewContent</strong> e{" "}
          <strong>InitiateCheckout</strong> quando o lead abre o checkout,{" "}
          <strong>AddPaymentInfo</strong> na geração do PIX e{" "}
          <strong>Purchase</strong> no pagamento aprovado. Deixe vazio pra usar
          o pixel global da sua conta.
        </div>
        <div>
          <Label>Facebook Pixel ID</Label>
          <Input
            value={fbPixel}
            onChange={(e) => setFbPixel(e.target.value)}
            placeholder="000000000000000"
          />
        </div>
        <div>
          <Label>TikTok Pixel ID</Label>
          <Input
            value={tkPixel}
            onChange={(e) => setTkPixel(e.target.value)}
            placeholder="XXXXXXXXXXX"
          />
        </div>
      </Section>

      <Section title="Integrações globais" desc="Configurações que valem pra todos os checkouts do produto.">
        {[
          // 29/07/2026 (davi): tirado link 'Pixels & CAPI' — rota
          // /produtos/[id]/pixels foi deletada; Pixels agora vive so no
          // checkout builder (aba Facebook/TikTok Pixel logo acima).
          { href: `/dashboard/integracoes/utmify`, label: "UTMify", desc: "Tracking de UTMs" },
          { href: `/dashboard/integracoes/webhooks`, label: "Webhooks", desc: "Eventos no seu servidor" },
          { href: `/dashboard/integracoes/whatsapp`, label: "WhatsApp Recovery", desc: "Recuperação de carrinho" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 hover:border-cyan-400/30 hover:bg-white/[0.04] transition"
          >
            <div className="flex items-center gap-3">
              <Plug className="size-4 text-cyan-400" />
              <div>
                <p className="text-sm text-white">{l.label}</p>
                <p className="text-[11px] text-zinc-500">{l.desc}</p>
              </div>
            </div>
            <ChevronRight className="size-4 text-zinc-500" />
          </Link>
        ))}
      </Section>
    </div>
  );
}

/* ============================ Helpers ============================ */

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {desc && <p className="mt-0.5 text-[11px] text-zinc-500">{desc}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  desc,
  value,
  onChange,
  disabled,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <div>
        <p className="text-sm text-white">{label}</p>
        {desc && <p className="mt-0.5 text-[11px] text-zinc-500">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          value ? "bg-cyan-400" : "bg-zinc-700"
        } disabled:cursor-not-allowed`}
        aria-pressed={value}
      >
        <span
          className={`inline-block size-5 transform rounded-full bg-white shadow ring-0 transition ${
            value ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function BlockToggle({
  label,
  desc,
  value,
  onChange,
  disabled,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border bg-gradient-to-br from-white/[0.02] to-transparent p-3 transition ${
        value ? "border-cyan-400/30 bg-cyan-400/[0.03]" : "border-white/[0.06]"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {desc && <p className="mt-0.5 text-[11px] text-zinc-500">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          value ? "bg-cyan-400" : "bg-zinc-700"
        } disabled:cursor-not-allowed`}
      >
        <span
          className={`inline-block size-5 transform rounded-full bg-white shadow ring-0 transition ${
            value ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function FieldToggle({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 hover:border-white/[0.1] transition">
      <span className="flex items-center gap-2 text-sm text-white">
        {label}
        {required && <span className="text-[10px] text-zinc-500">obrigatório</span>}
      </span>
      <input
        type="checkbox"
        checked={value}
        disabled={required}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-white/15 bg-white/[0.05] text-cyan-400 focus:ring-cyan-400/30 disabled:opacity-60"
      />
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
    >
      {children}
    </select>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-9 cursor-pointer rounded border border-white/[0.08] bg-transparent"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 font-mono text-xs" />
    </div>
  );
}

/**
 * ColorInput que aceita "sem cor" (string vazia) = herda o padrão do checkout.
 *
 * O ColorInput normal não serve: <input type="color"> não aceita value="" e
 * cairia em #000000 sozinho, gravando preto no tema sem o seller ter escolhido
 * nada. Aqui o picker mostra o `fallback` só como ponto de partida visual, e o
 * valor só é gravado quando o seller mexe de fato.
 */
function OptionalColorInput({
  value,
  onChange,
  fallback,
}: {
  value: string;
  onChange: (v: string) => void;
  fallback: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value || fallback}
        onChange={(e) => onChange(e.target.value)}
        className="size-9 shrink-0 cursor-pointer rounded border border-white/[0.08] bg-transparent"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="automático"
        className="min-w-0 flex-1 font-mono text-xs"
      />
      {!!value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Voltar pra cor automática do checkout"
          className="shrink-0 rounded border border-white/[0.08] px-2 py-2 text-[10px] font-medium text-zinc-400 transition hover:border-white/20 hover:text-white"
        >
          Auto
        </button>
      )}
    </div>
  );
}

/**
 * Picker de vídeo Bturb. Lista os vídeos do user e permite selecionar.
 * Quando seleciona, popula o `videoUrl` (chamando onChange).
 */
function BturbVideoPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [videos, setVideos] = useState<
    Array<{ id: string; title: string; videoUrl: string; thumbnailUrl: string | null; durationSec: number | null }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (loaded) return;
    setLoading(true);
    try {
      const { listBturbVideosForPicker } = await import(
        "@/app/dashboard/bturb/actions"
      );
      const r = await listBturbVideosForPicker();
      if (r.ok) setVideos(r.videos);
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>Escolher do Bturb</Label>
      <div className="rounded-lg border border-white/[0.06] bg-black/30 p-3">
        {!loaded ? (
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="w-full text-xs text-zinc-300 hover:text-white"
          >
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> Carregando…
              </span>
            ) : (
              "📹 Ver meus vídeos Bturb"
            )}
          </button>
        ) : videos.length === 0 ? (
          <p className="text-center text-[11px] text-zinc-500">
            Nenhum vídeo no Bturb ainda. Faça upload em /dashboard/bturb.
          </p>
        ) : (
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {videos.map((v) => {
              const selected = value === v.videoUrl;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChange(v.videoUrl)}
                  className={`flex w-full items-center gap-2 rounded-md p-1.5 text-left text-xs transition ${
                    selected
                      ? "bg-cyan-400/20 text-cyan-200"
                      : "text-zinc-300 hover:bg-white/[0.04]"
                  }`}
                >
                  {v.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbnailUrl}
                      alt=""
                      className="size-8 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded bg-white/[0.04]">
                      🎬
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{v.title}</span>
                  {v.durationSec && (
                    <span className="shrink-0 text-[10px] text-zinc-500">
                      {Math.floor(v.durationSec / 60)}:
                      {String(v.durationSec % 60).padStart(2, "0")}
                    </span>
                  )}
                  {selected && <Check className="size-3 shrink-0 text-cyan-300" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Input combinado pra banner: 2 modos lado a lado.
 *  - Upload de arquivo (vai pro Vercel Blob, retorna URL pública)
 *  - Colar URL externa (Imgur, S3, qualquer link público)
 *
 * `value` é sempre uma URL final (qualquer que seja a fonte).
 */
function BannerImageInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Modo 1: Upload */}
      <div className="rounded-lg border border-white/[0.06] bg-black/30 p-3">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
          Opção 1 — Enviar imagem do seu computador
        </p>
        <FileUpload
          purpose="banner"
          accept="image/*"
          currentUrl={value || null}
          onUploaded={(r) => onChange(r.url)}
          onCleared={() => onChange("")}
          label="Selecionar imagem"
          helper="JPG, PNG, WEBP — recomendado largura 1200px+. PNG/WEBP sem fundo mantêm a transparência."
        />
      </div>

      {/* Modo 2: URL externa */}
      <div className="rounded-lg border border-white/[0.06] bg-black/30 p-3">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
          Opção 2 — Colar link da imagem
        </p>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://imgur.com/seu-banner.jpg"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="mt-2 text-[11px] text-red-400 hover:text-red-300"
          >
            Remover banner
          </button>
        )}
      </div>
    </div>
  );
}

function Collapsible({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.01]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-3 text-sm font-medium text-zinc-200 hover:text-white"
      >
        <span>{title}</span>
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-3 border-t border-white/[0.06] p-3">{children}</div>}
    </div>
  );
}

function BlockOrderEditor({
  order,
  onChange,
}: {
  order: BlockKey[];
  onChange: (next: BlockKey[]) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  return (
    <div className="space-y-1.5">
      {order.map((b, i) => (
        <div
          key={b}
          draggable
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => {
            e.preventDefault();
            if (dragIdx === null || dragIdx === i) return;
            const next = order.slice();
            const [moved] = next.splice(dragIdx, 1);
            next.splice(i, 0, moved);
            onChange(next);
            setDragIdx(i);
          }}
          onDragEnd={() => setDragIdx(null)}
          className={`flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-200 cursor-grab active:cursor-grabbing transition ${
            dragIdx === i ? "opacity-50" : "hover:border-cyan-400/30"
          }`}
        >
          <GripVertical className="size-4 text-zinc-500" />
          <span className="flex-1">{BLOCK_LABELS[b]}</span>
          <span className="text-[10px] text-zinc-600 font-mono">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

function TestimonialsEditor({
  value,
  onChange,
}: {
  value: Testimonial[];
  onChange: (v: Testimonial[]) => void;
}) {
  function update(i: number, patch: Partial<Testimonial>) {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function add() {
    onChange([...value, { name: "", text: "", rating: 5 }]);
  }
  function remove(i: number) {
    onChange(value.filter((_, k) => k !== i));
  }
  return (
    <div className="space-y-2">
      {value.map((tt, i) => (
        <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
          <Input
            value={tt.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Nome do cliente"
          />
          <textarea
            value={tt.text}
            onChange={(e) => update(i, { text: e.target.value })}
            placeholder="Depoimento"
            className="flex min-h-[60px] w-full rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          />
          <div className="flex items-center justify-between">
            <Select
              value={String(tt.rating ?? 5)}
              onChange={(v) => update(i, { rating: Number(v) })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} estrela{n > 1 ? "s" : ""}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-xs text-red-300 hover:text-red-200"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-white/[0.1] py-2 text-xs text-zinc-400 hover:bg-white/[0.03] hover:text-white"
      >
        <Plus className="size-3" /> Adicionar depoimento
      </button>
    </div>
  );
}

function SealsEditor({
  value,
  onChange,
}: {
  value: SecuritySeal[];
  onChange: (v: SecuritySeal[]) => void;
}) {
  function update(i: number, patch: Partial<SecuritySeal>) {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function add() {
    onChange([...value, { icon: "shield", title: "Novo selo", text: "" }]);
  }
  function remove(i: number) {
    onChange(value.filter((_, k) => k !== i));
  }
  return (
    <div className="space-y-2">
      {value.map((s, i) => {
        const Icon = SEAL_ICONS[s.icon] || ShieldCheck;
        return (
          <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Icon className="size-4 text-cyan-300" />
              <Select
                value={s.icon}
                onChange={(v) => update(i, { icon: v as SecuritySeal["icon"] })}
              >
                <option value="shield">Escudo (segurança)</option>
                <option value="lock">Cadeado (criptografia)</option>
                <option value="award">Medalha (garantia)</option>
                <option value="zap">Raio (rapidez)</option>
                <option value="rocket">Foguete (entrega)</option>
                <option value="handshake">Aperto de mão (confiança)</option>
              </Select>
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 text-zinc-500 hover:text-red-300"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <Input
              value={s.title}
              onChange={(e) => update(i, { title: e.target.value })}
              placeholder="Título"
            />
            <Input
              value={s.text ?? ""}
              onChange={(e) => update(i, { text: e.target.value })}
              placeholder="Texto de apoio (opcional)"
            />
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-white/[0.1] py-2 text-xs text-zinc-400 hover:bg-white/[0.03] hover:text-white"
      >
        <Plus className="size-3" /> Adicionar selo
      </button>
    </div>
  );
}

/* ============================ Preview ============================ */

function Preview({
  product,
  priceCentsOverride,
  theme,
  methods,
  mode,
}: {
  product: ProductDetails;
  priceCentsOverride: number | null;
  theme: ReturnType<typeof withDefaults>;
  methods: string[];
  mode: "desktop" | "mobile";
}) {
  const primary = theme.primaryColor;
  const accent = theme.accentColor;
  const bg = theme.bgColor;
  const card = theme.cardColor;
  const text = theme.textColor;
  const radius = theme.cardRadius;

  const productImage = theme.productImageOverride || product.image;
  const productName = theme.visibleName || product.name;
  const finalPrice = priceCentsOverride && priceCentsOverride > 0 ? priceCentsOverride : product.priceCents;

  // 2-column layout: payment+identification on right, summary+seals on left
  const isTwoCol = theme.layoutColumns === 2 && mode === "desktop";

  const orderedBlocks = theme.blockOrder.filter((b) => {
    if (b === "header") return theme.blockHeader;
    if (b === "summary") return theme.blockOrderSummary;
    if (b === "seals") return theme.blockSecuritySeals;
    if (b === "testimonials") return theme.blockTestimonials;
    if (b === "coupon") return theme.blockCoupon;
    if (b === "bump") return theme.blockOrderBump;
    return true; // identification, payment always show
  });

  // Render block by key
  function renderBlock(b: BlockKey) {
    switch (b) {
      case "header":
        return null; // rendered separately at top
      case "summary":
        return (
          <div className="p-4" style={{ background: card, borderRadius: radius }}>
            <p className="text-xs font-medium opacity-70">{theme.summaryTitle}</p>
            <div className="mt-3 flex items-start gap-3">
              {productImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={productImage}
                  alt={productName}
                  className="size-14 shrink-0 rounded-lg object-cover border border-white/10"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold">{productName}</h3>
                {product.description && (
                  <p className="mt-0.5 text-[11px] opacity-60 line-clamp-2">{product.description}</p>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between border-t pt-3" style={{ borderColor: `${text}15` }}>
              <span className="text-xs opacity-70">Total</span>
              <span className="text-xl font-bold tabular-nums" style={{ color: accent }}>
                {formatBRL(finalPrice)}
              </span>
            </div>
            {theme.summarySafety && (
              <p className="mt-2 text-[10px] opacity-60">✓ {theme.summarySafety}</p>
            )}
          </div>
        );
      case "identification":
        return (
          <div className="p-4 space-y-3" style={{ background: card, borderRadius: radius }}>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: primary, color: "#000" }}
              >
                1
              </span>
              <p className="text-sm font-semibold">Identifique-se</p>
            </div>
            <div className="space-y-2">
              {theme.fieldName && <FieldStub label="Nome e Sobrenome" text={text} />}
              {theme.fieldEmail && <FieldStub label="E-mail" text={text} />}
              {theme.fieldPhone && <FieldStub label="Telefone / WhatsApp" text={text} />}
              {theme.fieldCpf && <FieldStub label="CPF" text={text} />}
              {(theme.fieldCep || theme.isPhysical) && <FieldStub label="CEP" text={text} />}
            </div>
            {theme.isPhysical && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: `${text}15` }}>
                <FieldStub label="Rua" text={text} />
                <FieldStub label="Número" text={text} />
                <FieldStub label="Bairro" text={text} />
                <FieldStub label="Cidade" text={text} />
              </div>
            )}
          </div>
        );
      case "coupon":
        return (
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: `${text}20`, borderRadius: radius / 2 }}>
              <span className="opacity-50">Cupom de desconto</span>
            </div>
            <button
              type="button"
              className="rounded-lg px-4 text-xs font-medium"
              style={{ background: `${text}10`, color: text, borderRadius: radius / 2 }}
            >
              Aplicar
            </button>
          </div>
        );
      case "bump":
        return (
          <div
            className="p-3 border-2 border-dashed"
            style={{
              borderColor: `${primary}40`,
              background: `${primary}08`,
              borderRadius: radius,
            }}
          >
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5 size-4" style={{ accentColor: primary }} />
              <div>
                <p className="text-xs font-semibold">🎁 Adicione e ganhe um desconto especial</p>
                <p className="mt-0.5 text-[11px] opacity-60">Produto adicional configurado em Ofertas</p>
              </div>
            </label>
          </div>
        );
      case "payment":
        return (
          <div className="p-4 space-y-3" style={{ background: card, borderRadius: radius }}>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: primary, color: "#000" }}
              >
                {theme.isPhysical ? 3 : 2}
              </span>
              <p className="text-sm font-semibold">Forma de pagamento</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {methods.includes("pix") && (
                <MethodTab label="PIX" primary={primary} text={text} active />
              )}
              {methods.includes("card") && (
                <MethodTab label="Cartão" primary={primary} text={text} active={!methods.includes("pix")} />
              )}
            </div>
            <button
              type="button"
              className="w-full py-3.5 text-sm font-bold uppercase tracking-wider shadow-lg transition hover:opacity-90"
              style={{
                background: theme.ctaBg,
                color: theme.ctaColor,
                borderRadius: radius / 1.5,
              }}
            >
              {theme.ctaText}
            </button>
          </div>
        );
      case "seals":
        return (
          <div className={`grid gap-2 ${mode === "mobile" ? "grid-cols-1" : "grid-cols-3"}`}>
            {theme.securitySeals.slice(0, mode === "mobile" ? 3 : 6).map((s, i) => {
              const Icon = SEAL_ICONS[s.icon] || ShieldCheck;
              return (
                <div
                  key={i}
                  className="p-3 flex items-center gap-2"
                  style={{ background: card, borderRadius: radius / 1.5 }}
                >
                  <Icon className="size-5 shrink-0" style={{ color: primary }} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold truncate">{s.title}</p>
                    {s.text && <p className="text-[10px] opacity-60 truncate">{s.text}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      case "testimonials":
        return (
          <div className="space-y-2 border-t pt-4" style={{ borderColor: `${text}15` }}>
            <p className="text-[10px] uppercase tracking-wider opacity-60">Quem comprou aprovou</p>
            {theme.testimonials.slice(0, 2).map((tt, i) => (
              <div
                key={i}
                className="p-3"
                style={{ background: card, borderRadius: radius / 1.5 }}
              >
                <div className="flex items-center gap-0.5" style={{ color: "#facc15" }}>
                  {Array.from({ length: tt.rating ?? 5 }).map((_, k) => (
                    <span key={k}>★</span>
                  ))}
                </div>
                <p className="mt-1 text-xs">{tt.text || "(sem texto)"}</p>
                <p className="mt-1 text-[10px] opacity-60">— {tt.name || "Anônimo"}</p>
              </div>
            ))}
          </div>
        );
    }
  }

  return (
    <div
      className="overflow-hidden shadow-2xl"
      style={{ background: bg, color: text, borderRadius: radius }}
    >
      {/* Banner em imagem (no preview também) — esconde se a imagem falhar */}
      {theme.bannerImageUrl && <BannerImage src={theme.bannerImageUrl} />}

      {theme.bannerEnabled && theme.bannerText && (
        <div
          className="w-full px-4 py-2 text-center text-xs font-medium"
          style={{ background: theme.bannerBg, color: theme.bannerColor }}
        >
          {theme.bannerText}
        </div>
      )}

      {theme.blockHeader && (
        <div
          className="w-full px-4 py-3 text-center text-sm font-semibold"
          style={{ background: theme.headerBg, color: theme.headerColor }}
        >
          🔒 {theme.headerText}
        </div>
      )}

      {theme.countdownEnabled && (
        <div
          className="w-full px-4 py-2 text-center text-sm font-medium"
          style={{
            background: theme.countdownBg || `${primary}22`,
            color: theme.countdownColor || primary,
          }}
        >
          ⏱ {theme.countdownText}{" "}
          <span className="font-mono">
            {String(theme.countdownMinutes).padStart(2, "0")}:00
          </span>
        </div>
      )}

      <div className={mode === "mobile" ? "p-4" : "p-6"}>
        {isTwoCol ? (
          <div className="grid grid-cols-[1fr_1.2fr] gap-4">
            <div className="space-y-3">
              {orderedBlocks.filter((b) => b === "summary" || b === "seals" || b === "testimonials").map((b) => (
                <div key={b}>{renderBlock(b)}</div>
              ))}
            </div>
            <div className="space-y-3">
              {orderedBlocks.filter((b) => b !== "header" && b !== "summary" && b !== "seals" && b !== "testimonials").map((b) => (
                <div key={b}>{renderBlock(b)}</div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {orderedBlocks.filter((b) => b !== "header").map((b) => (
              <div key={b}>{renderBlock(b)}</div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-1 text-[10px] opacity-60">
          <ShieldCheck className="size-3" style={{ color: primary }} />
          Pagamento processado por Trilho
        </div>
      </div>

      {theme.whatsappEnabled && theme.whatsappNumber && (
        <div className="border-t p-3 text-center text-[10px] opacity-60" style={{ borderColor: `${text}10` }}>
          💬 Botão WhatsApp flutuante ativo — {theme.whatsappNumber}
        </div>
      )}
    </div>
  );
}

function FieldStub({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[11px] opacity-70">{label}</p>
      <div
        className="mt-0.5 h-9 rounded-md border"
        style={{ borderColor: `${text}20`, background: `${text}05` }}
      />
    </div>
  );
}

function MethodTab({
  label,
  primary,
  text,
  active,
}: {
  label: string;
  primary: string;
  text: string;
  active?: boolean;
}) {
  return (
    <div
      className="rounded-lg border py-3 text-center text-xs font-semibold transition"
      style={{
        borderColor: active ? primary : `${text}20`,
        background: active ? `${primary}15` : "transparent",
        color: active ? primary : text,
      }}
    >
      {label}
    </div>
  );
}

/* ============================================================
 *  TemplatePreview — preview INLINE em tempo real dos templates.
 *
 *  Não usa iframe — renderiza o template REAL direto no painel,
 *  passando isPreview=true pra mockear o PIX. Cada mudança no theme
 *  reflete instantaneamente (state local, zero reload).
 *
 *  Não exige Publicar pra ver: tudo é state local até o seller
 *  clicar em "Publicar alterações".
 * ============================================================ */
function TemplatePreview({
  template,
  slug,
  product,
  priceCents,
  previewMode,
  theme,
  orderBumps,
  shippingOptions,
  paymentMethods,
}: {
  template: string;
  slug: string;
  product: { id: string; name: string; description: string | null; image: string | null; priceCents: number };
  priceCents: number;
  previewMode: "desktop" | "mobile";
  theme: ReturnType<typeof withDefaults>;
  orderBumps: OrderBumpItem[];
  shippingOptions: ShippingItem[];
  paymentMethods: string[];
}) {
  // Cada template tem um "lookbook" mini renderizado direto aqui
  // (sem iframe), pra não precisar do checkout estar publicado pra ver.
  const meta: Record<string, { label: string; emoji: string; description: string }> = {
    auto: {
      label: "Automático",
      emoji: "⚡",
      description: "PIX gerado direto, sem cliques. O cliente vê só o QR Code.",
    },
    extra: {
      label: "Padrão Renda Extra",
      emoji: "💼",
      description: "Cards compactos: produto + identificação + pagamento.",
    },
    simple: {
      label: "Simples",
      emoji: "✨",
      description: "Minimalista: pedido + dados + PIX. Direto ao ponto.",
    },
    drop: {
      label: "Drop",
      emoji: "🛒",
      description: "Carrinho + stepper (Identificação → Entrega → Pagamento).",
    },
    dropv2: {
      label: "Drop V2",
      emoji: "🏪",
      description:
        "Drop avançado com pré-warm de PIX (mais rápido) — otimizado pra dropshipping.",
    },
    fast: {
      label: "Fast",
      emoji: "🚀",
      description: "Ultra-rápido: produto + nome + email + botão. 1 só tela.",
    },
    gringa: {
      label: "Gringa (EN)",
      emoji: "🌎",
      description: "Internacional: Card + Apple Pay + Google Pay. Sem PIX, sem CPF.",
    },
    "gringa-drop-v1": {
      label: "Gringa Drop v1 (EN)",
      emoji: "📦",
      description:
        "Internacional pra produto físico: 3 steps (Contact → Shipping → Payment) + endereço completo.",
    },
    tiktok_shop: {
      label: "TikTok Shop",
      emoji: "🛍️",
      description:
        "Estilo TikTok Shop: galeria/vídeo, desconto, countdown, variantes, prova social e avaliações.",
    },
    mercado_livre: {
      label: "Mercado Livre",
      emoji: "🟡",
      description:
        "Réplica do checkout do Mercado Livre (sem logo): resumo + pagamento + Compra Garantida.",
    },
    amazon: {
      label: "Amazon Checkout",
      emoji: "📦",
      description:
        "Estilo Amazon: endereço + forma de pagamento + resumo do pedido com frete.",
    },
    shopee: {
      label: "Shopee Checkout",
      emoji: "🛒",
      description:
        "Estilo Shopee: produto + cupom + frete + resumo laranja com prova social.",
    },
  };
  // Fallback: qualquer template registrado no dispatcher (RealCheckoutTemplate)
  // renderiza o preview ao vivo, mesmo sem entrada no `meta`. Evita preview em
  // branco pra templates novos (era o bug do tiktok_shop/mercado_livre).
  const m = meta[template] ?? {
    label: template,
    emoji: "🧩",
    description: "Preview ao vivo do seu checkout.",
  };

  // Banner do banner image vai antes (estilo /c/[slug] real)
  const containerWidth = previewMode === "mobile" ? 420 : 720;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.04] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">{m.emoji}</span>
            <p className="text-sm font-semibold text-white truncate">{m.label}</p>
          </div>
          <a
            href={`https://trilhopag.com/c/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[10px] text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1"
          >
            Abrir publicado ↗
          </a>
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-400">{m.description}</p>
      </div>

      {/* Preview INLINE — renderiza o template real com isPreview=true */}
      <div
        className="rounded-2xl border border-white/[0.08] overflow-hidden mx-auto"
        style={{ maxWidth: containerWidth, background: theme.bgColor || "#f5f5f5" }}
      >
        {/* Banner em imagem (se configurado) — esconde se a imagem falhar */}
        {theme.bannerImageUrl && <BannerImage src={theme.bannerImageUrl} />}
        {/* 30/07/2026: banner de texto + contador no preview, na MESMA ordem
            do /c/[slug] real. Antes o preview não mostrava nenhum dos dois,
            então o seller não tinha como perceber que estava quebrado. */}
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
            storageKey={`preview-${slug}`}
          />
        )}
        <div
          className="overflow-x-hidden"
          style={{ maxHeight: previewMode === "mobile" ? 720 : 820, overflowY: "auto" }}
        >
          <RealCheckoutTemplate
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
            ctaLabel={theme.ctaText || "GERAR PIX"}
            utm={{}}
            bgColor={theme.bgColor || "#f5f5f5"}
            cardColor={theme.cardColor || "#ffffff"}
            textColor={theme.textColor || "#18181b"}
            primaryColor={theme.primaryColor || "#16a34a"}
            accentColor={theme.accentColor || "#22c55e"}
            ctaText={theme.ctaText || "GERAR PIX"}
            ctaBg={theme.ctaBg || "#16a34a"}
            ctaColor={theme.ctaColor || "#ffffff"}
            headerText={theme.headerText || "Pagamento 100% Seguro"}
            headerBg={theme.headerBg || "#16a34a"}
            headerColor={theme.headerColor || "#ffffff"}
            fields={{
              name: theme.fieldName ?? true,
              email: theme.fieldEmail ?? true,
              phone: theme.fieldPhone ?? false,
              // FORCE CPF=false em templates Gringa (sao internacionais)
              cpf:
                template === "gringa" || template === "gringa-drop-v1"
                  ? false
                  : (theme.fieldCpf ?? false),
              // CEP fica EXCLUSIVAMENTE a serviço do isPhysical agora
              cep: theme.isPhysical ?? false,
            }}
            showQuantity={theme.showQuantity ?? false}
            isPhysical={theme.isPhysical ?? false}
            isPreview={true}
            // Currency: BRL/USD/EUR — seller escolhe na secao Produto.
            currency={
              (theme as Record<string, unknown>).currency as string | undefined
            }
            autoTranslate={theme.autoTranslate ?? false}
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
            mercadoLivreConfig={(theme as Record<string, unknown>).mercadoLivre as never}
            amazonConfig={(theme as Record<string, unknown>).amazon as never}
            shopeeConfig={(theme as Record<string, unknown>).shopee as never}
            receiptUpload={theme.receiptUpload ?? false}
            orderBumps={orderBumps.filter((b) => b.active)}
            shippingOptions={shippingOptions.filter((s) => s.active)}
            paymentMethods={paymentMethods}
          />
          {/* Imagem de rodapé no preview — mesma posição do /c/[slug]: logo
              abaixo do card, antes dos selos. */}
          {theme.footerImageUrl && (
            <FooterImage
              src={theme.footerImageUrl}
              fullWidth={theme.footerImageFull === true}
            />
          )}
          {/* Selos no preview — mesma regra do /c/[slug] (opt-in) */}
          {theme.blockSecuritySeals === true && (
            <SecuritySeals
              items={
                theme.securitySeals && theme.securitySeals.length > 0
                  ? (theme.securitySeals as never)
                  : DEFAULT_SEALS
              }
              primaryColor={theme.primaryColor || "#16a34a"}
            />
          )}
          {/* Depoimentos no preview — reflete o que aparece no checkout real */}
          {theme.blockTestimonials &&
            theme.testimonials &&
            theme.testimonials.length > 0 && (
              <Testimonials
                items={theme.testimonials}
                primaryColor={theme.primaryColor || "#16a34a"}
              />
            )}
        </div>
      </div>

      <p className="text-[11px] text-zinc-500 text-center">
        Preview ao vivo · Produto: <strong>{product.name}</strong> ·{" "}
        <strong>R$ {(priceCents / 100).toFixed(2)}</strong>
      </p>
    </div>
  );
}

/**
 * Picker visual de onde mostrar os Order Bumps no checkout.
 * Cada opcao tem um mini-mockup que ilustra a posicao.
 */
const BUMP_POSITIONS = [
  {
    key: "top",
    label: "No topo",
    desc: "Antes do produto e do pagamento. Maximo destaque.",
  },
  {
    key: "above_payment",
    label: "Acima do pagamento",
    desc: "Depois do produto, antes dos metodos de pagamento.",
  },
  {
    key: "below_payment",
    label: "Abaixo do pagamento",
    desc: "Depois dos metodos, antes do botao de comprar. Default.",
  },
  {
    key: "after_cta",
    label: "Depois do botao",
    desc: "Apos o CTA principal. Bom pra ofertas extras menos invasivas.",
  },
] as const;

function BumpPositionPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {BUMP_POSITIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border-2 px-3 py-3 text-left transition",
              active
                ? "border-cyan-400 bg-cyan-400/[0.06]"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.03]",
            )}
          >
            <BumpPositionMockup position={opt.key} active={active} />
            <div className="min-w-0">
              <p
                className={cn(
                  "text-xs font-bold",
                  active ? "text-cyan-300" : "text-white",
                )}
              >
                {opt.label}
              </p>
              <p className="text-[10px] leading-tight text-zinc-500">
                {opt.desc}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Mockup visual de onde o bump aparece em cada modo. */
function BumpPositionMockup({
  position,
  active,
}: {
  position: string;
  active: boolean;
}) {
  const accent = active ? "#22d3ee" : "#71717a";
  const Bar = ({ y, h, kind }: { y: number; h: number; kind: "bump" | "block" | "cta" }) => {
    const color =
      kind === "bump" ? accent : kind === "cta" ? "#525252" : "#3f3f46";
    const bg = kind === "bump" ? `${accent}22` : "transparent";
    return (
      <rect
        x={4}
        y={y}
        width={48}
        height={h}
        rx={2}
        fill={bg}
        stroke={color}
        strokeWidth={kind === "bump" ? 1.5 : 1}
        strokeDasharray={kind === "bump" ? "0" : "0"}
      />
    );
  };
  // Slots: top -> bump em y=4; above_payment -> bump y=20; below_payment -> y=40; after_cta -> y=60
  let bumpY = 40;
  if (position === "top") bumpY = 4;
  else if (position === "above_payment") bumpY = 20;
  else if (position === "after_cta") bumpY = 60;
  return (
    <svg
      viewBox="0 0 56 76"
      width="56"
      height="76"
      className="shrink-0"
    >
      <rect x={1} y={1} width={54} height={74} rx={4} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.10)" />
      {/* Produto */}
      {bumpY !== 4 && <Bar y={4} h={12} kind="block" />}
      {bumpY === 4 && <Bar y={4} h={12} kind="bump" />}
      {/* Pagamento */}
      {bumpY === 20 && <Bar y={20} h={10} kind="bump" />}
      {bumpY !== 20 && <Bar y={20} h={10} kind="block" />}
      {/* Metodos */}
      <Bar y={32} h={6} kind="block" />
      {bumpY === 40 && <Bar y={40} h={10} kind="bump" />}
      {bumpY !== 40 && bumpY !== 60 && <Bar y={40} h={6} kind="block" />}
      {/* CTA */}
      <Bar y={bumpY === 40 ? 52 : 48} h={8} kind="cta" />
      {bumpY === 60 && <Bar y={62} h={10} kind="bump" />}
    </svg>
  );
}
