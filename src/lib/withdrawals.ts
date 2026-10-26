import { prisma } from "./prisma";
import {
  auditWithdrawalRequest,
  hasBlockingFlag,
  type WithdrawalAuditReport,
} from "./withdrawal-audit";
import { dispatchEvent } from "./webhooks";
import { notificarSaque } from "./notifications";

/** Payload público de um saque pra webhook (withdrawal.paid / failed). */
function serializeWithdrawalForWebhook(w: {
  id: string;
  amountCents: number;
  feeCents: number;
  method: string;
  pixKey: string;
  walletAddress: string | null;
  status: string;
  failReason?: string | null;
  paidAt?: Date | null;
}) {
  return {
    id: w.id,
    object: "withdrawal",
    status: w.status,
    method: w.method,
    amount_cents: w.amountCents,
    fee_cents: w.feeCents,
    net_cents: Math.max(0, w.amountCents - w.feeCents),
    pix_key: w.method === "pix" ? w.pixKey : null,
    wallet_address: w.method === "usdt_solana" ? w.walletAddress : null,
    fail_reason: w.failReason ?? null,
    paid_at: w.paidAt?.toISOString() ?? null,
  };
}

/**
 * NOVA POLÍTICA: TODOS os saques são MANUAIS por segurança.
 *
 * Antes esta lib chamava SafePix automaticamente quando o admin aprovava.
 * Agora NÃO. O admin só clica em "aprovar" DEPOIS de ter mandado o PIX/USDT
 * manualmente via app do banco / exchange. A aprovação é apenas a marcação
 * "✓ enviei" no sistema, que muda o status pra PAID e dispara email.
 *
 * Justificativa: integração automática com PSP tem risco de:
 *  - Vazamento de credenciais
 *  - Exploits que disparam saques duplicados
 *  - Erros de webhook que travam dinheiro
 *
 * Saque manual é mais lento mas é 100% controlável.
 */

// 08/08/2026: os números saíram deste arquivo pra lib/withdrawal-limits.ts.
// O formulário de saque é "use client" e não pode importar daqui (este módulo
// puxa prisma), então ele mantinha uma cópia à mão do mínimo — que divergiu e
// dizia R$ 30 enquanto o servidor exigia R$ 50. Agora os dois leem o mesmo
// módulo neutro. A explicação longa está lá.
import {
  MIN_WITHDRAWAL_CENTS,
  MIN_USDT_CENTS,
  WITHDRAWAL_FEE_CENTS,
  USDT_FIXED_FEE_CENTS,
  USDT_PERCENT_FEE,
} from "./withdrawal-limits";

export class WithdrawalError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type WithdrawalMethod = "pix" | "usdt_solana";

/**
 * Calcula a taxa total cobrada num saque. Pra PIX é fixo
 * (user.withdrawalFeeCents). Pra USDT é 1% do amount (sem fixo).
 */
export function computeWithdrawalFee(
  amountCents: number,
  method: WithdrawalMethod,
  userPixFeeCents: number,
): number {
  if (method === "usdt_solana") {
    return Math.round(amountCents * USDT_PERCENT_FEE) + USDT_FIXED_FEE_CENTS;
    // 1% do amount, sem taxa fixa (davi 23/07/2026)
  }
  return userPixFeeCents;
}

export async function requestWithdrawal(input: {
  userId: string;
  amountCents: number;
  method?: WithdrawalMethod;
  /** Chave PIX (obrigatório se method=pix) */
  pixKey?: string;
  pixKeyType?: "cpf" | "cnpj" | "evp" | "phone" | "email";
  /** Wallet Solana (obrigatório se method=usdt_solana) */
  walletAddress?: string;
}) {
  // DEPLOYMENT LOCK (05/07/2026): saque so pode acontecer no gateway
  // autorizado. Clone tenta sacar → erro generico.
  const { assertAuthorizedDeployment } = await import(
    "./security/deployment-guard"
  );
  try {
    assertAuthorizedDeployment();
  } catch {
    throw new WithdrawalError(
      "service_unavailable",
      "Serviço indisponível. Tente novamente em alguns minutos.",
    );
  }

  const { userId } = input;
  const method: WithdrawalMethod = input.method ?? "pix";
  const amountCents = Math.floor(input.amountCents);

  // Validações de método
  if (method === "pix") {
    if (!input.pixKey || !input.pixKeyType) {
      throw new WithdrawalError(
        "missing_pix_key",
        "Informe a chave Pix e o tipo.",
      );
    }
    if (amountCents < MIN_WITHDRAWAL_CENTS) {
      throw new WithdrawalError(
        "amount_below_minimum",
        `Valor mínimo de saque PIX é R$ ${(MIN_WITHDRAWAL_CENTS / 100).toFixed(2)}.`,
      );
    }
  } else if (method === "usdt_solana") {
    if (!input.walletAddress || input.walletAddress.trim().length < 30) {
      throw new WithdrawalError(
        "missing_wallet",
        "Informe um endereço Solana válido (mín. 30 caracteres).",
      );
    }
    if (amountCents < MIN_USDT_CENTS) {
      throw new WithdrawalError(
        "amount_below_minimum_usdt",
        `Valor mínimo do saque USDT P2P é R$ ${(MIN_USDT_CENTS / 100).toFixed(2)}.`,
      );
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      balanceCents: true,
      blocked: true,
      withdrawalFeeCents: true,
      withdrawalAuditBypass: true,
    },
  });
  if (!user) throw new WithdrawalError("not_found", "Usuário não encontrado.");
  if (user.blocked)
    throw new WithdrawalError("blocked", "Conta bloqueada para saques.");
  // POLITICA jun/2026: Player Divulgador EH conta real (User com flag pra
  // criar sub-contas FAKE). O saldo dele eh real (vendas dele) — saque
  // tinha sido bloqueado por engano. Agora libera: a flag so afeta a
  // capacidade de criar sub-contas DivulgadorAccount, NAO saque.

  const feeCents = computeWithdrawalFee(
    amountCents,
    method,
    user.withdrawalFeeCents ?? WITHDRAWAL_FEE_CENTS,
  );

  // CRITICAL FIX (jun/2026): taxa estava sendo cobrada DUAS vezes.
  // - Antes: totalDebit = amount + fee  AND  seller recebia amount - fee.
  //   Seller pedia R$100 → balance -R$109.90 + recebia R$90.10 = custo R$19.80
  //   (R$ 9.90 × 2). Bug reportado pelo seller joao falcao.
  // - Agora: totalDebit = amount. Seller recebe amount - fee. Custo = fee 1x.
  //   Admin envia "Enviar via PIX: R$ X,XX" = amount - fee (ja era assim).
  const totalDebit = amountCents;

  if (user.balanceCents < totalDebit) {
    throw new WithdrawalError(
      "insufficient_balance",
      `Saldo insuficiente. Você tem R$ ${(user.balanceCents / 100).toFixed(2)} e precisa de R$ ${(totalDebit / 100).toFixed(2)}.`,
    );
  }

  // ===== AUDITORIA AUTOMATICA =====
  // Roda antes da criacao. Se ha flag "block" (drift, sem vendas, refund
  // rate critica, etc), nega imediatamente. Senao salva o relatorio na
  // Withdrawal pra admin ver os warnings na hora de aprovar.
  let auditReport: WithdrawalAuditReport;
  try {
    auditReport = await auditWithdrawalRequest(userId, amountCents);
  } catch (e) {
    // Auditoria nunca deve quebrar o fluxo — se falhar, registra erro mas
    // permite saque ir com flag generica de "audit_unavailable" pro admin.
    console.error("[withdrawals] audit failed:", e);
    auditReport = {
      flags: [
        {
          code: "audit_unavailable",
          severity: "warn",
          message: "Auditoria automatica falhou — revisar manualmente.",
        },
      ],
      score: 30,
      computedAt: new Date().toISOString(),
      balanceMatch: {
        ok: false,
        drift: 0,
        paidNetCents: 0,
        refundedNetCents: 0,
        chargebackNetCents: 0,
        withdrawnCents: 0,
        pendingWithdrawalCents: 0,
        expectedBalance: 0,
        actualBalance: user.balanceCents,
      },
      ratios: { refundRate: 0, chargebackRate: 0, totalSales: 0 },
      velocity: { withdrawalsLast24h: 0, withdrawalsLast7d: 0 },
    };
  }

  // A auditoria BLOQUEIA normalmente (pra TODO mundo). A única exceção é um
  // seller marcado individualmente como liberado (withdrawalAuditBypass): só
  // ESSE seller passa direto, mesmo com flag de block — os outros seguem
  // bloqueados igual. A trava de saldo (mais abaixo) continua valendo sempre.
  if (hasBlockingFlag(auditReport) && !user.withdrawalAuditBypass) {
    const blockers = auditReport.flags
      .filter((f) => f.severity === "block")
      .map((f) => f.message)
      .join(" | ");
    throw new WithdrawalError(
      "audit_blocked",
      `Solicitacao bloqueada pela auditoria automatica: ${blockers}. Contate o suporte pra revisao manual.`,
    );
  }
  if (hasBlockingFlag(auditReport) && user.withdrawalAuditBypass) {
    console.warn(
      "[withdrawals] seller liberado individualmente (withdrawalAuditBypass) — block ignorado:",
      userId,
      auditReport.flags.filter((f) => f.severity === "block").map((f) => f.code),
    );
  }

  // BULLETPROOF (jun/2026): defesa em CAMADAS contra duplo saque:
  //
  // 1. Transaction atomica TS:
  //    a) Re-check de saque aberto via findFirst (rapido, evita IO em
  //       caso comum quando nao ha race)
  //    b) Debito condicional via updateMany WHERE balance >= total
  //    c) CREATE withdrawal — pode falhar com P2002 se outra request
  //       conseguiu criar antes
  //
  // 2. DB-LEVEL partial unique index `withdrawal_one_open_per_user`:
  //    UNIQUE (userId) WHERE status IN ('PENDING', 'PROCESSING').
  //    Mesmo que duas requests passem da re-verificacao TS (TOCTOU race
  //    nas milisegundos do find+create), apenas UMA consegue inserir.
  //    Postgres rejeita a outra com unique_violation (P2002) e essa
  //    chamada retorna mensagem amigavel pro seller.
  //
  // Apos detectar P2002, REVERTEMOS o debito do balance (refund) pra
  // nao perder dinheiro do seller.
  let withdrawal;
  try {
    withdrawal = await prisma.$transaction(async (db) => {
      // 1. Re-check de saque aberto (race-safe, otimizacao caso feliz)
      const openWithdrawal = await db.withdrawal.findFirst({
        where: {
          userId,
          status: { in: ["PENDING", "PROCESSING"] },
        },
        select: {
          id: true,
          status: true,
          method: true,
          amountCents: true,
        },
      });
      if (openWithdrawal) {
        throw new WithdrawalError(
          "withdrawal_in_progress",
          `Você já tem um saque ${
            openWithdrawal.status === "PROCESSING"
              ? "em processamento"
              : "aguardando aprovação"
          } de R$ ${(openWithdrawal.amountCents / 100).toFixed(2)} (${openWithdrawal.method === "usdt_solana" ? "USDT" : "PIX"}). Aguarde finalizar antes de pedir outro.`,
        );
      }

      // 2. Débito condicional (race-safe via WHERE balanceCents >= totalDebit)
      const updateResult = await db.user.updateMany({
        where: { id: userId, balanceCents: { gte: totalDebit } },
        data: { balanceCents: { decrement: totalDebit } },
      });
      if (updateResult.count === 0) {
        throw new WithdrawalError(
          "insufficient_balance",
          "Saldo insuficiente. Verifique sua carteira.",
        );
      }

      // 3. Cria withdrawal — persiste relatorio da auditoria pra admin
      return db.withdrawal.create({
        data: {
          userId,
          amountCents,
          feeCents,
          method,
          pixKey: method === "pix" ? (input.pixKey ?? "") : "",
          pixKeyType: method === "pix" ? (input.pixKeyType ?? "evp") : "n/a",
          walletAddress: method === "usdt_solana" ? input.walletAddress?.trim() ?? null : null,
          status: "PENDING",
          auditReport: auditReport as never,
          auditScore: auditReport.score,
        },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // P2002 = unique constraint violation. So acontece se nosso index
    // `withdrawal_one_open_per_user` rejeitar — significa que outra
    // request conseguiu criar PENDING entre nosso re-check e o create.
    // Reverte o debito que ja foi aplicado (se foi) e mostra erro amigavel.
    if (msg.includes("withdrawal_one_open_per_user") || msg.includes("P2002")) {
      // Reverte o debito (best-effort — pode ja ter sido revertido pelo
      // rollback da transaction, mas garantia extra)
      await prisma.user
        .update({
          where: { id: userId },
          data: { balanceCents: { increment: totalDebit } },
        })
        .catch(() => {});
      throw new WithdrawalError(
        "withdrawal_in_progress",
        "Você já tem um saque pendente. Aguarde a conclusão antes de pedir outro.",
      );
    }
    throw e;
  }

  // Email de "saque solicitado" REMOVIDO (17/07/2026, política de emails).

  // SAQUE AUTOMÁTICO (PIX only) — best-effort, NUNCA quebra o fluxo. O saque já
  // está PENDING e o saldo já foi debitado: se o auto-withdraw não rolar (seller
  // sem flag, saldo disperso entre contas, kill-switch, teto diário, erro), o
  // saque simplesmente fica PENDING pro admin enviar manual — igual a hoje.
  // A transição PENDING→PROCESSING lá dentro é atômica (idempotência).
  if (method === "pix") {
    try {
      const { tryAutoWithdraw } = await import("./auto-withdrawal");
      await tryAutoWithdraw(withdrawal.id);
    } catch (e) {
      console.error("[withdrawals] auto-withdraw error:", e);
    }
  }

  return { withdrawal, providerId: null };
}

/**
 * Aprovação do admin — APENAS marca como PAID. NÃO chama PSP nenhum.
 * Admin já mandou PIX/USDT manualmente antes de clicar em aprovar.
 *
 * Idempotente: se já foi PAID, retorna o estado atual sem efeito.
 */
export async function adminApproveWithdrawal(
  withdrawalId: string,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const w = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      id: true,
      userId: true,
      amountCents: true,
      feeCents: true,
      pixKey: true,
      walletAddress: true,
      method: true,
      status: true,
    },
  });
  if (!w) return { ok: false, error: "Saque não encontrado" };
  if (w.status === "PAID") {
    return { ok: true, status: "PAID" }; // idempotente
  }
  // Aceita PENDING (manual) E PROCESSING (saque AUTO que saiu mas ficou preso
  // sem o webhook confirmar — a SafePix não tem API de status, então o admin
  // confirma na mão depois de ver que caiu).
  if (w.status !== "PENDING" && w.status !== "PROCESSING") {
    return { ok: false, error: `Saque já está como ${w.status}` };
  }

  // Trava atômica: PENDING/PROCESSING → PAID.
  const upd = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: { in: ["PENDING", "PROCESSING"] } },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (upd.count === 0) {
    return { ok: false, error: "Saque já foi processado por outro admin" };
  }

  // Email de confirmação pro seller REMOVIDO (17/07/2026, política).

  // Push notification — fire-and-forget
  try {
    const { sendPushToUser } = await import("./push");
    sendPushToUser(
      w.userId,
      {
        title: "✅ Saque pago",
        body: `R$ ${(w.amountCents / 100).toFixed(2).replace(".", ",")} foi enviado pra sua chave PIX`,
        url: "/dashboard/saques",
        kind: "withdraw",
        event: "withdrawal",
        vars: {
          amount: `R$ ${(w.amountCents / 100).toFixed(2).replace(".", ",")}`,
        },
      },
      { onlyIfWithdrawalPaid: true },
    ).catch(() => {});
  } catch {
    // push opcional — nao bloqueia
  }

  // Webhook withdrawal.paid — fire-and-forget (não bloqueia a aprovação).
  dispatchEvent(
    w.userId,
    "withdrawal.paid",
    serializeWithdrawalForWebhook({ ...w, status: "PAID", paidAt: new Date() }),
  ).catch(() => {});
  // 09/08/2026: sino. Mesmo ponto do webhook — o saque ja foi confirmado.
  await notificarSaque({ userId: w.userId, ok: true, amountCents: w.amountCents });

  return { ok: true, status: "PAID" };
}

/**
 * Rejeição do admin — recusa o saque, estorna o saldo. Idempotente.
 */
export async function adminRejectWithdrawal(
  withdrawalId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const w = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      id: true,
      userId: true,
      amountCents: true,
      feeCents: true,
      method: true,
      pixKey: true,
      walletAddress: true,
      status: true,
      createdAt: true,
    },
  });
  if (!w) return { ok: false, error: "Saque não encontrado" };
  if (w.status !== "PENDING") {
    return {
      ok: false,
      error: `Saque já está como ${w.status} — não pode ser rejeitado`,
    };
  }

  const reject = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: "PENDING" },
    data: {
      status: "REJECTED",
      failReason: reason.slice(0, 500),
    },
  });
  if (reject.count === 0) {
    return { ok: false, error: "Saque já foi processado por outro admin" };
  }

  // Estorna saldo. Politica jun/2026: debit = amount (sem fee).
  // OBS: saques HISTORICOS (criados antes do fix) tinham debit = amount+fee.
  // Pra reject de saque LEGADO PENDING, ainda devemos retornar amount+fee
  // pra match com o que foi debitado. Identificamos via createdAt: < dia
  // do deploy do fix (definido como 2026-06-05 00:00 UTC, ajustar se
  // necessario) → refund amount+fee. >= deploy → refund amount.
  const FIX_DEPLOYED_AT = new Date("2026-06-05T00:00:00Z");
  const refundAmount =
    w.createdAt < FIX_DEPLOYED_AT
      ? w.amountCents + w.feeCents
      : w.amountCents;
  await prisma.user.update({
    where: { id: w.userId },
    data: { balanceCents: { increment: refundAmount } },
  });

  // Email de reject REMOVIDO (17/07/2026, política).

  dispatchEvent(
    w.userId,
    "withdrawal.failed",
    serializeWithdrawalForWebhook({
      id: w.id,
      amountCents: w.amountCents,
      feeCents: w.feeCents,
      method: w.method,
      pixKey: w.pixKey,
      walletAddress: w.walletAddress,
      status: "REJECTED",
      failReason: reason,
    }),
  ).catch(() => {});

  return { ok: true };
}

/**
 * markWithdrawalPaid — usado pelo webhook do SafePix em saques antigos.
 * Mantido pra retrocompatibilidade com saques que ainda estão em PROCESSING.
 */
export async function markWithdrawalPaid(withdrawalId: string) {
  const updateResult = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: { not: "PAID" } },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (updateResult.count === 0) {
    return prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  }
  const updated = await prisma.withdrawal.findUniqueOrThrow({
    where: { id: withdrawalId },
    include: { user: { select: { name: true, email: true } } },
  });
  // Email de "saque pago" REMOVIDO (17/07/2026, política).
  dispatchEvent(
    updated.userId,
    "withdrawal.paid",
    serializeWithdrawalForWebhook(updated),
  ).catch(() => {});
  // 09/08/2026: sino. Mesmo ponto do webhook — o saque ja foi confirmado.
  await notificarSaque({
    userId: updated.userId,
    ok: true,
    amountCents: updated.amountCents,
  });
  return updated;
}

/**
 * markWithdrawalFailed — usado pelo webhook do SafePix em saques antigos.
 */
export async function markWithdrawalFailed(
  withdrawalId: string,
  reason: string,
) {
  const before = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      id: true,
      userId: true,
      amountCents: true,
      feeCents: true,
      method: true,
      pixKey: true,
      walletAddress: true,
      status: true,
      createdAt: true,
    },
  });
  if (!before) return null;
  if (before.status === "FAILED" || before.status === "REJECTED") {
    return before;
  }

  const upd = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: { in: ["PENDING", "PROCESSING"] } },
    data: { status: "FAILED", failReason: reason.slice(0, 500) },
  });
  if (upd.count === 0) return before;

  // Reembolsa saldo (só uma vez). Idem reject — saques pre-fix tinham
  // debit = amount+fee; pos-fix tem debit = amount.
  const FIX_DEPLOYED_AT = new Date("2026-06-05T00:00:00Z");
  const refundAmount =
    before.createdAt < FIX_DEPLOYED_AT
      ? before.amountCents + before.feeCents
      : before.amountCents;
  await prisma.user.update({
    where: { id: before.userId },
    data: { balanceCents: { increment: refundAmount } },
  });

  // Email de "saque falhou" REMOVIDO (17/07/2026, política).

  dispatchEvent(
    before.userId,
    "withdrawal.failed",
    serializeWithdrawalForWebhook({
      id: before.id,
      amountCents: before.amountCents,
      feeCents: before.feeCents,
      method: before.method,
      pixKey: before.pixKey,
      walletAddress: before.walletAddress,
      status: "FAILED",
      failReason: reason,
    }),
  ).catch(() => {});

  return before;
}

export {
  MIN_WITHDRAWAL_CENTS,
  MIN_USDT_CENTS,
  WITHDRAWAL_FEE_CENTS,
  USDT_FIXED_FEE_CENTS,
  USDT_PERCENT_FEE,
};
