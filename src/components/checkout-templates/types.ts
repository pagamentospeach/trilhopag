import type {
  AutoConfig,
  ExtraConfig,
  SimpleConfig,
  DropConfig,
  FastConfig,
  GringaConfig,
  GringaDropConfig,
  PixResultConfig,
  TiktokShopConfig,
  MercadoLivreConfig,
  AmazonConfig,
  ShopeeConfig,
} from "./configs";

export type TemplateProduct = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  priceCents: number;
};

export type TemplateProps = {
  slug: string;
  product: TemplateProduct;
  priceCents: number;
  ctaLabel: string;
  variantId?: string;
  utm: Record<string, string | null>;
  // Theme cores
  bgColor: string;
  cardColor: string;
  textColor: string;
  primaryColor: string;
  accentColor: string;
  // CTA / modal
  ctaText: string;
  ctaBg: string;
  ctaColor: string;
  headerText: string;
  headerBg: string;
  headerColor: string;
  // Pre-fill via URL
  prefillName?: string;
  prefillEmail?: string;
  prefillPhone?: string;
  prefillCpf?: string;
  // Toggles do builder — qual campo aparece no checkout. Cada template
  // respeita os flags mostrando/escondendo os inputs correspondentes.
  // Quando ausente, o template usa seu default (geralmente nome+email).
  fields?: {
    name?: boolean;
    email?: boolean;
    phone?: boolean;
    cpf?: boolean;
    cep?: boolean;
  };
  /** Se true, mostra seletor de quantidade (+/-) onde aplicável. */
  showQuantity?: boolean;
  /** Produto físico: requer CEP + endereço completo. */
  isPhysical?: boolean;
  /**
   * Se true, mostra na tela de resultado do PIX um campo pra o lead enviar
   * o comprovante de pagamento. Off por padrão; o seller liga no builder.
   * O comprovante aparece na aba Vendas.
   */
  receiptUpload?: boolean;
  /** Modo preview do builder — mocka PIX, não dispara fetch real. */
  isPreview?: boolean;
  /**
   * Quando true, ativa traducao automatica do checkout pro idioma do
   * navegador do cliente (detectado via navigator.language). Cobertura:
   *  - Static dictionary: en/es/fr/it/de (top 5 idiomas paid traffic
   *    BR-out). Strings cobertas: titulos, labels, CTAs, PIX result,
   *    placeholders, tooltips.
   *  - Fallback: seta <html lang="pt-BR"> pro Chrome/Edge oferecer auto-
   *    translate de strings nao mapeadas (descricao do produto, etc).
   * Cliente brasileiro (navigator.language=pt-*): no-op, mantem PT.
   */
  autoTranslate?: boolean;
  /**
   * Métodos de pagamento habilitados nesse checkout. Quando mais de 1 ativo,
   * o template renderiza um seletor (cards lado a lado). Quando só PIX, mostra
   * direto a UI de PIX (comportamento atual mantido).
   * Valores: "pix" | "card" | "apple_pay" | "google_pay"
   */
  paymentMethods?: string[];
  /**
   * Moeda do checkout (ISO 4217). Default BRL. Templates internacionais
   * (Gringa, Gringa Drop) usam USD/EUR/GBP. Stripe aceita qualquer moeda
   * suportada — verificar lista oficial.
   */
  currency?: string;
  /**
   * OrderBump resolvido (null quando desligado). Pode vir de um produto
   * vinculado ou ser standalone (configurado 100% no builder).
   * Cada template decide ONDE renderiza, mas todos lêem o mesmo shape.
   */
  bump?: {
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    imageUrl?: string | null;
    badge?: string;
    buttonText?: string;
    /** Preço "de" (riscado, BRL string). null = não mostra. */
    originalPrice?: string | null;
    accentColor?: string;
  } | null;

  /**
   * Múltiplos order bumps (modelo novo v2). Cada um aparece no checkout
   * como checkbox/card que o cliente marca pra adicionar ao pedido.
   * Lista vazia = sem bumps.
   */
  orderBumps?: Array<{
    id: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
    priceCents: number;
    originalPriceCents: number | null;
  }>;
  /**
   * Onde renderizar os bumps no checkout. Valores: "top" | "above_payment" |
   * "below_payment" (default) | "after_cta". Templates implementam slots e
   * o builder escolhe o que melhor converte.
   */
  bumpPosition?: string;
  /**
   * Opções de frete configuradas. Cliente escolhe uma; o priceCents é
   * adicionado ao total. Lista vazia = produto digital, não exibe.
   */
  shippingOptions?: Array<{
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    priceCents: number;
    estimatedTime: string | null;
    isDefault: boolean;
  }>;
  // Per-template overrides (each template reads its own namespace)
  autoConfig?: AutoConfig;
  extraConfig?: ExtraConfig;
  simpleConfig?: SimpleConfig;
  dropConfig?: DropConfig;
  fastConfig?: FastConfig;
  gringaConfig?: GringaConfig;
  gringaDropConfig?: GringaDropConfig;
  pixResultConfig?: PixResultConfig;
  tiktokShopConfig?: TiktokShopConfig;
  mercadoLivreConfig?: MercadoLivreConfig;
  amazonConfig?: AmazonConfig;
  shopeeConfig?: ShopeeConfig;
};
