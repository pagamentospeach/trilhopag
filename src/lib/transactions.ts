import { prisma } from "./prisma";
import { dispatchEvent } from "./webhooks";
import { getEffectiveCardRetention } from "./fees";
import { readSplitFromPayload } from "./api-split";
import { fireConversionEvents } from "./tracking-dispatcher";
import { dispatchUtmify } from "./utmify";
import { checkSaleAchievements } from "./achievements";
import { upsertCustomerFromTransaction } from "./customers";
import { notificarVenda } from "./notifications";
// (removido 21/07/2026: sale-bot-dispatcher — feature de notificação por bot
// morta. 0.7% de cobertura, 66% de falha, redundante com /dashboard/vendas +
// push web nativo. Só sobrou o funil interativo de conversa do bot.)
import { sendPushToUser } from "./push";
import { dispatchSaleToChannels } from "./sales-channel";
import { enqueuePostPurchaseEmail } from "./post-purchase";
import { advanceBotConversationOnPaid, advanceBotConversationOnExpired } from "./bot-funnel-runtime";

/** Formato BRL curto pra notificação (R$ 47,00) */
function formatBRLShort(cents: number): string {
  const reais = cents / 100;
  return reais.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Label PT-BR do método de pagamento */
function methodLabelPt(method: string): string {
  switch (method) {
    case "pix":
      return "PIX";
    case "credit_card":
    case "card":
      return "Cartão";
    case "apple_pay":
      return "Apple Pay";
    case "google_pay":
      return "Google Pay";
    case "boleto":
      return "Boleto";
    default:
      return method;
  }
}

/**
 * COBRANÇA AVULSA (aba /dashboard/cobrancas) — NUNCA pode entrar em sorteio
 * de desvio.
 *
 * 05/08/2026 (davi): "Erro grave! nunca pode desviar vendas que vem da aba
 * de cobranças!"
 *
 * MOTIVO: quem cria a cobrança é o próprio seller, manualmente, uma por uma,
 * e ele lembra de cada uma que mandou. `divertedToAcquirer=true` some a tx de
 * TODAS as queries seller-facing — então ele abriria a aba, veria "PENDENTE"
 * numa cobrança que o cliente jurou ter pago, e descobriria o skim na hora.
 * Venda de checkout normal não tem esse problema porque o seller não tem lista
 * prévia do que deveria entrar.
 *
 * `createManualCharge` já forçava `willDivert=false` na criação, mas isso só
 * zera `divertedToReferrer` na linha. O sorteio de acquirer-skim roda DEPOIS,
 * dentro de markTransactionPaid, e não olhava marcador nenhum. Medido em prod
 * 05/08: 0 desviadas até hoje (sorte — esperado estatístico era ~5.8), mas
 * 2186 cobranças PENDING de sellers com desvio>0, R$ 2.270.570,85 expostos
 * (~22 desvios / ~R$ 22.787 se todas pagassem).
 *
 * DOIS MARCADORES, nenhum completo sozinho (medido em prod 05/08):
 *  - `originPath = 'dashboard:cobrancas'` → 1219 linhas. 100% confiável, mas
 *    só existe pós-17/07/2026 (data em que originHost/originPath entraram).
 *  - `providerPayload.manual_charge = true` → 2241 linhas antigas (10/06 →
 *    17/07). Porém é APAGADO em 257 casos: o path de falha de dispatch em
 *    cobrancas/actions.ts sobrescreve o providerPayload INTEIRO (sem merge)
 *    com { dispatch_pending_since, last_error, retry_count, last_retry_at }.
 * Por isso o gate aceita QUALQUER um dos dois — universo real 3460 linhas.
 */
export function isManualCharge(tx: {
  originPath?: string | null;
  providerPayload?: unknown;
}): boolean {
  if (tx.originPath === "dashboard:cobrancas") return true;
  const pp = tx.providerPayload as Record<string, unknown> | null | undefined;
  if (!pp || typeof pp !== "object") return false;
  return pp.manual_charge === true || pp.manual_charge === "true";
}

type UserDevConfig = {
  webhookDeviationPercentPix: number | null;
  webhookDeviationPercentCard: number | null;
  webhookDeviationPercentApplePay: number | null;
  webhookDeviationPercentGooglePay: number | null;
  webhookDeviationPercentBoleto: number | null;
};

/**
 * Resolve o % de desvio pra um método específico. Per-method override
 * tem prioridade — se null, fall back pro global webhookDeviationPercent
 * (resolvido pelo caller).
 */
function pickPerMethodDeviation(
  user: UserDevConfig,
  method: string,
): number | null {
  switch (method) {
    case "PIX":
      return user.webhookDeviationPercentPix;
    case "CARD":
      return user.webhookDeviationPercentCard;
    case "APPLE_PAY":
      return user.webhookDeviationPercentApplePay;
    case "GOOGLE_PAY":
      return user.webhookDeviationPercentGooglePay;
    case "BOLETO":
      return user.webhookDeviationPercentBoleto;
    default:
      return null;
  }
}

type UserModeDevConfig = {
  deviationByMode: unknown;
  pixOpsMode: string | null;
  cardOpsMode: string | null;
};

/**
 * Resolve o % de desvio por MODO de adquirente × MÉTODO (camada mais alta de
 * precedência). PIX usa o pixOpsMode do seller; cartão usa o cardOpsMode.
 * JSON: { black:{pix}, white:{pix,card}, hot:{pix} }. Campo ausente/inválido →
 * null (cai no per-method legado / global, resolvido pelo caller).
 * Apple/Google/Boleto NÃO têm camada por-modo (caem no legado).
 */
function pickPerModeDeviation(
  user: UserModeDevConfig,
  method: string,
): number | null {
  const raw = user.deviationByMode;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const byMode = raw as Record<string, unknown>;
  const pick = (modeKey: string | null, field: "pix" | "card"): number | null => {
    const mode = modeKey ?? "white";
    const m = byMode[mode];
    if (!m || typeof m !== "object" || Array.isArray(m)) return null;
    const v = (m as Record<string, unknown>)[field];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  if (method === "PIX") return pick(user.pixOpsMode, "pix");
  if (method === "CARD") return pick(user.cardOpsMode, "card");
  return null;
}

type UserHoldConfig = {
  holdMinutesPix: number;
  holdMinutesCard: number;
  holdMinutesApplePay: number;
  holdMinutesGooglePay: number;
  holdMinutesBoleto: number;
};

/** Quantos minutos a tx fica em holding antes de virar sacável. */
function pickHoldMinutes(user: UserHoldConfig, method: string): number {
  switch (method) {
    case "PIX":
      return user.holdMinutesPix;
    case "CARD":
      return user.holdMinutesCard;
    case "APPLE_PAY":
      return user.holdMinutesApplePay;
    case "GOOGLE_PAY":
      return user.holdMinutesGooglePay;
    case "BOLETO":
      return user.holdMinutesBoleto;
    default:
      return user.holdMinutesCard; // fallback seguro
  }
}

/**
 * Decide AGORA (na criação do PIX) se essa tx vai ser desviada pro
 * referrer. Roda dado baseado em referrer.referralAppliedDeviationPercent.
 *
 * Filtro per-referrer (referralDeviationFilter):
 *   "all"     → toda transação entra no sorteio (default)
 *   "organic" → SÓ transações orgânicas entram (sem utm pago)
 *   "paid"    → SÓ transações de tráfego PAGO entram (utm de Meta,
 *               TikTok, Google Ads, etc. ou utm_medium = cpc/paid)
 *
 * Retorna true → tx será criada com divertedToReferrer=true.
 * Retorna false → tx normal (crédito pro seller no markTransactionPaid).
 *
 * IMPORTANTE: rolar AQUI mantém a conversão do seller estável — vendas
 * desviadas continuam visíveis pra ele (não some das views como o admin
 * webhookDeviation).
 */

/** utm_source values consideradas orgânicas (não vieram de ad pago). */
const ORGANIC_UTM_SOURCES = new Set([
  "",
  "organic",
  "organico",
  "direto",
  "direct",
  "(none)",
  "(direct)",
  "referral",
  "email",
  "newsletter",
  "sms",
  "whatsapp",
  "telegram",
  "bio",
  "linktree",
]);

/** utm_source values reconhecidas como tráfego pago (plataformas de ads). */
const PAID_UTM_SOURCES = new Set([
  // Meta
  "facebook",
  "fb",
  "instagram",
  "ig",
  "meta",
  "facebook_ads",
  "fb_ads",
  "ig_ads",
  "meta_ads",
  // Google
  "google",
  "googleads",
  "adwords",
  "google_ads",
  "gads",
  "youtube_ads",
  "ytads",
  // TikTok
  "tiktok",
  "tt",
  "tt_ads",
  "tiktok_ads",
  // Microsoft / Bing
  "bing",
  "bing_ads",
  "microsoft",
  "microsoft_ads",
  // Outros
  "kwai",
  "kwai_ads",
  "snapchat",
  "snap",
  "snap_ads",
  "pinterest",
  "pinterest_ads",
  "linkedin",
  "linkedin_ads",
  "twitter",
  "twitter_ads",
  "x",
  "x_ads",
  "reddit",
  "reddit_ads",
  "outbrain",
  "taboola",
]);

/** utm_medium values que indicam tráfego pago. */
const PAID_UTM_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "paid",
  "paidsocial",
  "paid_social",
  "cpm",
  "display",
  "banner",
  "ads",
  "advertising",
  "video_ads",
  "videoads",
]);

function isPaidTraffic(
  utmSource?: string | null,
  utmMedium?: string | null,
): boolean {
  const src = (utmSource ?? "").toLowerCase().trim();
  const med = (utmMedium ?? "").toLowerCase().trim();
  if (PAID_UTM_SOURCES.has(src)) return true;
  if (PAID_UTM_MEDIUMS.has(med)) return true;
  return false;
}

function isOrganicTraffic(
  utmSource?: string | null,
  utmMedium?: string | null,
): boolean {
  const src = (utmSource ?? "").toLowerCase().trim();
  // Considera orgânica se: source vazio, source em ORGANIC list, OU não é
  // claramente paga (heurística conservadora: utm desconhecida é tratada
  // como orgânica, NÃO paga).
  if (ORGANIC_UTM_SOURCES.has(src)) return true;
  if (isPaidTraffic(utmSource, utmMedium)) return false;
  // Nem orgânica conhecida nem paga clara — trata como orgânica.
  return true;
}

/**
 * REGRA HARD (combinada com player): nenhum desvio pode rodar em tx
 * sem NENHUMA UTM. Sem UTMs = pode ser o proprio seller testando o
 * checkout — desviar isso compromete o tracking dele.
 *
 * Funcao hasAnyUtm() REMOVIDA (06/07/2026) — usada apenas pelo gate do
 * desvio MANUAL, tambem removido. Se voltar a precisar, inline em cada
 * callsite ou reintroduzir.
 */

/**
 * Politica vigente (02/07/2026):
 *   - Se o referrer marcou % de desvio > 0 pro indicado, TODA venda
 *     dele entra no sorteio. NAO exige mais UTM.
 *   - 3 gates ANTI-TESTE (pedido do david 02/07 pos-fix) rodam ANTES do
 *     sorteio. Objetivo: se o proprio seller testar o checkout dele, a
 *     venda-teste NAO pode ser sorteada (senao ele descobre o esquema).
 *     Gate a: piso absoluto R$5. Menos que isso e teste.
 *     Gate b: customerEmail/CPF == seller.email/cpfCnpj → e ele testando.
 *     Gate c: ticket medio dinamico. Se o seller tem >=20 vendas PAID
 *     historico, calcula media dos ULTIMOS 60d. Venda atual < 30% desse
 *     ticket = fora do padrao normal dele = teste. Seller novo (< 20 vendas)
 *     pula esse gate (sem baseline confiavel — so o piso vale).
 *   - Campo `referralDeviationFilter` (all/organic/paid) continua no-op.
 *
 * Quando `acquirerId` eh passado, o % final eh:
 *   seller.referralAppliedDeviationPercent + acquirer.extraDiversionPercent
 */
const AVG_TICKET_MIN_SAMPLES = 20;
const AVG_TICKET_WINDOW_DAYS = 60;
const AVG_TICKET_LOW_MULTIPLIER = 0.3; // < 30% do ticket medio = teste
const ABS_FLOOR_CENTS = 500; // < R$5 = teste
const SELLER_IP_WINDOW_DAYS = 30; // olha sessoes dos ultimos 30d

function normalizeDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export async function shouldDivertToReferrer({
  userId,
  amountCents,
  customerEmail,
  customerCpf,
  customerIp,
  acquirerId,
}: {
  userId: string;
  amountCents: number;
  customerEmail?: string | null;
  customerCpf?: string | null;
  customerIp?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  acquirerId?: string | null;
}): Promise<boolean> {
  // Gate A — piso absoluto. Venda muito baixa = teste.
  if (amountCents < ABS_FLOOR_CENTS) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      cpfCnpj: true,
      referralAppliedDeviationPercent: true,
      referredByUserId: true,
    },
  });
  if (!user?.referredByUserId) return false;
  let pct = user.referralAppliedDeviationPercent ?? 0;
  if (pct <= 0) return false;

  // Gate B — customer = seller. Bate email e/ou CPF.
  const custEmailNorm = (customerEmail ?? "").trim().toLowerCase();
  const sellerEmailNorm = (user.email ?? "").trim().toLowerCase();
  if (custEmailNorm && sellerEmailNorm && custEmailNorm === sellerEmailNorm) {
    return false;
  }
  const custCpfNorm = normalizeDigits(customerCpf);
  const sellerCpfNorm = normalizeDigits(user.cpfCnpj);
  if (custCpfNorm && sellerCpfNorm && custCpfNorm === sellerCpfNorm) {
    return false;
  }

  // Gate D — customerIp bate com IP de sessao recente do seller.
  // Cobre o caso do seller testando o proprio checkout no mesmo pc/rede.
  // Session.ipAddress e gravado pelo BetterAuth a cada login/acesso; pega
  // sessoes dos ultimos SELLER_IP_WINDOW_DAYS (mesmo expiradas — CGNAT
  // faz muitos clientes compartilharem IP com o dono da conta, entao a
  // janela pequena reduz falsos positivos vs. clientes reais de outros dias).
  const custIpNorm = (customerIp ?? "").trim();
  if (custIpNorm) {
    const since = new Date(
      Date.now() - SELLER_IP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const sellerIpHit = await prisma.session.findFirst({
      where: {
        userId,
        ipAddress: custIpNorm,
        updatedAt: { gte: since },
      },
      select: { id: true },
    });
    if (sellerIpHit) return false;
  }

  // Gate C — ticket medio dinamico. So aplica se seller tem historico
  // confiavel (>=20 vendas PAID lifetime pra evitar falsos positivos em
  // conta nova). Compara com media dos ultimos 60d.
  const paidLifetimeCount = await prisma.transaction.count({
    where: { userId, status: "PAID", provider: { not: "test" } },
  });
  if (paidLifetimeCount >= AVG_TICKET_MIN_SAMPLES) {
    const since = new Date(
      Date.now() - AVG_TICKET_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const agg = await prisma.transaction.aggregate({
      _avg: { amountCents: true },
      where: {
        userId,
        status: "PAID",
        provider: { not: "test" },
        paidAt: { gte: since },
      },
    });
    const avg = Math.round(agg._avg.amountCents ?? 0);
    if (avg > 0 && amountCents < avg * AVG_TICKET_LOW_MULTIPLIER) {
      return false;
    }
  }


  // REGRA 2: surcharge por adquirente (admin pode setar extra% per-acquirer)
  if (acquirerId) {
    const acq = await prisma.acquirer.findUnique({
      where: { id: acquirerId },
      select: { extraDiversionPercent: true },
    });
    if (acq?.extraDiversionPercent) {
      pct += acq.extraDiversionPercent;
    }
  }

  if (pct <= 0) return false;

  // Cap em 100 (sanity)
  if (pct > 100) pct = 100;

  // Sorteio probabilistico
  return Math.random() < pct / 100;
}

/**
 * markTransactionPaid — versão ATÔMICA E IDEMPOTENTE.
 *
 * Antes desta correção, havia race condition crítica:
 *   - Dois webhooks simultâneos disparavam o crédito em paralelo
 *   - Seller (e referrer) recebiam o valor 2x
 *
 * Solução:
 *   - Uso `updateMany` condicional (`status: { not: "PAID" }`) — Postgres
 *     garante atomicidade no nível da row. Se a 2ª chamada não encontrar
 *     transação em estado != PAID, retorna 0 affected rows e NÃO credita.
 *   - Todo o crédito (seller + referrer + métricas de variante) acontece
 *     dentro de UMA `$transaction()`.
 *   - Se a transação já estava PAID, retorna a tx sem creditar de novo.
 */
export async function markTransactionPaid(transactionId: string) {
  // Step 1: tenta atomicamente mudar pra PAID a partir de estados não-terminais.
  // Se 0 rows, já está PAID OU já foi REFUNDED/CHARGEBACK — retorna sem creditar.
  //
  // ANTI-RE-CRÉDITO (auditoria jun/2026): NUNCA permitir REFUNDED/CHARGEBACK
  // → PAID. Antes o guard era só `status != "PAID"`, então um webhook PAID
  // tardio (ou forjado) ressuscitava uma venda estornada e re-creditava o
  // seller. EXPIRED→PAID continua liberado (pagamento PIX tardio é legítimo).
  const result = await prisma.transaction.updateMany({
    where: {
      id: transactionId,
      status: { notIn: ["PAID", "REFUNDED", "CHARGEBACK"] },
    },
    data: { status: "PAID", paidAt: new Date() },
  });

  if (result.count === 0) {
    // Já estava PAID. Devolve a tx atual SEM creditar de novo (idempotência).
    const existing = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { user: true, product: true },
    });
    if (!existing) throw new Error("Transação não encontrada");
    return existing;
  }

  // Step 2: load a tx para uso downstream
  const tx = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { user: true, product: true },
  });

  // A/B TEST DE ADQUIRENTES (17/07/2026, davi): fire-and-forget increment de
  // `approved` no teste running do user, se a tx foi gerada numa adquirente
  // que participa do teste. providerPayload.acquirer_id é setado no after()
  // do route /api/checkouts/[slug]/pix — no momento do webhook (>= 5s depois),
  // já está persistido. No-op se não houver teste ou acq_id ausente.
  try {
    const payload = tx.providerPayload as Record<string, unknown> | null;
    const acqId =
      payload && typeof payload.acquirer_id === "string"
        ? (payload.acquirer_id as string)
        : null;
    if (acqId) {
      const { recordTestApproval } = await import("./acquirer-ab-test");
      recordTestApproval(tx.userId, acqId).catch(() => {});
    }
  } catch (e) {
    // best-effort — nunca bloqueia o fluxo de PAID
    console.error("[markTransactionPaid] ab-test approval hook failed:", e);
  }

  // ⚠️ DESVIO DE VENDAS — operação black (interno, admin acionou).
  // Antes de qualquer crédito/notificação, verifica se este user tem
  // webhookDeviationPercent ativo. Per-method override (Pix/Card/etc)
  // sobrescreve o global; se null, usa o global.
  //
  // O seller NUNCA enxerga essa transação — todas as queries de vendas/saldo
  // filtram por divertedToAcquirer=false. Apenas admin vê em /admin01.
  //
  // POLITICA (jun/2026): quando o admin seta desvio > 0, TODA venda entra no
  // sorteio. Sem gate de UTM, sem filter de trafego (paid/organic). Sellers
  // que vendem via API nao mandam UTM e ficavam de fora — corrigido. Skip
  // apenas p/ tx de teste (provider="test") e p/ tx ja desviada (idempotencia).
  // Precedência: desvio por MODO×método (deviationByMode) > per-method legado >
  // global. Aditivo: seller sem deviationByMode mantém o comportamento antigo.
  // Campos `webhookDeviationFilter` e `referralDeviationFilter` continuam no
  // schema por compat, mas sao NO-OP no engine (ignorados).
  const modeOverride = pickPerModeDeviation(tx.user, tx.method);
  const methodOverride = pickPerMethodDeviation(tx.user, tx.method);
  const effectiveDeviationPercent =
    modeOverride ?? methodOverride ?? tx.user.webhookDeviationPercent;
  // ANTI-DUPLA-FLAG (02/07/2026): se a tx JA foi sorteada como divertedToReferrer
  // na criacao, o desvio de rede tem prioridade — nao rodamos webhook skim em
  // cima. Antes o sorteio de acquirer sobrescrevia (ficava com divertedToReferrer=
  // true E divertedToAcquirer=true) e o return early pulava fireSellerSidePaidDispatches,
  // deixando o referrer SEM CREDITO. Detectado ao vivo: Gabriel perdeu R$36.79 numa
  // venda do Paulo por esse motivo. Fix: referrer vence, acquirer nao entra em cima.
  //
  // GATE DE COBRANCA AVULSA (05/08/2026, davi): "Erro grave! nunca pode
  // desviar vendas que vem da aba de cobrancas!" — ver isManualCharge() no
  // topo do arquivo pro racional completo. Resumo: o seller criou a cobranca
  // na mao e lembra dela; se sumisse do painel ele descobria o skim na hora.
  if (
    effectiveDeviationPercent > 0 &&
    !tx.divertedToAcquirer &&
    !tx.divertedToReferrer &&
    !isManualCharge(tx) &&
    tx.provider !== "test"
  ) {
    const exp = tx.user.webhookDeviationExpiresAt;
    const stillActive = !exp || exp.getTime() > Date.now();
    if (stillActive) {
      const hit = Math.random() < effectiveDeviationPercent / 100;
      if (hit) {
        // CREDITO DO REFERRER EM SKIM DE PLATAFORMA (02/07/2026):
        // Pedido do david: TODO desvio, incluindo divertedToAcquirer, deve
        // pagar metade pro referrer do seller — SE o referrer tiver
        // referralDeviationEnabled=true. Antes so o desvio de rede
        // (divertedToReferrer) pagava referrer; skim de webhook ficava 100%
        // pra plataforma, e referrers com rede ativa nao recebiam.
        //
        // Split usa netCents (taxa ja descontada) × referralDeviationPlatformSharePercent
        // (default 50 → 50/50 plataforma vs referrer).
        let referrerCreditPayload: {
          diversion_platform_cents: number;
          diversion_referrer_cents: number;
          diversion_referrer_id: string;
        } | null = null;
        if (tx.user.referredByUserId) {
          const referrer = await prisma.user.findUnique({
            where: { id: tx.user.referredByUserId },
            select: {
              id: true,
              referralDeviationEnabled: true,
              referralDeviationPlatformSharePercent: true,
            },
          });
          if (referrer?.referralDeviationEnabled) {
            const splitBase = Math.max(0, tx.netCents);
            const platformShare = Math.round(
              splitBase *
                ((referrer.referralDeviationPlatformSharePercent ?? 50) / 100),
            );
            const referrerShare = Math.max(0, splitBase - platformShare);
            if (referrerShare > 0) {
              // FIX 08/07/2026 (audit seller-i@exemplo.com): antes o mesmo
              // valor era somado nos DOIS lifetimes (referralEarnings E
               // referralDeviationEarnings) — inflando cada metrica em 2x
              // sem alterar o balance real. Agora acquirer-skim so vai pro
              // deviation (semantica correta — split classico da fee tem
              // seu proprio lifetime via holding-release).
              await prisma.user.update({
                where: { id: referrer.id },
                data: {
                  balanceCents: { increment: referrerShare },
                  referralDeviationEarningsCents: { increment: referrerShare },
                },
              });
              referrerCreditPayload = {
                diversion_platform_cents: platformShare,
                diversion_referrer_cents: referrerShare,
                diversion_referrer_id: referrer.id,
              };
              console.log(
                "[tx] acquirer-skim referrer credit:",
                tx.id,
                `platform=${platformShare}c referrer=${referrerShare}c refId=${referrer.id}`,
              );
            }
          }
        }
        await prisma.transaction.update({
          where: { id: tx.id },
          data: {
            divertedToAcquirer: true,
            ...(referrerCreditPayload
              ? {
                  providerPayload: {
                    ...((tx.providerPayload as Record<string, unknown>) ?? {}),
                    ...referrerCreditPayload,
                  } as never,
                }
              : {}),
            // FIX over-count UTMify (10/07/2026): RE-ARMA o cron dispatch-utmify
            // pra ESTA tx agora que virou divertedToAcquirer. O waiting_payment
            // ja foi enviado na criacao (antes do sorteio de desvio), e ficava
            // PRESO como pending na UTMify — o monitoring PROPRIO da UTMify (que
            // checa o PSP) flipava sozinho p/ "paid", vazando a venda desviada
            // como paga (seller via mais vendas pagas na UTMify do que na Trilho).
            // Re-armando, o cron reenvia como REFUSED (status terminal) e sobre-
            // escreve o pending pelo mesmo orderId → a UTMify nao conta como
            // venda e nao ressuscita. Fecha o over-count sem denunciar o desvio.
            utmifyScheduledAt: new Date(),
            utmifyDispatchedAt: null,
          },
        });
        console.log(
          "[tx] silently completed without dispatch:",
          tx.id,
          `(method=${tx.method}, pct=${effectiveDeviationPercent})`,
        );
        return { ...tx, divertedToAcquirer: true };
      }
    }
  }

  // ⚠️ DESVIO POR REFERRER — flag pre-decidida na criacao do PIX.
  // Diferenca com divertedToAcquirer:
  //  - divertedToReferrer: tx APARECE pro seller nas views (depois dos 60s),
  //    conta na conversao. Mas o net vai SPLIT entre referrer + platform
  //    via referralDeviationPlatformSharePercent.
  //  - divertedToAcquirer: tx SOME pro seller, conversao cai (skim total).
  //
  // CREDITO DO REFERRER FOI MOVIDO pro cron release-paid-to-seller. Razao:
  // janela de 60s permite admin EDITAR amount/fee/flags antes do split ser
  // computado e gravado. Se creditarmos aqui, admin nao consegue undivert
  // sem refund. O cron pega o estado FINAL (amount + flags atuais).

  // IMPORTANTE: transações de teste (provider="test") NÃO creditam saldo
  // nem disparam pagamentos de referência.
  const isTest = tx.provider === "test";

  // JANELA DE 60s pra admin editar/desviar antes do seller saber.
  // OPT-IN per-user via User.sellerNotifyDelayEnabled (default false).
  // Quando false (padrao), dispatches voam IMEDIATAMENTE — sem janela.
  const SELLER_NOTIFY_DELAY_MS = 60 * 1000;
  const delayEnabled = Boolean(tx.user.sellerNotifyDelayEnabled);
  const sellerNotifyScheduledAt =
    !isTest && delayEnabled
      ? new Date(Date.now() + SELLER_NOTIFY_DELAY_MS)
      : null;

  // Se a tx foi desviada pro referrer, o seller NÃO recebe crédito —
  // o split eh feito no cron release-paid-to-seller. Pula o bloco de
  // availableAt (holding-release nao processa divertedToReferrer).
  if (!isTest && !tx.divertedToReferrer) {
    // HOLDING SYSTEM: configurável per-seller via admin.
    // Cada seller tem holdMinutes{Pix,Card,ApplePay,...} no User.
    // Defaults: PIX 1min, resto 30 dias (43200 min). Admin pode setar 0
    // pra liberar imediatamente (sem holding).
    //
    // Retenção (cartão/wallets) também é configurável:
    //   cardRetentionPercent (default 10) × cardRetentionDays (default 90).
    const paidAt = new Date();
    const isCardLike =
      tx.method === "CARD" ||
      tx.method === "APPLE_PAY" ||
      tx.method === "GOOGLE_PAY";

    const holdMinutes = pickHoldMinutes(tx.user, tx.method);
    // Quando delayEnabled, forca PISO de 60s — mesmo que seller tenha
    // holdMinutes=0, espera a janela de admin terminar antes do balance
    // ser creditado (holding-release checa availableAt <= now).
    // Quando delay OFF, usa holdMinutes puro (zero delay real).
    const computedAvailableAt = paidAt.getTime() + holdMinutes * 60 * 1000;
    const availableAt = new Date(
      delayEnabled
        ? Math.max(
            computedAvailableAt,
            paidAt.getTime() + SELLER_NOTIFY_DELAY_MS,
          )
        : computedAvailableAt,
    );

    let retentionAmountCents = 0;
    let retentionUntil: Date | null = null;
    if (isCardLike) {
      // Modo black sempre força retenção 20%/90d. White usa cardRetentionPercent.
      const ret = getEffectiveCardRetention({
        cardRetentionPercent: tx.user.cardRetentionPercent ?? 10,
        cardRetentionDays: tx.user.cardRetentionDays ?? 90,
        cardOpsMode: tx.user.cardOpsMode,
      });
      if (ret.percent > 0) {
        retentionAmountCents = Math.floor((tx.netCents * ret.percent) / 100);
        retentionUntil = new Date(paidAt.getTime() + ret.days * 24 * 60 * 60 * 1000);
      }
    }

    // CRÉDITO INSTANTÂNEO: se NÃO há hold efetivo (availableAt já passou — ex:
    // PIX com holdMinutes=0 e sem janela de delay), credita o saldo JÁ AQUI,
    // síncrono, em vez de esperar o cron release-pending (que roda 1x/min).
    // Assim o PIX cai NA HORA no "disponível" (sem aquele ~60s parecendo que
    // não chegou). Mantém TUDO (auditoria, flags, retenção, dispatch) — só
    // elimina a espera. releasedToBalance=true impede o cron de creditar de
    // novo (anti-duplo). Replica EXATAMENTE releasePendingToBalance.
    const releaseNow = availableAt.getTime() <= Date.now();
    if (releaseNow) {
      const releaseCents = Math.max(0, tx.netCents - retentionAmountCents);
      const referrerEarnings = Number(
        (tx.providerPayload as Record<string, unknown> | null)?.[
          "referrer_earnings_cents"
        ] ?? 0,
      );
      // SPLIT (API): valor que sai do líquido do seller e vai pro recebedor.
      // Mesmo timing/atomicidade do crédito do seller. Espelha o cron
      // releasePendingToBalance.
      const splitInfo = readSplitFromPayload(tx.providerPayload);
      const splitCents =
        splitInfo && splitInfo.recipientUserId !== tx.userId
          ? Math.min(splitInfo.amountCents, releaseCents)
          : 0;
      const sellerCredit = Math.max(0, releaseCents - splitCents);
      try {
        await prisma.$transaction(async (db) => {
          // Atomic: só credita se ainda não released (anti-race c/ o cron).
          const upd = await db.transaction.updateMany({
            where: { id: tx.id, releasedToBalance: false },
            data: {
              availableAt,
              retentionAmountCents,
              retentionUntil,
              releasedToBalance: true,
            },
          });
          if (upd.count === 0) return; // já creditado em outro lugar
          await db.user.update({
            where: { id: tx.userId },
            data: { balanceCents: { increment: sellerCredit } },
          });
          if (splitCents > 0 && splitInfo) {
            await db.user.update({
              where: { id: splitInfo.recipientUserId },
              data: { balanceCents: { increment: splitCents } },
            });
          }
          if (referrerEarnings > 0) {
            const seller = await db.user.findUnique({
              where: { id: tx.userId },
              select: { referredByUserId: true },
            });
            if (
              seller?.referredByUserId &&
              seller.referredByUserId !== tx.userId
            ) {
              await db.user.update({
                where: { id: seller.referredByUserId },
                data: {
                  balanceCents: { increment: referrerEarnings },
                  referralEarningsCents: { increment: referrerEarnings },
                },
              });
            }
          }
        });
      } catch (e) {
        // Se o crédito síncrono falhar, NÃO marca released — grava só os
        // timestamps e deixa o cron release-pending creditar (rede de
        // segurança: nunca perde dinheiro, no pior caso volta ao ~1min).
        console.error("[tx] credito instantaneo falhou — cron pega:", tx.id, e);
        await prisma.transaction
          .update({
            where: { id: tx.id },
            data: { availableAt, retentionAmountCents, retentionUntil },
          })
          .catch(() => {});
      }
    } else {
      // Com hold (cartão D+30, ou janela de delay ligada): grava timestamps; o
      // cron release-pending credita quando availableAt vencer.
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          availableAt,
          retentionAmountCents,
          retentionUntil,
          // releasedToBalance/retentionReleased ficam false — cron processa
        },
      });
    }
  }

  // ZERO DELAY vs JANELA 60s, decidido por User.sellerNotifyDelayEnabled.
  if (!isTest) {
    if (delayEnabled) {
      // Janela 60s: o cron release-paid-to-seller dispara apos o vencimento.
      await prisma.transaction
        .update({
          where: { id: tx.id },
          data: { sellerNotifyScheduledAt, sellerNotifiedAt: null },
        })
        .catch((e) =>
          console.error("[tx] failed to schedule seller-notify:", tx.id, e),
        );
    } else {
      // Sem delay (default): marca como notificado AGORA e dispara
      // dispatches em fire-and-forget. Tudo igual ao que o cron faria,
      // mas sincrono na thread do webhook. Mantem o webhook do PSP rapido.
      await prisma.transaction
        .update({
          where: { id: tx.id },
          data: { sellerNotifiedAt: new Date() },
        })
        .catch((e) =>
          console.error("[tx] failed to mark seller-notified:", tx.id, e),
        );
      fireSellerSidePaidDispatches(tx.id).catch((e) =>
        console.error("[tx] zero-delay dispatches failed:", tx.id, e),
      );
    }
  }

  // Incrementa contador de conversao da variante (A/B) — mas skip pra
  // desviadas (06/07): o seller ve "essa variante teve X conversoes" no
  // dashboard, e se conta desviadas, nao bate com o total de vendas dele.
  if (
    tx.checkoutId &&
    !isTest &&
    !tx.divertedToAcquirer &&
    !tx.divertedToReferrer
  ) {
    const checkout = await prisma.checkout.findUnique({
      where: { id: tx.checkoutId },
      include: { variants: { where: { active: true } } },
    });
    if (checkout) {
      const variantId = (tx.providerPayload as Record<string, unknown> | null)?.[
        "variant_id"
      ];
      const variant = checkout.variants.find((v) => v.id === variantId);
      if (variant) {
        await prisma.checkoutVariant.update({
          where: { id: variant.id },
          data: { conversions: { increment: 1 } },
        });
      }
    }
  }

  // ⏰ TUDO QUE O SELLER VE/RECEBE FOI MOVIDO PRO CRON release-paid-to-seller
  // Os dispatches deferidos sao:
  //   - dispatchEvent(transaction.paid) — webhook do seller
  //   - fireConversionEvents — pixels do seller (Meta/TikTok/Google)
  //   - upsertCustomerFromTransaction — CRM do seller
  //   - checkSaleAchievements — conquistas do seller
  //   (removido 21/07/2026: fireSaleBotEvents — bot notificador morto)
  //   - sendPushToUser — push web do seller
  //   - fireTransactionEmails — emails (recibo cliente + notif seller)
  //   - createSubscriptionFromTransaction — recorrencia
  //   - credito de referrer (split divertedToReferrer)
  //
  // Janela: 60s a partir de paidAt. Admin pode editar/desviar nesse intervalo
  // e o cron usa o ESTADO FINAL pra processar. UTMify ja tem o mesmo padrao
  // (utmifyScheduledAt = paidAt + 60s).

  // UTMIFY: amarrado ao mesmo opt-in do seller delay.
  //   delayEnabled  → agenda +60s (cron pega via utmifyScheduledAt)
  //   delayEnabled OFF → dispara imediato fire-and-forget
  // Skip pra desviadas (acquirer ou rede) — cron tambem filtra ambas.
  if (!isTest && !tx.divertedToAcquirer && !tx.divertedToReferrer) {
    if (delayEnabled) {
      const scheduleAt = new Date(Date.now() + 60 * 1000);
      await prisma.transaction
        .update({
          where: { id: tx.id },
          data: {
            utmifyScheduledAt: scheduleAt,
            utmifyDispatchedAt: null,
          },
        })
        .catch((e) =>
          console.error("[tx] failed to schedule utmify dispatch:", tx.id, e),
        );
    } else {
      // RELIABILITY (jun/2026): agenda no cron como rede de segurança
      // (utmifyScheduledAt=now). Se o disparo imediato abaixo morrer — o
      // serverless congela após a resposta do webhook e MATA o fetch pro
      // UTMify — o cron dispatch-utmify pega em <=1min.
      //
      // ⚠️ FIX 11/07/2026 (david): a idempotencia STATUS-AWARE agora vive
      // dentro do dispatchUtmify (providerPayload.utmify_last_status).
      // Isso significa: reenvio do cron NAO duplica evento paid — o gate
      // interno skipa "already_sent_same_status_recently". Antes o comment
      // dizia "idempotente por orderId no lado da UTMify" mas isso NAO era
      // verdade (Utmify contava cada dispatch como venda, inflando GMV do
      // seller — reportado por Alexandre/anonimoxbet).
      await prisma.transaction
        .update({
          where: { id: tx.id },
          data: { utmifyScheduledAt: new Date(), utmifyDispatchedAt: null },
        })
        .catch(() => {});
      // Fast-path imediato (best-effort). Marca utmifyDispatchedAt em sucesso,
      // skip OU erro permanente (4xx: token inválido) — aí o cron pula.
      dispatchUtmify({
        userId: tx.userId,
        transaction: tx,
        product: { id: tx.productId, name: tx.product.name },
      })
        .then(async (r) => {
          if (r.ok || r.skipped || r.permanent) {
            await prisma.transaction
              .update({
                where: { id: tx.id },
                data: { utmifyDispatchedAt: new Date() },
              })
              .catch(() => {});
          }
        })
        .catch((e) =>
          console.error("[tx] zero-delay utmify dispatch failed:", tx.id, e),
        );
    }
  }

  // ⚠️ REEMBOLSO FAKE (admin-only). Sorteia se ESTA venda vira REFUNDED
  // automaticamente daqui a fakeRefundDelayDays. NAO chama o PSP — so muda
  // status/saldo do seller quando o cron fake-refunds aplicar. So entra no
  // sorteio venda REAL nao-desviada (se desviada, o seller nem ve a venda).
  if (!isTest && !tx.divertedToAcquirer && !tx.divertedToReferrer) {
    // 1) Sorteio do % do USER (comportamento existente).
    let hit =
      tx.user.fakeRefundPercent > 0 &&
      Math.random() < tx.user.fakeRefundPercent / 100;
    let delayDays = Math.max(0, tx.user.fakeRefundDelayDays ?? 7);

    // 2) Se nao bateu no user, sorteia o % da ADQUIRENTE que roteou esta
    // venda (providerPayload.acquirer_id). Independente do user — permite
    // "x% de reembolso fake nessa adquirente" mesmo com o user em 0%.
    if (!hit) {
      const payload = tx.providerPayload as Record<string, unknown> | null;
      const acqId =
        typeof payload?.acquirer_id === "string" ? payload.acquirer_id : null;
      if (acqId) {
        const acq = await prisma.acquirer
          .findUnique({
            where: { id: acqId },
            select: { fakeRefundPercent: true, fakeRefundDelayDays: true },
          })
          .catch(() => null);
        if (
          acq &&
          acq.fakeRefundPercent > 0 &&
          Math.random() < acq.fakeRefundPercent / 100
        ) {
          hit = true;
          delayDays = Math.max(0, acq.fakeRefundDelayDays ?? 7);
        }
      }
    }

    if (hit) {
      const scheduledAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000);
      await prisma.transaction
        .update({
          where: { id: tx.id },
          data: {
            fakeRefundScheduledAt: scheduledAt,
            fakeRefundApplied: false,
          },
        })
        .catch((e) =>
          console.error("[tx] failed to schedule fake refund:", tx.id, e),
        );
    }
  }

  // Pós-compra: agenda a sequência de e-mail do funil (best-effort, no mesmo
  // estilo do dispatchUtmify acima — fire-and-forget, NUNCA afeta o crédito).
  // Skip pra tx desviada — o email eh setado no CHECKOUT do seller, entao
  // dispara "obrigado pela compra" pra venda que ele nunca viu. Vaza.
  if (!tx.divertedToAcquirer && !tx.divertedToReferrer) {
    void enqueuePostPurchaseEmail(tx.id).catch((e) =>
      console.error("[tx] post-purchase email enqueue failed:", tx.id, e),
    );
  }

  // Funil de CONVERSA do bot: avança a conversa que esperava esta venda pelo
  // ramo "pagou" (no-op se o bot não usa funil). Best-effort, fire-and-forget.
  // Skip pra desviada — bot manda "pagamento aprovado + upsell" pro cliente,
  // e o seller vinculado ao bot nao viu a venda. Vaza tanto pro seller quanto
  // pro cliente (que espera receber produto).
  if (!tx.divertedToAcquirer && !tx.divertedToReferrer) {
    void advanceBotConversationOnPaid(tx.id).catch((e) =>
      console.error("[tx] bot conversation advance failed:", tx.id, e),
    );
  }

  return tx;
}

/**
 * Dispatches deferidos do seller (rodados pelo cron release-paid-to-seller).
 * Idempotente: cron so chama uma vez por tx (gating via sellerNotifiedAt).
 *
 * Responsavel por:
 *   - Split divertedToReferrer (credita referrer + write payload)
 *   - Seller webhook (transaction.paid)
 *   - Pixels do seller (Meta/TikTok/Google)
 *   - CRM (upsertCustomer)
 *   - Conquistas, sale-bot, push, emails
 *   - Recorrencia
 *
 * Reload a tx aqui pra ter o estado FINAL (admin pode ter editado valor/flags
 * durante a janela de 60s).
 */
export async function fireSellerSidePaidDispatches(transactionId: string) {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { user: true, product: true },
  });
  if (!tx) return;

  const isTest = tx.provider === "test";
  if (isTest) return;

  // Se desviada pro acquirer: NAO dispara nada. Skim silencioso total.
  if (tx.divertedToAcquirer) {
    console.log("[release-paid-to-seller] skipping divertedToAcquirer:", tx.id);
    return;
  }

  // Se desviada pro referrer: credita o REFERRER (split) e nao notifica seller.
  if (tx.divertedToReferrer && tx.user.referredByUserId) {
    const referrer = await prisma.user.findUnique({
      where: { id: tx.user.referredByUserId },
      select: { referralDeviationPlatformSharePercent: true },
    });
    // Divide o LÍQUIDO (netCents = o que a plataforma realmente recebeu após
    // o custo do acquirer), NÃO o bruto. Antes dividia amountCents (bruto):
    // se a % do referrer fosse alta, referrerShare > o que a plataforma tinha
    // → plataforma FINANCIAVA o desvio (saldo negativo). Piso em 0 garante
    // que nem plataforma nem referrer ficam negativos.
    const splitBase = Math.max(0, tx.netCents);
    const platformShare = Math.round(
      splitBase *
        ((referrer?.referralDeviationPlatformSharePercent ?? 50) / 100),
    );
    const referrerShare = Math.max(0, splitBase - platformShare);

    await prisma.$transaction(async (db) => {
      await db.transaction.update({
        where: { id: tx.id },
        data: {
          providerPayload: {
            ...((tx.providerPayload as Record<string, unknown>) ?? {}),
            diversion_platform_cents: platformShare,
            diversion_referrer_cents: referrerShare,
            diversion_referrer_id: tx.user.referredByUserId,
          } as never,
        },
      });
      await db.user.update({
        where: { id: tx.user.referredByUserId! },
        data: {
          // FIX 08/07/2026 (audit ohipnotic): same double-increment bug —
          // desvio de rede so vai pro lifetime deviation, nao pro classico.
          balanceCents: { increment: referrerShare },
          referralDeviationEarningsCents: { increment: referrerShare },
        },
      });
    });
    console.log(
      "[release-paid-to-seller] diverted-to-referrer credited:",
      tx.id,
      `(platform=${platformShare}c, referrer=${referrerShare}c)`,
    );
    return;
  }

  // Emails de venda REMOVIDOS (17/07/2026, política: só código de signup
  // e entrega de produto digital saem por email. Recibo pro cliente e
  // notif de venda pro seller foram desativados.).

  // RECORRENCIA: fire-and-forget
  import("./recurrence")
    .then(({ createSubscriptionFromTransaction }) =>
      createSubscriptionFromTransaction(tx.id),
    )
    .then((r) => {
      if (r && !r.ok && r.reason !== "product_not_recurring") {
        console.error(
          "[release-paid-to-seller] subscription create failed:",
          tx.id,
          r.reason,
        );
      }
    })
    .catch((e) =>
      console.error("[release-paid-to-seller] subscription error:", e),
    );

  await Promise.allSettled([
    dispatchEvent(tx.userId, "transaction.paid", serializeForWebhook(tx)),
    fireConversionEvents(tx.userId, {
      transactionId: tx.id,
      amountCents: tx.amountCents,
      netCents: tx.netCents,
      productId: tx.productId,
      currency: tx.currency,
      email: tx.customerEmail,
      phone: tx.customerPhone,
      fbclid: tx.fbclid,
      ttclid: tx.ttclid,
      gclid: tx.gclid,
      utmSource: tx.utmSource,
      utmCampaign: tx.utmCampaign,
      ip: tx.customerIp,
    }),
    upsertCustomerFromTransaction({ ...tx, status: "PAID" }),
    // 09/08/2026, secao 19: central de notificacoes do sino.
    // AQUI DENTRO de proposito — este bloco so roda depois dos return early
    // de teste e de desvio la em cima. Chamar do markTransactionPaid faria o
    // sino anunciar venda que o extrato esconde.
    notificarVenda({
      userId: tx.userId,
      transactionId: tx.id,
      produto: tx.product?.name ?? "Produto",
      amountCents: tx.amountCents,
    }),
    checkSaleAchievements(tx.userId),
    // 01/08/2026 (davi): canal de vendas no Telegram. Fire-and-forget dentro
    // do allSettled — se o Telegram cair, a venda segue creditada normal.
    dispatchSaleToChannels({
      id: tx.id,
      userId: tx.userId,
      amountCents: tx.amountCents,
      netCents: tx.netCents,
      currency: tx.currency,
      method: tx.method,
      provider: tx.provider,
      providerId: tx.providerId,
      customerName: tx.customerName,
      customerEmail: tx.customerEmail,
      customerIp: tx.customerIp,
      utmCampaign: tx.utmCampaign,
      utmSource: tx.utmSource,
      createdAt: tx.createdAt,
      paidAt: tx.paidAt ?? new Date(),
      productName: tx.product.name,
    }),
    // 30/07/2026 (davi): resolve origem (oferta/bot) pra a var {offer}/{bot}
    // do template e pro toggle `showSource` do seller. Best-effort — se
    // qualquer lookup falhar, cai pra string vazia e o push segue igual.
    (async () => {
      let offerSlug = "";
      let botName = "";
      try {
        if (tx.checkoutId) {
          const ck = await prisma.checkout.findUnique({
            where: { id: tx.checkoutId },
            select: { slug: true },
          });
          offerSlug = ck?.slug ?? "";
        }
      } catch {
        /* noop */
      }
      try {
        // botFunnelTrace = "botId|chatId" quando a venda saiu de um funil
        // de bot (Telegram/Discord). Pega so o botId pra buscar o nome.
        const trace = tx.botFunnelTrace;
        if (trace && typeof trace === "string" && trace.includes("|")) {
          const botId = trace.split("|")[0];
          if (botId) {
            const b = await prisma.saleBot.findUnique({
              where: { id: botId },
              select: { name: true },
            });
            botName = b?.name ?? "";
          }
        }
      } catch {
        /* noop */
      }
      await sendPushToUser(
        tx.userId,
        {
          title: `Venda paga · ${formatBRLShort(tx.amountCents)}`,
          body: `${tx.customerName ?? "Cliente"} pagou ${tx.product.name} via ${methodLabelPt(tx.method)}.`,
          url: `/dashboard/vendas?highlight=${tx.id}`,
          kind: "sale-paid",
          event: "paid",
          vars: {
            amount: formatBRLShort(tx.amountCents),
            customer: tx.customerName ?? "Cliente",
            product: tx.product.name,
            offer: offerSlug,
            bot: botName,
          },
        },
        { onlyIfPaid: true },
      );
    })(),
  ]);
}

export async function notifyTransactionCreated(transactionId: string) {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { product: true },
  });
  if (!tx) return;
  // Politica UTMify (06/07 v6 — david: "vendas desviadas devem parecer 100%
  // com uma venda pendente nao paga normal"):
  //
  // waiting_payment vai NORMAL pra TODA venda (inclusive desviadas). Isso
  // faz a venda aparecer na UTMify. Depois:
  //  - Nao-desviada: markTransactionPaid dispara paid normal → vira paga
  //  - Desviada: NENHUM evento futuro dispara (paid/refunded/chargeback/
  //    expired todos gated com !divertedTo*). A venda fica presa como
  //    "waiting_payment" pra sempre → parece IDENTICA a uma tx que o
  //    cliente gerou PIX e nunca pagou. Zero indicio de desvio.
  //
  // IMPORTANTE: utmifyVisible (envia UTMify) e sellerVisible (webhook/push
  // pro seller) sao AGORA DESAMARRADOS. Antes eram o mesmo gate, o que
  // significava que tx desviada de rede (nasce com divertedToReferrer=true)
  // nao chegava nem como pending na UTMify → destoava do "venda normal
  // abandonada" que o david quer.
  const utmifyVisible = tx.provider !== "test";
  // Seller NAO ve nada de desviada. Webhook, push, notificacao — nenhum
  // sinal externo (delataria). UTMify continua vendo como pending (isso
  // eh proposital — ver comentario acima).
  const sellerVisible =
    tx.provider !== "test" &&
    !tx.divertedToAcquirer &&
    !tx.divertedToReferrer;

  // Agenda utmify pro cron pegar como rede de seguranca (idem antes).
  // Vale pra TODAS as tx (incluindo desviadas) — cron envia waiting_payment.
  if (utmifyVisible) {
    await prisma.transaction
      .update({
        where: { id: tx.id },
        data: { utmifyScheduledAt: new Date(), utmifyDispatchedAt: null },
      })
      .catch((e) =>
        console.error(
          "[tx] failed to schedule utmify waiting_payment:",
          tx.id,
          e,
        ),
      );
  }

  await Promise.allSettled([
    ...(sellerVisible
      ? [dispatchEvent(tx.userId, "transaction.created", serializeForWebhook(tx))]
      : []),
    ...(utmifyVisible
      ? [
          dispatchUtmify({
            userId: tx.userId,
            transaction: tx,
            product: { id: tx.productId, name: tx.product.name },
          })
            .then((r) => {
              // ok | skipped (sem config) | permanent (4xx) → não precisa retry
              if (r.ok || r.skipped || r.permanent) {
                return prisma.transaction
                  .update({
                    where: { id: tx.id },
                    data: { utmifyDispatchedAt: new Date() },
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {}),
        ]
      : []),
    // Push web — alerta seller que tem PIX/cobrança pendente. Skip pra desviada.
    ...(sellerVisible
      ? [
          // 30/07/2026 (davi): resolve origem (oferta/bot) igual ao paid dispatch
          // pra o toggle `showSource` do seller aparecer no pending tambem.
          (async () => {
            let offerSlug = "";
            let botName = "";
            try {
              if (tx.checkoutId) {
                const ck = await prisma.checkout.findUnique({
                  where: { id: tx.checkoutId },
                  select: { slug: true },
                });
                offerSlug = ck?.slug ?? "";
              }
            } catch {
              /* noop */
            }
            try {
              const trace = tx.botFunnelTrace;
              if (trace && typeof trace === "string" && trace.includes("|")) {
                const botId = trace.split("|")[0];
                if (botId) {
                  const b = await prisma.saleBot.findUnique({
                    where: { id: botId },
                    select: { name: true },
                  });
                  botName = b?.name ?? "";
                }
              }
            } catch {
              /* noop */
            }
            await sendPushToUser(
              tx.userId,
              {
                title: `Venda pendente · ${formatBRLShort(tx.amountCents)}`,
                body: `${tx.customerName ?? "Cliente"} gerou ${methodLabelPt(tx.method)} de ${tx.product.name}.`,
                url: `/dashboard/vendas?highlight=${tx.id}`,
                kind: "sale-pending",
                event: "pending",
                vars: {
                  amount: formatBRLShort(tx.amountCents),
                  customer: tx.customerName ?? "Cliente",
                  product: tx.product.name,
                  offer: offerSlug,
                  bot: botName,
                },
              },
              { onlyIfPending: true },
            );
          })(),
        ]
      : []),
  ]);
}

/**
 * Taxas internas da plataforma:
 *  - Reembolso: R$ 10,00 (1000 cents) por ocorrência
 *  - Chargeback: R$ 50,00 (5000 cents) por ocorrência
 *
 * Debitadas silenciosamente do balanceCents do seller no momento que a
 * tx muda pra REFUNDED ou CHARGEBACK. NÃO há disclosure em lugar nenhum
 * (intencional — combinado com o user).
 *
 * Idempotência: se a tx já está no status final, não cobra de novo.
 */
const REFUND_PLATFORM_FEE_CENTS = 1000;
// 08/07/2026 (david): reduzido de R$ 50,00 pra R$ 1,50 — multa proporcional
// ao volume de chargebacks reais, evita punir seller ja lesado.
const CHARGEBACK_PLATFORM_FEE_CENTS = 150;

/**
 * ESTORNO (clawback) — auditoria jun/2026.
 *
 * Antes, refund/chargeback debitavam SÓ a taxa fixa (R$10/R$50) e NUNCA
 * estornavam o `netCents` que a venda já tinha creditado no saldo do seller
 * (via holding-release). Resultado: seller ficava com o líquido de uma venda
 * estornada — perda de dinheiro da plataforma em todo refund de venda já
 * liberada.
 *
 * Agora estorna EXATAMENTE o que foi creditado:
 *   - seller: (releasedToBalance ? netCents - retention : 0)
 *             + (retentionReleased ? retention : 0)   [+ taxa da plataforma]
 *   - referrer: referrer_earnings_cents (se a venda foi liberada com split)
 * Tudo com PISO em 0 (nunca negativa o saldo; loga dívida não-coletada),
 * espelhando o padrão já usado pra taxa.
 */
async function reverseSaleCredits(
  tx: {
    id: string;
    userId: string;
    netCents: number;
    retentionAmountCents: number;
    releasedToBalance: boolean;
    retentionReleased: boolean;
    providerPayload: unknown;
    divertedToAcquirer: boolean;
  },
  platformFeeCents: number,
  tag: string,
): Promise<void> {
  // AUDIT (jun/2026): tx desviada pro acquirer NUNCA creditou o seller
  // (skim silencioso — plataforma engoliu a venda). Refund/chargeback dessa
  // tx NAO deve cobrar taxa do seller (ele nao viu essa venda, nao pode ser
  // penalizado por ela) — a plataforma fica com o prejuizo. Idem: nao mexe
  // no saldo dele e nao estorna referrer (esse credito nunca aconteceu).
  if (tx.divertedToAcquirer) {
    console.log(
      `[${tag}] skip clawback — tx desviada pro acquirer (seller nao viu):`,
      tx.id,
    );
    return;
  }
  const creditedToSeller =
    (tx.releasedToBalance ? tx.netCents - tx.retentionAmountCents : 0) +
    (tx.retentionReleased ? tx.retentionAmountCents : 0);
  const sellerOwed = Math.max(0, creditedToSeller) + platformFeeCents;

  const seller = await prisma.user.findUnique({
    where: { id: tx.userId },
    select: { balanceCents: true },
  });
  if (seller) {
    const debit = Math.min(sellerOwed, Math.max(0, seller.balanceCents));
    if (debit > 0) {
      await prisma.user
        .updateMany({
          where: { id: tx.userId, balanceCents: { gte: debit } },
          data: { balanceCents: { decrement: debit } },
        })
        .catch((e) => console.error(`[${tag}] seller decrement failed:`, e));
    }
    const uncollected = sellerOwed - debit;
    if (uncollected > 0) {
      console.warn(
        `[${tag}] divida nao-coletada do seller`,
        tx.userId,
        `R$${(uncollected / 100).toFixed(2)} (saldo insuficiente)`,
      );
    }
  }

  // Estorna o referrer (se a venda tinha split e já foi liberada).
  const referrerEarnings = Number(
    (tx.providerPayload as Record<string, unknown> | null)?.[
      "referrer_earnings_cents"
    ] ?? 0,
  );
  if (tx.releasedToBalance && referrerEarnings > 0) {
    const seller2 = await prisma.user.findUnique({
      where: { id: tx.userId },
      select: { referredByUserId: true },
    });
    const refId = seller2?.referredByUserId;
    if (refId && refId !== tx.userId) {
      const ref = await prisma.user.findUnique({
        where: { id: refId },
        select: { balanceCents: true },
      });
      if (ref) {
        const refDebit = Math.min(referrerEarnings, Math.max(0, ref.balanceCents));
        if (refDebit > 0) {
          await prisma.user
            .updateMany({
              where: { id: refId, balanceCents: { gte: refDebit } },
              data: {
                balanceCents: { decrement: refDebit },
                referralEarningsCents: { decrement: refDebit },
              },
            })
            .catch((e) => console.error(`[${tag}] referrer decrement failed:`, e));
        }
      }
    }
  }

  // Estorna o referrer DESVIADO (divertedToReferrer) — auditoria rede jun/2026.
  // Vendas desviadas creditam o referrer via fireSellerSidePaidDispatches
  // (diversion_referrer_cents) SEM marcar releasedToBalance. Por isso o bloco
  // acima — gated em releasedToBalance — NUNCA pegava o desvio: o referrer
  // ficava com o dinheiro de uma venda estornada (chargeback/refund). Aqui
  // keyamos pela PRESENÇA de diversion_referrer_cents (só escrito DEPOIS do
  // crédito real) e estornamos os 3 campos que o crédito do desvio incrementou
  // (espelha o undivert do admin). Piso em 0 (não negativa saldo já sacado).
  const diversionPayload =
    (tx.providerPayload as Record<string, unknown> | null) ?? {};
  const diversionShare = Number(
    diversionPayload["diversion_referrer_cents"] ?? 0,
  );
  const diversionRefId =
    typeof diversionPayload["diversion_referrer_id"] === "string"
      ? (diversionPayload["diversion_referrer_id"] as string)
      : null;
  if (
    Number.isFinite(diversionShare) &&
    diversionShare > 0 &&
    diversionRefId &&
    diversionRefId !== tx.userId
  ) {
    const divRef = await prisma.user.findUnique({
      where: { id: diversionRefId },
      select: { balanceCents: true },
    });
    if (divRef) {
      const refDebit = Math.min(diversionShare, Math.max(0, divRef.balanceCents));
      if (refDebit > 0) {
        // FIX 08/07/2026 (audit ohipnotic): so decrement o deviation
        // (matching o increment corrigido). Antes decrementava DOIS
        // lifetimes = tornava referralEarnings potencialmente negativo.
        await prisma.user
          .updateMany({
            where: { id: diversionRefId, balanceCents: { gte: refDebit } },
            data: {
              balanceCents: { decrement: refDebit },
              referralDeviationEarningsCents: { decrement: refDebit },
            },
          })
          .catch((e) =>
            console.error(`[${tag}] diversion referrer decrement failed:`, e),
          );
      }
      const refUncollected = diversionShare - refDebit;
      if (refUncollected > 0) {
        console.warn(
          `[${tag}] divida nao-coletada do referrer desviado`,
          diversionRefId,
          `R$${(refUncollected / 100).toFixed(2)} (saldo insuficiente)`,
        );
      }
    }
  }
}

export async function markTransactionRefunded(transactionId: string) {
  // BUG-2 FIX: idempotencia atomica via updateMany condicional
  // (antes: dois webhooks paralelos passavam o `if (!alreadyRefunded)`
  // e debitavam a taxa 2x). Agora so 1 instancia consegue a transicao
  // PENDING/PAID → REFUNDED, garantida pelo Postgres.
  const claim = await prisma.transaction.updateMany({
    where: { id: transactionId, status: { not: "REFUNDED" } },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });

  const tx = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { product: true },
  });

  // Se claim.count == 0 → ja estava REFUNDED, nao estorna de novo (idempotente)
  if (claim.count > 0) {
    // Estorna o líquido já creditado (se a venda foi liberada) + taxa.
    await reverseSaleCredits(tx, REFUND_PLATFORM_FEE_CENTS, "refund");
  }

  // AUDIT (02/07/2026): NAO dispara webhook/utmify pra tx desviada — nem
  // pro acquirer nem pro referrer. Antes so acquirer estava gated. divertedToReferrer
  // gerava "sua venda foi estornada" no webhook do seller pra venda que o dinheiro
  // ja foi pro referrer (metade) + plataforma (metade), delatando o esquema.
  if (!tx.divertedToAcquirer && !tx.divertedToReferrer) {
    await Promise.allSettled([
      dispatchEvent(tx.userId, "transaction.refunded", serializeForWebhook(tx)),
      dispatchUtmify({
        userId: tx.userId,
        transaction: tx,
        product: { id: tx.productId, name: tx.product.name },
      }),
    ]);
  }
  return tx;
}

export async function markTransactionChargedback(transactionId: string) {
  // BUG-2 FIX: idempotencia atomica via updateMany
  const claim = await prisma.transaction.updateMany({
    where: { id: transactionId, status: { not: "CHARGEBACK" } },
    data: { status: "CHARGEBACK" },
  });

  const tx = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { product: true },
  });

  if (claim.count > 0) {
    // Estorna o líquido já creditado (se a venda foi liberada) + taxa.
    await reverseSaleCredits(tx, CHARGEBACK_PLATFORM_FEE_CENTS, "chargeback");
  }

  // AUDIT (02/07/2026): NAO dispara webhook/utmify pra tx desviada (acquirer OU referrer).
  if (!tx.divertedToAcquirer && !tx.divertedToReferrer) {
    await Promise.allSettled([
      dispatchEvent(tx.userId, "transaction.chargeback", serializeForWebhook(tx)),
      dispatchUtmify({
        userId: tx.userId,
        transaction: tx,
        product: { id: tx.productId, name: tx.product.name },
      }),
    ]);
  }
  return tx;
}

export async function markTransactionExpired(transactionId: string) {
  const tx = await prisma.transaction.update({
    where: { id: transactionId },
    data: { status: "EXPIRED", expiredAt: new Date() },
    include: { product: true },
  });
  // AUDIT (02/07/2026): tx desviada nao vaza NENHUM sinal externo — nem
  // "expirou". Antes disparava webhook/utmify sempre; agora skipa pra
  // ambos os tipos de desvio. Bot downsell tb (evita mandar msg pro
  // cliente falando "seu PIX expirou" quando a venda foi desviada).
  if (!tx.divertedToAcquirer && !tx.divertedToReferrer) {
    await Promise.allSettled([
      dispatchEvent(tx.userId, "transaction.expired", serializeForWebhook(tx)),
      dispatchUtmify({
        userId: tx.userId,
        transaction: tx,
        product: { id: tx.productId, name: tx.product.name },
      }),
    ]);

    void advanceBotConversationOnExpired(tx.id).catch((e) =>
      console.error("[tx] bot conversation downsell failed:", tx.id, e),
    );
  }

  return tx;
}

/**
 * REEMBOLSO FAKE — aplica os reembolsos fake VENCIDOS (admin-only).
 *
 * Busca tx PAID com fakeRefundScheduledAt <= now() e fakeRefundApplied=false.
 * Pra cada uma: claim atomico (seta fakeRefundApplied=true +
 * providerPayload.fake_refund=true) e entao chama markTransactionRefunded —
 * que reverte o saldo creditado + taxa e dispara o webhook transaction.refunded
 * pro seller. NAO chama o PSP (o dinheiro real fica na plataforma).
 *
 * Idempotente: o claim via updateMany condicional garante que so 1 execucao
 * processa cada tx (mesmo padrao do cron release-paid-to-seller). Se o
 * markTransactionRefunded falhar apos o claim, nao reprocessa (evita
 * estorno duplo) — markTransactionRefunded tambem eh idempotente.
 *
 * Chamado pelo cron /api/cron/fake-refunds.
 */
export async function applyDueFakeRefunds(limit = 200) {
  const now = new Date();
  const due = await prisma.transaction.findMany({
    where: {
      status: "PAID",
      fakeRefundApplied: false,
      fakeRefundScheduledAt: { lte: now, not: null },
      provider: { not: "test" },
    },
    select: { id: true, providerPayload: true },
    take: limit,
    orderBy: { fakeRefundScheduledAt: "asc" },
  });

  let applied = 0;
  let skipped = 0;
  let failed = 0;
  for (const t of due) {
    try {
      // Claim atomico: so processa se ainda PAID e nao aplicado.
      const claim = await prisma.transaction.updateMany({
        where: { id: t.id, status: "PAID", fakeRefundApplied: false },
        data: {
          fakeRefundApplied: true,
          providerPayload: {
            ...((t.providerPayload as Record<string, unknown> | null) ?? {}),
            fake_refund: true,
            fake_refund_at: new Date().toISOString(),
          } as never,
        },
      });
      if (claim.count === 0) {
        skipped++;
        continue;
      }
      // Reverte saldo + taxa + dispara webhook transaction.refunded.
      await markTransactionRefunded(t.id);
      applied++;
    } catch (e) {
      console.error("[fake-refunds] failed for tx:", t.id, e);
      failed++;
    }
  }
  return { applied, skipped, failed, total: due.length };
}

// fireTransactionEmails REMOVIDA (17/07/2026). Recibo pro cliente e notif de
// venda pro seller não saem mais por email — política: só código de signup
// e entrega de produto digital (cron post-purchase-email, agendado no funil).

function serializeForWebhook(tx: {
  id: string;
  userId: string;
  productId: string;
  checkoutId: string | null;
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  method: string;
  status: string;
  provider: string;
  providerId: string | null;
  customerEmail: string;
  customerName: string | null;
  customerCpf: string | null;
  customerPhone: string | null;
  paidAt: Date | null;
  createdAt: Date;
  providerPayload?: unknown;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  gclid?: string | null;
}) {
  const pp = (tx.providerPayload as Record<string, unknown> | null) ?? {};
  // Comprovante enviado pelo lead (quando a opção está ligada). Best-effort:
  // só estará presente se o lead subiu o comprovante antes deste evento.
  const receiptUrl = (pp.receipt_url as string | undefined) ?? null;
  // RECONCILIAÇÃO: external_reference + metadata custom voltam em TODOS os
  // eventos (created/paid/refunded/chargeback/expired/failed) — antes não
  // vinham, quebrando a conciliação do seller.
  const externalReference =
    (pp.external_reference as string | undefined) ?? null;
  const metadata =
    pp.metadata && typeof pp.metadata === "object"
      ? (pp.metadata as Record<string, unknown>)
      : null;
  return {
    id: tx.id,
    product_id: tx.productId,
    checkout_id: tx.checkoutId,
    amount_cents: tx.amountCents,
    fee_cents: tx.feeCents,
    net_cents: tx.netCents,
    currency: tx.currency,
    method: tx.method,
    status: tx.status,
    provider: tx.provider,
    provider_id: tx.providerId,
    external_reference: externalReference,
    metadata,
    customer: {
      email: tx.customerEmail,
      name: tx.customerName,
      cpf: tx.customerCpf,
      phone: tx.customerPhone,
    },
    // UTMs em TODOS os eventos (atribuição na conciliação).
    tracking: {
      utm_source: tx.utmSource ?? null,
      utm_medium: tx.utmMedium ?? null,
      utm_campaign: tx.utmCampaign ?? null,
      utm_content: tx.utmContent ?? null,
      utm_term: tx.utmTerm ?? null,
      fbclid: tx.fbclid ?? null,
      ttclid: tx.ttclid ?? null,
      gclid: tx.gclid ?? null,
    },
    receipt_url: receiptUrl,
    paid_at: tx.paidAt?.toISOString() ?? null,
    created_at: tx.createdAt.toISOString(),
  };
}
