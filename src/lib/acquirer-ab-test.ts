/**
 * Teste A/B de ADQUIRENTES (17/07/2026 — davi: "temos algum bug no teste a/b
 * de adquirentes, ele parece que nao ta funcionando").
 *
 * ANTES: o AcquirerTest era criado no DB via `startAcquirerTest`, mas NUNCA
 * era lido em `dispatchPixCharge` e NUNCA tinha seus contadores incrementados.
 * O card do dashboard mostrava "0 / 20 · 0 aprovadas" pra sempre — mesmo com
 * a adquirente do teste gerando PIX (via prioridade normal) e recebendo
 * aprovações.
 *
 * AGORA:
 *   1. `pickTestAcquirer` — durante o dispatch, se tem teste em andamento e
 *      alguma adquirente do teste ainda não atingiu `txTargetPerAcq`, ela é
 *      escolhida como PRIMEIRO batch solo (round-robin: menos attempts vence).
 *      Isso força o balanceamento entre as adquirentes do teste, ignorando
 *      a prioridade normal.
 *
 *   2. `recordTestAttempt` — chamado quando uma tentativa é feita numa
 *      adquirente do teste (mesmo sem passar pelo pick — se ela naturalmente
 *      venceu o fanout, ainda conta). Auto-completa quando TODAS atingem
 *      o target.
 *
 *   3. `recordTestApproval` — chamado no webhook (dentro de markTransactionPaid)
 *      quando uma tx da adquirente do teste é marcada PAID. Auto-completa
 *      no lugar mais tardio possível — o teste só termina depois de ter
 *      dados completos.
 *
 * Contadores usam JSONB `results`; concorrência é resolvida com retry
 * otimista (2 tentativas). É telemetria, não financeiro — best-effort é OK.
 */
import { prisma } from "./prisma";

type Results = Record<string, { attempts: number; approved: number }>;

type RunningTest = {
  id: string;
  acquirerIds: string[];
  txTargetPerAcq: number;
  results: Results;
};

/**
 * Detecta e cancela teste órfão (17/07/2026, davi): se TODAS as adquirentes
 * do teste ficaram inativas, deletadas ou sem suporte a PIX, o teste nunca
 * vai progredir — auto-cancela com `cancelReason = "adquirentes indisponíveis"`.
 *
 * Retorna `true` se cancelou (caller deve tratar o teste como null depois).
 *
 * Definição de "órfão" — nenhuma das acquirerIds do teste satisfaz TODAS:
 *   - Acquirer row ainda existe (não deletada)
 *   - Acquirer.active = true
 *   - Acquirer.supportsPix = true
 *
 * (Não checa User.pixOpsMode nem UserAcquirer.pixActive de propósito: teste
 * é setup do seller; se ele pausou adquirente localmente ou trocou de modo,
 * ele pode voltar a qualquer hora. Só cancela quando o problema é GLOBAL.)
 */
async function autoCancelOrphanTest(test: RunningTest): Promise<boolean> {
  try {
    const validCount = await prisma.acquirer.count({
      where: {
        id: { in: test.acquirerIds },
        active: true,
        supportsPix: true,
      },
    });
    if (validCount > 0) return false;

    await prisma.acquirerTest.update({
      where: { id: test.id },
      data: {
        status: "canceled",
        completedAt: new Date(),
        cancelReason: "adquirentes indisponíveis",
      },
    });
    console.log(
      `[ab-test] auto-canceled orphan test ${test.id} (all ${test.acquirerIds.length} acquirers gone/inactive)`,
    );
    return true;
  } catch (e) {
    console.error("[ab-test] autoCancelOrphanTest failed:", e);
    return false; // conservador: não afirmar cancelamento se update falhou
  }
}

/**
 * Promove uma adquirente pro TOPO do pixPriority do seller — usado quando
 * `autoPromoteWinner=true` e o teste completa. Reordena: vencedora vira 0,
 * as demais mantêm ordem relativa em 1..N. Só mexe em pixPriority; cardPriority
 * e priority ficam intactos.
 *
 * Best-effort — se falhar, loga e engole (não impede o teste de completar).
 */
async function promoteAcquirerToPixTop(
  userId: string,
  winnerAcquirerId: string,
): Promise<void> {
  try {
    const uas = await prisma.userAcquirer.findMany({
      where: { userId },
      select: { id: true, acquirerId: true, pixPriority: true },
      orderBy: { pixPriority: "asc" },
    });
    if (uas.length === 0) return;
    // Winner fica em 0; os demais em 1..N-1, mantendo ordem relativa atual.
    const winner = uas.find((u) => u.acquirerId === winnerAcquirerId);
    if (!winner) return;
    const rest = uas.filter((u) => u.acquirerId !== winnerAcquirerId);
    const updates = [winner, ...rest].map((u, idx) =>
      prisma.userAcquirer.update({
        where: { id: u.id },
        data: { pixPriority: idx },
      }),
    );
    await prisma.$transaction(updates);
    console.log(
      `[ab-test] auto-promoted acquirer ${winnerAcquirerId} to pixPriority=0 for user ${userId}`,
    );
  } catch (e) {
    console.error("[ab-test] promoteAcquirerToPixTop failed:", e);
  }
}

/**
 * Busca o teste running do user. Cache in-memory por 15s pra evitar 1 query
 * extra em CADA PIX gerado. False-positive aceitável: se seller cancelar,
 * ainda balanceamos até o cache expirar (15s).
 */
const runningTestCache = new Map<
  string,
  { at: number; test: RunningTest | null }
>();
const CACHE_TTL_MS = 15_000;

export async function getRunningTestForUser(
  userId: string,
): Promise<RunningTest | null> {
  const hit = runningTestCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.test;

  try {
    const t = await prisma.acquirerTest.findFirst({
      where: { userId, status: "running" },
      select: {
        id: true,
        acquirerIds: true,
        txTargetPerAcq: true,
        results: true,
      },
    });
    let parsed: RunningTest | null = t
      ? {
          id: t.id,
          acquirerIds: t.acquirerIds,
          txTargetPerAcq: t.txTargetPerAcq,
          results: (t.results as Results) ?? {},
        }
      : null;

    // AUTO-CANCEL ÓRFÃO (17/07/2026, davi): se todas as adquirentes do teste
    // sumiram (deletadas/inativas globalmente), o teste nunca vai progredir.
    // Cancela agora com motivo e trata como null pro caller.
    if (parsed) {
      const wasOrphan = await autoCancelOrphanTest(parsed);
      if (wasOrphan) parsed = null;
    }

    runningTestCache.set(userId, { at: Date.now(), test: parsed });
    return parsed;
  } catch (e) {
    console.error("[ab-test] getRunningTestForUser failed:", e);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * Estatística — chi-squared 2x2 pra dizer se o resultado é confiável
 * (17/07/2026, davi: "quando o teste bate ~30 amostras, calcular p-value
 * simples e mostrar 'resultado estatisticamente confiável' ou 'precisa de
 * mais dados' — vira credibilidade").
 * ═════════════════════════════════════════════════════════════════════ */

/** Valores críticos qui-quadrado a 5% (p<0.05) pra df 1..9. Suficiente pra
 *  testes com até 10 adquirentes (df = N_arms - 1). */
const CHI_SQ_CRITICAL_005: Record<number, number> = {
  1: 3.841,
  2: 5.991,
  3: 7.815,
  4: 9.488,
  5: 11.07,
  6: 12.592,
  7: 14.067,
  8: 15.507,
  9: 16.919,
};

export type SignificanceLevel =
  | "insufficient" // < 30 samples por arm em qualquer arm
  | "not_significant" // amostra ok mas diferenças dentro do ruído
  | "significant"; // p < 0.05 → estatisticamente confiável

export type SignificanceResult = {
  level: SignificanceLevel;
  chiSquared: number;
  criticalValue: number;
  minSamples: number;
  /** Human message pra badge/tooltip. */
  message: string;
};

/**
 * Chi-squared 2x2 (k arms × approved/failed) — pergunta: as diferenças na
 * taxa de aprovação entre as adquirentes vêm do acaso ou têm significância?
 *
 * Requisitos:
 *   1. Cada arm precisa de ao menos 30 amostras (heurística p/ Normal aprox)
 *   2. Cada célula esperada >= 5 (rule of thumb do chi-squared)
 *
 * Se qualquer arm ainda ta < 30 → "insufficient".
 * Se chi-squared > critical(df=k-1) → "significant".
 * Senão → "not_significant" (empate estatístico).
 */
export function computeSignificance(
  results: Results,
  acquirerIds: string[],
): SignificanceResult {
  const rows = acquirerIds.map((id) => {
    const r = results[id] ?? { attempts: 0, approved: 0 };
    return {
      approved: r.approved,
      failed: Math.max(0, r.attempts - r.approved),
      total: r.attempts,
    };
  });

  const MIN_SAMPLES = 30;
  const minSamples = Math.min(...rows.map((r) => r.total), 0);
  if (rows.some((r) => r.total < MIN_SAMPLES)) {
    return {
      level: "insufficient",
      chiSquared: 0,
      criticalValue: 0,
      minSamples,
      message: `Precisa de mais dados (≥${MIN_SAMPLES} por adquirente pra ser confiável)`,
    };
  }

  const totalApproved = rows.reduce((s, r) => s + r.approved, 0);
  const totalFailed = rows.reduce((s, r) => s + r.failed, 0);
  const grandTotal = totalApproved + totalFailed;
  if (grandTotal === 0) {
    return {
      level: "insufficient",
      chiSquared: 0,
      criticalValue: 0,
      minSamples,
      message: "Sem dados de aprovação ainda",
    };
  }

  // Chi-squared = Σ (observed - expected)² / expected
  let chiSquared = 0;
  for (const row of rows) {
    const expectedApproved = (row.total * totalApproved) / grandTotal;
    const expectedFailed = (row.total * totalFailed) / grandTotal;
    if (expectedApproved > 0) {
      chiSquared += Math.pow(row.approved - expectedApproved, 2) / expectedApproved;
    }
    if (expectedFailed > 0) {
      chiSquared += Math.pow(row.failed - expectedFailed, 2) / expectedFailed;
    }
  }

  const df = Math.max(1, acquirerIds.length - 1);
  const criticalValue = CHI_SQ_CRITICAL_005[Math.min(df, 9)] ?? 16.919;
  const isSignificant = chiSquared > criticalValue;

  return {
    level: isSignificant ? "significant" : "not_significant",
    chiSquared,
    criticalValue,
    minSamples,
    message: isSignificant
      ? "Resultado estatisticamente confiável (p<0.05)"
      : "Diferenças ainda dentro da margem de erro — considere rodar mais amostras",
  };
}

/** Invalida o cache — chamado quando o teste é criado/cancelado/completado. */
export function invalidateRunningTestCache(userId: string): void {
  runningTestCache.delete(userId);
}

/**
 * Checagem oportunista pra auto-cancelar tests órfãos do seller.
 * Chamada da página `/dashboard/adquirentes` no server render — se a última
 * abertura foi antes de todas as adquirentes do teste sumirem, o teste
 * fica "running" fantasma. Isso limpa antes de renderizar.
 *
 * Bypass do cache (fresh query) porque:
 *   - Roda 1x por page load (não é hot path)
 *   - Precisamos garantir estado real, não o de 15s atrás
 */
export async function reapOrphanTestsForUser(userId: string): Promise<void> {
  try {
    const t = await prisma.acquirerTest.findFirst({
      where: { userId, status: "running" },
      select: {
        id: true,
        acquirerIds: true,
        txTargetPerAcq: true,
        results: true,
      },
    });
    if (!t) return;
    const parsed: RunningTest = {
      id: t.id,
      acquirerIds: t.acquirerIds,
      txTargetPerAcq: t.txTargetPerAcq,
      results: (t.results as Results) ?? {},
    };
    const wasOrphan = await autoCancelOrphanTest(parsed);
    if (wasOrphan) invalidateRunningTestCache(userId);
  } catch (e) {
    console.error("[ab-test] reapOrphanTestsForUser failed:", e);
  }
}

/**
 * Round-robin: dado o teste + adquirentes elegíveis pro dispatch (após
 * filtros de mode/pixActive/etc), retorna o ID daquela que deve ser tentada
 * primeiro — a com MENOS attempts (empate = ordem do teste = ordem que o
 * seller escolheu).
 *
 * Retorna null se:
 *   - Nenhuma adquirente do teste está entre as elegíveis
 *   - TODAS as adquirentes do teste já atingiram txTargetPerAcq (teste
 *     efetivamente completo — provavelmente completeIfDone rodou junto)
 */
export function pickTestAcquirer(
  test: RunningTest,
  eligibleAcquirerIds: string[],
): string | null {
  const eligSet = new Set(eligibleAcquirerIds);
  let bestId: string | null = null;
  let bestAttempts = Infinity;
  for (const acqId of test.acquirerIds) {
    if (!eligSet.has(acqId)) continue;
    const r = test.results[acqId] ?? { attempts: 0, approved: 0 };
    if (r.attempts >= test.txTargetPerAcq) continue; // já bateu meta
    if (r.attempts < bestAttempts) {
      bestAttempts = r.attempts;
      bestId = acqId;
    }
  }
  return bestId;
}

/**
 * Incrementa `results[acquirerId].attempts` no teste running do user.
 * Se o teste não incluir essa adquirente, no-op silencioso.
 * Se atingir target em TODAS as adquirentes → auto-completa (compareApproval).
 *
 * Best-effort: erros são logados e engolidos (não bloqueia o fluxo de PIX).
 */
export async function recordTestAttempt(
  userId: string,
  acquirerId: string,
): Promise<void> {
  await recordTestOutcome(userId, acquirerId, "attempt");
}

/**
 * Incrementa `results[acquirerId].approved` no teste running do user.
 * Chamado dentro de markTransactionPaid quando tx.providerPayload.acquirer_id
 * bate com uma adquirente do teste. No-op se não houver teste.
 */
export async function recordTestApproval(
  userId: string,
  acquirerId: string,
): Promise<void> {
  await recordTestOutcome(userId, acquirerId, "approval");
}

async function recordTestOutcome(
  userId: string,
  acquirerId: string,
  kind: "attempt" | "approval",
): Promise<void> {
  // Retry otimista: 2 tentativas cobrem conflitos comuns (dois PIX gerados
  // no mesmo ms). Se sobrar conflito, engolimos — telemetria pode perder
  // 1 tick, sem prejuízo financeiro.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Busca fresh (não usa cache — precisamos do results atual pra
      // incrementar corretamente).
      const t = await prisma.acquirerTest.findFirst({
        where: { userId, status: "running" },
        select: {
          id: true,
          acquirerIds: true,
          txTargetPerAcq: true,
          results: true,
          autoPromoteWinner: true,
        },
      });
      if (!t) return; // sem teste running
      if (!t.acquirerIds.includes(acquirerId)) return; // acq fora do teste

      const results = ((t.results as Results) ?? {}) as Results;
      const cur = results[acquirerId] ?? { attempts: 0, approved: 0 };
      const next: Results = {
        ...results,
        [acquirerId]: {
          attempts: kind === "attempt" ? cur.attempts + 1 : cur.attempts,
          approved: kind === "approval" ? cur.approved + 1 : cur.approved,
        },
      };

      // Verifica se com esse incremento o teste FECHA (todos atingiram target).
      const allDone = t.acquirerIds.every(
        (id) => (next[id]?.attempts ?? 0) >= t.txTargetPerAcq,
      );

      let winnerId: string | null = null;
      if (allDone) {
        // Vencedor = maior taxa de aprovação (approved/attempts). Empate:
        // maior número absoluto de approved. Empate final: primeira da lista.
        let bestRate = -1;
        let bestApproved = -1;
        for (const id of t.acquirerIds) {
          const r = next[id] ?? { attempts: 0, approved: 0 };
          const rate = r.attempts > 0 ? r.approved / r.attempts : 0;
          if (
            rate > bestRate ||
            (rate === bestRate && r.approved > bestApproved)
          ) {
            bestRate = rate;
            bestApproved = r.approved;
            winnerId = id;
          }
        }
      }

      await prisma.acquirerTest.update({
        where: { id: t.id },
        data: {
          results: next as never,
          ...(allDone
            ? {
                status: "completed",
                completedAt: new Date(),
                winnerAcquirerId: winnerId,
              }
            : {}),
        },
      });

      invalidateRunningTestCache(userId);

      // AUTO-PROMOTE (17/07/2026, davi): se marcado no wizard e o teste
      // terminou, promove a vencedora pro topo do pixPriority. Best-effort.
      if (allDone && winnerId && t.autoPromoteWinner) {
        await promoteAcquirerToPixTop(userId, winnerId);
      }
      return;
    } catch (e) {
      if (attempt === 1) {
        console.error("[ab-test] recordTestOutcome failed:", { userId, acquirerId, kind, e });
      }
      // small jitter então tenta de novo (2ª/última rodada)
      await new Promise((r) => setTimeout(r, 30 + Math.random() * 50));
    }
  }
}
