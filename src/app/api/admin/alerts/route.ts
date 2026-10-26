import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { getStoredNeonUsage } from "@/lib/neon-usage";
import { getAutoWithdrawBlockedIps } from "@/lib/system-flags";

export const dynamic = "force-dynamic";

type Alert = {
  id: string;
  level: "crit" | "warn" | "info";
  text: string;
  href?: string;
};

/**
 * Central de alertas do admin (polling pela AlertsBar no layout).
 * Deriva alertas do estado atual: saques pendentes/falhados, adquirentes
 * off ou com aprovação baixa, KYC pendente. Admin-only.
 */
export async function GET() {
  const r = await requireAdmin();
  if (!r) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since1h = new Date(Date.now() - 60 * 60 * 1000);

  const [
    pendingWd,
    highRiskWd,
    failedWd24h,
    stuckProcessingWd,
    acqOff,
    kycPending,
    neon,
    blockedIps,
    balanceDrifts,
    nominalDedup,
    pixDispatchFinalFail,
  ] = await Promise.all([
    prisma.withdrawal.count({ where: { status: "PENDING" } }),
    prisma.withdrawal.count({ where: { status: "PENDING", auditScore: { gte: 60 } } }),
    prisma.withdrawal.count({
      where: { status: "FAILED", createdAt: { gte: since24h } },
    }),
    // Saques AUTO (providerAccount setado) presos em PROCESSING há +1h: o saque
    // saiu mas o webhook não confirmou (SafePix não tem API de status). Admin
    // confere na SafePix e clica Aprovar.
    prisma.withdrawal.count({
      where: {
        status: "PROCESSING",
        providerAccount: { not: null },
        createdAt: { lt: since1h },
      },
    }),
    prisma.acquirer.count({ where: { globalEnabled: false } }),
    prisma.adminNotification.count({
      where: { type: "kyc_pending_audit", resolved: false },
    }),
    getStoredNeonUsage(),
    getAutoWithdrawBlockedIps(),
    prisma.adminNotification.findMany({
      where: { type: "safepix_balance_drift", resolved: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, message: true },
    }),
    // Otimizacao automatica de adquirentes — adquirente escondida por nominal
    // duplicado. Precisa admin trocar o nominal na escondida.
    prisma.adminNotification.count({
      where: { type: "acquirer_nominal_dedup", resolved: false },
    }),
    // PIX que nao gerou apos MAX_RETRIES (20 tentativas / ~30min). Cliente
    // ficou sem PIX pra pagar — admin precisa investigar imediatamente.
    prisma.adminNotification.findMany({
      where: { type: "pix_dispatch_final_fail", resolved: false },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, message: true, payload: true },
    }),
  ]);

  const alerts: Alert[] = [];

  // 🚨 AUDITORIA DE SALDO SafePix — queda de saldo sem saque que explique
  // (possível dreno não autorizado). É o alerta mais crítico — vai no topo.
  for (const d of balanceDrifts) {
    alerts.push({
      id: `safepix-drift-${d.id}`,
      level: "crit",
      text: d.message,
      href: "/admin01/withdrawals",
    });
  }

  // 🚨 PIX QUE NAO GEROU (08/07/2026) — cliente ficou sem QR pra pagar apos
  // 20 retries + ~30min de tentativas em multiplas PSPs. Vai no topo — nao
  // pode nunca acumular sem atencao do admin.
  if (pixDispatchFinalFail.length > 0) {
    alerts.push({
      id: "pix-dispatch-fail",
      level: "crit",
      text: `🚨 ${pixDispatchFinalFail.length} PIX nao gerou apos 20 retries — cliente pode ter ficado sem QR. Investigue as PSPs urgente.`,
      href: "/admin01/dashboard",
    });
    // Um alerta por tx (max 5 pra nao poluir) — admin ve o valor + user direto.
    for (const n of pixDispatchFinalFail.slice(0, 5)) {
      alerts.push({
        id: `pix-fail-${n.id}`,
        level: "crit",
        text: n.message,
        href: "/admin01/dashboard",
      });
    }
  }

  // SAQUE AUTOMÁTICO bloqueado por IP — o Vercel trocou de IP de saída e a
  // SafePix recusou. Mostra o(s) IP(s) novo(s) pra adicionar na allowlist.
  if (blockedIps.length > 0) {
    const ips = blockedIps.map((b) => b.ip).join(", ");
    alerts.push({
      id: "auto-wd-blocked-ip",
      level: "crit",
      text: `⚡ Saque automático bloqueado: a SafePix recusou o IP ${ips}. Adicione na allowlist (Gerenciar IPs Autorizados) das contas SafePix.`,
      href: "/admin01/withdrawals",
    });
  }

  // Data-transfer do Neon (snapshot diário do cron neon-quota-check).
  if (neon && neon.level !== "ok") {
    alerts.push({
      id: "neon-quota",
      level: neon.level === "crit" ? "crit" : "warn",
      text: `Neon data-transfer: ${neon.reason}`,
      href: "/admin01/dashboard",
    });
  }

  if (highRiskWd > 0) {
    alerts.push({
      id: "wd-risk",
      level: "crit",
      text: `${highRiskWd} saque(s) pendente(s) de ALTO RISCO (audit ≥ 60)`,
      href: "/admin01/withdrawals",
    });
  }
  if (pendingWd > 0) {
    alerts.push({
      id: "wd-pending",
      level: "warn",
      text: `${pendingWd} saque(s) aguardando aprovação`,
      href: "/admin01/withdrawals",
    });
  }
  if (failedWd24h > 0) {
    alerts.push({
      id: "wd-failed",
      level: "warn",
      text: `${failedWd24h} saque(s) falharam nas últimas 24h`,
      href: "/admin01/withdrawals",
    });
  }
  if (stuckProcessingWd > 0) {
    alerts.push({
      id: "wd-stuck-processing",
      level: "warn",
      text: `${stuckProcessingWd} saque(s) auto em PROCESSANDO há +1h — confira na SafePix e clique Aprovar se já caiu`,
      href: "/admin01/withdrawals",
    });
  }

  if (acqOff > 0) {
    alerts.push({
      id: "acq-off",
      level: "info",
      text: `${acqOff} adquirente(s) desativada(s) (globalEnabled=off)`,
      href: "/admin01/acquirers",
    });
  }
  if (kycPending > 0) {
    alerts.push({
      id: "kyc",
      level: "info",
      text: `${kycPending} documento(s) KYC aguardando análise`,
      href: "/admin01/documents",
    });
  }

  if (nominalDedup > 0) {
    alerts.push({
      id: "nominal-dedup",
      level: "warn",
      text: `${nominalDedup} adquirente(s) escondida(s) por nominal duplicado — troque o nominal e marque como tratada`,
      href: "/admin01/acquirers",
    });
  }

  // ─── FEE VIOLATION (08/07/2026, david) ───
  // Auditoria em live: quantos sellers estao com taxa PIX BLACK/WHITE
  // abaixo do minimo (4.9% + R$ 1,00). Cada um representa prejuizo por
  // venda. Alerta CRITICO — resolve editando o perfil do seller.
  const {
    MIN_PIX_FEE_PERCENT_BLACK_WHITE,
    MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE,
  } = await import("@/lib/fees");
  const usersForFee = await prisma.user.findMany({
    where: { role: { not: "admin" } },
    select: {
      id: true,
      email: true,
      feePercent: true,
      feeFixedCents: true,
      feesByMode: true,
    },
  });
  let feeViolations = 0;
  const violatingEmails: string[] = [];
  for (const u of usersForFee) {
    const byMode = (u.feesByMode as Record<
      string,
      Record<string, number | null> | undefined
    > | null) ?? null;
    for (const m of ["black", "white"] as const) {
      const cfg = byMode?.[m] ?? null;
      const effPct = cfg?.pixPct != null ? cfg.pixPct : u.feePercent;
      const effCents = cfg?.pixFix != null ? cfg.pixFix : u.feeFixedCents;
      if (
        effPct < MIN_PIX_FEE_PERCENT_BLACK_WHITE ||
        effCents < MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE
      ) {
        feeViolations++;
        if (violatingEmails.length < 5) violatingEmails.push(u.email ?? "?");
        break; // conta o seller uma vez, mesmo se ambos os modos violam
      }
    }
  }
  if (feeViolations > 0) {
    const preview = violatingEmails.join(", ") + (feeViolations > 5 ? "…" : "");
    alerts.push({
      id: "fee-violations",
      level: "crit",
      text: `⚠️ ${feeViolations} seller(s) com taxa PIX abaixo do mínimo (4.9% + R$ 1) no modo BLACK/WHITE — gerando PREJUÍZO. Ex: ${preview}`,
      href: "/admin01/users?fee_violation=1",
    });
  }

  // Ordena por severidade (crit > warn > info).
  const order = { crit: 0, warn: 1, info: 2 } as const;
  alerts.sort((x, y) => order[x.level] - order[y.level]);

  return NextResponse.json({ ok: true, ts: Date.now(), alerts });
}
