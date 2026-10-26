/**
 * RECONCILIAÇÃO de saques AUTOMÁTICOS travados — rede de segurança contra
 * webhook PERDIDO (safepix-transfer não chegou/não processou).
 *
 * Varre saques AUTO (providerId+providerAccount setados) presos em PROCESSING
 * há > STUCK_THRESHOLD e re-consulta a SafePix pela conta que ENVIOU. Se a
 * SafePix confirma PAGO → markWithdrawalPaid; se confirma FALHA → markWithdraw-
 * Failed (estorna). Qualquer resposta AMBÍGUA (401/404/erro/empty) → NÃO mexe
 * (deixa PROCESSING pro admin), pra NUNCA criar saque duplo ou estorno indevido.
 *
 * Idempotente: markWithdrawalPaid/Failed não reprocessam saque já finalizado.
 */
import { prisma } from "./prisma";
import { decryptString } from "./crypto";
import {
  getWithdrawalStatus as safePixWithdrawalStatus,
  isPaidStatus as safePixIsPaid,
  isFailedStatus as safePixIsFailed,
  type SafePixCreds,
} from "./providers/safepix";
import {
  getWithdrawalStatus as pluggouWithdrawalStatus,
  isPaidStatusW as pluggouIsPaid,
  isFailedStatusW as pluggouIsFailed,
} from "./providers/pluggou";
import {
  getWithdrawalStatus as pixzyWithdrawalStatus,
  isPaidStatusW as pixzyIsPaid,
  isFailedStatusW as pixzyIsFailed,
} from "./providers/pixzy";
import { markWithdrawalPaid, markWithdrawalFailed } from "./withdrawals";

/** Resolve a família da adquirente pelo code da conta que ENVIOU o saque.
 *  SafePix + Pluggou + Pixzy. FlevoPay removido em jul/2026.
 *  NOTA: Pixzy nao expoe GET /withdrawals/{id} publico — reconcile vai
 *  sempre bater em UNKNOWN e cair em `stillProcessing`. Mantemos aqui
 *  pra o fluxo funcionar quando eles publicarem o endpoint. */
type PayoutProvider = "safepix" | "pluggou" | "pixzy";

function payoutProviderOf(code: string): PayoutProvider | null {
  if (code.startsWith("safepix")) return "safepix";
  if (code.startsWith("pluggou")) return "pluggou";
  if (code.startsWith("pixzy")) return "pixzy";
  return null;
}

function getWithdrawalStatusFor(
  provider: PayoutProvider,
  providerId: string,
  creds: SafePixCreds,
) {
  if (provider === "pluggou") return pluggouWithdrawalStatus(providerId, creds);
  if (provider === "pixzy") return pixzyWithdrawalStatus(providerId, creds);
  return safePixWithdrawalStatus(providerId, creds);
}
function isPaidFor(provider: PayoutProvider, status: string) {
  if (provider === "pluggou") return pluggouIsPaid(status);
  if (provider === "pixzy") return pixzyIsPaid(status);
  return safePixIsPaid(status);
}
function isFailedFor(provider: PayoutProvider, status: string) {
  if (provider === "pluggou") return pluggouIsFailed(status);
  if (provider === "pixzy") return pixzyIsFailed(status);
  return safePixIsFailed(status);
}

/** PROCESSING há mais que isso = webhook provavelmente perdido. (15 min) */
const STUCK_THRESHOLD_MS = 15 * 60 * 1000;
/** Não varre histórico antigo demais. (3 dias) */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** Teto de saques por execução (ratelimit SafePix/CF). */
const MAX_PER_RUN = 40;

export type ReconcileResult = {
  scanned: number;
  paid: number;
  failed: number;
  stillProcessing: number;
  errors: number;
};

export async function reconcileStuckWithdrawals(): Promise<ReconcileResult> {
  const now = Date.now();
  const stuck = await prisma.withdrawal.findMany({
    where: {
      status: "PROCESSING",
      providerId: { not: null },
      providerAccount: { not: null },
      createdAt: {
        lt: new Date(now - STUCK_THRESHOLD_MS),
        gt: new Date(now - MAX_AGE_MS),
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      providerId: true,
      providerAccount: true,
      amountCents: true,
    },
    take: MAX_PER_RUN,
  });

  const result: ReconcileResult = {
    scanned: stuck.length,
    paid: 0,
    failed: 0,
    stillProcessing: 0,
    errors: 0,
  };
  if (stuck.length === 0) return result;

  // Cache de creds por conta (providerAccount === acquirer.code).
  const credsCache = new Map<
    string,
    { publicKey: string; secretKey: string } | null
  >();
  async function credsFor(code: string) {
    if (credsCache.has(code)) return credsCache.get(code)!;
    const acq = await prisma.acquirer.findUnique({
      where: { code },
      select: { publicKey: true, secretKeyEnc: true },
    });
    let c: { publicKey: string; secretKey: string } | null = null;
    if (acq?.publicKey && acq?.secretKeyEnc) {
      try {
        c = { publicKey: acq.publicKey, secretKey: decryptString(acq.secretKeyEnc) };
      } catch {
        c = null;
      }
    }
    credsCache.set(code, c);
    return c;
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const w of stuck) {
    if (!w.providerId || !w.providerAccount) continue;
    const provider = payoutProviderOf(w.providerAccount);
    if (!provider) {
      // conta de outra família (ex: saque manual antigo) → não reconcilia aqui.
      continue;
    }
    await sleep(1200); // respeita o ratelimit agressivo (Cloudflare)
    const creds = await credsFor(w.providerAccount);
    if (!creds) {
      result.errors++;
      continue;
    }
    try {
      const { status } = await getWithdrawalStatusFor(
        provider,
        w.providerId,
        creds,
      );
      if (isPaidFor(provider, status)) {
        await markWithdrawalPaid(w.id);
        result.paid++;
      } else if (isFailedFor(provider, status)) {
        await markWithdrawalFailed(
          w.id,
          `reconcile: ${provider} confirmou falha na transferência`,
        );
        result.failed++;
      } else {
        // PENDING/PROCESSING do lado da adquirente → ainda em andamento.
        result.stillProcessing++;
      }
    } catch {
      // 401/404/erro/empty = NÃO confirmado. Deixa PROCESSING (admin resolve).
      result.errors++;
    }
  }

  return result;
}
