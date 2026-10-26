/**
 * Compras INTERNAS do seller — saldo ou PIX (via AbacatePay).
 *
 * Funcionalidades cobertas (funções PAGAS do gateway):
 *  - Subscription mensal "Subir Campanhas em Massa"
 *  - Compra de Tema individual
 *  - Espionagem, tracking e demais recursos pagos
 *
 * Fluxo PIX:
 *  1. createInternalPixCharge cria InternalPurchase pending + PIX via AbacatePay
 *  2. Cliente paga PIX
 *  3. Webhook AbacatePay chama applyInternalPurchase quando paga
 *  4. Feature é aplicada (subscription estendida / tema concedido)
 *
 * Fluxo Saldo:
 *  - applyMassCampaignSubscriptionBalance / purchaseThemeWithBalance
 *    debitam balanceCents e aplicam imediato.
 */
import QRCode from "qrcode";
import { prisma } from "./prisma";
import { getHandler } from "./acquirers";
import { decryptString } from "./crypto";
import { buildPostbackUrl } from "./security/webhook-secret";
import { recordThemePixPurchase } from "./theme-access";
import { ensureValidCustomer } from "./fake-customer";

export const MASS_CAMPAIGN_MONTHLY_CENTS = 69700; // R$ 697,00
export const THEME_PRICE_CENTS = 500; // R$ 5,00 (já era esse valor)
export const SUBSCRIPTION_DURATION_DAYS = 30;
/** Uploads grátis incluídos a cada renovação do plano. Após esses, R$ 1,00/upload. */
export const MASS_CAMPAIGN_FREE_UPLOADS_PER_CYCLE = 20;
/** Custo por upload extra (acima do free quota). */
export const MASS_CAMPAIGN_EXTRA_UPLOAD_CENTS = 100; // R$ 1,00

type Feature =
  | "mass_campaign_30d"
  | "custom_theme_request"
  | `theme:${string}`
  | `spying:${string}`;

/**
 * Pega TODAS as Acquirers globais ativas com credenciais decriptografaveis,
 * ordenadas por prioridade global (admin define). Usado pra gerar PIX das
 * FUNCOES PAGAS do gateway (temas, tracking, espionagem, campanha em massa).
 *
 * Antes (jul/2026) o helper era `getAbacatePayCreds` — hard-coded pra
 * AbacatePay. Se a AbacatePay estivesse fora do ar ou nem cadastrada,
 * o botao "Pagar com PIX" quebrava com "AbacatePay não configurado".
 * Agora aceita QUALQUER adquirente ativa (safepix, mercadopago, sharkbanking,
 * sharkhub, abacatepay) e faz fallback pra proxima se a primeira
 * falhar. Mesmo mecanismo do dispatchPixCharge do fluxo normal, so que sem
 * UserAcquirer (usa a ordem global — admin decide).
 */
async function getPlatformPixAcquirers(): Promise<
  Array<{
    id: string;
    code: string;
    publicKey: string;
    secretKey: string;
  }>
> {
  // 17/07/2026 (davi): compra interna (tema, subscription, etc) SEMPRE via
  // Pluggou. Filtra `code startsWith "pluggou"`. Fallback: se nenhuma Pluggou
  // estiver ativa, cai nas demais (temos que ter algo). Assim garantimos que
  // temas e outras compras internas concentram receita/reconciliação na
  // Pluggou, que é a conta padrão da plataforma.
  const pluggouOnly = await prisma.acquirer.findMany({
    where: {
      active: true,
      globalEnabled: true,
      supportsPix: true,
      secretKeyEnc: { not: null },
      code: { startsWith: "pluggou" },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: { id: true, code: true, publicKey: true, secretKeyEnc: true },
  });
  const rows = pluggouOnly.length > 0
    ? pluggouOnly
    : await prisma.acquirer.findMany({
        where: {
          active: true,
          globalEnabled: true,
          supportsPix: true,
          secretKeyEnc: { not: null },
        },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        select: { id: true, code: true, publicKey: true, secretKeyEnc: true },
      });
  const out: Array<{
    id: string;
    code: string;
    publicKey: string;
    secretKey: string;
  }> = [];
  for (const r of rows) {
    if (!r.secretKeyEnc) continue;
    try {
      out.push({
        id: r.id,
        code: r.code,
        publicKey: r.publicKey ?? "",
        secretKey: decryptString(r.secretKeyEnc),
      });
    } catch (e) {
      console.error(`[internal-purchases] decrypt failed for ${r.code}:`, e);
      // segue tentando as outras
    }
  }
  return out;
}

/** Cria PIX via AbacatePay pra uma compra interna. */
export async function createInternalPixCharge({
  userId,
  feature,
  amountCents,
  description,
  metadata,
}: {
  userId: string;
  feature: Feature;
  amountCents: number;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<
  | {
      ok: true;
      purchaseId: string;
      pixCopyPaste: string;
      pixQrCodeBase64?: string;
      expiresAt: string | null;
    }
  | { ok: false; error: string }
> {
  const acquirers = await getPlatformPixAcquirers();
  if (acquirers.length === 0) {
    return {
      ok: false,
      error:
        "Nenhuma adquirente PIX ativa. Avise o admin pra cadastrar/ativar uma em /admin01/adquirentes.",
    };
  }

  // Pega user pra customer info
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, cpfCnpj: true },
  });
  if (!user) return { ok: false, error: "Usuário não encontrado" };

  const customer = ensureValidCustomer({
    name: user.name,
    email: user.email,
    cpf: user.cpfCnpj,
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";

  // Cria a InternalPurchase como pending PRIMEIRO (pra ter o ID pra rastreio —
  // o webhook acha a compra pelo pixProviderId).
  const purchase = await prisma.internalPurchase.create({
    data: {
      userId,
      feature,
      amountCents,
      paymentMethod: "pix",
      status: "pending",
      metadata: (metadata ?? {}) as never,
    },
  });

  const cpfDigits = customer.cpf.replace(/\D/g, "");
  // Base do postbackUrl — vai ser sobrescrito por provider abaixo pra cada
  // acquirente escolher seu proprio webhook. Sharkbanking/sharkhub
  // sobrescrevem internamente no provider mesmo, entao a URL passada aqui
  // eh so a de abacatepay/safepix (que precisam receber correto).
  //
  // FIX 17/07/2026 (davi: "o pix nao ta gerando"): Pluggou retornava 422
  // "Erro de validação nos dados fornecidos" porque o customer faltava
  // phone. ensureValidCustomer já gera phoneForProvider válido — só
  // precisava passar. Adicionado phone pra desbloquear compra de tema.
  const chargeInputBase = {
    amountCents,
    postbackUrl: `${appUrl}/api/webhooks/abacatepay`,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phoneForProvider,
      document: {
        number: cpfDigits,
        type: (cpfDigits.length === 14 ? "cnpj" : "cpf") as "cpf" | "cnpj",
      },
    },
    items: [
      {
        title: description.slice(0, 70),
        unit_price: amountCents,
        quantity: 1,
        tangible: false,
        external_ref: `internal:${purchase.id}`,
      },
    ],
    metadata: {
      transaction_id: purchase.id,
      internal_purchase_id: purchase.id,
      feature: String(feature),
      user_id: userId,
    },
  };

  // Tenta cada adquirente em ordem de prioridade. Falha em uma → tenta a
  // proxima. So retorna erro quando TODAS falharem (mensagem inclui todos
  // os codes tentados pra facilitar debug do admin).
  const errors: string[] = [];
  for (const acq of acquirers) {
    const handler = getHandler(acq.code);
    if (!handler) {
      errors.push(`${acq.code}: sem handler`);
      continue;
    }
    // Sobrescreve postbackUrl pro webhook correto da adquirente escolhida.
    // Providers que ja fazem override interno (sharkbanking/sharkhub)
    // ignoram, o postbackUrl aqui vira decorativo pra elas.
    const webhookPath = acq.code.startsWith("safepix")
      ? "/api/webhooks/safepix"
      : acq.code.startsWith("mercadopago")
        ? "/api/webhooks/mercadopago"
        : acq.code.startsWith("sharkbanking")
          ? "/api/webhooks/sharkbanking"
          : acq.code.startsWith("sharkhub")
            ? "/api/webhooks/sharkhub"
            : acq.code.startsWith("pluggou")
              ? "/api/webhooks/pluggou"
              : acq.code.startsWith("pixzy")
                ? "/api/webhooks/pixzy"
                : "/api/webhooks/abacatepay";
    // Só safepix precisa de whs (é onde tinha o forge). Outros providers
    // já têm sig verificada.
    const rawPostback = `${appUrl}${webhookPath}`;
    const chargeInput = {
      ...chargeInputBase,
      postbackUrl: acq.code.startsWith("safepix")
        ? buildPostbackUrl(rawPostback, purchase.id)
        : rawPostback,
    };
    try {
      const result = await handler(chargeInput, {
        publicKey: acq.publicKey,
        secretKey: acq.secretKey,
      });
      if (!result.qrCode) {
        errors.push(`${acq.code}: sem QR (status=${result.status})`);
        continue;
      }

      // Gera o QR base64 do copia-e-cola (front prependa o prefixo data:image).
      let qrCodeBase64: string | undefined;
      try {
        const dataUrl = await QRCode.toDataURL(result.qrCode, {
          width: 320,
          margin: 1,
        });
        qrCodeBase64 = dataUrl.replace(
          /^data:image\/[a-z0-9+.-]+;base64,/i,
          "",
        );
      } catch {}

      // Salva PIX info na purchase (inclui acquirerId pra rastrear qual venceu)
      await prisma.internalPurchase.update({
        where: { id: purchase.id },
        data: {
          pixProviderId: result.id,
          pixCopyPaste: result.qrCode,
          pixQrCodeBase64: qrCodeBase64 ?? null,
          pixExpiresAt: result.expiresAt ?? null,
          metadata: {
            ...((metadata ?? {}) as Record<string, unknown>),
            acquirer_id: acq.id,
            acquirer_code: acq.code,
          } as never,
        },
      });

      return {
        ok: true,
        purchaseId: purchase.id,
        pixCopyPaste: result.qrCode,
        pixQrCodeBase64: qrCodeBase64,
        expiresAt: result.expiresAt ?? null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      errors.push(`${acq.code}: ${msg}`);
      // continua tentando as proximas
    }
  }

  // Todas as adquirentes falharam
  await prisma.internalPurchase.update({
    where: { id: purchase.id },
    data: { status: "failed" },
  });
  return {
    ok: false,
    error: `Nenhuma adquirente conseguiu gerar o PIX. Tentativas: ${errors.join(" | ")}`,
  };
}

/**
 * Helper de webhook: dado um pixProviderId, checa se corresponde a uma
 * InternalPurchase (nao a uma Transaction normal de venda). Se sim e o
 * webhook confirmou que a cobranca foi paga, aplica a compra (concede
 * o tema / estende subscription / libera espionagem etc).
 *
 * Retorno `isInternal`: usado pelo webhook pra retornar 200 sem ir pro
 * "unknown_transaction" — a cobranca EH nossa, so nao eh uma venda de
 * seller.
 *
 * IMPORTANTE (jul/2026): antes so os webhooks AbacatePay e MP chamavam
 * o applyInternalPurchase. Como agora QUALQUER adquirente ativa pode
 * gerar PIX pras compras internas do gateway (temas etc), todos os
 * webhooks (safepix, sharkbanking, sharkhub) precisam suportar
 * — daí o helper centralizado. Idempotente: applyInternalPurchase pula
 * se ja tiver sido aplicada.
 */
export async function tryHandleInternalPurchaseWebhook(input: {
  pixProviderId: string;
  confirmedPaid: boolean;
}): Promise<{ isInternal: boolean }> {
  const internal = await prisma.internalPurchase.findFirst({
    where: { pixProviderId: input.pixProviderId },
    select: { id: true, status: true },
  });
  if (!internal) return { isInternal: false };
  if (internal.status !== "paid" && input.confirmedPaid) {
    const r = await applyInternalPurchase(internal.id);
    if (!r.ok) {
      console.error(
        "[internal-purchase] apply failed:",
        internal.id,
        r.error,
      );
    }
  }
  return { isInternal: true };
}

/**
 * Aplica uma compra interna quando confirmada (chamado pelo webhook AbacatePay
 * quando o PIX é marcado paid, ou pelas funções de balance que aplicam
 * direto).
 *
 * Idempotente: se já tá paid, retorna sem fazer nada de novo.
 */
export async function applyInternalPurchase(
  purchaseId: string,
): Promise<{ ok: boolean; error?: string }> {
  const purchase = await prisma.internalPurchase.findUnique({
    where: { id: purchaseId },
  });
  if (!purchase) return { ok: false, error: "Purchase não encontrada" };
  if (purchase.status === "paid") return { ok: true }; // já aplicada

  const { userId, feature } = purchase;

  if (feature === "mass_campaign_30d") {
    // Estende massCampaignSubscriptionUntil em +30 dias + adiciona N
    // free uploads (N admin-editavel via /admin01/precos, default 20).
    // Free uploads são CUMULATIVOS — quem renovou antes de gastar
    // os antigos fica com o saldo + N novos.
    const { getMassCampaignFreeUploadsAsync } = await import("./pricing");
    const freeUploads = await getMassCampaignFreeUploadsAsync();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        massCampaignSubscriptionUntil: true,
        massCampaignFreeUploadsLeft: true,
      },
    });
    const now = new Date();
    const currentEnd =
      user?.massCampaignSubscriptionUntil &&
      user.massCampaignSubscriptionUntil > now
        ? user.massCampaignSubscriptionUntil
        : now;
    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() + SUBSCRIPTION_DURATION_DAYS);

    await prisma.$transaction(async (db) => {
      await db.user.update({
        where: { id: userId },
        data: {
          massCampaignSubscriptionUntil: newEnd,
          massCampaignFreeUploadsLeft: { increment: freeUploads },
        },
      });
      await db.internalPurchase.update({
        where: { id: purchaseId },
        data: { status: "paid", paidAt: new Date() },
      });
    });
    return { ok: true };
  }

  if (feature.startsWith("theme:")) {
    const themeKey = feature.slice("theme:".length);
    // FIX BUG-5: grava como source="pix" + integrityHash, não "admin_grant".
    // Antes auditoria ficava confusa porque toda compra PIX aparecia como grant.
    const grant = await recordThemePixPurchase(userId, themeKey);
    if (!grant.ok) return { ok: false, error: grant.reason };
    await prisma.internalPurchase.update({
      where: { id: purchaseId },
      data: { status: "paid", paidAt: new Date() },
    });
    return { ok: true };
  }

  if (feature.startsWith("spying:")) {
    // Espionagem (FB/TikTok swipe file). hasSpyingAccess() so checa se
    // existe InternalPurchase paid com feature=spying:<plat> — entao
    // marcar como paid AQUI ja libera o acesso.
    await prisma.internalPurchase.update({
      where: { id: purchaseId },
      data: { status: "paid", paidAt: new Date() },
    });
    return { ok: true };
  }

  return { ok: false, error: `Feature desconhecida: ${feature}` };
}

/**
 * Aplica subscription de mass campaign cobrando do SALDO. Atomic:
 * debita balance + estende subscription numa transação.
 */
export async function subscribeMassCampaignWithBalance(
  userId: string,
): Promise<{ ok: boolean; error?: string; newBalanceCents?: number; subscriptionUntil?: Date }> {
  // Preços admin-editáveis (via /admin01/precos), com fallback hardcoded
  const { getPricing } = await import("./pricing");
  const pricing = await getPricing();
  const monthlyCents = pricing.massCampaignMonthlyCents;
  const freeUploads = pricing.massCampaignFreeUploadsPerCycle;

  const result = await prisma.$transaction(async (db) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        balanceCents: true,
        blocked: true,
        massCampaignSubscriptionUntil: true,
      },
    });
    if (!user) return { ok: false as const, error: "User não encontrado" };
    if (user.blocked)
      return { ok: false as const, error: "Conta bloqueada" };
    if (user.balanceCents < monthlyCents) {
      const reais = (monthlyCents / 100).toFixed(2).replace(".", ",");
      return {
        ok: false as const,
        error: `Saldo insuficiente. Necessário: R$ ${reais}.`,
      };
    }
    const now = new Date();
    const currentEnd =
      user.massCampaignSubscriptionUntil &&
      user.massCampaignSubscriptionUntil > now
        ? user.massCampaignSubscriptionUntil
        : now;
    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() + SUBSCRIPTION_DURATION_DAYS);

    const updated = await db.user.update({
      where: { id: userId },
      data: {
        balanceCents: { decrement: monthlyCents },
        massCampaignSubscriptionUntil: newEnd,
        // Bônus de free uploads (admin-editável; cumulativo se renovou cedo)
        massCampaignFreeUploadsLeft: { increment: freeUploads },
      },
      select: { balanceCents: true, massCampaignSubscriptionUntil: true },
    });

    // Registra a compra pra histórico (já marcada paid)
    await db.internalPurchase.create({
      data: {
        userId,
        feature: "mass_campaign_30d",
        amountCents: monthlyCents,
        paymentMethod: "balance",
        status: "paid",
        paidAt: new Date(),
      },
    });

    return {
      ok: true as const,
      newBalanceCents: updated.balanceCents,
      subscriptionUntil: updated.massCampaignSubscriptionUntil ?? newEnd,
    };
  });
  return result;
}

/** Checa se user tem subscription ativa de massa campaign. */
export async function hasActiveMassCampaignSubscription(
  userId: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { massCampaignSubscriptionUntil: true, isFriendAccount: true },
  });
  if (!user) return false;
  // Conta amigo (admin-granted) pula paywall sempre
  if (user.isFriendAccount) return true;
  if (!user.massCampaignSubscriptionUntil) return false;
  return user.massCampaignSubscriptionUntil > new Date();
}
