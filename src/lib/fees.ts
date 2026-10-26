import { prisma } from "./prisma";
import { toOpsMode } from "./ops-modes";

export const PLATFORM_DEFAULT_FEE_PERCENT = 5.99;
export const PLATFORM_DEFAULT_FEE_FIXED_CENTS = 200;
export const WITHDRAWAL_FEE_CENTS = 1000;
export const MIN_WITHDRAWAL_CENTS = 5000;

/**
 * TAXA MINIMA absoluta PIX pros modos BLACK/WHITE (08/07/2026, david).
 *
 * Contexto: seller seller-a@exemplo.com apareceu com 0% + R\$ 1,29 — abaixo
 * do custo interno (adquirente + operacao), gerando PREJUIZO pra plataforma
 * em CADA venda. Regra de negocio: seller NUNCA pode ficar com taxa abaixo
 * do minimo — se estiver, PIX nao gera + popup avisa "fale com o admin".
 *
 * Aplicado nos modos BLACK e WHITE. HOT usa cobranca UNICA por venda (nao
 * tem % + fixo separados), entao o gate nao aplica.
 */
export const MIN_PIX_FEE_PERCENT_BLACK_WHITE = 4.9;
export const MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE = 100;

/**
 * Retorna { ok: false, reason } se a taxa PIX EFETIVA do seller (respeitando
 * feesByMode do modo atual) esta abaixo do minimo definido pra BLACK/WHITE.
 * Retorna { ok: true } se HOT (nao valida) ou taxa acima do minimo.
 *
 * Uso: dispatchPixCharge chama antes de tentar gerar o PIX. Se retornar
 * !ok, aborta com finalError e a UI mostra popup "fale com admin".
 */
export function assertMinPixFee(user: {
  feePercent: number;
  feeFixedCents: number;
  feesByMode: unknown;
  pixOpsMode: string;
}): { ok: true } | { ok: false; effPct: number; effCents: number; mode: string } {
  const mode = toOpsMode(user.pixOpsMode);
  // HOT usa cobranca UNICA (hotFeeCents), nao valida aqui.
  // SAG idem, e de proposito: o piso MIN_PIX_FEE_*_BLACK_WHITE foi calculado
  // em cima do custo de black/white. Aplicar ele no sub adquirente gateway
  // barraria venda com um numero que ninguem escolheu pro modo. Quando o davi
  // definir o piso do SAG, basta incluir "sag" na condicao abaixo.
  if (mode !== "black" && mode !== "white") return { ok: true };
  const byMode = (user.feesByMode as Record<
    string,
    Record<string, number | null> | undefined
  > | null) ?? null;
  const modeCfg = byMode?.[mode] ?? null;
  const effPct =
    modeCfg?.pixPct != null ? modeCfg.pixPct : user.feePercent;
  const effCents =
    modeCfg?.pixFix != null ? modeCfg.pixFix : user.feeFixedCents;
  if (
    effPct < MIN_PIX_FEE_PERCENT_BLACK_WHITE ||
    effCents < MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE
  ) {
    return { ok: false, effPct, effCents, mode };
  }
  return { ok: true };
}

/**
 * AUTO-FIX de fee-violations (09/07/2026, david).
 *
 * Roda periodicamente (cron 5min) e detecta sellers com taxa PIX EFETIVA
 * abaixo do minimo BLACK/WHITE (4.9% + R$ 1,00). Em vez de bloquear PIX,
 * AJUSTA AUTOMATICAMENTE pro minimo:
 *   - feePercent: max(atual, 4.9)
 *   - feeFixedCents: max(atual, 100)
 *   - feesByMode[black].pixPct/pixFix e feesByMode[white].pixPct/pixFix
 *     tb sao floor'd ao minimo (se estavam abaixo).
 *
 * Regra: NAO diminui nada. So sobe o que ta abaixo do minimo. Se seller
 * ta com 3% + R$0,50, vira 4.9% + R$1. Se ta com 4.9% + R$0,80, vira
 * 4.9% + R$1. Se ta com 5% + R$1, nao mexe.
 *
 * Retorna a lista de sellers ajustados pra logging/notificacao.
 */
export async function autoFixPixFeeViolations(): Promise<
  Array<{ userId: string; email: string | null; changes: string[] }>
> {
  // Traz sellers nao-admin com potencial de violacao (pra evitar full-scan).
  // Filtro conservador: qualquer um cujo feePercent ou feeFixedCents estejam
  // abaixo do minimo. Sellers com feesByMode podem violar mesmo com base ok,
  // por isso o loop tambem checa modo por modo.
  const suspects = await prisma.user.findMany({
    where: {
      role: { not: "admin" },
      OR: [
        { feePercent: { lt: MIN_PIX_FEE_PERCENT_BLACK_WHITE } },
        { feeFixedCents: { lt: MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE } },
        // Sellers com feesByMode: NAO da pra filtrar Json path facilmente
        // no Prisma, entao trazemos os que tem feesByMode nao-null tb.
        { feesByMode: { not: undefined as never } },
      ],
    },
    select: {
      id: true,
      email: true,
      feePercent: true,
      feeFixedCents: true,
      feesByMode: true,
    },
    take: 2000,
  });

  const fixed: Array<{ userId: string; email: string | null; changes: string[] }> = [];

  for (const u of suspects) {
    const changes: string[] = [];
    const patchData: {
      feePercent?: number;
      feeFixedCents?: number;
      feesByMode?: unknown;
    } = {};

    // Fix base (aplica a todos os modos que nao tem override).
    if (u.feePercent < MIN_PIX_FEE_PERCENT_BLACK_WHITE) {
      patchData.feePercent = MIN_PIX_FEE_PERCENT_BLACK_WHITE;
      changes.push(
        `feePercent ${u.feePercent}% → ${MIN_PIX_FEE_PERCENT_BLACK_WHITE}%`,
      );
    }
    if (u.feeFixedCents < MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE) {
      patchData.feeFixedCents = MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE;
      changes.push(
        `feeFixedCents ${u.feeFixedCents}c → ${MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE}c`,
      );
    }

    // Fix per-mode (BLACK e WHITE).
    const byMode = (u.feesByMode as Record<
      string,
      Record<string, number | null> | undefined
    > | null) ?? null;
    if (byMode) {
      const newByMode = { ...byMode };
      let byModeChanged = false;
      for (const m of ["black", "white"] as const) {
        const cfg = newByMode[m];
        if (!cfg) continue;
        const newCfg = { ...cfg };
        if (
          newCfg.pixPct != null &&
          newCfg.pixPct < MIN_PIX_FEE_PERCENT_BLACK_WHITE
        ) {
          changes.push(
            `feesByMode.${m}.pixPct ${newCfg.pixPct}% → ${MIN_PIX_FEE_PERCENT_BLACK_WHITE}%`,
          );
          newCfg.pixPct = MIN_PIX_FEE_PERCENT_BLACK_WHITE;
          byModeChanged = true;
        }
        if (
          newCfg.pixFix != null &&
          newCfg.pixFix < MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE
        ) {
          changes.push(
            `feesByMode.${m}.pixFix ${newCfg.pixFix}c → ${MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE}c`,
          );
          newCfg.pixFix = MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE;
          byModeChanged = true;
        }
        newByMode[m] = newCfg;
      }
      if (byModeChanged) patchData.feesByMode = newByMode;
    }

    if (changes.length === 0) continue;

    try {
      await prisma.user.update({
        where: { id: u.id },
        data: patchData as never,
      });
      fixed.push({ userId: u.id, email: u.email, changes });
      console.warn(
        `[auto-fix-fee] ${u.email ?? u.id}: ${changes.join(", ")}`,
      );
    } catch (e) {
      console.error(`[auto-fix-fee] falhou para ${u.email ?? u.id}:`, e);
    }
  }

  return fixed;
}

/**
 * Taxas e retenção do modo BLACK para CARTÃO.
 *
 * Quando o seller liga `cardOpsMode = "black"`, a plataforma pode
 * processar cartão em adquirentes black (ex: Stripe black) que aceitam
 * volumes mais agressivos sem KYC robusto pelo seller. Em troca:
 *  - Taxa cheia: 35% + R$ 10,00 por venda (vs. o cardFeePercent normal)
 *  - Retenção: 20% por 90 dias (vs. cardRetentionPercent normal = 10%)
 *
 * Os defaults BLACK estão HARDCODED — admin não customiza individual.
 * Quem quiser modo black aceita esses números, ponto.
 */
export const BLACK_CARD_FEE_PERCENT = 35;
export const BLACK_CARD_FEE_FIXED_CENTS = 1000; // R$ 10,00
export const BLACK_CARD_RETENTION_PERCENT = 20;
export const BLACK_CARD_RETENTION_DAYS = 90;

/**
 * Retorna a taxa de cartão efetiva para um seller, considerando o modo
 * de operação (white = padrão do user, black = constantes acima).
 */
export function getEffectiveCardFee(user: {
  cardFeePercent: number;
  cardFeeFixedCents: number;
  cardOpsMode?: string | null;
}): { feePercent: number; feeFixedCents: number; mode: "white" | "black" } {
  if (user.cardOpsMode === "black") {
    return {
      feePercent: BLACK_CARD_FEE_PERCENT,
      feeFixedCents: BLACK_CARD_FEE_FIXED_CENTS,
      mode: "black",
    };
  }
  return {
    feePercent: user.cardFeePercent,
    feeFixedCents: user.cardFeeFixedCents,
    mode: "white",
  };
}

/**
 * Retorna a retenção efetiva de cartão pra um seller. Black sempre 20%/90d.
 */
export function getEffectiveCardRetention(user: {
  cardRetentionPercent: number;
  cardRetentionDays: number;
  cardOpsMode?: string | null;
}): { percent: number; days: number } {
  if (user.cardOpsMode === "black") {
    return {
      percent: BLACK_CARD_RETENTION_PERCENT,
      days: BLACK_CARD_RETENTION_DAYS,
    };
  }
  return {
    percent: user.cardRetentionPercent,
    days: user.cardRetentionDays,
  };
}

/**
 * CUSTO que o GATEWAY paga pra adquirente por transação PIX.
 * Default usado SÓ quando a adquirente da tx não tem custo resolvível
 * (ex.: acquirer_id aponta pra uma Acquirer já DELETADA — caso de ~253
 * vendas/30d em jun/2026). Calibrado pra bater com a adquirente real
 * dominante (safepix = 3,99% + R$ 1,00). O valor antigo (4,99%) ficava
 * 1 ponto acima do custo real e INFLAVA o custo dessas vendas órfãs,
 * deprimindo o "Lucro" do dashboard sem motivo.
 *
 * IMPORTANTE: isso é o CUSTO da plataforma, NÃO o que o seller paga.
 * Seller paga `PLATFORM_DEFAULT_FEE_*`. Plataforma fica com a diferença
 * (menos referrer earnings, se houver). Mudar isto NÃO altera o que o
 * seller paga nem o que o referrer recebe — só a estimativa de custo.
 */
export const ACQUIRER_DEFAULT_PIX_COST_PERCENT = 3.99;
export const ACQUIRER_DEFAULT_PIX_COST_FIXED_CENTS = 100;
export const ACQUIRER_DEFAULT_CARD_COST_PERCENT = 0;
export const ACQUIRER_DEFAULT_CARD_COST_FIXED_CENTS = 0;

/**
 * Calcula o custo que a plataforma paga pra adquirente nessa transação.
 * Aceita method "PIX" ou "CARD" + custo customizado se passado.
 */
export function calculateAcquirerCost(
  amountCents: number,
  method: "PIX" | "CARD",
  overrides?: {
    pixCostPercent?: number | null;
    pixCostFixedCents?: number | null;
    cardCostPercent?: number | null;
    cardCostFixedCents?: number | null;
  },
): number {
  if (method === "PIX") {
    const pct =
      overrides?.pixCostPercent ?? ACQUIRER_DEFAULT_PIX_COST_PERCENT;
    const fix =
      overrides?.pixCostFixedCents ?? ACQUIRER_DEFAULT_PIX_COST_FIXED_CENTS;
    return Math.round((amountCents * pct) / 100) + fix;
  }
  const pct =
    overrides?.cardCostPercent ?? ACQUIRER_DEFAULT_CARD_COST_PERCENT;
  const fix =
    overrides?.cardCostFixedCents ?? ACQUIRER_DEFAULT_CARD_COST_FIXED_CENTS;
  return Math.round((amountCents * pct) / 100) + fix;
}

/**
 * CRITICAL FIX (jun/2026): caches in-memory de 5min REMOVIDOS.
 *
 * Antes: Map<acquirerId, costs/surcharge> com TTL 5min.
 * Bug: quando admin alterava extraSellerFeePercent em /admin01/acquirers,
 * containers Vercel ja rodando seguiam servindo o valor cacheado por ate
 * 5 minutos. Resultado: txs processadas nesses containers usavam fee
 * antigo (geralmente 0) ate o container reciclar.
 *
 * Exemplo real (seller-k@exemplo.com):
 *  - 06-04 07:55 admin set extraSellerFeePercent=5 na MP
 *  - 06-05 15:06 tx R$ 399 processada com fee=base (sem surcharge) →
 *    seller recebeu R$ 26 a mais que devia.
 *
 * Fix: sempre hit DB. Custo: 1 query por tx (poucos ms). Bem mais seguro.
 */
export async function getAcquirerCosts(acquirerId: string | null) {
  if (!acquirerId) return null;
  return prisma.acquirer.findUnique({
    where: { id: acquirerId },
    select: {
      pixCostPercent: true,
      pixCostFixedCents: true,
      cardCostPercent: true,
      cardCostFixedCents: true,
    },
  });
}

/**
 * HOT — taxa TOTAL fixa por venda (em centavos). Substitui 100% das outras
 * taxas: SEM %, SEM fee base, SEM surcharge. O seller no modo hot (ou a venda
 * numa adquirente hot) paga SO isso. Editavel no admin via
 * PlatformDefaults.hotFeeFixedCents. Default R$ 1,00.
 */
export const HOT_FEE_DEFAULT_CENTS = 100;

/**
 * HOT — TETO de valor pra taxa flat. A taxa única (R$ 1,00) só vale pra vendas
 * ABAIXO de R$ 16,00. Em vendas a partir de R$ 16,00 (>= 1600 cents) a venda
 * hot passa a cobrar a taxa WHITE NORMAL do seller (%, fixo + split de
 * referrer + surcharge da adquirente). Regra anti-abuso: impede usar o hot
 * (R$ 1 flat) pra ticket alto.
 *
 * ⚠️ Espelhado no aviso da aba do seller (dashboard/adquirentes/client.tsx) —
 * se mudar o valor aqui, atualize o texto "R$ 16,00" lá também.
 */
export const HOT_FLAT_FEE_MAX_CENTS = 1600;

export async function getHotFeeCents(): Promise<number> {
  const d = await prisma.platformDefaults.findUnique({
    where: { id: "default" },
    select: { hotFeeFixedCents: true },
  });
  return d?.hotFeeFixedCents ?? HOT_FEE_DEFAULT_CENTS;
}

export async function getAcquirerSellerSurcharge(
  acquirerId: string | null,
): Promise<{ extraSellerFeePercent: number; extraSellerFeeFixedCents: number }> {
  if (!acquirerId) return { extraSellerFeePercent: 0, extraSellerFeeFixedCents: 0 };
  const a = await prisma.acquirer.findUnique({
    where: { id: acquirerId },
    select: { extraSellerFeePercent: true, extraSellerFeeFixedCents: true },
  });
  return {
    extraSellerFeePercent: a?.extraSellerFeePercent ?? 0,
    extraSellerFeeFixedCents: a?.extraSellerFeeFixedCents ?? 0,
  };
}

/**
 * Recalcula o fee/net APOS o dispatch (quando ja sabemos a acquirer
 * escolhida). Idempotente: se ja foi calculado com surcharge, NAO duplica.
 *
 * HOT: se a adquirente escolhida for mode="hot", o fee TOTAL vira a taxa flat
 * (hotFeeFixedCents) — ignora base + surcharge inteiramente. É a fonte de
 * verdade final (roda pos-dispatch em pix/card/upsell/v1/subs).
 *
 * Usado nas rotas pix/card pra ajustar Transaction.feeCents+netCents.
 */
export async function recomputeFeeWithAcquirerSurcharge(input: {
  amountCents: number;
  baseFeeCents: number;
  acquirerId: string | null;
}): Promise<{
  feeCents: number;
  netCents: number;
  surchargeCents: number;
}> {
  if (!input.acquirerId) {
    return {
      feeCents: input.baseFeeCents,
      netCents: Math.max(0, input.amountCents - input.baseFeeCents),
      surchargeCents: 0,
    };
  }
  const a = await prisma.acquirer.findUnique({
    where: { id: input.acquirerId },
    select: {
      mode: true,
      extraSellerFeePercent: true,
      extraSellerFeeFixedCents: true,
    },
  });
  // HOT: taxa TOTAL flat — substitui base + surcharge. SÓ pra vendas ABAIXO de
  // R$ 16,00; a partir disso a venda hot cobra a taxa WHITE normal (base +
  // surcharge — segue o cálculo abaixo).
  if (a?.mode === "hot" && input.amountCents < HOT_FLAT_FEE_MAX_CENTS) {
    const hotFee = Math.max(await getHotFeeCents(), 90);
    return {
      feeCents: hotFee,
      netCents: Math.max(0, input.amountCents - hotFee),
      surchargeCents: 0,
    };
  }
  const surchargePctCents = Math.round(
    (input.amountCents * (a?.extraSellerFeePercent ?? 0)) / 100,
  );
  const surchargeCents = surchargePctCents + (a?.extraSellerFeeFixedCents ?? 0);
  const feeCents = input.baseFeeCents + surchargeCents;
  const netCents = Math.max(0, input.amountCents - feeCents);
  return { feeCents, netCents, surchargeCents };
}

/**
 * HELPER pos-dispatch: recalcula fee/net da tx aplicando surcharge da
 * adquirente E persiste a tx no DB num unico update. Tambem grava
 * acquirer_id/code/surcharge no providerPayload pro webhook e pro
 * dashboard P&L.
 *
 * USAR EM TODAS AS ROTAS POS-DISPATCH: pix, card, upsell, v1, cron-subs.
 *
 * @returns surchargeCents aplicado (0 se nao havia surcharge na acquirer)
 */
export async function applyAcquirerSurchargePostDispatch(input: {
  transactionId: string;
  amountCents: number;
  baseFeeCents: number;
  acquirerId: string | null | undefined;
  acquirerCode?: string | null;
  /** Campos extras a anexar ao providerPayload (preserva o que ja tinha). */
  extraPayload?: Record<string, unknown>;
}): Promise<{ feeCents: number; netCents: number; surchargeCents: number }> {
  const { prisma } = await import("./prisma");
  const recomputed = await recomputeFeeWithAcquirerSurcharge({
    amountCents: input.amountCents,
    baseFeeCents: input.baseFeeCents,
    acquirerId: input.acquirerId ?? null,
  });
  // Le providerPayload atual pra mergear (evita perder dados)
  const tx = await prisma.transaction.findUnique({
    where: { id: input.transactionId },
    select: { providerPayload: true },
  });
  const currentPayload = (tx?.providerPayload as Record<string, unknown> | null) ?? {};
  await prisma.transaction.update({
    where: { id: input.transactionId },
    data: {
      feeCents: recomputed.feeCents,
      netCents: recomputed.netCents,
      providerPayload: {
        ...currentPayload,
        ...(input.extraPayload ?? {}),
        ...(input.acquirerId ? { acquirer_id: input.acquirerId } : {}),
        ...(input.acquirerCode ? { acquirer_code: input.acquirerCode } : {}),
        ...(recomputed.surchargeCents > 0
          ? { acquirer_surcharge_cents: recomputed.surchargeCents }
          : {}),
      } as never,
    },
  });
  return recomputed;
}

export function calculateFee(
  amountCents: number,
  percent: number,
  fixedCents: number,
): { feeCents: number; netCents: number } {
  const percentFee = Math.round((amountCents * percent) / 100);
  const feeCents = percentFee + fixedCents;
  const netCents = Math.max(0, amountCents - feeCents);
  return { feeCents, netCents };
}

export async function getUserFee(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      feePercent: true,
      feeFixedCents: true,
      referredByUserId: true,
    },
  });
  return {
    feePercent: user?.feePercent ?? PLATFORM_DEFAULT_FEE_PERCENT,
    feeFixedCents: user?.feeFixedCents ?? PLATFORM_DEFAULT_FEE_FIXED_CENTS,
    referredByUserId: user?.referredByUserId ?? null,
  };
}

/**
 * FLOOR de seguranca pras taxas que admin pode setar manualmente.
 *
 * Sem floor, admin pode setar feePercent=0 via /admin01 e plataforma
 * comeria 4.99% + R$1 de prejuizo POR VENDA (custo SafePix nao coberto).
 *
 * Floor = custo da adquirente + margem minima R$0.50. Plataforma nunca
 * perde dinheiro mesmo se algum admin errar config.
 *
 * CARD black ja tem floor implicito (constantes BLACK_*), nao precisa.
 * CARD white: pode ser 0 (algumas adquirentes de cartao nao cobram pct).
 */
/**
 * PISO de taxa PIX POR MODO de adquirente — protege a margem da plataforma sem
 * sobrescrever os preços baixos intencionais. Valores definidos pelo admin:
 *  - white: 0,5% + R$1,00  (custo da adquirente white)
 *  - hot:   0%   + R$0,90  (piso da venda hot abaixo de R$16)
 *  - black/sag/outros: sem piso (a taxa padrão já é alta — 5,99%)
 * A taxa configurada (seller/indicador) nunca cai abaixo disso no cálculo.
 */
function pixFeeFloor(mode: string | null | undefined): {
  pct: number;
  fix: number;
} {
  if (mode === "white") return { pct: 0.5, fix: 100 };
  if (mode === "hot") return { pct: 0, fix: 90 };
  return { pct: 0, fix: 0 };
}

/**
 * Calcula a divisão entre platform fee e earning do referrer.
 * Platform sempre recebe a taxa-base do referrer (ou default).
 * Referrer (se houver) recebe a diferença entre a taxa do referido e a taxa do referrer.
 *
 * Suporta `method` ("PIX" | "CARD"):
 *  - PIX: usa feePercent/feeFixedCents do user (default)
 *  - CARD + cardOpsMode=white: usa cardFeePercent/cardFeeFixedCents
 *  - CARD + cardOpsMode=black: usa BLACK_CARD_FEE_PERCENT/FIXED (35% + R$10)
 */
export async function splitFeeBetweenPlatformAndReferrer(input: {
  sellerUserId: string;
  amountCents: number;
  /** Default = "PIX" pra manter compat com chamadas antigas. */
  method?: "PIX" | "CARD";
}) {
  const method = input.method ?? "PIX";
  const seller = await prisma.user.findUnique({
    where: { id: input.sellerUserId },
    select: {
      feePercent: true,
      feeFixedCents: true,
      cardFeePercent: true,
      cardFeeFixedCents: true,
      pixOpsMode: true,
      cardOpsMode: true,
      referredByUserId: true,
    },
  });

  // HOT: taxa TOTAL flat — sem %, sem fee base, sem split de referrer.
  // O modo hot do metodo (pixOpsMode pra PIX, cardOpsMode pra CARD) define.
  const sellerOpsMode =
    method === "CARD" ? seller?.cardOpsMode : seller?.pixOpsMode;
  // HOT flat (R$ 1,00) SÓ pra vendas ABAIXO de R$ 16,00. A partir disso, a
  // venda hot cai na taxa WHITE normal do seller (segue o fluxo abaixo, com
  // %, fixo, floor e split de referrer).
  if (sellerOpsMode === "hot" && input.amountCents < HOT_FLAT_FEE_MAX_CENTS) {
    // Piso hot (<R$16): nunca abaixo de R$0,90.
    const hotFee = Math.max(await getHotFeeCents(), 90);
    return {
      feeCents: hotFee,
      netCents: Math.max(0, input.amountCents - hotFee),
      referrerEarningsCents: 0,
    };
  }

  // Resolve taxa do método
  let sellerPct: number;
  let sellerFix: number;
  if (method === "CARD" && seller) {
    const eff = getEffectiveCardFee({
      cardFeePercent: seller.cardFeePercent,
      cardFeeFixedCents: seller.cardFeeFixedCents,
      cardOpsMode: seller.cardOpsMode,
    });
    sellerPct = eff.feePercent;
    sellerFix = eff.feeFixedCents;
  } else {
    sellerPct = seller?.feePercent ?? PLATFORM_DEFAULT_FEE_PERCENT;
    sellerFix = seller?.feeFixedCents ?? PLATFORM_DEFAULT_FEE_FIXED_CENTS;
  }

  // FLOOR ENFORCEMENT — PIX, por modo de adquirente (white 0,5%+R$1 · hot
  // 0%+R$0,90 · black sem piso). CARD: black tem floor implícito; white pode 0.
  if (method === "PIX") {
    const floor = pixFeeFloor(seller?.pixOpsMode);
    if (sellerPct < floor.pct || sellerFix < floor.fix) {
      sellerPct = Math.max(sellerPct, floor.pct);
      sellerFix = Math.max(sellerFix, floor.fix);
    }
  }

  const sellerFee = calculateFee(input.amountCents, sellerPct, sellerFix);

  let referrerEarnings = 0;
  if (seller?.referredByUserId) {
    const referrer = await prisma.user.findUnique({
      where: { id: seller.referredByUserId },
      select: {
        feePercent: true,
        feeFixedCents: true,
        cardFeePercent: true,
        cardFeeFixedCents: true,
        cardOpsMode: true,
      },
    });
    if (referrer) {
      // Aplica o MESMO método e modo do referrer pra calcular taxa-base
      let refPct: number;
      let refFix: number;
      if (method === "CARD") {
        const eff = getEffectiveCardFee({
          cardFeePercent: referrer.cardFeePercent,
          cardFeeFixedCents: referrer.cardFeeFixedCents,
          cardOpsMode: referrer.cardOpsMode,
        });
        refPct = eff.feePercent;
        refFix = eff.feeFixedCents;
      } else {
        refPct = referrer.feePercent;
        refFix = referrer.feeFixedCents;
      }
      // Mesmo floor que o seller — se referrer.feePercent=0, referrer
      // engoliria a taxa do seller toda e plataforma ficaria devendo
      // a adquirente. Floor garante plataforma >= custo + margem minima.
      if (method === "PIX") {
        const floor = pixFeeFloor(seller?.pixOpsMode);
        refPct = Math.max(refPct, floor.pct);
        refFix = Math.max(refFix, floor.fix);
      }
      const referrerBase = calculateFee(input.amountCents, refPct, refFix);
      // Diferença entre o que o vendedor pagou e o que a plataforma cobraria do referrer
      referrerEarnings = Math.max(
        0,
        sellerFee.feeCents - referrerBase.feeCents,
      );
    }
  }

  return {
    feeCents: sellerFee.feeCents,
    netCents: sellerFee.netCents,
    referrerEarningsCents: referrerEarnings,
  };
}
