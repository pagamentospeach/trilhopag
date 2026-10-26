/**
 * AUDITORIA DE SALDO SafePix — tripwire de fraude.
 *
 * Ideia (do david): o saldo das contas SafePix só CAI quando um saque é feito
 * PELO GATEWAY (auto, manual aprovado ou sweep de emergência) ou quando há um
 * reembolso. Se o saldo cair e NADA disso explicar a queda, é sinal de que
 * alguém tirou dinheiro POR FORA (ex: credenciais vazadas) → ALERTA imediato.
 *
 * Como funciona:
 *  - A cada execução (cron), lê o saldo de cada conta e compara com o último
 *    snapshot (PlatformDefaults.safepixBalanceSnapshot).
 *  - Se o TOTAL caiu, soma as saídas LEGÍTIMAS do gateway na janela:
 *      payout dos saques AUTO (providerAccount setado, PAID/PROCESSING)
 *    + payout dos saques MANUAIS aprovados (PAID)
 *    + sweeps de emergência (AdminAuditLog.payload.totalSentCents)
 *    + reembolsos SafePix (Transaction REFUNDED).
 *  - unexplained = queda − explicado. Se > R$ 50 → cria AdminNotification
 *    (crit) que aparece na barra de alertas do admin.
 *
 * LIMITAÇÃO conhecida (v1): usa a VARIAÇÃO LÍQUIDA do saldo. Em período de muita
 * entrada (cobranças caindo), um dreno pode ser parcialmente mascarado pelo que
 * entra. Pega bem o caso real (dreno sem saque, especialmente em período calmo).
 * Tolerância de R$ 50 absorve taxas de transferência da SafePix + timing.
 */
import { prisma } from "./prisma";
import { decryptString } from "./crypto";
import { getBalance as getSafePixBalance } from "./providers/safepix";

/** Ignora quedas menores que isso (ruído de taxa). */
const DROP_FLOOR_CENTS = 500; // R$ 5
/** Alerta quando a parte NÃO explicada passa disso. */
const UNEXPLAINED_THRESHOLD_CENTS = 5000; // R$ 50
/** Folga de tempo pra timing skew entre saque e efeito no saldo. */
const GRACE_MS = 10 * 60 * 1000;
/** Não cria alerta novo se já há um não-resolvido recente (anti-spam). */
const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000;

type Snapshot = {
  at: string;
  total: number;
  accounts: Record<string, number>;
};

export type SafepixAuditResult = {
  ok: boolean;
  baseline?: boolean;
  totalNowCents?: number;
  totalPrevCents?: number;
  dropCents?: number;
  explainedCents?: number;
  unexplainedCents?: number;
  alerted?: boolean;
  accountsRead?: number;
};

export async function auditSafepixBalances(): Promise<SafepixAuditResult> {
  // 1. Lê saldo de cada conta SafePix (em paralelo, best-effort).
  const accts = await prisma.acquirer.findMany({
    where: {
      code: { startsWith: "safepix" },
      active: true,
      supportsPix: true,
      publicKey: { not: null },
      secretKeyEnc: { not: null },
    },
    orderBy: { code: "asc" },
    select: { code: true, publicKey: true, secretKeyEnc: true },
  });

  const reads = await Promise.all(
    accts.map(async (a) => {
      if (!a.publicKey || !a.secretKeyEnc) return null;
      try {
        const bal = await getSafePixBalance({
          publicKey: a.publicKey,
          secretKey: decryptString(a.secretKeyEnc),
        });
        return { code: a.code, cents: bal.amountCents };
      } catch {
        return null;
      }
    }),
  );

  const now: Record<string, number> = {};
  for (const r of reads) if (r) now[r.code] = r.cents;
  const codesNow = Object.keys(now);
  // Se não conseguiu ler NENHUMA conta, não mexe no snapshot (evita falso reset).
  if (codesNow.length === 0) return { ok: false, accountsRead: 0 };

  const pd = await prisma.platformDefaults.findUnique({
    where: { id: "default" },
    select: { safepixBalanceSnapshot: true },
  });
  const prev = (pd?.safepixBalanceSnapshot ?? null) as Snapshot | null;

  const saveSnapshot = async () => {
    const total = codesNow.reduce((s, c) => s + now[c], 0);
    const snap: Snapshot = { at: new Date().toISOString(), total, accounts: now };
    await prisma.platformDefaults.upsert({
      where: { id: "default" },
      create: { id: "default", safepixBalanceSnapshot: snap as never },
      update: { safepixBalanceSnapshot: snap as never },
    });
  };

  // Primeira vez (sem baseline) → só grava e sai.
  if (!prev || !prev.accounts || typeof prev.at !== "string") {
    await saveSnapshot();
    return { ok: true, baseline: true, accountsRead: codesNow.length };
  }

  // 2. Só conta as contas presentes nos DOIS snapshots (evita ruído quando uma
  // conta falhou de ler numa das vezes).
  const shared = codesNow.filter((c) => typeof prev.accounts[c] === "number");
  let totalNow = 0;
  let totalPrev = 0;
  for (const c of shared) {
    totalNow += now[c];
    totalPrev += prev.accounts[c];
  }
  const dropCents = totalPrev - totalNow; // positivo = caiu

  if (dropCents <= DROP_FLOOR_CENTS) {
    await saveSnapshot();
    return {
      ok: true,
      totalNowCents: totalNow,
      totalPrevCents: totalPrev,
      dropCents: Math.max(0, dropCents),
      explainedCents: 0,
      unexplainedCents: 0,
      alerted: false,
      accountsRead: codesNow.length,
    };
  }

  // 3. Saídas LEGÍTIMAS do gateway na janela [prev.at - grace, agora].
  const windowStart = new Date(new Date(prev.at).getTime() - GRACE_MS);
  const [paidWds, processingAutoWds, sweeps, refunds] = await Promise.all([
    // O dinheiro só SAI quando o saque é PAGO → casa pela `paidAt`, NÃO pela
    // createdAt. (Um saque pode ser pedido e só sair muito depois — ex: ficou
    // PENDING e o admin deu Retry. Casar por createdAt jogava ele pra fora da
    // janela e gerava FALSO POSITIVO de "saldo caiu sem explicação".) Vale pra
    // saque auto E manual.
    prisma.withdrawal.findMany({
      where: { status: "PAID", paidAt: { gte: windowStart } },
      select: { amountCents: true, feeCents: true },
    }),
    // Saques AUTO ainda em PROCESSING (timeout ambíguo — pode ter saído).
    prisma.withdrawal.findMany({
      where: {
        status: "PROCESSING",
        providerAccount: { not: null },
        createdAt: { gte: windowStart },
      },
      select: { amountCents: true, feeCents: true },
    }),
    prisma.adminAuditLog.findMany({
      where: { action: "admin.emergency_sweep", createdAt: { gte: windowStart } },
      select: { payload: true },
    }),
    prisma.transaction.findMany({
      where: {
        provider: "safepix",
        status: "REFUNDED",
        refundedAt: { gte: windowStart },
      },
      select: { amountCents: true },
    }),
  ]);

  const payoutSum = (ws: { amountCents: number; feeCents: number }[]) =>
    ws.reduce((s, w) => s + Math.max(0, w.amountCents - w.feeCents), 0);
  const sweepSum = sweeps.reduce(
    (s, l) =>
      s + Number((l.payload as Record<string, unknown> | null)?.totalSentCents ?? 0),
    0,
  );
  const refundSum = refunds.reduce((s, t) => s + t.amountCents, 0);
  const explainedCents =
    payoutSum(paidWds) + payoutSum(processingAutoWds) + sweepSum + refundSum;
  const unexplainedCents = dropCents - explainedCents;

  let alerted = false;
  if (unexplainedCents > UNEXPLAINED_THRESHOLD_CENTS) {
    const recent = await prisma.adminNotification.findFirst({
      where: {
        type: "safepix_balance_drift",
        resolved: false,
        createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (!recent) {
      const brl = (c: number) => `R$ ${(c / 100).toFixed(2)}`;
      await prisma.adminNotification.create({
        data: {
          type: "safepix_balance_drift",
          message: `🚨 Saldo SafePix caiu ${brl(dropCents)}, mas os saques do gateway só explicam ${brl(explainedCents)} — ${brl(unexplainedCents)} SEM EXPLICAÇÃO. Possível saque não autorizado! Verifique as contas SafePix.`,
          payload: {
            dropCents,
            explainedCents,
            unexplainedCents,
            windowStart: windowStart.toISOString(),
            prevTotal: totalPrev,
            nowTotal: totalNow,
            perAccount: shared.map((c) => ({
              code: c,
              prevCents: prev.accounts[c],
              nowCents: now[c],
              deltaCents: now[c] - prev.accounts[c],
            })),
          } as never,
        },
      });
    }
    alerted = true;
  }

  await saveSnapshot();
  return {
    ok: true,
    totalNowCents: totalNow,
    totalPrevCents: totalPrev,
    dropCents,
    explainedCents,
    unexplainedCents,
    alerted,
    accountsRead: codesNow.length,
  };
}
