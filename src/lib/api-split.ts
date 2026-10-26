import { prisma } from "./prisma";

/**
 * SPLIT VIA API PÚBLICA (integração com bots de Telegram, SaaS, etc).
 *
 * Permite que o seller, ao criar uma cobrança via API, divida o líquido da
 * venda com OUTRA conta Trilho (um "recebedor"/parceiro). Quando a venda é
 * PAGA, o valor do split sai do líquido do seller e é creditado no
 * balanceCents do recebedor — exatamente como o mecanismo de referrer já faz
 * (referrer_earnings_cents), então não introduz nenhuma classe nova de risco
 * de saldo: reaproveita o mesmo caminho de release (instantâneo + cron).
 *
 * Persistência: gravamos o split resolvido no providerPayload da Transaction:
 *   providerPayload.split = {
 *     recipient_user_id: "<cuid>",
 *     recipient_label:   "parceiro@email.com",
 *     amount_cents:      1234
 *   }
 *
 * Os crons de release (holding-release.ts) e o crédito instantâneo
 * (transactions.ts markTransactionPaid) leem esse bloco via
 * readSplitFromPayload() e creditam o recebedor.
 */

export interface SplitInput {
  /** Email OU user id (cuid) da conta Trilho que vai receber o split. */
  recipient: string;
  /** Valor fixo do split em centavos. Use ISTO ou `percent` — não ambos. */
  amount_cents?: number | null;
  /** Percentual (0..100) sobre o LÍQUIDO da venda (após taxas). */
  percent?: number | null;
}

export interface ResolvedSplit {
  recipientUserId: string;
  recipientLabel: string;
  amountCents: number;
}

export type ResolveSplitResult =
  | { ok: true; split: ResolvedSplit }
  | { ok: false; error: string; message: string };

/**
 * Resolve + valida o recebedor e calcula o valor do split em centavos.
 *
 * Regras:
 *  - recipient precisa ser uma conta Trilho existente (email ou user id).
 *  - recipient não pode ser a própria conta do seller.
 *  - exatamente UM entre amount_cents e percent.
 *  - split >= 1 centavo e <= netCents (não pode exceder o líquido da venda;
 *    a plataforma e o referrer já têm prioridade sobre a taxa).
 */
export async function resolveSplit(opts: {
  sellerUserId: string;
  split: SplitInput;
  /** Líquido da venda (após taxas da plataforma) — base do percent + teto. */
  netCents: number;
}): Promise<ResolveSplitResult> {
  const raw = (opts.split.recipient ?? "").trim();
  if (!raw) {
    return {
      ok: false,
      error: "split_recipient_required",
      message: "split.recipient é obrigatório (email ou user id do recebedor)",
    };
  }

  const recipient = await prisma.user.findFirst({
    where: raw.includes("@") ? { email: raw.toLowerCase() } : { id: raw },
    select: { id: true, email: true },
  });
  if (!recipient) {
    return {
      ok: false,
      error: "split_recipient_not_found",
      message:
        "split.recipient não corresponde a nenhuma conta Trilho (use o email ou o user id do recebedor)",
    };
  }
  if (recipient.id === opts.sellerUserId) {
    return {
      ok: false,
      error: "split_recipient_self",
      message: "split.recipient não pode ser a própria conta do seller",
    };
  }

  const hasAmount =
    typeof opts.split.amount_cents === "number" &&
    Number.isFinite(opts.split.amount_cents);
  const hasPercent =
    typeof opts.split.percent === "number" &&
    Number.isFinite(opts.split.percent);
  if (hasAmount === hasPercent) {
    return {
      ok: false,
      error: "split_amount_invalid",
      message:
        "Informe split.amount_cents OU split.percent (exatamente um dos dois)",
    };
  }

  let amountCents: number;
  if (hasAmount) {
    amountCents = Math.round(opts.split.amount_cents as number);
  } else {
    amountCents = Math.round((opts.netCents * (opts.split.percent as number)) / 100);
  }

  if (amountCents < 1) {
    return {
      ok: false,
      error: "split_amount_invalid",
      message: "O valor do split precisa ser >= 1 centavo",
    };
  }
  if (amountCents > opts.netCents) {
    return {
      ok: false,
      error: "split_exceeds_net",
      message: `O split (${amountCents} centavos) não pode exceder o líquido da venda (${opts.netCents} centavos, após as taxas da plataforma)`,
    };
  }

  return {
    ok: true,
    split: {
      recipientUserId: recipient.id,
      recipientLabel: recipient.email,
      amountCents,
    },
  };
}

/** Formata o split resolvido pro providerPayload da Transaction. */
export function splitToPayload(split: ResolvedSplit) {
  return {
    recipient_user_id: split.recipientUserId,
    recipient_label: split.recipientLabel,
    amount_cents: split.amountCents,
  };
}

/**
 * Lê o split persistido no providerPayload de uma Transaction. Usado pelos
 * caminhos de release (crédito instantâneo + cron) pra creditar o recebedor.
 * Retorna null se não houver split válido.
 */
export function readSplitFromPayload(
  payload: unknown,
): { recipientUserId: string; amountCents: number } | null {
  const p = payload as Record<string, unknown> | null;
  const s = p?.["split"] as Record<string, unknown> | undefined;
  if (!s) return null;
  const recipientUserId =
    typeof s.recipient_user_id === "string" ? s.recipient_user_id : null;
  const amountCents =
    typeof s.amount_cents === "number" ? Math.round(s.amount_cents) : 0;
  if (!recipientUserId || amountCents < 1) return null;
  return { recipientUserId, amountCents };
}
