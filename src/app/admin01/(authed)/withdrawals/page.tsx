import { prisma } from "@/lib/prisma";
import { formatBRL, formatDate, acquirerNominalLabel } from "@/lib/utils";
import { WithdrawalRow } from "./client";
import type { WithdrawalAuditReport } from "@/lib/withdrawal-audit";
import {
  getSalesSinceLastWithdrawal,
  type SalesSinceWithdrawal,
} from "@/lib/sales-since-withdrawal";
import { AcquirerBalancesPanel } from "../_components/acquirer-balances-panel";
import { AutoWithdrawControl } from "../_components/auto-withdraw-control";
import { EmergencySweep } from "../_components/emergency-sweep";
import { EMERGENCY_PIX_KEY } from "@/lib/emergency-sweep";
import { getAllActiveAcquirerBalances } from "@/lib/acquirer-balance";
import { computeGatewayProfit } from "@/lib/gateway-profit";
import {
  isAutoWithdrawKilled,
  getAutoWithdrawBreaker,
  getAutoWithdrawBlockedIps,
  BREAKER_THRESHOLD,
} from "@/lib/system-flags";

export const dynamic = "force-dynamic";
// Lê flags globais + saldos live das contas SafePix (cache 60s). 60s de folga.
export const maxDuration = 60;

export default async function AdminWithdrawalsPage() {
  const withdrawals = await prisma.withdrawal.findMany({
    // Mais recentes primeiro (cronológico). Antes agrupava por status, o que
    // embaralhava as datas e parecia desorganizado. Os pedidos novos (PENDING)
    // naturalmente caem no topo por serem os mais recentes.
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: {
        select: { email: true, name: true, id: true, autoWithdrawEnabled: true },
      },
    },
  });

  // Mapa code → nome da adquirente, pra mostrar de QUAL conta SafePix saiu o
  // dinheiro em cada saque automático (providerAccount = code tipo "safepix-2").
  const wdAccountCodes = [
    ...new Set(
      withdrawals
        .map((w) => w.providerAccount)
        .filter((c): c is string => !!c),
    ),
  ];
  const acqLabelByCode = new Map<string, string>();
  if (wdAccountCodes.length > 0) {
    const rows = await prisma.acquirer.findMany({
      where: { code: { in: wdAccountCodes } },
      select: { code: true, nominalName: true, institution: true, shortCode: true },
    });
    for (const r of rows) {
      const label = acquirerNominalLabel(r.nominalName, r.institution);
      acqLabelByCode.set(
        r.code,
        r.shortCode ? `${r.shortCode} · ${label}` : label,
      );
    }
  }

  // ===== SAQUE AUTOMÁTICO — estado global + detecção de saldo disperso (#4) =====
  const [killed, breaker, blockedIpsRaw, safepixBalances, driftRows] =
    await Promise.all([
      isAutoWithdrawKilled(),
      getAutoWithdrawBreaker(),
      getAutoWithdrawBlockedIps(),
      getAllActiveAcquirerBalances().catch(() => []),
      prisma.adminNotification.findMany({
        where: { type: "safepix_balance_drift", resolved: false },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, message: true },
      }),
    ]);
  // Contas de PIX-OUT (saque automático): SafePix + Pluggou.
  const safepixAccts = safepixBalances.filter(
    (b) =>
      (b.code.startsWith("safepix") || b.code.startsWith("pluggou")) &&
      b.supported &&
      typeof b.availableCents === "number",
  );
  const maxSingleCents = safepixAccts.reduce(
    (m, b) => Math.max(m, b.availableCents ?? 0),
    0,
  );
  const totalAvailCents = safepixAccts.reduce(
    (s, b) => s + (b.availableCents ?? 0),
    0,
  );
  // Lucro do gateway (reaproveita o total já lido; passivo dos sellers + saques
  // em trânsito vêm do banco). É só pra exibir — o saque recalcula no servidor.
  const gatewayProfit = await computeGatewayProfit(totalAvailCents);
  // Saques PIX pendentes de sellers com auto LIGADO que NENHUMA conta sozinha
  // cobre, mas o TOTAL cobre → ficaram manuais só por dispersão de saldo.
  const dispersedCandidates = withdrawals
    .filter(
      (w) =>
        w.status === "PENDING" && w.method === "pix" && w.user.autoWithdrawEnabled,
    )
    .map((w) => ({ w, payout: Math.max(0, w.amountCents - w.feeCents) }))
    .filter(
      ({ payout }) =>
        maxSingleCents > 0 && payout > maxSingleCents && payout <= totalAvailCents,
    );
  const dispersed =
    dispersedCandidates.length > 0
      ? {
          count: dispersedCandidates.length,
          totalReais: formatBRL(
            dispersedCandidates.reduce((s, c) => s + c.payout, 0),
          ),
          maxSingleReais: formatBRL(maxSingleCents),
          totalAvailableReais: formatBRL(totalAvailCents),
          items: dispersedCandidates.slice(0, 10).map((c) => ({
            userLabel: c.w.user.name ?? c.w.user.email,
            payoutReais: formatBRL(c.payout),
          })),
        }
      : null;
  const autoWithdrawControlData = {
    killed,
    breaker: {
      fails: breaker.fails,
      threshold: BREAKER_THRESHOLD,
      trippedUntil: breaker.trippedUntil,
      open:
        !!breaker.trippedUntil &&
        new Date(breaker.trippedUntil).getTime() > Date.now(),
    },
    blockedIps: blockedIpsRaw.map((b) => ({
      ip: b.ip,
      account: b.account,
      atLabel: formatDate(new Date(b.at)),
    })),
    balanceDrifts: driftRows.map((d) => ({ id: d.id, message: d.message })),
    dispersed,
  };

  // VENDAS DESDE O ÚLTIMO SAQUE — só pros saques que o admin revisa
  // (PENDING/PROCESSING). Dedupe por userId pra não recomputar por linha.
  const reviewUserIds = [
    ...new Set(
      withdrawals
        .filter((w) => w.status === "PENDING" || w.status === "PROCESSING")
        .map((w) => w.user.id),
    ),
  ];
  const salesByUser = new Map<string, SalesSinceWithdrawal>();
  await Promise.all(
    reviewUserIds.map(async (uid) => {
      salesByUser.set(uid, await getSalesSinceLastWithdrawal(uid));
    }),
  );
  function fmtSalesSince(s: SalesSinceWithdrawal | undefined) {
    if (!s) return null;
    return {
      sinceLabel: s.sinceDate ? formatDate(s.sinceDate) : null,
      grossFormatted: formatBRL(s.grossCents),
      feeFormatted: formatBRL(s.feeCents),
      netFormatted: formatBRL(s.netCents),
      count: s.count,
      byAcquirer: s.byAcquirer.map((a) => ({
        name: a.name,
        shortCode: a.shortCode,
        grossFormatted: formatBRL(a.grossCents),
        netFormatted: formatBRL(a.netCents),
        count: a.count,
      })),
    };
  }

  return (
    <div className="space-y-4 sm:space-y-5 max-w-7xl">
      <header>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Saques</h1>
        <p className="text-xs sm:text-sm text-zinc-400 leading-snug">
          Aprove ou rejeite cada saque MANUALMENTE. Confira sempre os flags de auditoria abaixo.
        </p>
        <p className="text-[11px] sm:text-xs text-zinc-500 mt-1 leading-snug">
          <span className="text-cyan-300 font-bold">Líquido</span> = quanto enviar pro seller via PIX/USDT (já descontado fee).
        </p>
      </header>

      {/* Controles do saque automático — kill-switch, breaker, saldo disperso.
          Colapsado por padrão pra desafogar a página. */}
      <details className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <summary className="cursor-pointer select-none list-none px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-zinc-300 hover:text-white flex items-center gap-2">
          <span className="text-zinc-500 transition-transform group-open:rotate-90">
            ▸
          </span>
          Saque automático · controles (clique pra abrir)
        </summary>
        <div className="px-3 pb-3">
          <AutoWithdrawControl data={autoWithdrawControlData} />
        </div>
      </details>

      {/* 🚨 Saque de emergência — varre todas as adquirentes pra chave PIX fixa.
          Colapsado por padrão; conteúdo compacto. */}
      <details className="group rounded-2xl border border-red-500/30 bg-red-500/[0.04] overflow-hidden">
        <summary className="cursor-pointer select-none list-none px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] text-red-200 hover:text-red-100 flex items-center gap-2">
          <span className="text-red-400/70 transition-transform group-open:rotate-90">
            ▸
          </span>
          Saque de emergência · varrer adquirentes
        </summary>
        <div className="px-3 pb-3">
          <EmergencySweep
            pixKey={EMERGENCY_PIX_KEY}
            totalAvailCents={totalAvailCents}
            profit={{
              totalAvailCents: gatewayProfit.totalAvailCents,
              sellerLiabilitiesCents: gatewayProfit.sellerLiabilitiesCents,
              pendingPayoutsCents: gatewayProfit.pendingPayoutsCents,
              profitCents: gatewayProfit.profitCents,
            }}
          />
        </div>
      </details>

      {/* Saldo nas adquirentes — pra admin decidir se tem grana pra pagar */}
      <AcquirerBalancesPanel
        title="Saldo disponivel nas adquirentes (live)"
        description="Cache 60s. Verifique antes de aprovar saques grandes pra ter certeza que ha cobertura."
      />

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        {/* Cabeçalho de tabela — só desktop. Mobile usa layout de card. */}
        <div className="hidden md:grid grid-cols-[140px_1.5fr_120px_140px_180px] gap-4 border-b border-white/[0.06] bg-black/30 px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-500">
          <span>Data</span>
          <span>Seller / Chave PIX</span>
          <span className="text-right">Valor</span>
          <span>Status</span>
          <span className="text-right">Ações</span>
        </div>
        {withdrawals.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">
            Sem saques registrados.
          </p>
        ) : (
          withdrawals.map((w) => (
            <WithdrawalRow
              key={w.id}
              w={{
                id: w.id,
                createdAtFormatted: formatDate(w.createdAt),
                userName: w.user.name ?? w.user.email,
                userEmail: w.user.email,
                userId: w.user.id,
                amountFormatted: formatBRL(w.amountCents),
                feeFormatted: formatBRL(w.feeCents),
                netFormatted: formatBRL(w.amountCents - w.feeCents),
                amountCents: w.amountCents,
                feeCents: w.feeCents,
                method: w.method,
                pixKey: w.pixKey,
                pixKeyType: w.pixKeyType,
                walletAddress: w.walletAddress,
                status: w.status,
                failReason: w.failReason,
                providerId: w.providerId,
                providerAccount: w.providerAccount,
                providerAccountLabel: w.providerAccount
                  ? acqLabelByCode.get(w.providerAccount) ?? w.providerAccount
                  : null,
                auditScore: w.auditScore,
                auditReport: (w.auditReport as unknown as WithdrawalAuditReport) ?? null,
                salesSince:
                  w.status === "PENDING" || w.status === "PROCESSING"
                    ? fmtSalesSince(salesByUser.get(w.user.id))
                    : null,
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
