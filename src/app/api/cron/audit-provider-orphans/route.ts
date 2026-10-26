import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptString } from "@/lib/crypto";
import { normalizeAcquirerCodeToProvider } from "@/lib/acquirers";
import {
  markTransactionChargedback,
  markTransactionExpired,
  markTransactionPaid,
  markTransactionRefunded,
} from "@/lib/transactions";
import * as safepix from "@/lib/providers/safepix";
import * as sharkbanking from "@/lib/providers/sharkbanking";
import * as sharkhub from "@/lib/providers/sharkhub";
import * as pluggou from "@/lib/providers/pluggou";
import * as abacatepay from "@/lib/providers/abacatepay";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AUDITOR de PROVIDER ORPHANS (07/07/2026, david: "isso nunca mais pode
 * acontecer, conserta isso").
 *
 * Contexto: quando `Transaction.provider` era salvo com sufixo (ex:
 * "pluggou-black" em vez de "pluggou"), o webhook do PSP nunca achava a
 * tx e o pagamento ficava orfao (PENDING pra sempre). O guard rail no
 * prisma.ts agora previne isso na GRAVACAO, mas existe uma janela de
 * risco: qualquer tx criada ANTES do fix (ou por bug futuro que bypasse
 * o guard) ficaria presa. Este cron eh a rede de seguranca.
 *
 * Estrategia (a cada 15min):
 *   1. Busca tx PENDING com provider contendo "-" (sufixo)
 *   2. Normaliza pro family name
 *   3. Re-consulta status na API do provider correspondente
 *   4. Se PAID → markTransactionPaid (dispara todo fluxo normal)
 *   5. Se REFUNDED / CHARGEBACK / FAILED → mark correspondente
 *   6. Se PENDING → deixa (cliente ainda vai pagar; proxima execucao rechecka)
 *
 * Idempotente: markTransaction* usam updateMany condicional, nao credita
 * duas vezes.
 */

const FAMILIES = [
  "safepix",
  "mercadopago",
  "abacatepay",
  "sharkbanking",
  "sharkhub",
  "pluggou",
];

type StatusOutcome = {
  status: string;
  isPaid: boolean;
  isRefunded: boolean;
  isFailed: boolean;
  isChargeback: boolean;
};

async function statusForProvider(
  family: string,
  providerId: string,
  creds: { publicKey: string; secretKey: string },
): Promise<StatusOutcome | null> {
  const build = (
    raw: string,
    is: {
      paid: boolean;
      refunded: boolean;
      failed: boolean;
      chargeback: boolean;
    },
  ): StatusOutcome => ({
    status: raw,
    isPaid: is.paid,
    isRefunded: is.refunded,
    isFailed: is.failed,
    isChargeback: is.chargeback,
  });
  if (family === "safepix") {
    const s = await safepix.getPaymentStatus(providerId, creds);
    const st = String(s.status ?? "");
    return build(st, {
      paid: safepix.isPaidStatus(st),
      refunded: safepix.isRefundedStatus(st),
      failed: safepix.isFailedStatus(st),
      chargeback: false,
    });
  }
  if (family === "pluggou") {
    const s = await pluggou.getPaymentStatus(providerId, creds);
    const st = String(s.status ?? "");
    return build(st, {
      paid: pluggou.isPaidStatus(st),
      refunded: pluggou.isRefundedStatus(st),
      failed: pluggou.isFailedStatus(st),
      chargeback: pluggou.isChargedbackStatus(st),
    });
  }
  if (family === "sharkhub") {
    // SharkHub tem signature diferente: (paymentId, apiKey: string).
    // A api-key vai no `creds.secretKey`.
    const s = await sharkhub.getPaymentStatus(providerId, creds.secretKey);
    const st = String(s.status ?? "");
    return build(st, {
      paid: sharkhub.isPaidStatus(st),
      refunded: sharkhub.isRefundedStatus(st),
      failed: sharkhub.isFailedStatus(st),
      chargeback: sharkhub.isChargedbackStatus(st),
    });
  }
  if (family === "sharkbanking") {
    const s = await sharkbanking.getPaymentStatus(providerId, creds);
    const st = String(s.status ?? "");
    return build(st, {
      paid: sharkbanking.isPaidStatus(st),
      refunded: sharkbanking.isRefundedStatus(st),
      failed: sharkbanking.isFailedStatus(st),
      chargeback: false,
    });
  }
  if (family === "abacatepay") {
    const s = await abacatepay.getPaymentStatus(providerId, creds);
    const st = String(s.status ?? "");
    return build(st, {
      paid: abacatepay.isPaidStatus(st),
      refunded: abacatepay.isRefundedStatus(st),
      failed: abacatepay.isFailedStatus(st),
      chargeback: abacatepay.isDisputedStatus(st),
    });
  }
  return null;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let normalized = 0;
  let paid = 0;
  let refunded = 0;
  let chargeback = 0;
  let expired = 0;
  let unchanged = 0;
  let errors = 0;

  for (const fam of FAMILIES) {
    const rows = await prisma.transaction.findMany({
      where: {
        provider: { startsWith: fam + "-" },
        // Foca em tx recentes (30 dias) — tx muito antigas provavelmente
        // ja expiraram no PSP, nao adianta re-consultar.
        createdAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        provider: true,
        providerId: true,
        status: true,
        providerPayload: true,
      },
      take: 100, // limite pra nao explodir tempo do cron
    });
    if (rows.length === 0) continue;

    // Cache creds das contas dessa familia
    const acqs = await prisma.acquirer.findMany({
      where: {
        code: { startsWith: fam },
        active: true,
        secretKeyEnc: { not: null },
      },
      select: { id: true, code: true, publicKey: true, secretKeyEnc: true },
    });
    const credsList = acqs
      .map((a) => {
        try {
          return {
            id: a.id,
            code: a.code,
            publicKey: a.publicKey ?? "",
            secretKey: decryptString(a.secretKeyEnc!),
          };
        } catch {
          return null;
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    for (const tx of rows) {
      // 1. Normaliza no DB (o guard-rail do prisma.ts ja faria isso, mas
      //    dados antigos podem estar quebrados — corrige explicitamente).
      const normalizedName = normalizeAcquirerCodeToProvider(tx.provider);
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { provider: normalizedName },
      });
      normalized++;

      if (!tx.providerId) {
        unchanged++;
        continue;
      }

      // 2. Re-consulta status. Prefere a conta originadora (payload.acquirer_id).
      const originId = (tx.providerPayload as Record<string, unknown> | null)?.acquirer_id;
      const ordered = credsList.slice().sort((a, b) => {
        if (a.id === originId) return -1;
        if (b.id === originId) return 1;
        return 0;
      });

      let outcome: StatusOutcome | null = null;
      for (const c of ordered) {
        try {
          const r = await statusForProvider(fam, tx.providerId, {
            publicKey: c.publicKey,
            secretKey: c.secretKey,
          });
          if (r && r.status !== "UNKNOWN") {
            outcome = r;
            break;
          }
        } catch {
          // creds erradas — tenta proxima
        }
      }

      if (!outcome) {
        errors++;
        continue;
      }

      if (outcome.isPaid && tx.status !== "PAID") {
        await markTransactionPaid(tx.id);
        paid++;
      } else if (outcome.isRefunded && tx.status !== "REFUNDED") {
        await markTransactionRefunded(tx.id);
        refunded++;
      } else if (outcome.isChargeback && tx.status !== "CHARGEBACK") {
        await markTransactionChargedback(tx.id);
        chargeback++;
      } else if (outcome.isFailed && tx.status === "PENDING") {
        await markTransactionExpired(tx.id);
        expired++;
      } else {
        unchanged++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    normalized,
    paid,
    refunded,
    chargeback,
    expired,
    unchanged,
    errors,
  });
}
