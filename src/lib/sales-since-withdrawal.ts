import { prisma } from "./prisma";
import { acquirerNominalLabel } from "./utils";

/**
 * Resumo das vendas PAGAS de um seller DESDE o último saque PAGO. Usado no
 * admin (página de Saques) pra mostrar, abaixo de um saque pendente, o que
 * gerou o saldo que ele está tentando sacar.
 *
 * Baseline = data do último saque com status PAID (paidAt, senão createdAt).
 * Se o seller nunca sacou, conta todas as vendas (since = epoch).
 */
export type SalesSinceWithdrawal = {
  sinceDate: Date | null;
  grossCents: number;
  feeCents: number;
  netCents: number;
  count: number;
  byAcquirer: {
    name: string;
    shortCode: string | null;
    grossCents: number;
    netCents: number;
    count: number;
  }[];
};

export async function getSalesSinceLastWithdrawal(
  userId: string,
): Promise<SalesSinceWithdrawal> {
  const lastPaid = await prisma.withdrawal.findFirst({
    where: { userId, status: "PAID" },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    select: { paidAt: true, createdAt: true },
  });
  const sinceDate = lastPaid?.paidAt ?? lastPaid?.createdAt ?? null;
  const since = sinceDate ?? new Date(0);

  // Agrega no Postgres por adquirente (providerPayload->>'acquirer_id').
  // Casts ::float8/::int evitam BigInt e não transferem o blob JSON.
  const rows = await prisma.$queryRaw<
    Array<{ acq: string | null; cnt: number; gross: number; net: number; fee: number }>
  >`
    SELECT ("providerPayload"->>'acquirer_id') AS acq,
           COUNT(*)::int AS cnt,
           COALESCE(SUM("amountCents"), 0)::float8 AS gross,
           COALESCE(SUM("netCents"), 0)::float8 AS net,
           COALESCE(SUM("feeCents"), 0)::float8 AS fee
    FROM "Transaction"
    WHERE "userId" = ${userId}
      AND "status" = 'PAID'
      AND "provider" <> 'test'
      AND "divertedToAcquirer" = false
      AND "divertedToReferrer" = false
      AND COALESCE("paidAt", "createdAt") > ${since}
    GROUP BY ("providerPayload"->>'acquirer_id')
  `;

  let grossCents = 0;
  let feeCents = 0;
  let netCents = 0;
  let count = 0;
  for (const r of rows) {
    grossCents += r.gross;
    netCents += r.net;
    feeCents += r.fee;
    count += r.cnt;
  }

  const acqIds = rows
    .map((r) => r.acq)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const acqs = acqIds.length
    ? await prisma.acquirer.findMany({
        where: { id: { in: acqIds } },
        select: { id: true, nominalName: true, institution: true, shortCode: true, code: true },
      })
    : [];
  const acqById = new Map(acqs.map((a) => [a.id, a]));

  const byAcquirer = rows
    .map((r) => {
      const a = r.acq ? acqById.get(r.acq) : undefined;
      return {
        name: a
          ? acquirerNominalLabel(a.nominalName || a.code, a.institution)
          : r.acq || "Sem adquirente",
        shortCode: a?.shortCode ?? null,
        grossCents: Math.round(r.gross),
        netCents: Math.round(r.net),
        count: r.cnt,
      };
    })
    .sort((x, y) => y.grossCents - x.grossCents);

  return {
    sinceDate,
    grossCents: Math.round(grossCents),
    feeCents: Math.round(feeCents),
    netCents: Math.round(netCents),
    count,
    byAcquirer,
  };
}
