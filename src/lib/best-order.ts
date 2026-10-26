import { prisma } from "@/lib/prisma";
import { startOfBrtDay } from "@/lib/utils";

/**
 * "Melhor ordem global do gateway" — ranking das adquirentes por conversão do
 * gateway INTEIRO no dia de hoje (todos os sellers somados), não só do seller.
 *
 * Conversão = PAID / copia-e-cola gerado (pixCopiedAt). É a métrica mais honesta
 * de "quem converte", porque normaliza pelo volume de tentativas reais de
 * pagamento. Adquirentes com poucos cliques (< MIN_COPIED) ficam no fim pra não
 * subir por sorte (1 venda em 1 clique = 100% mas é fluke).
 */

const MIN_COPIED = 10;

export type GlobalAcquirerRank = {
  acquirerId: string;
  copied: number;
  approved: number;
  conv: number;
};

/**
 * Calcula o ranking global (melhor → pior) das adquirentes hoje.
 * Devolve a lista ordenada; adquirentes sem volume mínimo vão pro fim,
 * ordenadas por volume de cliques (desempate).
 */
export async function computeGlobalAcquirerRankingToday(): Promise<
  GlobalAcquirerRank[]
> {
  const startOfToday = startOfBrtDay();

  // Agrega no Postgres por acquirer_id (JSON path) — todos os sellers.
  const rows = await prisma.$queryRaw<
    { acq: string | null; copied: bigint; approved: bigint }[]
  >`
    SELECT
      ("providerPayload"->>'acquirer_id') AS acq,
      COUNT(*) FILTER (WHERE "pixCopiedAt" IS NOT NULL) AS copied,
      COUNT(*) FILTER (WHERE status = 'PAID') AS approved
    FROM "Transaction"
    WHERE "createdAt" >= ${startOfToday}
      AND ("providerPayload"->>'acquirer_id') IS NOT NULL
    GROUP BY ("providerPayload"->>'acquirer_id')
  `;

  const ranks: GlobalAcquirerRank[] = rows
    .filter((r) => r.acq)
    .map((r) => {
      const copied = Number(r.copied);
      const approved = Number(r.approved);
      return {
        acquirerId: r.acq as string,
        copied,
        approved,
        conv: copied > 0 ? approved / copied : 0,
      };
    });

  // Quem tem volume mínimo entra no ranking "de verdade" (ordenado por conv,
  // desempate por volume). Quem não tem vai pro fim por volume.
  const ranked = ranks
    .filter((r) => r.copied >= MIN_COPIED)
    .sort((a, b) => b.conv - a.conv || b.copied - a.copied);
  const rest = ranks
    .filter((r) => r.copied < MIN_COPIED)
    .sort((a, b) => b.copied - a.copied);

  return [...ranked, ...rest];
}

/**
 * Aplica a melhor ordem global pro seller: reescreve pixPriority, cardPriority
 * e priority de TODAS as UserAcquirer do seller. Adquirentes presentes no
 * ranking global vão primeiro (na ordem do ranking); as demais mantêm a ordem
 * relativa atual (pixPriority) logo abaixo.
 *
 * Reescreve as três colunas de prioridade porque o dispatcher lê pixPriority
 * (PIX) e cardPriority (cartão) na hora de rotear.
 */
export async function applyBestGlobalOrderForUser(
  userId: string,
  ranking?: GlobalAcquirerRank[],
): Promise<void> {
  const rank = ranking ?? (await computeGlobalAcquirerRankingToday());
  const rankIndex = new Map<string, number>();
  rank.forEach((r, i) => rankIndex.set(r.acquirerId, i));

  const uas = await prisma.userAcquirer.findMany({
    where: { userId },
    select: { id: true, acquirerId: true, pixPriority: true },
  });
  if (uas.length === 0) return;

  // Ordena: primeiro os que estão no ranking global (pela posição), depois os
  // demais pela ordem manual atual (pixPriority asc). Desempate estável.
  const sorted = [...uas].sort((a, b) => {
    const ra = rankIndex.has(a.acquirerId)
      ? rankIndex.get(a.acquirerId)!
      : Number.MAX_SAFE_INTEGER;
    const rb = rankIndex.has(b.acquirerId)
      ? rankIndex.get(b.acquirerId)!
      : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return (a.pixPriority ?? 0) - (b.pixPriority ?? 0);
  });

  await prisma.$transaction(
    sorted.map((ua, idx) =>
      prisma.userAcquirer.update({
        where: { id: ua.id },
        data: { pixPriority: idx, cardPriority: idx, priority: idx },
      }),
    ),
  );
}
