/**
 * Sistema de holding & release das vendas.
 *
 * Regras:
 *   PIX  → availableAt = paidAt + 1 minuto
 *   CARD → availableAt = paidAt + 30 dias (D+30)
 *   CARD também: 10% retido por 90 dias (retentionUntil)
 *
 * Esta lib expõe 2 funções pros crons:
 *   - releasePendingToBalance(): credita netCents - retention pro seller
 *     quando availableAt passar
 *   - releaseRetentionToBalance(): credita o retentionAmount quando
 *     retentionUntil passar
 */
import { prisma } from "./prisma";
import { readSplitFromPayload } from "./api-split";

const BATCH_SIZE = 200;

/**
 * Libera vendas com availableAt <= now AND releasedToBalance=false.
 * Credita (netCents - retentionAmountCents) no balance do seller.
 * Também credita referrer earnings (se houver) na mesma operação.
 *
 * Idempotente: usa updateMany condicional (releasedToBalance=false) pra
 * evitar race quando 2 crons rodam ao mesmo tempo.
 */
export async function releasePendingToBalance(): Promise<{
  releasedCount: number;
  totalCreditedCents: number;
  totalReferrerCents: number;
}> {
  const txs = await prisma.transaction.findMany({
    where: {
      status: "PAID",
      releasedToBalance: false,
      availableAt: { lte: new Date(), not: null },
      divertedToAcquirer: false,
      divertedToReferrer: false,
      provider: { not: "test" },
    },
    select: {
      id: true,
      userId: true,
      netCents: true,
      retentionAmountCents: true,
      providerPayload: true,
    },
    take: BATCH_SIZE,
    orderBy: { availableAt: "asc" },
  });

  let releasedCount = 0;
  let totalCreditedCents = 0;
  let totalReferrerCents = 0;

  for (const tx of txs) {
    // PISO em 0 (auditoria jun/2026): se algum caminho deixar
    // retentionAmountCents > netCents (ex: admin editou o valor da tx sem
    // recomputar a retenção), sem o piso isto creditaria um valor NEGATIVO —
    // ou seja, DEBITARIA o saldo do seller silenciosamente. Nunca liberar
    // menos que 0.
    const releaseCents = Math.max(0, tx.netCents - tx.retentionAmountCents);
    const referrerEarnings = Number(
      (tx.providerPayload as Record<string, unknown> | null)?.[
        "referrer_earnings_cents"
      ] ?? 0,
    );
    // SPLIT (API): se a tx tem um recebedor de split, o valor sai do líquido
    // do seller e vai pro saldo do recebedor — mesmo timing do crédito do
    // seller. Clamp no releaseCents pra nunca debitar o seller além do que ele
    // recebe nesta liberação.
    const splitInfo = readSplitFromPayload(tx.providerPayload);
    const splitCents =
      splitInfo && splitInfo.recipientUserId !== tx.userId
        ? Math.min(splitInfo.amountCents, releaseCents)
        : 0;
    const sellerCredit = Math.max(0, releaseCents - splitCents);

    try {
      await prisma.$transaction(async (db) => {
        // Atomic: só atualiza se ainda não released (anti-race)
        const updated = await db.transaction.updateMany({
          where: { id: tx.id, releasedToBalance: false },
          data: { releasedToBalance: true },
        });
        if (updated.count === 0) {
          // Já foi processado por outra instância
          return;
        }

        // Credita seller (líquido MENOS o split, se houver)
        await db.user.update({
          where: { id: tx.userId },
          data: { balanceCents: { increment: sellerCredit } },
        });

        // Credita o recebedor do split (outra conta Trilho)
        if (splitCents > 0 && splitInfo) {
          await db.user.update({
            where: { id: splitInfo.recipientUserId },
            data: { balanceCents: { increment: splitCents } },
          });
        }

        // Credita referrer (se aplicável). Mesma regra de timing —
        // referrer só recebe quando seller recebe.
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
            totalReferrerCents += referrerEarnings;
          }
        }

        releasedCount++;
        totalCreditedCents += releaseCents;
      });
    } catch (e) {
      console.error("[holding-release] failed for tx", tx.id, e);
    }
  }

  return { releasedCount, totalCreditedCents, totalReferrerCents };
}

/**
 * Libera a RETENÇÃO (10%) das vendas com retentionUntil <= now AND
 * retentionReleased=false. Só aplica em txs onde retentionAmountCents > 0
 * (i.e., cartão).
 */
export async function releaseRetentionToBalance(): Promise<{
  releasedCount: number;
  totalCreditedCents: number;
}> {
  const txs = await prisma.transaction.findMany({
    where: {
      status: "PAID",
      retentionReleased: false,
      retentionAmountCents: { gt: 0 },
      retentionUntil: { lte: new Date(), not: null },
      divertedToAcquirer: false,
      divertedToReferrer: false,
      provider: { not: "test" },
    },
    select: {
      id: true,
      userId: true,
      retentionAmountCents: true,
    },
    take: BATCH_SIZE,
    orderBy: { retentionUntil: "asc" },
  });

  let releasedCount = 0;
  let totalCreditedCents = 0;

  for (const tx of txs) {
    try {
      await prisma.$transaction(async (db) => {
        const updated = await db.transaction.updateMany({
          where: { id: tx.id, retentionReleased: false },
          data: { retentionReleased: true },
        });
        if (updated.count === 0) return;

        await db.user.update({
          where: { id: tx.userId },
          data: {
            balanceCents: { increment: tx.retentionAmountCents },
          },
        });

        releasedCount++;
        totalCreditedCents += tx.retentionAmountCents;
      });
    } catch (e) {
      console.error("[retention-release] failed for tx", tx.id, e);
    }
  }

  return { releasedCount, totalCreditedCents };
}

/**
 * Calcula os 4 buckets do seller pra exibição na UI de Saques:
 *
 *   available    → balanceCents do User (já released)
 *   pendingPix   → soma de net das txs PIX PAID, availableAt > now
 *   pendingCard  → soma de net das txs CARD PAID, availableAt > now
 *   retainedCard → soma de retentionAmount das txs CARD PAID, retentionUntil > now
 *
 * Inclui também a lista de "próximos releases" pro calendário.
 */
export async function getSellerBalanceBuckets(userId: string): Promise<{
  availableCents: number;
  pendingPixCents: number;
  pendingCardCents: number;
  retainedCardCents: number;
  /** Lista (até 50) de próximos releases — pra calendário */
  upcomingReleases: Array<{
    txId: string;
    date: string;
    cents: number;
    kind: "pix_release" | "card_release" | "card_retention";
    method: string;
  }>;
}> {
  const [user, pendingTxs, retainedTxs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { balanceCents: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        status: "PAID",
        releasedToBalance: false,
        availableAt: { not: null },
        divertedToAcquirer: false,
        divertedToReferrer: false,
        provider: { not: "test" },
      },
      select: {
        id: true,
        netCents: true,
        retentionAmountCents: true,
        availableAt: true,
        method: true,
      },
      orderBy: { availableAt: "asc" },
      take: 200,
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        status: "PAID",
        retentionReleased: false,
        retentionAmountCents: { gt: 0 },
        retentionUntil: { not: null },
        divertedToAcquirer: false,
        divertedToReferrer: false,
        provider: { not: "test" },
      },
      select: {
        id: true,
        retentionAmountCents: true,
        retentionUntil: true,
        method: true,
      },
      orderBy: { retentionUntil: "asc" },
      take: 200,
    }),
  ]);

  let pendingPixCents = 0;
  let pendingCardCents = 0;
  let retainedCardCents = 0;
  const upcoming: Array<{
    txId: string;
    date: string;
    cents: number;
    kind: "pix_release" | "card_release" | "card_retention";
    method: string;
  }> = [];

  for (const tx of pendingTxs) {
    const isCard =
      tx.method === "CARD" ||
      tx.method === "APPLE_PAY" ||
      tx.method === "GOOGLE_PAY";
    const releaseCents = tx.netCents - tx.retentionAmountCents;
    if (isCard) {
      pendingCardCents += releaseCents;
    } else {
      pendingPixCents += releaseCents;
    }
    if (tx.availableAt) {
      upcoming.push({
        txId: tx.id,
        date: tx.availableAt.toISOString(),
        cents: releaseCents,
        kind: isCard ? "card_release" : "pix_release",
        method: tx.method,
      });
    }
  }

  for (const tx of retainedTxs) {
    retainedCardCents += tx.retentionAmountCents;
    if (tx.retentionUntil) {
      upcoming.push({
        txId: tx.id,
        date: tx.retentionUntil.toISOString(),
        cents: tx.retentionAmountCents,
        kind: "card_retention",
        method: tx.method,
      });
    }
  }

  // Ordena por data ASC e limita a 50
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  const upcomingReleases = upcoming.slice(0, 50);

  return {
    availableCents: user?.balanceCents ?? 0,
    pendingPixCents,
    pendingCardCents,
    retainedCardCents,
    upcomingReleases,
  };
}
