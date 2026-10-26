/**
 * INTEGRIDADE PRÉ-SAQUE — a camada final contra vendas forjadas.
 *
 * Contexto (16/07/2026): pentester forjou vendas via webhook exploit (fix
 * whs já deployado em `security/webhook-secret.ts`). Como defesa em
 * PROFUNDIDADE, esta camada bloqueia saque automático quando o total de
 * saldos internos dos sellers > total real depositado nas adquirentes.
 *
 * Como funciona:
 *   totalUsersBalance  = SUM(User.balanceCents + pendingBalanceCents + reservedBalanceCents)
 *   totalAcquirers     = SUM(getBalance() de todas as contas SafePix+Pluggou+SharkHub+SharkBanking)
 *
 *   drift = totalUsersBalance - totalAcquirers
 *   driftPct = drift / totalUsersBalance
 *
 *   Se drift positivo E > toleranceCents E driftPct > tolerancePct:
 *     → BLOQUEIA saque automático. Sinal de forjagem.
 *
 * NÃO ATRAPALHA SAQUE LEGÍTIMO porque:
 *   1. Cache 60s — 1 leitura de saldos serve pra dezenas de saques.
 *   2. Tolerância dupla (cents E %) absorve taxas, latência, snapshot skew.
 *   3. FAIL-OPEN se >50% das adquirentes não responderem — hiccup de rede
 *      não pode travar todos os saques da plataforma.
 *   4. Roda em paralelo com pouca CPU — sem impacto em UX.
 *
 * FAIL-CLOSED APENAS quando drift claramente positivo E acima de ambos os
 * threshold (o attacker forjou → drift positivo grande). Se drift negativo
 * (adquirentes com mais dinheiro que interno = normal em period de vendas
 * caindo mas ainda não processadas) → OK.
 *
 * Complementa (não substitui):
 *   - `withdrawal-audit.ts` — balance drift por-seller no DB (não vê SafePix).
 *   - `safepix-balance-audit.ts` — dreno de saldo sem saque (retrospectivo).
 *   - `webhook-secret.ts` — whs no postback URL (previne forjagem).
 */
import { prisma } from "./prisma";
import { decryptString } from "./crypto";
import { getBalance as getSafePixBalance } from "./providers/safepix";
import { getBalance as getPluggouBalance } from "./providers/pluggou";
import { getBalance as getPixzyBalance } from "./providers/pixzy";
import { getBalance as getSharkBanking } from "./providers/sharkbanking";
import { getBalance as getSharkHub } from "./providers/sharkhub";

/** Tolerância absoluta (cents). Absorve taxas + timing. R$ 500. */
const TOLERANCE_CENTS = 50_000;
/** Tolerância relativa (%). Absorve platform que cresceu rápido e ainda tem
 *  vendas na "pendência do PSP". 2%. */
const TOLERANCE_PCT = 0.02;
/** TTL do cache em ms. */
const CACHE_TTL_MS = 60 * 1000;
/** % mínimo de adquirentes que devem responder pra decisão ser confiável. */
const MIN_RESPONDING_PCT = 0.5;

export type IntegrityResult = {
  ok: boolean;
  reason?: string;
  totalUsersBalanceCents: number;
  totalAcquirersCents: number;
  driftCents: number;
  driftPct: number;
  respondingAccounts: number;
  totalAccounts: number;
  cached: boolean;
  checkedAt: string;
};

type CacheEntry = { at: number; result: IntegrityResult };
let cache: CacheEntry | null = null;

/** Zera cache (útil pra testes ou após rodar reconcile manual). */
export function clearIntegrityCache(): void {
  cache = null;
}

export async function checkPlatformBalanceIntegrity(): Promise<IntegrityResult> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.result, cached: true };
  }

  // 1. Total interno de todos os sellers
  const agg = await prisma.user.aggregate({
    _sum: {
      balanceCents: true,
      pendingBalanceCents: true,
      reservedBalanceCents: true,
    },
    where: { blocked: false },
  });
  const totalUsersBalanceCents =
    (agg._sum.balanceCents ?? 0) +
    (agg._sum.pendingBalanceCents ?? 0) +
    (agg._sum.reservedBalanceCents ?? 0);

  // 2. Total nas adquirentes — todas contas PIX ativas
  const accts = await prisma.acquirer.findMany({
    where: {
      OR: [
        { code: { startsWith: "safepix" } },
        { code: { startsWith: "pluggou" } },
        { code: { startsWith: "sharkbanking" } },
        { code: { startsWith: "sharkhub" } },
      ],
      active: true,
      supportsPix: true,
      publicKey: { not: null },
      secretKeyEnc: { not: null },
    },
    select: { code: true, publicKey: true, secretKeyEnc: true },
  });

  const balances = await Promise.all(
    accts.map(async (a) => {
      if (!a.publicKey || !a.secretKeyEnc) return null;
      try {
        const secretKey = decryptString(a.secretKeyEnc);
        const creds = { publicKey: a.publicKey, secretKey };
        let cents = 0;
        if (a.code.startsWith("safepix")) {
          const r = await getSafePixBalance(creds);
          cents = r.amountCents;
        } else if (a.code.startsWith("pluggou")) {
          const r = await getPluggouBalance(creds);
          cents = r.amountCents;
        } else if (a.code.startsWith("pixzy")) {
          const r = await getPixzyBalance(creds);
          cents = r.amountCents;
        } else if (a.code.startsWith("sharkbanking")) {
          const r = await getSharkBanking(creds);
          cents = r.amountCents;
        } else if (a.code.startsWith("sharkhub")) {
          // SharkHub API usa withdrawalKey (string), não par de creds
          const r = await getSharkHub(creds.secretKey);
          cents = r.amountCents;
        }
        return { code: a.code, cents };
      } catch (e) {
        console.warn(
          `[integrity-check] saldo falhou ${a.code}:`,
          e instanceof Error ? e.message.slice(0, 100) : String(e),
        );
        return null;
      }
    }),
  );

  const responding = balances.filter(
    (b): b is { code: string; cents: number } => b !== null,
  );
  const totalAcquirersCents = responding.reduce((s, b) => s + b.cents, 0);
  const respondingPct = accts.length === 0 ? 0 : responding.length / accts.length;

  const driftCents = totalUsersBalanceCents - totalAcquirersCents;
  const driftPct =
    totalUsersBalanceCents === 0 ? 0 : driftCents / totalUsersBalanceCents;

  // Se poucas adquirentes responderam, resultado NÃO é confiável.
  // Fail-OPEN — deixa saque seguir pra não travar tudo por hiccup de rede.
  if (respondingPct < MIN_RESPONDING_PCT) {
    const result: IntegrityResult = {
      ok: true,
      reason: `insufficient_responses (${responding.length}/${accts.length})`,
      totalUsersBalanceCents,
      totalAcquirersCents,
      driftCents,
      driftPct,
      respondingAccounts: responding.length,
      totalAccounts: accts.length,
      cached: false,
      checkedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), result };
    console.warn("[integrity-check] fail-open (poucas contas responderam)", {
      responding: responding.length,
      total: accts.length,
    });
    return result;
  }

  // Drift positivo = interno > real = fraude potencial.
  // Drift negativo = real > interno = normal (vendas pendentes de processamento).
  const failsAbsolute = driftCents > TOLERANCE_CENTS;
  const failsPct = driftPct > TOLERANCE_PCT;
  const ok = !(failsAbsolute && failsPct);

  const result: IntegrityResult = {
    ok,
    reason: ok
      ? undefined
      : `drift_exceeded (drift=R$${(driftCents / 100).toFixed(2)}, ${(driftPct * 100).toFixed(2)}%)`,
    totalUsersBalanceCents,
    totalAcquirersCents,
    driftCents,
    driftPct,
    respondingAccounts: responding.length,
    totalAccounts: accts.length,
    cached: false,
    checkedAt: new Date().toISOString(),
  };

  // Alerta admin quando drift positivo E respondeu maioria. Não spamma —
  // dedup por hora via AdminNotification.
  if (!ok) {
    try {
      const dedupWindow = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await prisma.adminNotification.findFirst({
        where: { type: "balance_integrity_alert", createdAt: { gt: dedupWindow } },
        select: { id: true },
      });
      if (!recent) {
        await prisma.adminNotification.create({
          data: {
            type: "balance_integrity_alert",
            message: `ALERTA CRÍTICO: saldo interno excede real das adquirentes em R$ ${(driftCents / 100).toFixed(2)} (${(driftPct * 100).toFixed(2)}%). Saques automáticos BLOQUEADOS. Investigar vendas forjadas.`,
            payload: {
              totalUsersBalanceCents,
              totalAcquirersCents,
              driftCents,
              driftPct,
              respondingAccounts: responding.length,
              totalAccounts: accts.length,
              accounts: responding,
              checkedAt: result.checkedAt,
            },
          },
        });
      }
    } catch (e) {
      console.error("[integrity-check] falha ao criar alerta:", e);
    }
  }

  cache = { at: Date.now(), result };
  return result;
}
