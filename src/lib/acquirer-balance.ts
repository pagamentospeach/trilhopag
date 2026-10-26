/**
 * Dispatcher de saldo por adquirente — admin precisa ver quanto dinheiro
 * tem em cada conta SafePix/Stripe/etc pra decidir saque + reconciliar.
 *
 * Cache em memoria 60s por acquirerId pra evitar:
 *  - Hammer no CloudFlare rate-limit (SafePix)
 *  - Custo desnecessario (Stripe nao cobra, mas eh polite)
 *  - Latencia no admin dashboard quando varias adquirentes
 *
 * Dispatch por `acquirer.code`:
 *   safepix*    → safepix.getBalance(creds)
 *   stripe*     → stripe.getStripeBalance(creds)
 *   mercadopago → API nao expoe saldo simples → null
 *
 * Retorna { amountCents | null, currency, error?, lastFetched, supported }.
 */

import { prisma } from "./prisma";
import { decryptString } from "./crypto";
import { getBalance as getSafePixBalance } from "./providers/safepix";
import { getBalance as getSharkBalance } from "./providers/sharkbanking";
import { getBalance as getSharkHubBalance } from "./providers/sharkhub";
import { getBalance as getPluggouBalance } from "./providers/pluggou";
import { getBalance as getPixzyBalance } from "./providers/pixzy";
import { getStripeBalance } from "./providers/stripe";
import {
  ACQUIRER_DEFAULT_PIX_COST_PERCENT,
  ACQUIRER_DEFAULT_PIX_COST_FIXED_CENTS,
  ACQUIRER_DEFAULT_CARD_COST_PERCENT,
  ACQUIRER_DEFAULT_CARD_COST_FIXED_CENTS,
} from "./fees";

export type AcquirerBalanceResult = {
  acquirerId: string;
  code: string;
  nominalName: string;
  /** ShortCode da adquirente (ex.: "SP1", "PGH") — exibido no admin (19/07/2026, davi). */
  shortCode?: string | null;
  /** Email da conta no PSP — exibido no admin pra identificar rapidinho qual login está por trás dessa nominal. */
  accountEmail?: string | null;
  /** Hash SHA-256 (truncada 16 chars) do par (publicKey, secretKeyEnc). Duas Acquirer
   *  rows com mesmo fingerprint = MESMA credencial cadastrada 2x → mesma conta na PSP
   *  → total infla. Usado pra dedup no cálculo do total (20/07/2026, davi). */
  accountFingerprint?: string | null;
  /**
   * 22/07/2026 (davi: "As contas na pluggou tao puxando tudo com o mesmo saldo,
   * ta errado"). Hash 16-char do RAW BALANCE response da PSP. Contas com o mesmo
   * hash compartilham o pool na PSP (sub-nominais/sub-accounts com saldo global
   * — comum na Pluggou). Difere de accountFingerprint (que hash as creds): aqui
   * hasheamos o RESULTADO da API, então detecta pool compartilhado mesmo com
   * credenciais únicas. Null quando erro ou balance calculado (sem API).
   */
  sharedBalanceGroup?: string | null;
  /** Códigos das outras adquirentes que estão no MESMO sharedBalanceGroup. Só
   *  preenchido em getAllActiveAcquirerBalances (dedup em batch). */
  sharedWith?: string[];
  /** Instituição/PSP extraída do código PIX (ex.: "onlyup"). null = sem URL. */
  institution?: string | null;
  /** Saldo disponivel (sacavel agora) em cents. null = unsupported ou erro. */
  availableCents: number | null;
  /** Saldo pendente (em processamento, ainda nao disponivel) em cents. */
  pendingCents: number | null;
  currency: string;
  /** True quando o provider expoe balance API real. */
  supported: boolean;
  /** True quando o valor eh CALCULADO a partir das transactions (sem API). */
  calculated?: boolean;
  /** Detalhes da calculo quando calculated=true. */
  calcDetails?: {
    netCents: number;
    pendingCents: number;
    paidCount: number;
    refundedCount: number;
    grossCents: number;
    /** Custo REAL da adquirente ja descontado (pixCost/cardCost). */
    acquirerCostCents?: number;
    /** Saques pagos ja descontados proporcionalmente. */
    withdrawalShareCents?: number;
  };
  error?: string;
  lastFetched: string;
};

type CacheEntry = {
  result: AcquirerBalanceResult;
  expiresAt: number;
};

const balanceCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;
// TTL curto pra resultados COM erro (timeout/instabilidade): evita martelar a
// API da adquirente em loop, mas faz o painel se auto-recuperar em ~8s ao inves
// de "grudar" o erro por 60s inteiros quando foi so um soluço passageiro.
const ERROR_CACHE_TTL_MS = 8_000;

/**
 * Cache de agregados globais usados nos calculos proporcionais
 * (volume total + saques pagos). TTL = mesmo do balance cache (60s).
 */
type GlobalAggs = {
  totalCalculatedGross: number;
  totalPaidWithdrawalsCents: number;
};
let cachedGlobalAggs: { data: GlobalAggs; expiresAt: number } | null = null;

async function getGlobalAggs(): Promise<GlobalAggs> {
  if (cachedGlobalAggs && cachedGlobalAggs.expiresAt > Date.now()) {
    return cachedGlobalAggs.data;
  }

  // Quais acquirers sao calculated (sem API)? Tudo que NAO eh safepix*/stripe*
  // — mesma logica do dispatcher.
  const calcAcqs = await prisma.acquirer.findMany({
    where: {
      active: true,
      AND: [
        { NOT: { code: { startsWith: "safepix" } } },
        { NOT: { code: { startsWith: "stripe" } } },
        { NOT: { code: { startsWith: "sharkbanking" } } },
        { NOT: { code: { startsWith: "sharkhub" } } },
        { NOT: { code: { startsWith: "pluggou" } } },
      ],
    },
    select: { id: true },
  });
  const calcAcqIds = calcAcqs.map((a) => a.id);

  let totalCalculatedGross = 0;
  if (calcAcqIds.length > 0) {
    // Soma o gross PAID das txs roteadas pelas acquirers calculadas
    const grossRes = await prisma.$queryRaw<
      Array<{ total: bigint | null }>
    >`
      SELECT SUM("amountCents") AS total
      FROM "Transaction"
      WHERE "status" = 'PAID'
        AND "providerPayload"->>'acquirer_id' = ANY(${calcAcqIds}::text[])
    `;
    totalCalculatedGross = Number(grossRes[0]?.total ?? 0);
  }

  // Total de saques PAID (amount + fee = dinheiro que saiu da pool da plataforma)
  const wAgg = await prisma.withdrawal.aggregate({
    where: { status: "PAID" },
    _sum: { amountCents: true, feeCents: true },
  });
  const totalPaidWithdrawalsCents =
    (wAgg._sum.amountCents ?? 0) + (wAgg._sum.feeCents ?? 0);

  const data = { totalCalculatedGross, totalPaidWithdrawalsCents };
  cachedGlobalAggs = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

/**
 * Fetch + cache. Se ja existe no cache valido, retorna sem chamar provider.
 * Se forceFresh=true, ignora cache (admin pode forcar refresh manual).
 */
export async function getAcquirerBalance(
  acquirerId: string,
  forceFresh = false,
): Promise<AcquirerBalanceResult> {
  if (!forceFresh) {
    const cached = balanceCache.get(acquirerId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  const acq = await prisma.acquirer.findUnique({
    where: { id: acquirerId },
    select: {
      id: true,
      code: true,
      shortCode: true,
      nominalName: true,
      institution: true,
      accountEmail: true,
      publicKey: true,
      secretKeyEnc: true,
      metadataEnc: true,
      balanceAdjustmentCents: true,
    },
  });

  if (!acq) {
    return makeResult(acquirerId, "?", "?", null, null, "BRL", false, "not_found");
  }

  const out = await fetchByCode(acq);
  out.institution = acq.institution ?? null;
  out.shortCode = acq.shortCode ?? null;
  out.accountEmail = acq.accountEmail ?? null;
  // Fingerprint das credenciais pra dedup de conta compartilhada (20/07/2026, davi:
  // "Tem adquirente duplicada ali no saldo total"). Hash 128-bit é robusto pra
  // dedup e não vaza a cred (só o hash roda no client — mas mesmo assim manter
  // truncado). Empty ou null vira "no-fingerprint" (sem dedup).
  if (acq.publicKey || acq.secretKeyEnc) {
    const crypto = await import("node:crypto");
    const h = crypto.createHash("sha256");
    h.update(String(acq.publicKey ?? ""));
    h.update(":");
    h.update(String(acq.secretKeyEnc ?? ""));
    out.accountFingerprint = h.digest("hex").slice(0, 16);
  }
  // 22/07/2026 (davi: "Isso nao pode acontecer, tem que puxar o saldo real
  // da conta"): removi dedup por (familia + availableCents + pendingCents) —
  // era fragil. Falso positivo quando 2 contas legit tinham saldo IDENTICO
  // por acaso (ex: PARTNERS 831 + CAITEC 831), pintava CAITEC como alias
  // de PARTNERS. Errado.
  //
  // Ficou soh dedup por `accountFingerprint` (hash publicKey+secretKey) —
  // esse eh 100% seguro: soh marca alias quando a MESMA credencial foi
  // cadastrada 2x, o que sempre significa mesma conta na PSP.
  // Aplica ajuste manual (admin reconciliacao)
  if (acq.balanceAdjustmentCents && out.availableCents !== null) {
    out.availableCents += acq.balanceAdjustmentCents;
  }
  // Erro → cache curto (auto-recupera). Sucesso → cache cheio (60s).
  balanceCache.set(acquirerId, {
    result: out,
    expiresAt:
      Date.now() + (out.error ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS),
  });
  return out;
}

/**
 * Busca saldo de TODAS as adquirentes ativas em paralelo. Usado por
 * /admin01/withdrawals e /admin01/acquirers.
 *
 * CACHE DISTRIBUÍDO (17/07/2026): antes, cada instância serverless da Vercel
 * mantinha seu próprio Map in-memory. Resultado: admin abria /withdrawals e
 * /acquirers e via valores DIFERENTES porque cada request caía em lambda
 * diferente, cada uma com seu cache. Agora persistimos o snapshot em
 * PlatformDefaults.acquirerBalancesCache (JSON) — compartilhado. TTL 60s.
 * Se DB estiver caído, faz fallback pro cache local por-instância.
 */
export async function getAllActiveAcquirerBalances(
  forceFresh = false,
): Promise<AcquirerBalanceResult[]> {
  const acqs = await prisma.acquirer.findMany({
    where: { active: true, globalEnabled: true },
    select: { id: true },
    orderBy: { priority: "asc" },
  });

  // Tenta usar snapshot do DB primeiro (compartilhado entre instâncias)
  if (!forceFresh) {
    const shared = await readSharedBalanceSnapshot(acqs.map((a) => a.id));
    if (shared) return shared;
  }

  // Snapshot expirado ou inexistente → fetch fresh + persiste
  const results = await Promise.allSettled(
    acqs.map((a) => getAcquirerBalance(a.id, forceFresh)),
  );
  const fresh = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return makeResult(
      acqs[i].id,
      "?",
      "?",
      null,
      null,
      "BRL",
      false,
      r.reason instanceof Error ? r.reason.message : "fetch_failed",
    );
  });

  // Persiste snapshot pra próximas leituras (best-effort — não bloqueia)
  writeSharedBalanceSnapshot(fresh).catch((e) => {
    console.warn("[acquirer-balance] falha ao persistir snapshot:", e);
  });

  return fresh;
}

/**
 * Lê snapshot do DB. Retorna null se:
 *   - Snapshot não existe (primeira leitura)
 *   - Snapshot expirado (>60s)
 *   - Snapshot não cobre TODAS as adquirentes pedidas (ex: adicionaram nova)
 *   - DB indisponível
 * Nesses casos, o caller vai buscar fresh e reescrever.
 */
async function readSharedBalanceSnapshot(
  requiredIds: string[],
): Promise<AcquirerBalanceResult[] | null> {
  try {
    const pd = await prisma.platformDefaults.findFirst({
      select: { acquirerBalancesCache: true },
    });
    const cache = pd?.acquirerBalancesCache as
      | Record<string, SharedCacheEntry>
      | null
      | undefined;
    if (!cache) return null;

    const now = Date.now();
    const results: AcquirerBalanceResult[] = [];
    for (const id of requiredIds) {
      const entry = cache[id];
      // Se qualquer adquirente faltando OU stale, invalida snapshot inteiro.
      // Isso mantém a atomicidade: todas as leituras num mesmo painel vêm da
      // mesma foto no tempo, sem misturar dado velho com dado novo.
      if (!entry || entry.expiresAt < now) return null;
      results.push({
        acquirerId: id,
        code: entry.code,
        shortCode: entry.shortCode ?? null,
        nominalName: entry.nominalName,
        institution: entry.institution ?? null,
        accountEmail: entry.accountEmail ?? null,
        accountFingerprint: entry.accountFingerprint ?? null,
        sharedBalanceGroup: entry.sharedBalanceGroup ?? null,
        sharedWith: entry.sharedWith,
        availableCents: entry.availableCents,
        pendingCents: entry.pendingCents,
        currency: entry.currency,
        supported: entry.supported,
        calculated: entry.calculated,
        calcDetails: entry.calcDetails,
        error: entry.error,
        lastFetched: new Date(entry.at).toISOString(),
      });
    }
    return results;
  } catch (e) {
    console.warn("[acquirer-balance] falha ao ler snapshot compartilhado:", e);
    return null;
  }
}

type SharedCacheEntry = {
  code: string;
  shortCode?: string | null;
  nominalName: string;
  institution?: string | null;
  accountEmail?: string | null;
  accountFingerprint?: string | null;
  sharedBalanceGroup?: string | null;
  sharedWith?: string[];
  availableCents: number | null;
  pendingCents: number | null;
  currency: string;
  supported: boolean;
  calculated?: boolean;
  calcDetails?: AcquirerBalanceResult["calcDetails"];
  error?: string;
  at: number;
  expiresAt: number;
};

async function writeSharedBalanceSnapshot(
  results: AcquirerBalanceResult[],
): Promise<void> {
  const now = Date.now();
  const cache: Record<string, SharedCacheEntry> = {};
  for (const r of results) {
    // Cada entrada segue o mesmo TTL do cache local (60s sucesso / 8s erro).
    const ttl = r.error ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
    cache[r.acquirerId] = {
      code: r.code,
      shortCode: r.shortCode ?? null,
      nominalName: r.nominalName,
      institution: r.institution ?? null,
      accountEmail: r.accountEmail ?? null,
      accountFingerprint: r.accountFingerprint ?? null,
      sharedBalanceGroup: r.sharedBalanceGroup ?? null,
      sharedWith: r.sharedWith,
      availableCents: r.availableCents,
      pendingCents: r.pendingCents,
      currency: r.currency,
      supported: r.supported,
      calculated: r.calculated,
      calcDetails: r.calcDetails,
      error: r.error,
      at: now,
      expiresAt: now + ttl,
    };
  }
  // Grava no singleton PlatformDefaults (upsert por id fixo). Não bloqueia se
  // falhar — cache local por-instância ainda funciona como fallback.
  const existing = await prisma.platformDefaults.findFirst({
    select: { id: true },
  });
  if (existing) {
    await prisma.platformDefaults.update({
      where: { id: existing.id },
      data: { acquirerBalancesCache: cache as never },
    });
  } else {
    await prisma.platformDefaults.create({
      data: { acquirerBalancesCache: cache as never },
    });
  }
}

async function fetchByCode(acq: {
  id: string;
  code: string;
  nominalName: string;
  publicKey: string | null;
  secretKeyEnc: string | null;
  metadataEnc: string | null;
}): Promise<AcquirerBalanceResult> {
  const code = acq.code.toLowerCase();

  // ===== SafePix =====
  if (code.startsWith("safepix")) {
    if (!acq.publicKey || !acq.secretKeyEnc) {
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "BRL",
        true,
        "missing_credentials",
      );
    }
    try {
      const secret = decryptString(acq.secretKeyEnc);
      const bal = await getSafePixBalance({
        publicKey: acq.publicKey,
        secretKey: secret,
      });
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        bal.amountCents,
        0,
        "BRL",
        true,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "fetch_failed";
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "BRL",
        true,
        msg,
      );
    }
  }

  // ===== Shark Banking =====
  if (code.startsWith("sharkbanking")) {
    if (!acq.publicKey || !acq.secretKeyEnc) {
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "BRL",
        true,
        "missing_credentials",
      );
    }
    try {
      const secret = decryptString(acq.secretKeyEnc);
      const bal = await getSharkBalance({
        publicKey: acq.publicKey,
        secretKey: secret,
      });
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        bal.amountCents,
        0,
        "BRL",
        true,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "fetch_failed";
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "BRL",
        true,
        msg,
      );
    }
  }

  // ===== SharkHub =====
  // Saldo usa a SAQUE-KEY (metadataEnc.withdrawalKey), NÃO a api-key do
  // secretKeyEnc. Passa pelo proxy de IP fixo (a rota /balance é saque-key,
  // sujeita à allowlist de IP) — se o IP não estiver liberado, vem 403 aqui
  // (charges seguem funcionando direto, sem proxy).
  if (code.startsWith("sharkhub")) {
    let withdrawalKey: string | undefined;
    if (acq.metadataEnc) {
      try {
        const meta = JSON.parse(decryptString(acq.metadataEnc)) as {
          withdrawalKey?: string;
        };
        withdrawalKey = meta.withdrawalKey;
      } catch {
        // metadata inválido → cai em missing_credentials abaixo
      }
    }
    if (!withdrawalKey) {
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "BRL",
        true,
        "missing_credentials",
      );
    }
    try {
      const bal = await getSharkHubBalance(withdrawalKey);
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        bal.amountCents,
        bal.pendingCents,
        "BRL",
        true,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "fetch_failed";
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "BRL",
        true,
        msg,
      );
    }
  }

  // ===== Pluggou =====
  if (code.startsWith("pluggou")) {
    if (!acq.publicKey || !acq.secretKeyEnc) {
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "BRL",
        true,
        "missing_credentials",
      );
    }
    try {
      const secret = decryptString(acq.secretKeyEnc);
      const bal = await getPluggouBalance({
        publicKey: acq.publicKey,
        secretKey: secret,
      });
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        bal.amountCents,
        0,
        "BRL",
        true,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "fetch_failed";
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "BRL",
        true,
        msg,
      );
    }
  }

  // ===== Pixzy =====
  // Bearer token unico (guardado em secretKeyEnc). publicKey nao eh usado
  // pela API, mas mantemos "pixzy" nele pra passar o filtro not-null do
  // resolveWebhookAcquirers.
  if (code.startsWith("pixzy")) {
    if (!acq.secretKeyEnc) {
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "BRL",
        true,
        "missing_credentials",
      );
    }
    try {
      const secret = decryptString(acq.secretKeyEnc);
      const bal = await getPixzyBalance({
        publicKey: acq.publicKey ?? "",
        secretKey: secret,
      });
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        bal.amountCents,
        0,
        "BRL",
        true,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "fetch_failed";
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "BRL",
        true,
        msg,
      );
    }
  }

  // ===== Stripe =====
  if (code.startsWith("stripe")) {
    if (!acq.publicKey || !acq.secretKeyEnc) {
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "USD",
        true,
        "missing_credentials",
      );
    }
    try {
      const secret = decryptString(acq.secretKeyEnc);
      const bal = await getStripeBalance({
        publishableKey: acq.publicKey,
        secretKey: secret,
      });
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        bal.availableCents,
        bal.pendingCents,
        bal.currency,
        true,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "fetch_failed";
      return makeResult(
        acq.id,
        acq.code,
        acq.nominalName,
        null,
        null,
        "USD",
        true,
        msg,
      );
    }
  }

  // ===== Mercado Pago / outros =====
  // API nao expoe balance simples — calculamos a partir das transactions:
  //   net   = SUM(amount - custo_adquirente) WHERE PAID AND acquirer = X
  //         - SUM(amount) WHERE status IN (REFUNDED, CHARGEBACK) AND acquirer = X
  //   custo_adquirente = pixCost/cardCost REAL da adquirente (NAO o fee do
  //   seller). O CAIXA na conta da adquirente = o que entrou (amount) menos
  //   o que ela cobra (cost). O fee do seller eh receita da PLATAFORMA e
  //   FICA na conta — por isso NAO subtraimos fee aqui (era um BUG que fazia
  //   o saldo exibido = net do seller, escondendo o lucro da plataforma).
  //   share = my_gross / total_calc_gross  (proporcao do total processado
  //                                         por acquirers sem API)
  //   ajuste_saques = share * total_paid_withdrawals
  //   saldo_estimado = net - ajuste_saques
  //
  // Por que so subtrai saques nos calculados: pra SafePix/Stripe, a API
  // ja retorna o saldo REAL que ja reflete o que foi swept pra bank
  // (e pago aos sellers). Pros calculados, precisamos estimar.
  //
  // Limitacoes (badge "EST." no UI sinaliza):
  //  - Atribuicao proporcional do saque eh estimativa
  //  - Nao reflete antecipacoes manuais por adquirente
  //  - Nao reflete taxas bancarias adicionais
  const [calc, globalAggs] = await Promise.all([
    calculateBalanceFromTransactions(acq.id),
    getGlobalAggs(),
  ]);

  let withdrawalShareCents = 0;
  if (globalAggs.totalCalculatedGross > 0 && calc.grossCents > 0) {
    const share = calc.grossCents / globalAggs.totalCalculatedGross;
    withdrawalShareCents = Math.round(
      share * globalAggs.totalPaidWithdrawalsCents,
    );
  }
  const finalAvailableCents = calc.netCents - withdrawalShareCents;

  return {
    acquirerId: acq.id,
    code: acq.code,
    nominalName: acq.nominalName,
    availableCents: finalAvailableCents,
    pendingCents: calc.pendingCents,
    currency: "BRL",
    supported: false,
    error: undefined,
    calculated: true,
    calcDetails: { ...calc, withdrawalShareCents, grossCents: calc.grossCents },
    lastFetched: new Date().toISOString(),
  };
}

/**
 * Calcula o CAIXA real na conta de uma adquirente sem API de balance.
 * Usado pra MP e demais adquirentes sem API de saldo.
 *
 * Formula (CAIXA na conta da adquirente, antes de saques):
 *   caixa     = SUM(amount - custo_adquirente) WHERE PAID
 *             - SUM(amount) WHERE REFUNDED|CHARGEBACK
 *   custo_adquirente = round(amount * pixCost%/cardCost%) + fixo, POR metodo
 *   pending   = SUM(amount) WHERE PENDING
 *
 * IMPORTANTE: subtraimos o CUSTO REAL da adquirente (pixCostPercent etc.),
 * NAO o fee do seller. O fee do seller eh receita da plataforma e FICA na
 * conta da adquirente ate o seller sacar. Subtrair o fee (bug antigo) fazia
 * o saldo exibido == net do seller, escondendo 100% do lucro da plataforma.
 *
 * Filtra por providerPayload.acquirer_id pra so contar tx dessa adquirente.
 */
async function calculateBalanceFromTransactions(acquirerId: string): Promise<{
  netCents: number;
  pendingCents: number;
  paidCount: number;
  refundedCount: number;
  grossCents: number;
  acquirerCostCents: number;
}> {
  // Custo configurado da adquirente (o que ELA cobra da plataforma).
  const costCfg = await prisma.acquirer.findUnique({
    where: { id: acquirerId },
    select: {
      pixCostPercent: true,
      pixCostFixedCents: true,
      cardCostPercent: true,
      cardCostFixedCents: true,
    },
  });
  const pixPct = costCfg?.pixCostPercent ?? ACQUIRER_DEFAULT_PIX_COST_PERCENT;
  const pixFix =
    costCfg?.pixCostFixedCents ?? ACQUIRER_DEFAULT_PIX_COST_FIXED_CENTS;
  const cardPct = costCfg?.cardCostPercent ?? ACQUIRER_DEFAULT_CARD_COST_PERCENT;
  const cardFix =
    costCfg?.cardCostFixedCents ?? ACQUIRER_DEFAULT_CARD_COST_FIXED_CENTS;

  // Usa raw query pra filtrar por providerPayload.acquirer_id (JSON path)
  // Prisma JSON filters ficam pesados — raw eh mais direto e indexavel.
  // Agrupa por status + method pra aplicar o custo certo (PIX vs cartao).
  const result = await prisma.$queryRaw<
    Array<{
      status: string;
      method: string;
      sum_amount: bigint | null;
      count: bigint;
    }>
  >`
    SELECT
      "status"::text AS status,
      "method"::text AS method,
      SUM("amountCents") AS sum_amount,
      COUNT(*) AS count
    FROM "Transaction"
    WHERE "providerPayload"->>'acquirer_id' = ${acquirerId}
      AND "status" IN ('PAID', 'REFUNDED', 'CHARGEBACK', 'PENDING')
    GROUP BY "status", "method"
  `;

  let netCents = 0;
  let pendingCents = 0;
  let paidCount = 0;
  let refundedCount = 0;
  let grossCents = 0;
  let acquirerCostCents = 0;

  for (const r of result) {
    const sumAmount = Number(r.sum_amount ?? 0);
    const cnt = Number(r.count);
    if (r.status === "PAID") {
      // Custo REAL que a adquirente reteve (por metodo). O resto (amount -
      // cost) fica na conta da adquirente = caixa da plataforma, que inclui
      // tanto o net do seller quanto o lucro da plataforma.
      let cost: number;
      if (r.method === "PIX") {
        cost = Math.round((sumAmount * pixPct) / 100) + pixFix * cnt;
      } else {
        cost = Math.round((sumAmount * cardPct) / 100) + cardFix * cnt;
      }
      grossCents += sumAmount;
      acquirerCostCents += cost;
      netCents += sumAmount - cost;
      paidCount += cnt;
    } else if (r.status === "REFUNDED" || r.status === "CHARGEBACK") {
      netCents -= sumAmount;
      refundedCount += cnt;
    } else if (r.status === "PENDING") {
      pendingCents += sumAmount;
    }
  }

  return {
    netCents,
    pendingCents,
    paidCount,
    refundedCount,
    grossCents,
    acquirerCostCents,
  };
}

function makeResult(
  acquirerId: string,
  code: string,
  nominalName: string,
  availableCents: number | null,
  pendingCents: number | null,
  currency: string,
  supported: boolean,
  error?: string,
): AcquirerBalanceResult {
  return {
    acquirerId,
    code,
    nominalName,
    availableCents,
    pendingCents,
    currency,
    supported,
    error,
    lastFetched: new Date().toISOString(),
  };
}

/** Soma todos os saldos disponiveis em BRL pra mostrar um total.
 *  Inclui os calculados (sem API) — sao estimativas mas contam pro total. */
export function sumAvailableInCurrency(
  balances: AcquirerBalanceResult[],
  currency: string,
): number {
  return balances
    .filter((b) => b.currency === currency && b.availableCents !== null)
    .reduce((acc, b) => acc + (b.availableCents ?? 0), 0);
}
