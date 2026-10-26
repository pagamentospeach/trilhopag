/**
 * Configurações específicas por template.
 * Cada template lê seu próprio namespace do theme, com fallbacks
 * pros valores default abaixo.
 */

export type PixResultConfig = {
  scanText?: string;            // "Escaneie o QR Code ou copie o código..."
  copyLabel?: string;           // "COPIAR CÓDIGO PIX"
  copiedLabel?: string;         // "Copiado!"
  valueTotalLabel?: string;     // "Valor total:"
  comoPagarTitle?: string;      // "Como pagar?"
  comoPagarStep1?: string;
  comoPagarStep2?: string;
};

export type AutoConfig = {
  loadingText?: string;         // "Gerando seu Pix..."
  loadingSubtext?: string;      // "Só um instante."
  errorRetryLabel?: string;     // "Tentar de novo"
};

export type ExtraConfig = {
  iconBg?: string;              // cor das bolinhas dos ícones (default azul)
  iconColor?: string;           // cor do ícone dentro da bolinha
  identTitle?: string;          // "Identificação"
  paymentTitle?: string;        // "Pagamento"
  pixOptionTitle?: string;      // "Pagamento via Pix"
  pixOptionSubtitle?: string;   // "Aprovação imediata."
  pixOptionCheckBg?: string;    // cor da bolinha do check (default laranja)
  termsText?: string;
  emailLabel?: string;
  emailPlaceholder?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  ctaLabel?: string;            // "GERAR PIX"
};

export type SimpleConfig = {
  pedidoTitle?: string;         // "Seu pedido"
  dadosTitle?: string;          // "Dados cadastrais"
  paymentTitle?: string;        // "Dados de pagamento"
  pixBadgeBorderColor?: string; // borda azul do box do PIX
  pixBadgeText?: string;        // "pix"
  pixBadgeNote?: string;        // "Ao selecionar o PIX..."
  emailLabel?: string;
  emailPlaceholder?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  ctaLabel?: string;            // "GERAR PIX"
};

export type DropConfig = {
  safetyHeaderText?: string;    // "PAGAMENTO 100% SEGURO"
  safetyHeaderColor?: string;   // verde
  cartTitle?: string;           // "Seu carrinho"
  cartBadgeColor?: string;      // verde
  step1Label?: string;          // "Identificação"
  step2Label?: string;          // "Entrega"
  step3Label?: string;          // "Pagamento"
  stepperActiveColor?: string;
  identTitle?: string;          // "Identificação"
  noEmailLabel?: string;        // "Não tenho e-mail"
  warrantyTitle?: string;       // "Usamos seus dados de forma 100% segura..."
  warrantyItems?: string[];     // bullets
  ctaLabelPrefix?: string;      // "Continuar — " (concat com formatBRL)
};

export type GringaConfig = {
  /** Header — text shown at top */
  headerTitle?: string;             // "Secure checkout"
  /** Section titles */
  contactTitle?: string;            // "Contact"
  paymentTitle?: string;            // "Payment"
  /** Field labels */
  emailLabel?: string;              // "Email"
  emailPlaceholder?: string;        // "you@email.com"
  nameLabel?: string;               // "Full name"
  namePlaceholder?: string;         // "John Doe"
  phoneLabel?: string;              // "Phone"
  phonePlaceholder?: string;        // "+1 555 000 0000"
  /** CTA */
  ctaLabel?: string;                // "Pay {AMOUNT}"
  /** Safety messages */
  safetyText?: string;              // "Payments are encrypted and processed securely."
  /** "Powered by" footer */
  poweredByText?: string;           // "Powered by Stripe & Trilho"
  /** Wallet messaging */
  walletOptionTitle?: string;       // "Express checkout"
  walletOptionSubtitle?: string;    // "Pay with one tap"
  /** Lock icon color (default dark gray) */
  lockColor?: string;
};

export type GringaDropConfig = GringaConfig & {
  /** Shipping section labels */
  shippingTitle?: string;           // "Shipping address"
  cepPlaceholder?: string;          // "Postal code"
  addressPlaceholder?: string;      // "Street address"
  apartmentPlaceholder?: string;    // "Apt, suite, etc. (optional)"
  cityPlaceholder?: string;         // "City"
  statePlaceholder?: string;        // "State"
  countryLabel?: string;            // "Country"
  /** Order summary */
  orderSummaryTitle?: string;       // "Order summary"
  subtotalLabel?: string;           // "Subtotal"
  shippingLabel?: string;           // "Shipping"
  totalLabel?: string;              // "Total"
  freeShippingLabel?: string;       // "Free"
};

export type FastConfig = {
  obrigatorioLabel?: string;    // "OBRIGATÓRIO:"
  iconBg?: string;              // azul claro
  iconColor?: string;
  identTitle?: string;          // "Identifique-se"
  paymentTitle?: string;        // "Pagamento"
  safetyText?: string;          // "Pagamento seguro via PIX com aprovação imediata."
  emailLabel?: string;
  emailPlaceholder?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  ctaLabel?: string;            // "PAGAR AGORA"
};

/* ============ Defaults ============ */

export const DEFAULT_PIX_RESULT: Required<PixResultConfig> = {
  scanText:
    "Escaneie o QR Code ou copie o código Pix abaixo para finalizar o pagamento.",
  copyLabel: "COPIAR CÓDIGO PIX",
  copiedLabel: "Copiado!",
  valueTotalLabel: "Valor total:",
  comoPagarTitle: "Como pagar?",
  comoPagarStep1:
    "Escaneie o QR Code ou copie e cole o código Pix em seu app bancário ou carteira digital.",
  comoPagarStep2: "Seu pagamento será aprovado em alguns instantes.",
};

export const DEFAULT_AUTO: Required<AutoConfig> = {
  loadingText: "Gerando seu Pix...",
  loadingSubtext: "Só um instante.",
  errorRetryLabel: "Tentar de novo",
};

export const DEFAULT_EXTRA: Required<ExtraConfig> = {
  iconBg: "#3b82f6",
  iconColor: "#ffffff",
  identTitle: "Identificação",
  paymentTitle: "Pagamento",
  pixOptionTitle: "Pagamento via Pix",
  pixOptionSubtitle: "Aprovação imediata.",
  pixOptionCheckBg: "#f97316",
  termsText:
    "Ao finalizar o pagamento você concorda com nossos termos de uso e política de privacidade.",
  emailLabel: "Email",
  emailPlaceholder: "email@email.com",
  nameLabel: "Nome Completo",
  namePlaceholder: "Nome e Sobrenome",
  ctaLabel: "Gerar Pix",
};

export const DEFAULT_SIMPLE: Required<SimpleConfig> = {
  pedidoTitle: "Seu pedido",
  dadosTitle: "Dados cadastrais",
  paymentTitle: "Dados de pagamento",
  pixBadgeBorderColor: "#2563eb",
  pixBadgeText: "pix",
  pixBadgeNote:
    "Ao selecionar o PIX, você será encaminhado para um ambiente seguro.",
  emailLabel: "E-mail",
  emailPlaceholder: "Digite seu e-mail",
  nameLabel: "Nome completo",
  namePlaceholder: "Digite seu nome",
  ctaLabel: "Gerar Pix",
};

export const DEFAULT_DROP: Required<DropConfig> = {
  safetyHeaderText: "PAGAMENTO 100% SEGURO",
  safetyHeaderColor: "#16a34a",
  cartTitle: "Seu carrinho",
  cartBadgeColor: "#16a34a",
  step1Label: "Identificação",
  step2Label: "Entrega",
  step3Label: "Pagamento",
  stepperActiveColor: "#16a34a",
  identTitle: "Identificação",
  noEmailLabel: "Não tenho e-mail",
  warrantyTitle:
    "Usamos seus dados de forma 100% segura para garantir a sua satisfação:",
  warrantyItems: [
    "Enviar o seu comprovante de compra e pagamento;",
    "Ativar a sua garantia de devolução caso não fique satisfeito.",
  ],
  ctaLabelPrefix: "Continuar — ",
};

export const DEFAULT_GRINGA: Required<GringaConfig> = {
  headerTitle: "Secure checkout",
  contactTitle: "Contact",
  paymentTitle: "Payment",
  emailLabel: "Email",
  emailPlaceholder: "you@email.com",
  nameLabel: "Full name",
  namePlaceholder: "John Doe",
  phoneLabel: "Phone (optional)",
  phonePlaceholder: "+1 555 000 0000",
  ctaLabel: "Pay {AMOUNT}",
  safetyText:
    "Payments are encrypted and processed securely. We never store your card details.",
  poweredByText: "Powered by Stripe & Trilho",
  walletOptionTitle: "Express checkout",
  walletOptionSubtitle: "Pay with one tap using your saved wallet",
  lockColor: "#18181b",
};

export const DEFAULT_GRINGA_DROP: Required<GringaDropConfig> = {
  ...DEFAULT_GRINGA,
  shippingTitle: "Shipping address",
  cepPlaceholder: "Postal / Zip code",
  addressPlaceholder: "Street address",
  apartmentPlaceholder: "Apt, suite, etc. (optional)",
  cityPlaceholder: "City",
  statePlaceholder: "State / Province",
  countryLabel: "Country",
  orderSummaryTitle: "Order summary",
  subtotalLabel: "Subtotal",
  shippingLabel: "Shipping",
  totalLabel: "Total",
  freeShippingLabel: "Free",
};

export const DEFAULT_FAST: Required<FastConfig> = {
  obrigatorioLabel: "OBRIGATÓRIO:",
  iconBg: "#60a5fa",
  iconColor: "#ffffff",
  identTitle: "Identifique-se",
  paymentTitle: "Pagamento",
  safetyText: "Pagamento seguro via PIX com aprovação imediata.",
  emailLabel: "E-mail",
  emailPlaceholder: "E-mail",
  nameLabel: "Nome e sobrenome",
  namePlaceholder: "Nome e sobrenome",
  ctaLabel: "Gerar Pix",
};

/* ============ Merge helpers ============ */

export function mergeAuto(custom?: AutoConfig): Required<AutoConfig> {
  return { ...DEFAULT_AUTO, ...(custom || {}) };
}
export function mergeExtra(custom?: ExtraConfig): Required<ExtraConfig> {
  return { ...DEFAULT_EXTRA, ...(custom || {}) };
}
export function mergeSimple(custom?: SimpleConfig): Required<SimpleConfig> {
  return { ...DEFAULT_SIMPLE, ...(custom || {}) };
}
export function mergeDrop(custom?: DropConfig): Required<DropConfig> {
  return { ...DEFAULT_DROP, ...(custom || {}) };
}
export function mergeFast(custom?: FastConfig): Required<FastConfig> {
  return { ...DEFAULT_FAST, ...(custom || {}) };
}
export function mergeGringa(custom?: GringaConfig): Required<GringaConfig> {
  return { ...DEFAULT_GRINGA, ...(custom || {}) };
}
export function mergeGringaDrop(
  custom?: GringaDropConfig,
): Required<GringaDropConfig> {
  return { ...DEFAULT_GRINGA_DROP, ...(custom || {}) };
}
export function mergePixResult(
  custom?: PixResultConfig,
): Required<PixResultConfig> {
  return { ...DEFAULT_PIX_RESULT, ...(custom || {}) };
}

/* ============ TIKTOK SHOP ============ */
export type TiktokShopReview = {
  name: string;
  stars: number;
  text: string;
  photo?: string;
};
export type TiktokShopVariant = {
  label: string;
  image?: string;
  /**
   * Ajuste de preço (centavos) desta variante, somado ao preço base.
   * Pode ser negativo (variante mais barata). 0/ausente = sem mudança.
   * Aplicado de forma AUTORITATIVA no servidor (lê do theme salvo) —
   * o cliente só envia o índice escolhido, nunca o valor.
   */
  priceDeltaCents?: number;
};
export type TiktokShopConfig = {
  /** Galeria de imagens (carrossel). Vazio = usa a imagem do produto. */
  gallery?: string[];
  /** Vídeo do produto (mp4/webm) exibido como 1º slide do carrossel. */
  galleryVideo?: string;
  /** Avaliações com nota + foto opcional. */
  reviews?: TiktokShopReview[];
  /** Itens da "Proteção do cliente". */
  protection?: string[];
  /** Minutos do countdown de escassez. */
  countdownMinutes?: number;
  /** % de desconto exibido (calcula o preço "de"). 0 = esconde. */
  discountPercent?: number;
  /** Nota média exibida (ex "4.9"). */
  ratingValue?: string;
  /** Qtd de avaliações exibida no cabeçalho. */
  ratingCount?: number;
  /** Texto de vendidos (ex "1.2mil vendidos"). */
  soldText?: string;
  /** Label do bloco de variantes visuais (ex "Cor"). */
  variantsLabel?: string;
  /** Variantes — trocam a imagem principal e podem ajustar o preço. */
  variants?: TiktokShopVariant[];
  /** Prova social ao vivo: pop-ups de venda recente + contador de viewers. */
  socialProofEnabled?: boolean;
  /** Nomes usados nos pop-ups (ex ["João de SP", "Maria do RJ"]). */
  socialProofNames?: string[];
  /** Faixa do contador "X pessoas vendo agora" (mín/máx). */
  viewersMin?: number;
  viewersMax?: number;
};
export const DEFAULT_TIKTOK_SHOP: Required<TiktokShopConfig> = {
  gallery: [],
  galleryVideo: "",
  reviews: [
    { name: "Ana C.", stars: 5, text: "Produto chegou rápido e exatamente como na foto. Recomendo demais!" },
    { name: "Marcos R.", stars: 5, text: "Qualidade excelente pelo preço. Já é a segunda vez que compro." },
    { name: "Juliana P.", stars: 4, text: "Gostei muito, só demorou 2 dias a mais. Vale a pena." },
  ],
  protection: [
    "Reembolso garantido em até 90 dias",
    "Pagamento 100% seguro e criptografado",
    "Entrega rastreada do início ao fim",
    "Suporte dedicado ao cliente",
  ],
  countdownMinutes: 15,
  discountPercent: 70,
  ratingValue: "4.9",
  ratingCount: 207,
  soldText: "1.2mil vendidos",
  variantsLabel: "Opções",
  variants: [],
  socialProofEnabled: false,
  socialProofNames: [
    "João de São Paulo",
    "Maria do Rio de Janeiro",
    "Carlos de Belo Horizonte",
    "Fernanda de Curitiba",
    "Lucas de Porto Alegre",
  ],
  viewersMin: 23,
  viewersMax: 87,
};
export function mergeTiktokShop(
  custom?: TiktokShopConfig,
): Required<TiktokShopConfig> {
  return { ...DEFAULT_TIKTOK_SHOP, ...(custom || {}) };
}

/**
 * Resolve o ajuste de preço (centavos) de uma variante TikTok Shop a partir
 * do theme SALVO no banco. AUTORITATIVO no servidor: o cliente manda só o
 * índice; o valor vem sempre da config confiável. Retorna 0 quando inválido.
 * Usado em pix/route.ts + card/route.ts pra cobrar o preço certo da variante.
 */
export function resolveTiktokVariantDelta(
  theme: unknown,
  variantIndex: number | null | undefined,
): number {
  if (variantIndex == null || !Number.isInteger(variantIndex)) return 0;
  const cfg = (theme as { tiktokShop?: TiktokShopConfig } | null)?.tiktokShop;
  const variants = cfg?.variants;
  if (!Array.isArray(variants)) return 0;
  const v = variants[variantIndex];
  if (!v) return 0;
  const delta = Number(v.priceDeltaCents);
  return Number.isFinite(delta) ? Math.round(delta) : 0;
}

/* ============ MERCADO LIVRE ============ */
export type MercadoLivreConfig = {
  summaryTitle?: string;
  payTitle?: string;
  guaranteeTitle?: string;
  /** Itens da "Compra Garantida". */
  guarantees?: string[];
};
export const DEFAULT_MERCADO_LIVRE: Required<MercadoLivreConfig> = {
  summaryTitle: "Resumo da compra",
  payTitle: "Como você vai pagar",
  guaranteeTitle: "Compra Garantida",
  guarantees: [
    "Pagamento protegido e criptografado",
    "Receba o produto ou devolvemos seu dinheiro",
    "Envio rastreado para todo o Brasil",
  ],
};
export function mergeMercadoLivre(
  custom?: MercadoLivreConfig,
): Required<MercadoLivreConfig> {
  return { ...DEFAULT_MERCADO_LIVRE, ...(custom || {}) };
}

/* ============ AMAZON ============ */
export type AmazonConfig = {
  /** Título do topo (ex "Finalizar compra"). */
  headerTitle?: string;
  /** Título da seção de endereço. */
  addressTitle?: string;
  /** Título da seção de pagamento. */
  paymentTitle?: string;
  /** Título da seção de revisão dos itens. */
  reviewTitle?: string;
  /** Título do box de resumo (direita). */
  summaryTitle?: string;
  /** Texto do botão de fechar pedido. */
  ctaText?: string;
  /** Selo de entrega (ex "Entrega GRÁTIS amanhã"). */
  deliveryBadge?: string;
  /** Observação de entrega abaixo do selo. */
  deliveryNote?: string;
  /** Texto de frete grátis no resumo. */
  freeShippingText?: string;
  /** Texto de segurança/garantia no rodapé do resumo. */
  securityText?: string;
};
export const DEFAULT_AMAZON: Required<AmazonConfig> = {
  headerTitle: "Finalizar compra",
  addressTitle: "Endereço de entrega",
  paymentTitle: "Forma de pagamento",
  reviewTitle: "Revise os itens e a entrega",
  summaryTitle: "Resumo do pedido",
  ctaText: "Fechar pedido",
  deliveryBadge: "Entrega GRÁTIS amanhã",
  deliveryNote: "Se você pedir agora, recebe amanhã. Estoque limitado.",
  freeShippingText: "Seu pedido tem entrega GRÁTIS",
  securityText: "Transação 100% segura e criptografada",
};
export function mergeAmazon(custom?: AmazonConfig): Required<AmazonConfig> {
  return { ...DEFAULT_AMAZON, ...(custom || {}) };
}

/* ============ SHOPEE ============ */
export type ShopeeConfig = {
  /** Cor da marca (laranja Shopee por padrão). Define header, total e botão. */
  brandColor?: string;
  /** Título do topo (ex "Finalizar Pagamento"). */
  headerTitle?: string;
  /** Título da seção de endereço. */
  addressTitle?: string;
  /** Título da seção de pagamento. */
  paymentTitle?: string;
  /** Label do campo de voucher/cupom. */
  voucherLabel?: string;
  /** Placeholder do campo de voucher. */
  voucherPlaceholder?: string;
  /** Texto de frete grátis. */
  shippingFreeText?: string;
  /** Texto da garantia Shopee. */
  guaranteeText?: string;
  /** Texto de cashback / moedas. */
  cashbackText?: string;
  /** Título do resumo do pedido. */
  summaryTitle?: string;
  /** Texto do botão de fazer pedido. */
  ctaText?: string;
};
export const DEFAULT_SHOPEE: Required<ShopeeConfig> = {
  brandColor: "#EE4D2D",
  headerTitle: "Finalizar Pagamento",
  addressTitle: "Endereço de Entrega",
  paymentTitle: "Método de Pagamento",
  voucherLabel: "Voucher Shopee",
  voucherPlaceholder: "Inserir código",
  shippingFreeText: "Frete GRÁTIS",
  guaranteeText: "Shopee Garante: receba o produto ou seu dinheiro de volta",
  cashbackText: "Ganhe Shopee Coins nesta compra",
  summaryTitle: "Resumo do Pedido",
  ctaText: "Fazer pedido",
};
export function mergeShopee(custom?: ShopeeConfig): Required<ShopeeConfig> {
  return { ...DEFAULT_SHOPEE, ...(custom || {}) };
}

/* ===================== Selos de segurança (dados) =====================
 * Tipo + default MORAM AQUI, não no checkout-extras.tsx.
 *
 * checkout-extras.tsx é `"use client"`. Quando a página de checkout
 * (src/app/c/[slug]/page.tsx, Server Component) importava DEFAULT_SEALS de lá,
 * recebia um proxy de referência de client no lugar do array — e o .map()
 * dentro de <SecuritySeals> quebrava. Mesmo bug que derrubou a /dashboard com
 * "OVERVIEW_METRIC_KEYS is not iterable" (06/08/2026); aqui era latente porque
 * só dispara pra quem liga "Selos de Segurança" sem cadastrar itens próprios.
 * Este módulo é neutro, então server e client leem o mesmo array de verdade.
 */
export type SecuritySealKind =
  | "shield"
  | "award"
  | "lock"
  | "zap"
  | "rocket"
  | "handshake";

export type SecuritySealItem = {
  icon: SecuritySealKind;
  title: string;
  text?: string;
};

export const DEFAULT_SEALS: SecuritySealItem[] = [
  { icon: "shield", title: "Compra Segura", text: "Site protegido por SSL." },
  { icon: "lock", title: "Pagamento Criptografado", text: "Dados protegidos." },
  { icon: "award", title: "Garantia 7 dias", text: "Reembolso integral." },
];
