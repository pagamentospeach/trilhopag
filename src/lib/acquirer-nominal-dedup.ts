/**
 * OTIMIZACAO AUTOMATICA DE ADQUIRENTES — dedup por nominal.
 *
 * Pedido do david (jul/2026): sempre que uma adquirente tem seu nominalName
 * atualizado (via maybeUpdateNominal em lib/acquirers.ts, disparado por PSP),
 * verifica se outra adquirente ATIVA compartilha esse mesmo nominal. Se sim:
 *  - Compara a taxa de conversao do DIA de cada uma
 *    (conversao = txPaid / (txPaid + txPending + txExpired), ignora REFUNDED)
 *  - Marca `hiddenFromSellers = true` na(s) com conversao mais baixa
 *  - Deixa VISIVEL a de maior conversao
 *  - Cria AdminNotification tipo "acquirer_nominal_dedup" pra cada uma
 *    escondida, avisando o admin que ele precisa trocar o nominal la.
 *
 * Objetivo: nao mostrar 2+ adquirentes com o MESMO NOME de recebedor pros
 * sellers (dava confusao "por que aparece 2 vezes?"). Bulk delete de opcao
 * pra o seller pode confundir; hidden nao mexe no processamento (dispatcher
 * continua roteando pra ela quando for a vez), so tira da UI dele.
 *
 * Flag: PlatformFlag key="acquirer_nominal_dedup_auto". Default liga (seed
 * na migration). Admin pode toggle em /admin01/acquirers.
 */
import { prisma } from "./prisma";
import { collidingAcquirerModes } from "./ops-modes";

/** Nome da flag no PlatformFlag. */
export const FLAG_KEY = "acquirer_nominal_dedup_auto";

/** True se a otimizacao esta ativa. Default false se linha nao existe. */
export async function isNominalDedupAutoEnabled(): Promise<boolean> {
  const row = await prisma.platformFlag
    .findUnique({ where: { key: FLAG_KEY } })
    .catch(() => null);
  return Boolean(row?.enabled);
}

/** Liga/desliga a flag. Retorna o novo estado. */
export async function setNominalDedupAutoEnabled(
  enabled: boolean,
): Promise<boolean> {
  const row = await prisma.platformFlag.upsert({
    where: { key: FLAG_KEY },
    create: { key: FLAG_KEY, enabled },
    update: { enabled },
  });
  return row.enabled;
}

/**
 * Roda a otimizacao pra uma acquirer que acabou de mudar de nominal.
 * Idempotente e safe pra rodar em fire-and-forget do maybeUpdateNominal.
 *
 * @param triggeredAcquirerId id da adquirente cujo nominal acabou de mudar
 * @param newNominal          o novo nominal que ela adotou
 */
export async function runNominalDedupIfEnabled(
  triggeredAcquirerId: string,
  newNominal: string,
): Promise<void> {
  try {
    if (!(await isNominalDedupAutoEnabled())) return;

    // DEDUP POR MODO (05/07): so considera colisao dentro do MESMO modo
    // (black/white/hot/both). Antes olhava globalmente — se black e white
    // usassem o mesmo nominal por acaso, o dedup escondia uma sem necessidade.
    // Sellers so veem adquirentes do modo dele; nominal repetido em outro
    // modo eh invisivel pra ele, entao nao ha colisao real.
    //
    // Regra: usa o mode da acquirer que acabou de mudar. Adquirentes com
    // mode="both" entram em ambas as buscas (funcionam pra black e white).
    const triggeredAcq = await prisma.acquirer.findUnique({
      where: { id: triggeredAcquirerId },
      select: { mode: true },
    });
    if (!triggeredAcq) return;
    const triggeredMode = triggeredAcq.mode;
    // Buckets de modos que colidem com esta acquirer — ver
    // collidingAcquirerModes em lib/ops-modes.ts.
    const collidingModes = collidingAcquirerModes(triggeredMode);

    // Busca TODAS as acquirers que agora compartilham o mesmo nominal E
    // colidem por modo. Filtra por PIX-capable + ativa + globalEnabled —
    // nao ha razao pra dedupar coisas que nao aparecem pros sellers de
    // qualquer jeito.
    const candidates = await prisma.acquirer.findMany({
      where: {
        nominalName: newNominal,
        active: true,
        globalEnabled: true,
        supportsPix: true,
        mode: { in: collidingModes },
      },
      select: {
        id: true,
        code: true,
        shortCode: true,
        nominalName: true,
        hiddenFromSellers: true,
      },
    });

    // Menos de 2 → nao ha colisao, nada pra dedupar.
    if (candidates.length < 2) return;

    // Se ja tem exatamente UMA visivel e o resto escondida — dedup ja
    // consolidado por rodada anterior. Se a acquirer nova entrou ja
    // escondida (hiddenFromSellers=true pre-existente), respeita
    // (nao "abrir" um hidden manual).
    const visible = candidates.filter((a) => !a.hiddenFromSellers);
    if (visible.length <= 1) return;

    // Calcula conversao do DIA (hoje 00:00 BRT ate agora) por acquirer.
    // A acquirer que roteou a tx fica gravada em providerPayload.acquirer_id
    // (setada pelo dispatcher em lib/acquirers.ts). Isso eh o unico ponto
    // canonico — Transaction nao tem coluna acquirerId.
    const todayStart = brtStartOfDay(new Date());
    const conversions = await Promise.all(
      visible.map(async (a) => ({
        acquirer: a,
        rate: await computeConversionRate(a.id, todayStart),
      })),
    );

    // Escolhe a VENCEDORA: maior rate.total(count) como tiebreaker (mais
    // volume + boa rate ganha de rate=1.0 com 1 unica tx). Empate absoluto:
    // fica com a que ja estava na lista antes (menor createdAt). Como o
    // findMany nao ordena, uso rate.count como tiebreak explicito.
    conversions.sort((a, b) => {
      if (b.rate.rate !== a.rate.rate) return b.rate.rate - a.rate.rate;
      return b.rate.count - a.rate.count;
    });
    const winner = conversions[0];
    const losers = conversions.slice(1);

    // Marca perdedoras como hiddenFromSellers=true e cria uma
    // AdminNotification pra cada. Update em batch, notificacao em batch.
    if (losers.length === 0) return;

    await prisma.acquirer.updateMany({
      where: { id: { in: losers.map((l) => l.acquirer.id) } },
      data: { hiddenFromSellers: true },
    });

    // Uma notificacao por perdedora (o admin precisa agir em cada uma).
    // Idempotente: nao cria duplicada se ja tem NOT resolvida com msm
    // acquirerId+nominal na chave payload.
    for (const l of losers) {
      const dup = await prisma.adminNotification
        .findFirst({
          where: {
            type: "acquirer_nominal_dedup",
            resolved: false,
            targetUserId: null,
            payload: {
              path: ["hiddenAcquirerId"],
              equals: l.acquirer.id,
            },
          },
          select: { id: true },
        })
        .catch(() => null);
      if (dup) continue;
      await prisma.adminNotification.create({
        data: {
          type: "acquirer_nominal_dedup",
          targetUserId: null,
          message: `Adquirente ${l.acquirer.shortCode || l.acquirer.code} escondida dos sellers — nominal "${newNominal}" duplicado com ${winner.acquirer.shortCode || winner.acquirer.code} (conversao hoje: ${(l.rate.rate * 100).toFixed(1)}% vs ${(winner.rate.rate * 100).toFixed(1)}%). Troca o nominal dela.`,
          payload: {
            triggeredAcquirerId,
            hiddenAcquirerId: l.acquirer.id,
            hiddenAcquirerShortCode: l.acquirer.shortCode,
            hiddenAcquirerCode: l.acquirer.code,
            winnerAcquirerId: winner.acquirer.id,
            winnerAcquirerShortCode: winner.acquirer.shortCode,
            winnerAcquirerCode: winner.acquirer.code,
            nominalName: newNominal,
            hiddenConversionRate: l.rate.rate,
            hiddenConversionCount: l.rate.count,
            hiddenConversionPaid: l.rate.paid,
            winnerConversionRate: winner.rate.rate,
            winnerConversionCount: winner.rate.count,
            winnerConversionPaid: winner.rate.paid,
          },
        },
      });
    }
  } catch (e) {
    // Fire-and-forget: nunca deve derrubar o caller (maybeUpdateNominal).
    console.error("[acquirer-nominal-dedup] failed:", e);
  }
}

/** Conversao HOJE (BRT) por acquirer. */
type ConversionRate = {
  rate: number; // 0..1
  paid: number;
  count: number; // total considerado (paid + pending + expired)
};

async function computeConversionRate(
  acquirerId: string,
  since: Date,
): Promise<ConversionRate> {
  // Agrupamento por status pras tx cujo providerPayload.acquirer_id bate.
  // Nao consideramos REFUNDED/CHARGEBACK — sao terminais depois da conversao
  // e a decisao de esconder eh baseada em capacidade de FECHAR agora.
  const rows: Array<{ status: string; count: bigint }> = await prisma.$queryRaw`
    SELECT status, COUNT(*)::bigint AS count
    FROM "Transaction"
    WHERE "createdAt" >= ${since}
      AND "providerPayload"->>'acquirer_id' = ${acquirerId}
    GROUP BY status
  `;
  let paid = 0;
  let pending = 0;
  let expired = 0;
  for (const r of rows) {
    const c = Number(r.count);
    if (r.status === "PAID") paid = c;
    else if (r.status === "PENDING") pending = c;
    else if (r.status === "EXPIRED") expired = c;
  }
  const count = paid + pending + expired;
  const rate = count > 0 ? paid / count : 0;
  return { rate, paid, count };
}

/**
 * DES-esconde adquirentes cuja nominal deixou de ser duplicada.
 *
 * Chamado por cron a cada 1h. Percorre TODAS as acquirers `hiddenFromSellers=true`
 * (ativas + globalEnabled + supportsPix) e reativa (`hiddenFromSellers=false`)
 * as que ganharam nominal unico entre as VISIVEIS pros sellers.
 *
 * Politica quando ha 2+ hidden com o MESMO nominal e nenhuma visivel:
 * reativa APENAS a de maior conversao hoje. As outras continuam hidden.
 * Nao reativa duas ao mesmo tempo — isso recriaria a colisao original.
 *
 * Idempotencia: se rodar 2x seguido sem mudanca de estado, o segundo run
 * eh no-op (recheca condicoes a cada acquirer, ordem estavel via nominal+conv).
 *
 * Fire-and-forget do cron: nunca throw (log e segue).
 */
export async function unhideNominalOrphans(): Promise<{
  reactivated: Array<{ acquirerId: string; nominal: string }>;
  checked: number;
}> {
  const out: { reactivated: Array<{ acquirerId: string; nominal: string }>; checked: number } = {
    reactivated: [],
    checked: 0,
  };
  try {
    if (!(await isNominalDedupAutoEnabled())) return out;

    const hidden = await prisma.acquirer.findMany({
      where: {
        hiddenFromSellers: true,
        active: true,
        globalEnabled: true,
        supportsPix: true,
      },
      select: {
        id: true,
        code: true,
        shortCode: true,
        nominalName: true,
        mode: true,
      },
    });
    out.checked = hidden.length;
    if (hidden.length === 0) return out;

    // Calcula conversao pra cada uma pra ordenar "maior conversao primeiro"
    // dentro de cada grupo de nominal. Isso garante que se 2 hidden ganharam
    // orfandade juntas, a MELHOR volta primeiro (a segunda ja veh a primeira
    // como visivel e nao entra na reativacao).
    const todayStart = brtStartOfDay(new Date());
    const withConv = await Promise.all(
      hidden.map(async (a) => ({
        ...a,
        conv: await computeConversionRate(a.id, todayStart),
      })),
    );
    withConv.sort((a, b) => {
      if (a.nominalName < b.nominalName) return -1;
      if (a.nominalName > b.nominalName) return 1;
      if (b.conv.rate !== a.conv.rate) return b.conv.rate - a.conv.rate;
      return b.conv.count - a.conv.count;
    });

    for (const acq of withConv) {
      // Recheca AO VIVO se ainda existe uma VISIVEL com o mesmo nominal
      // NO MESMO MODO (colisao real). Sellers so veem adquirentes do modo
      // deles, entao nominal repetido em outro modo nao gera confusao.
      const collidingModes = collidingAcquirerModes(acq.mode);
      const visibleCount = await prisma.acquirer.count({
        where: {
          id: { not: acq.id },
          nominalName: acq.nominalName,
          hiddenFromSellers: false,
          active: true,
          globalEnabled: true,
          supportsPix: true,
          mode: { in: collidingModes },
        },
      });
      if (visibleCount > 0) continue;

      // Nominal orfa: reativa a acquirer.
      await prisma.acquirer.update({
        where: { id: acq.id },
        data: { hiddenFromSellers: false },
      });

      // Resolve as notificacoes pendentes dessa acquirer (marca como
      // "auto-resolvidas" — o motivo original nao existe mais).
      await prisma.adminNotification
        .updateMany({
          where: {
            type: "acquirer_nominal_dedup",
            resolved: false,
            payload: {
              path: ["hiddenAcquirerId"],
              equals: acq.id,
            },
          },
          data: {
            resolved: true,
            resolution: "auto_unhidden",
            resolvedAt: new Date(),
          },
        })
        .catch(() => {});

      out.reactivated.push({ acquirerId: acq.id, nominal: acq.nominalName });
    }
  } catch (e) {
    console.error("[acquirer-nominal-dedup] unhide orphans failed:", e);
  }
  return out;
}

/** 00:00 do dia em BRT convertido pra UTC Date. */
function brtStartOfDay(now: Date): Date {
  // BRT = UTC-3 (sem DST desde 2019).
  const utc = now.getTime();
  const brtNow = new Date(utc - 3 * 60 * 60 * 1000);
  brtNow.setUTCHours(0, 0, 0, 0);
  // brtNow eh "00:00 BRT" expressado em UTC → precisa somar +3h pra UTC real
  return new Date(brtNow.getTime() + 3 * 60 * 60 * 1000);
}
