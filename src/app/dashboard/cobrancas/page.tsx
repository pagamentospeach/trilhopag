import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { startOfBrtDay } from "@/lib/utils";
import {
  acquirerSellerVisibleWhere,
  resolveEffectiveSellerEmail,
} from "@/lib/acquirer-visibility";
import { CobrancasClient } from "./client";

export const dynamic = "force-dynamic";
// Orçamento de tempo: a server action de gerar PIX pode tentar a adquirente
// escolhida + fallback pras outras (cada uma com timeout próprio). 60s dá folga.
export const maxDuration = 60;

export default async function CobrancasPage() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      pixOpsMode: true,
      ownAcquirerPanelEnabled: true,
      ownAcquirerPanel: true,
      ownAcquirerPanelPublicModes: true,
    },
  });
  const pixOpsMode = user?.pixOpsMode ?? "black";
  // 30/07/2026 (davi): "Só aparece a aba de cobranças se o modo da conta
  // estiver black, na white / hot a aba de cobranças não aparece". A sidebar
  // já esconde o item, mas esconder no menu não fecha a rota — sem este
  // redirect o seller em white/hot ainda abria /dashboard/cobrancas digitando
  // a URL (ou por link/histórico do navegador).
  if (pixOpsMode !== "black") redirect("/dashboard");
  const effectiveEmail = await resolveEffectiveSellerEmail(prisma, userId);
  // PAINEL PROPRIO (19/07/2026, davi): se ligado, respeita whitelist do modo.
  // Per-mode public: modos em publicModes usam painel geral.
  const { acquirerOwnPanelWhere } = await import("@/lib/acquirer-visibility");
  const ownWhere = acquirerOwnPanelWhere(
    user?.ownAcquirerPanelEnabled ?? false,
    user?.ownAcquirerPanel as
      | import("@/lib/acquirer-visibility").OwnAcquirerPanelMap
      | null,
    pixOpsMode,
    user?.ownAcquirerPanelPublicModes ?? [],
  );
  const acqVisWhere = ownWhere ?? acquirerSellerVisibleWhere(effectiveEmail);

  // Filtro base das cobranças manuais (marcadas com providerPayload.manual_charge).
  const manualWhere = {
    userId,
    providerPayload: { path: ["manual_charge"], equals: true },
  } as const;
  // Início do dia NO FUSO DE BRASÍLIA (00:00 BRT), não meia-noite UTC.
  const startOfToday = startOfBrtDay();

  // Adquirentes elegíveis + histórico (últimas 50 pra filtro/busca) + agregados.
  const [acquirers, history, paidToday, statusGroups] = await Promise.all([
    prisma.acquirer.findMany({
      where: {
        active: true,
        supportsPix: true,
        mode: { in: [pixOpsMode, "both"] },
        ...acqVisWhere,
      },
      orderBy: [{ priority: "asc" }, { nominalName: "asc" }],
      select: { id: true, nominalName: true, institution: true, shortCode: true, mode: true, adminNote: true },
    }),
    prisma.transaction.findMany({
      where: manualWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amountCents: true,
        status: true,
        createdAt: true,
        paidAt: true,
        pixExpiresAt: true,
        pixCopyPaste: true,
        customerName: true,
        providerPayload: true,
      },
    }),
    prisma.transaction.aggregate({
      where: { ...manualWhere, status: "PAID", paidAt: { gte: startOfToday } },
      _sum: { amountCents: true, netCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["status"],
      where: manualWhere,
      _count: { _all: true },
    }),
  ]);

  // Nominal da adquirente que gerou cada PIX (join por providerPayload.acquirer_id).
  const acqIds = [
    ...new Set(
      history
        .map(
          (t) =>
            (t.providerPayload as Record<string, unknown> | null)?.acquirer_id,
        )
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  const acqNominalById = new Map<string, string>();
  if (acqIds.length > 0) {
    const rows = await prisma.acquirer.findMany({
      where: { id: { in: acqIds } },
      select: { id: true, nominalName: true },
    });
    for (const r of rows) acqNominalById.set(r.id, r.nominalName);
  }

  // Conversão das cobranças: PAID / (PAID + EXPIRED + FAILED + CANCELED).
  let paidN = 0;
  let lostN = 0;
  for (const g of statusGroups) {
    if (g.status === "PAID") paidN += g._count._all;
    if (
      g.status === "EXPIRED" ||
      g.status === "FAILED" ||
      g.status === "CANCELED"
    ) {
      lostN += g._count._all;
    }
  }
  const convTotal = paidN + lostN;
  const summary = {
    paidTodayCents: paidToday._sum.amountCents ?? 0,
    paidTodayNetCents: paidToday._sum.netCents ?? 0,
    paidTodayCount: paidToday._count._all,
    conversionRate: convTotal > 0 ? (paidN / convTotal) * 100 : null,
    paidCount: paidN,
    lostCount: lostN,
  };

  return (
    <CobrancasClient
      summary={summary}
      acquirers={acquirers.map((a) => ({
        id: a.id,
        nominalName: a.nominalName,
        institution: a.institution ?? null,
        shortCode: a.shortCode,
        adminNote: a.adminNote ?? null,
        mode: (a.mode === "white" ? "white" : a.mode === "both" ? "both" : "black") as
          | "black"
          | "white"
          | "both",
      }))}
      history={history.map((t) => {
        const pp = (t.providerPayload as Record<string, unknown> | null) ?? {};
        const label =
          (typeof pp.charge_label === "string" && pp.charge_label.trim()) ||
          t.customerName ||
          "Cobrança PIX";
        const acqId = typeof pp.acquirer_id === "string" ? pp.acquirer_id : null;
        const acquirer =
          (acqId ? acqNominalById.get(acqId) : undefined) ??
          (typeof pp.acquirer_nominal === "string" ? pp.acquirer_nominal : null);
        return {
          id: t.id,
          amountCents: t.amountCents,
          status: t.status,
          createdAt: t.createdAt.toISOString(),
          paidAt: t.paidAt ? t.paidAt.toISOString() : null,
          expiresAt: t.pixExpiresAt ? t.pixExpiresAt.toISOString() : null,
          copyPaste: t.pixCopyPaste,
          label,
          acquirer: acquirer ?? null,
        };
      })}
    />
  );
}
