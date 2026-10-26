import { prisma } from "./prisma";
import { resolveWebhookAcquirers, recordAcquirerApproval } from "./acquirers";
import {
  getPaymentStatus as getAbacateStatus,
  isPaidStatus as isAbacatePaidStatus,
  isRefundedStatus as isAbacateRefundedStatus,
} from "./providers/abacatepay";
import {
  getPaymentStatus as getSharkStatus,
  isPaidStatus as isSharkPaidStatus,
  isRefundedStatus as isSharkRefundedStatus,
} from "./providers/sharkbanking";
import {
  getPaymentStatus as getCajuStatus,
  isPaidStatus as isCajuPaidStatus,
  isChargedbackStatus as isCajuChargedbackStatus,
  isRefundedStatus as isCajuRefundedStatus,
} from "./providers/caju";
import {
  getPaymentStatus as getAsaasStatus,
  isPaidStatus as isAsaasPaidStatus,
  isRefundedStatus as isAsaasRefundedStatus,
} from "./providers/asaas";
import { decryptString } from "./crypto";
import {
  markTransactionPaid,
  markTransactionRefunded,
  markTransactionChargedback,
} from "./transactions";

export type ReconcileResult = {
  provider: string;
  scanned: number;
  checked: number;
  paidRecovered: number;
  errors: number;
  recoveredIds: string[];
};

/**
 * REDE DE SEGURANÇA contra webhook PERDIDO da AbacatePay.
 *
 * Contexto (auditoria jun/2026): a AbacatePay manda o secret na QUERY STRING
 * e o handler de webhook BLOQUEIA (401) se `ABACATEPAY_WEBHOOK_SECRET` não
 * estiver no env. Resultado: vendas PIX pagas ficavam presas em PENDING — o
 * webhook chegava mas era rejeitado, e não havia reconciliador pra AbacatePay.
 * Várias vendas reais "não caíram".
 *
 * Este reconciliador varre as PENDING recentes da AbacatePay e RE-CONSULTA o
 * status DIRETO na API (`GET /pixQrCode/check`, a MESMA fonte de verdade que o
 * webhook usa no passo anti-forja). Se a adquirente diz "PAID", marca a venda
 * paga pelo MESMO caminho do webhook (markTransactionPaid → credita saldo,
 * dispara UTMify/pixels/notificações). Idempotente — não re-credita PAID.
 *
 * Isto torna o crédito robusto INDEPENDENTE do webhook: mesmo que o secret
 * esteja errado, que a AbacatePay mande um evento que não assinamos, ou que o
 * POST se perca, a venda paga cai em até 10 min (intervalo do cron).
 *
 * A AbacatePay tem só Bearer (sem publicKey) — guardamos a API key na
 * `secretKey` das creds; `publicKey` é ignorada por getPaymentStatus.
 */
export async function reconcilePendingAbacatePay(opts?: {
  lookbackDays?: number;
  max?: number;
}): Promise<ReconcileResult> {
  const lookbackDays = opts?.lookbackDays ?? 4;
  const max = opts?.max ?? 600;
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const pend = await prisma.$queryRaw<
    Array<{
      id: string;
      providerId: string | null;
      userId: string;
      acquirer_id: string | null;
    }>
  >`
    SELECT id, "providerId", "userId", "providerPayload"->>'acquirer_id' AS acquirer_id
    FROM "Transaction"
    WHERE provider = 'abacatepay'
      AND status = 'PENDING'
      AND "providerId" IS NOT NULL
      AND "createdAt" >= ${since}
      AND "divertedToAcquirer" = false
      AND "divertedToReferrer" = false
    ORDER BY "createdAt" DESC
    LIMIT ${max}
  `;

  // Decripta as creds de todas as contas AbacatePay uma vez (a API key vai na
  // secretKey; publicKey é ignorada — mas resolveWebhookAcquirers exige
  // publicKey IS NOT NULL, e as contas AbacatePay têm publicKey preenchida).
  const acqs = await resolveWebhookAcquirers("abacatepay", null);
  const credsById = new Map<string, { publicKey: string; secretKey: string }>();
  for (const a of acqs) {
    if (!a.secretKeyEnc) continue;
    try {
      credsById.set(a.id, {
        publicKey: a.publicKey ?? "",
        secretKey: decryptString(a.secretKeyEnc),
      });
    } catch {
      // conta com credencial corrompida — ignora
    }
  }
  const allCredEntries = [...credsById.entries()];

  let checked = 0;
  let paidRecovered = 0;
  let errors = 0;
  const recoveredIds: string[] = [];

  async function processOne(tx: (typeof pend)[number]) {
    const acqId = tx.acquirer_id;

    // Conta originadora primeiro; depois as demais (cred pode diferir).
    const ordered: Array<{ publicKey: string; secretKey: string }> = [
      ...(acqId && credsById.has(acqId) ? [credsById.get(acqId)!] : []),
      ...allCredEntries
        .filter(([id]) => id !== acqId)
        .map(([, creds]) => creds),
    ];
    if (ordered.length === 0) {
      errors++;
      return;
    }

    let confirmed: string | null = null;
    for (const creds of ordered) {
      try {
        const s = await getAbacateStatus(tx.providerId!, creds);
        if (s?.status && s.status !== "UNKNOWN") {
          confirmed = s.status;
          break;
        }
      } catch {
        // credencial errada pra essa conta — tenta a próxima
      }
    }
    if (confirmed === null) {
      errors++;
      return;
    }
    checked++;
    if (isAbacatePaidStatus(confirmed)) {
      try {
        await markTransactionPaid(tx.id);
        if (acqId) {
          await recordAcquirerApproval(acqId, tx.userId).catch(() => {});
        }
        paidRecovered++;
        recoveredIds.push(tx.id);
      } catch (e) {
        errors++;
        console.error("[reconcile] abacatepay markTransactionPaid falhou", tx.id, e);
      }
    }
  }

  const CONCURRENCY = 8;
  for (let i = 0; i < pend.length; i += CONCURRENCY) {
    await Promise.all(pend.slice(i, i + CONCURRENCY).map(processOne));
  }

  if (paidRecovered > 0) {
    console.log(
      `[reconcile] abacatepay recuperou ${paidRecovered} venda(s) paga(s) presa(s) em PENDING:`,
      recoveredIds,
    );
  }
  return {
    provider: "abacatepay",
    scanned: pend.length,
    checked,
    paidRecovered,
    errors,
    recoveredIds,
  };
}

export type RefundReconcileResult = {
  provider: string;
  scanned: number;
  checked: number;
  refundedRecovered: number;
  errors: number;
  refundedIds: string[];
};

/**
 * REDE DE SEGURANÇA contra MED PIX / reembolso PERDIDO da AbacatePay.
 *
 * Contexto: quando o cliente abre um MED (reembolso PIX do Banco Central) na
 * conta AbacatePay, a venda — que já estava PAGA — vira REFUNDED no PSP. Isso
 * deveria chegar via webhook `transparent.refunded`, mas se o webhook for
 * bloqueado (faltando ABACATEPAY_WEBHOOK_SECRET), perdido, ou o evento não for
 * assinado, o reembolso NUNCA aparecia no admin e NUNCA era descontado do
 * seller — a plataforma comia o prejuízo silenciosamente.
 *
 * Diferente de reconcilePendingAbacatePay (que só olha PENDING→PAID), este varre
 * as vendas PAID recentes e RE-CONSULTA o status na API (a MESMA fonte de
 * verdade do webhook). Se a adquirente diz "REFUNDED", marca a venda reembolsada
 * pelo MESMO caminho do webhook (markTransactionRefunded → reverte o saldo
 * creditado + taxa, dispara webhook/UTMify). Idempotente — não re-estorna.
 *
 * Janela: MED PIX pode ser aberto dias após o pagamento, então olhamos um
 * lookback maior (default 45 dias). Pula vendas com fake_refund (reembolso
 * intencional da plataforma — não é MED real).
 */
export async function reconcileRefundedAbacatePay(opts?: {
  lookbackDays?: number;
  max?: number;
}): Promise<RefundReconcileResult> {
  const lookbackDays = opts?.lookbackDays ?? 45;
  const max = opts?.max ?? 800;
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const paid = await prisma.$queryRaw<
    Array<{
      id: string;
      providerId: string | null;
      userId: string;
      acquirer_id: string | null;
    }>
  >`
    SELECT id, "providerId", "userId", "providerPayload"->>'acquirer_id' AS acquirer_id
    FROM "Transaction"
    WHERE provider = 'abacatepay'
      AND status = 'PAID'
      AND "providerId" IS NOT NULL
      AND "createdAt" >= ${since}
      AND "divertedToAcquirer" = false
      AND "divertedToReferrer" = false
      AND COALESCE("providerPayload"->>'fake_refund', '') <> 'true'
    ORDER BY "createdAt" DESC
    LIMIT ${max}
  `;

  const acqs = await resolveWebhookAcquirers("abacatepay", null);
  const credsById = new Map<string, { publicKey: string; secretKey: string }>();
  for (const a of acqs) {
    if (!a.secretKeyEnc) continue;
    try {
      credsById.set(a.id, {
        publicKey: a.publicKey ?? "",
        secretKey: decryptString(a.secretKeyEnc),
      });
    } catch {
      // conta com credencial corrompida — ignora
    }
  }
  const allCredEntries = [...credsById.entries()];

  let checked = 0;
  let refundedRecovered = 0;
  let errors = 0;
  const refundedIds: string[] = [];

  async function processOne(tx: (typeof paid)[number]) {
    const acqId = tx.acquirer_id;
    const ordered: Array<{ publicKey: string; secretKey: string }> = [
      ...(acqId && credsById.has(acqId) ? [credsById.get(acqId)!] : []),
      ...allCredEntries
        .filter(([id]) => id !== acqId)
        .map(([, creds]) => creds),
    ];
    if (ordered.length === 0) {
      errors++;
      return;
    }

    let confirmed: string | null = null;
    for (const creds of ordered) {
      try {
        const s = await getAbacateStatus(tx.providerId!, creds);
        if (s?.status && s.status !== "UNKNOWN") {
          confirmed = s.status;
          break;
        }
      } catch {
        // credencial errada pra essa conta — tenta a próxima
      }
    }
    if (confirmed === null) {
      errors++;
      return;
    }
    checked++;
    if (isAbacateRefundedStatus(confirmed)) {
      try {
        await markTransactionRefunded(tx.id);
        refundedRecovered++;
        refundedIds.push(tx.id);
      } catch (e) {
        errors++;
        console.error(
          "[reconcile] abacatepay markTransactionRefunded falhou",
          tx.id,
          e,
        );
      }
    }
  }

  const CONCURRENCY = 8;
  for (let i = 0; i < paid.length; i += CONCURRENCY) {
    await Promise.all(paid.slice(i, i + CONCURRENCY).map(processOne));
  }

  if (refundedRecovered > 0) {
    console.log(
      `[reconcile] abacatepay detectou ${refundedRecovered} reembolso(s)/MED não processado(s):`,
      refundedIds,
    );
  }
  return {
    provider: "abacatepay",
    scanned: paid.length,
    checked,
    refundedRecovered,
    errors,
    refundedIds,
  };
}

/**
 * REDE DE SEGURANÇA contra webhook PERDIDO da Shark Banking (PENDING→PAID).
 *
 * A Shark não tem secret de webhook documentado — o handler depende 100% de
 * re-confirmação via API. Se o POST do webhook se perder, a venda paga ficaria
 * presa em PENDING. Este reconciliador varre as PENDING recentes e re-consulta
 * GET /v1/transactions/{id}; se a Shark diz "paid"/"approved", marca paga pelo
 * MESMO caminho do webhook (markTransactionPaid). Idempotente.
 */
export async function reconcilePendingSharkBanking(opts?: {
  lookbackDays?: number;
  max?: number;
}): Promise<ReconcileResult> {
  const lookbackDays = opts?.lookbackDays ?? 4;
  const max = opts?.max ?? 600;
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const pend = await prisma.$queryRaw<
    Array<{
      id: string;
      providerId: string | null;
      userId: string;
      acquirer_id: string | null;
    }>
  >`
    SELECT id, "providerId", "userId", "providerPayload"->>'acquirer_id' AS acquirer_id
    FROM "Transaction"
    WHERE provider = 'sharkbanking'
      AND status = 'PENDING'
      AND "providerId" IS NOT NULL
      AND "createdAt" >= ${since}
      AND "divertedToAcquirer" = false
      AND "divertedToReferrer" = false
    ORDER BY "createdAt" DESC
    LIMIT ${max}
  `;

  const acqs = await resolveWebhookAcquirers("sharkbanking", null);
  const credsById = new Map<string, { publicKey: string; secretKey: string }>();
  for (const a of acqs) {
    if (!a.secretKeyEnc) continue;
    try {
      credsById.set(a.id, {
        publicKey: a.publicKey ?? "",
        secretKey: decryptString(a.secretKeyEnc),
      });
    } catch {
      // credencial corrompida — ignora
    }
  }
  const allCredEntries = [...credsById.entries()];

  let checked = 0;
  let paidRecovered = 0;
  let errors = 0;
  const recoveredIds: string[] = [];

  async function processOne(tx: (typeof pend)[number]) {
    const acqId = tx.acquirer_id;
    const ordered: Array<{ publicKey: string; secretKey: string }> = [
      ...(acqId && credsById.has(acqId) ? [credsById.get(acqId)!] : []),
      ...allCredEntries
        .filter(([id]) => id !== acqId)
        .map(([, creds]) => creds),
    ];
    if (ordered.length === 0) {
      errors++;
      return;
    }

    let confirmed: string | null = null;
    for (const creds of ordered) {
      try {
        const s = await getSharkStatus(tx.providerId!, creds);
        if (s?.status && s.status !== "UNKNOWN") {
          confirmed = s.status;
          break;
        }
      } catch {
        // credencial errada pra essa conta — tenta a próxima
      }
    }
    if (confirmed === null) {
      errors++;
      return;
    }
    checked++;
    if (isSharkPaidStatus(confirmed)) {
      try {
        await markTransactionPaid(tx.id);
        if (acqId) {
          await recordAcquirerApproval(acqId, tx.userId).catch(() => {});
        }
        paidRecovered++;
        recoveredIds.push(tx.id);
      } catch (e) {
        errors++;
        console.error(
          "[reconcile] sharkbanking markTransactionPaid falhou",
          tx.id,
          e,
        );
      }
    }
  }

  const CONCURRENCY = 8;
  for (let i = 0; i < pend.length; i += CONCURRENCY) {
    await Promise.all(pend.slice(i, i + CONCURRENCY).map(processOne));
  }

  if (paidRecovered > 0) {
    console.log(
      `[reconcile] sharkbanking recuperou ${paidRecovered} venda(s) paga(s) presa(s) em PENDING:`,
      recoveredIds,
    );
  }
  return {
    provider: "sharkbanking",
    scanned: pend.length,
    checked,
    paidRecovered,
    errors,
    recoveredIds,
  };
}

/**
 * REDE DE SEGURANCA da Asaas: PENDING que na verdade ja foi pago.
 *
 * 10/08/2026 — escrito DEPOIS de acontecer. O primeiro PIX real de R$5 foi
 * pago e ficou preso em PENDING porque o webhook estava cadastrado no painel
 * da Asaas mas com `enabled: false`. Sem este varredor, dinheiro que entrou
 * na conta simplesmente nao aparecia pro seller, e ninguem saberia sem olhar
 * o painel da Asaas na mao.
 *
 * A Asaas ainda tem um jeito PROPRIO de interromper entrega: 15 respostas
 * fora de 2xx seguidas pausam a fila, e evento parado mais de 14 dias e
 * apagado em definitivo. Ou seja, aqui o webhook nao e "quase sempre
 * confiavel" — ele tem um mecanismo documentado que PERDE evento. Este cron
 * e o que garante o credito mesmo assim.
 */
export async function reconcilePendingAsaas(opts?: {
  lookbackDays?: number;
  max?: number;
}): Promise<ReconcileResult> {
  const lookbackDays = opts?.lookbackDays ?? 4;
  const max = opts?.max ?? 600;
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const pend = await prisma.$queryRaw<
    Array<{
      id: string;
      providerId: string | null;
      userId: string;
      acquirer_id: string | null;
    }>
  >`
    SELECT id, "providerId", "userId", "providerPayload"->>'acquirer_id' AS acquirer_id
    FROM "Transaction"
    WHERE provider = 'asaas'
      AND status = 'PENDING'
      AND "providerId" IS NOT NULL
      AND "createdAt" >= ${since}
      AND "divertedToAcquirer" = false
      AND "divertedToReferrer" = false
    ORDER BY "createdAt" DESC
    LIMIT ${max}
  `;

  const acqs = await resolveWebhookAcquirers("asaas", null);
  const credsById = new Map<string, { publicKey: string; secretKey: string }>();
  for (const a of acqs) {
    if (!a.secretKeyEnc) continue;
    try {
      credsById.set(a.id, {
        publicKey: a.publicKey ?? "",
        secretKey: decryptString(a.secretKeyEnc),
      });
    } catch {
      // credencial corrompida — ignora
    }
  }
  const allCredEntries = [...credsById.entries()];

  let checked = 0;
  let paidRecovered = 0;
  let errors = 0;
  const recoveredIds: string[] = [];

  async function processOne(tx: (typeof pend)[number]) {
    const acqId = tx.acquirer_id;
    const ordered: Array<{ publicKey: string; secretKey: string }> = [
      ...(acqId && credsById.has(acqId) ? [credsById.get(acqId)!] : []),
      ...allCredEntries
        .filter(([id]) => id !== acqId)
        .map(([, creds]) => creds),
    ];
    if (ordered.length === 0) {
      errors++;
      return;
    }

    let confirmed: string | null = null;
    for (const creds of ordered) {
      try {
        const s = await getAsaasStatus(tx.providerId!, creds);
        if (s?.status && s.status !== "UNKNOWN") {
          confirmed = s.status;
          break;
        }
      } catch {
        // credencial errada pra essa conta — tenta a próxima
      }
    }
    if (confirmed === null) {
      errors++;
      return;
    }
    checked++;
    if (isAsaasPaidStatus(confirmed)) {
      try {
        await markTransactionPaid(tx.id);
        if (acqId) {
          await recordAcquirerApproval(acqId, tx.userId).catch(() => {});
        }
        paidRecovered++;
        recoveredIds.push(tx.id);
      } catch (e) {
        errors++;
        console.error(
          "[reconcile] asaas markTransactionPaid falhou",
          tx.id,
          e,
        );
      }
    }
  }

  const CONCURRENCY = 8;
  for (let i = 0; i < pend.length; i += CONCURRENCY) {
    await Promise.all(pend.slice(i, i + CONCURRENCY).map(processOne));
  }

  if (paidRecovered > 0) {
    console.log(
      `[reconcile] asaas recuperou ${paidRecovered} venda(s) paga(s) presa(s) em PENDING:`,
      recoveredIds,
    );
  }
  return {
    provider: "asaas",
    scanned: pend.length,
    checked,
    paidRecovered,
    errors,
    recoveredIds,
  };
}

/**
 * REDE DE SEGURANÇA contra MED PIX / reembolso PERDIDO da Shark Banking
 * (PAID→REFUNDED). Varre as PAID recentes e re-consulta a API; se a Shark diz
 * "refunded"/"chargeback", estorna pelo MESMO caminho do webhook
 * (markTransactionRefunded). Idempotente. Pula fake_refund (estorno interno).
 */
export async function reconcileRefundedSharkBanking(opts?: {
  lookbackDays?: number;
  max?: number;
}): Promise<RefundReconcileResult> {
  const lookbackDays = opts?.lookbackDays ?? 45;
  const max = opts?.max ?? 800;
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const paid = await prisma.$queryRaw<
    Array<{
      id: string;
      providerId: string | null;
      userId: string;
      acquirer_id: string | null;
    }>
  >`
    SELECT id, "providerId", "userId", "providerPayload"->>'acquirer_id' AS acquirer_id
    FROM "Transaction"
    WHERE provider = 'sharkbanking'
      AND status = 'PAID'
      AND "providerId" IS NOT NULL
      AND "createdAt" >= ${since}
      AND "divertedToAcquirer" = false
      AND "divertedToReferrer" = false
      AND COALESCE("providerPayload"->>'fake_refund', '') <> 'true'
    ORDER BY "createdAt" DESC
    LIMIT ${max}
  `;

  const acqs = await resolveWebhookAcquirers("sharkbanking", null);
  const credsById = new Map<string, { publicKey: string; secretKey: string }>();
  for (const a of acqs) {
    if (!a.secretKeyEnc) continue;
    try {
      credsById.set(a.id, {
        publicKey: a.publicKey ?? "",
        secretKey: decryptString(a.secretKeyEnc),
      });
    } catch {
      // credencial corrompida — ignora
    }
  }
  const allCredEntries = [...credsById.entries()];

  let checked = 0;
  let refundedRecovered = 0;
  let errors = 0;
  const refundedIds: string[] = [];

  async function processOne(tx: (typeof paid)[number]) {
    const acqId = tx.acquirer_id;
    const ordered: Array<{ publicKey: string; secretKey: string }> = [
      ...(acqId && credsById.has(acqId) ? [credsById.get(acqId)!] : []),
      ...allCredEntries
        .filter(([id]) => id !== acqId)
        .map(([, creds]) => creds),
    ];
    if (ordered.length === 0) {
      errors++;
      return;
    }

    let confirmed: string | null = null;
    for (const creds of ordered) {
      try {
        const s = await getSharkStatus(tx.providerId!, creds);
        if (s?.status && s.status !== "UNKNOWN") {
          confirmed = s.status;
          break;
        }
      } catch {
        // credencial errada pra essa conta — tenta a próxima
      }
    }
    if (confirmed === null) {
      errors++;
      return;
    }
    checked++;
    if (isSharkRefundedStatus(confirmed)) {
      try {
        await markTransactionRefunded(tx.id);
        refundedRecovered++;
        refundedIds.push(tx.id);
      } catch (e) {
        errors++;
        console.error(
          "[reconcile] sharkbanking markTransactionRefunded falhou",
          tx.id,
          e,
        );
      }
    }
  }

  const CONCURRENCY = 8;
  for (let i = 0; i < paid.length; i += CONCURRENCY) {
    await Promise.all(paid.slice(i, i + CONCURRENCY).map(processOne));
  }

  if (refundedRecovered > 0) {
    console.log(
      `[reconcile] sharkbanking detectou ${refundedRecovered} reembolso(s)/MED não processado(s):`,
      refundedIds,
    );
  }
  return {
    provider: "sharkbanking",
    scanned: paid.length,
    checked,
    refundedRecovered,
    errors,
    refundedIds,
  };
}

/* ============================== CAJU ============================== */

/**
 * REDE DE SEGURANÇA contra webhook PERDIDO da Caju (01/08/2026, davi:
 * "conecta aqui denovo a caju com o gateway").
 *
 * Por que a Caju não tinha reconciliador até hoje: ela simplesmente NÃO
 * tinha endpoint de status funcional. O antigo
 * `/api/bravive-payment-status/{txid}` devolvia HTTP 200 com corpo
 * {"message":"Payment not found"} pra QUALQUER txid — inclusive os que
 * acabaram de ser criados. Sem fonte de verdade consultável, o webhook era
 * a única forma de saber que uma venda foi paga: webhook perdido = venda
 * presa em PENDING pra sempre.
 *
 * Agora existe `GET /api/vendas/{txid}/status` e ele funciona, então a Caju
 * ganha a mesma rede que AbacatePay e SharkBanking já tinham.
 *
 * DIFERENÇA das outras: não itera credenciais por adquirente. A consulta de
 * status só aceita a api_key MASTER (a sub-key devolve 404 até pra venda
 * que ela mesma criou), então uma única key cobre as 5 sub-keys de uma vez.
 * Sem CAJU_API_KEY no env, retorna cedo em vez de queimar rate limit.
 */
export async function reconcilePendingCaju(opts?: {
  lookbackDays?: number;
  max?: number;
}): Promise<ReconcileResult> {
  const empty: ReconcileResult = {
    provider: "caju",
    scanned: 0,
    checked: 0,
    paidRecovered: 0,
    errors: 0,
    recoveredIds: [],
  };
  if (!process.env.CAJU_API_KEY) {
    console.warn(
      "[reconcile] caju pulado — CAJU_API_KEY (api_key master) não configurada",
    );
    return empty;
  }

  const lookbackDays = opts?.lookbackDays ?? 4;
  const max = opts?.max ?? 600;
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const pend = await prisma.$queryRaw<
    Array<{
      id: string;
      providerId: string | null;
      userId: string;
      acquirer_id: string | null;
    }>
  >`
    SELECT id, "providerId", "userId", "providerPayload"->>'acquirer_id' AS acquirer_id
    FROM "Transaction"
    WHERE provider = 'caju'
      AND status = 'PENDING'
      AND "providerId" IS NOT NULL
      AND "createdAt" >= ${since}
      AND "divertedToAcquirer" = false
      AND "divertedToReferrer" = false
    ORDER BY "createdAt" DESC
    LIMIT ${max}
  `;

  let checked = 0;
  let paidRecovered = 0;
  let errors = 0;
  const recoveredIds: string[] = [];

  async function processOne(tx: (typeof pend)[number]) {
    let confirmed: string;
    try {
      const s = await getCajuStatus(tx.providerId!);
      confirmed = s.status;
    } catch {
      // Venda não encontrada / Caju fora do ar. Não é erro nosso — a
      // próxima rodada do cron tenta de novo.
      errors++;
      return;
    }
    checked++;
    if (isCajuPaidStatus(confirmed)) {
      try {
        await markTransactionPaid(tx.id);
        if (tx.acquirer_id) {
          await recordAcquirerApproval(tx.acquirer_id, tx.userId).catch(
            () => {},
          );
        }
        paidRecovered++;
        recoveredIds.push(tx.id);
      } catch (e) {
        errors++;
        console.error("[reconcile] caju markTransactionPaid falhou", tx.id, e);
      }
    }
  }

  // Concorrência 4 (metade das outras): a Caju roda no Render e responde em
  // ~1-8s com cold start. Mandar 8 em paralelo derruba o backend deles.
  const CONCURRENCY = 4;
  for (let i = 0; i < pend.length; i += CONCURRENCY) {
    await Promise.all(pend.slice(i, i + CONCURRENCY).map(processOne));
  }

  if (paidRecovered > 0) {
    console.log(
      `[reconcile] caju recuperou ${paidRecovered} venda(s) paga(s) presa(s) em PENDING:`,
      recoveredIds,
    );
  }
  return {
    provider: "caju",
    scanned: pend.length,
    checked,
    paidRecovered,
    errors,
    recoveredIds,
  };
}

/**
 * REDE DE SEGURANÇA contra MED PIX PERDIDO da Caju (PAID→CHARGEBACK).
 *
 * O endpoint de status devolve "MED" quando o cliente aciona o Mecanismo
 * Especial de Devolução do PIX. Sem isso, um MED cujo webhook se perdeu
 * deixaria o seller com saldo que o banco já tirou de volta.
 *
 * Pula `fake_refund` (estorno interno da plataforma) pelo mesmo motivo do
 * reconciliador da Shark: não é a adquirente que estornou.
 */
export async function reconcileMedCaju(opts?: {
  lookbackDays?: number;
  max?: number;
}): Promise<{
  provider: string;
  scanned: number;
  checked: number;
  refundedRecovered: number;
  errors: number;
  refundedIds: string[];
}> {
  const empty = {
    provider: "caju",
    scanned: 0,
    checked: 0,
    refundedRecovered: 0,
    errors: 0,
    refundedIds: [] as string[],
  };
  if (!process.env.CAJU_API_KEY) return empty;

  const lookbackDays = opts?.lookbackDays ?? 7;
  const max = opts?.max ?? 400;
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const paid = await prisma.$queryRaw<
    Array<{ id: string; providerId: string | null }>
  >`
    SELECT id, "providerId"
    FROM "Transaction"
    WHERE provider = 'caju'
      AND status = 'PAID'
      AND "providerId" IS NOT NULL
      AND "createdAt" >= ${since}
      AND COALESCE(("providerPayload"->>'fake_refund')::boolean, false) = false
    ORDER BY "createdAt" DESC
    LIMIT ${max}
  `;

  let checked = 0;
  let refundedRecovered = 0;
  let errors = 0;
  const refundedIds: string[] = [];

  async function processOne(tx: (typeof paid)[number]) {
    let confirmed: string;
    try {
      const s = await getCajuStatus(tx.providerId!);
      confirmed = s.status;
    } catch {
      errors++;
      return;
    }
    checked++;
    const isMed = isCajuChargedbackStatus(confirmed);
    const isRefund = isCajuRefundedStatus(confirmed);
    if (!isMed && !isRefund) return;
    try {
      if (isMed) await markTransactionChargedback(tx.id);
      else await markTransactionRefunded(tx.id);
      refundedRecovered++;
      refundedIds.push(tx.id);
    } catch (e) {
      errors++;
      console.error("[reconcile] caju MED/refund falhou", tx.id, e);
    }
  }

  const CONCURRENCY = 4;
  for (let i = 0; i < paid.length; i += CONCURRENCY) {
    await Promise.all(paid.slice(i, i + CONCURRENCY).map(processOne));
  }

  if (refundedRecovered > 0) {
    console.log(
      `[reconcile] caju detectou ${refundedRecovered} MED/reembolso não processado(s):`,
      refundedIds,
    );
  }
  return {
    provider: "caju",
    scanned: paid.length,
    checked,
    refundedRecovered,
    errors,
    refundedIds,
  };
}
