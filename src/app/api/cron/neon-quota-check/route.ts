import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchNeonUsage,
  saveNeonUsage,
  type NeonUsageSnapshot,
} from "@/lib/neon-usage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Cron DIÁRIO — guarda-chuva contra estouro de data-transfer do Neon.
 *
 * Em 2026-06-17 o gateway caiu inteiro (HTTP 402 em toda query) porque o Neon
 * estourou a cota de data-transfer. Este cron faz UMA chamada/dia à API do
 * Neon, persiste o consumo em PlatformDefaults.neonUsage (lido pelo dashboard
 * + barra de alertas) e, se o uso passar do teto (ou projetar estouro antes
 * do fim do período), abre um AdminNotification e dispara email pro admin.
 *
 * Idempotente/anti-spam: mantém UM alerta `neon_quota` ativo (atualiza em vez
 * de duplicar); email só na 1ª vez que dispara; auto-resolve quando normaliza.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // FAIL CLOSED: sem secret no env = 401.
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.NEON_API_KEY) {
    console.warn(
      "[neon-quota-check] NEON_API_KEY ausente — configure no Vercel env. Pulando.",
    );
    return NextResponse.json({ ok: true, skipped: "no_api_key" });
  }

  try {
    const snap = await fetchNeonUsage();
    await saveNeonUsage(snap);

    if (snap.level !== "ok") {
      await raiseAlert(snap);
    } else {
      // Voltou ao normal → resolve qualquer alerta ativo.
      await prisma.adminNotification.updateMany({
        where: { type: "neon_quota", resolved: false },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          resolution: "normalizado",
        },
      });
    }

    return NextResponse.json({ ok: true, ...snap });
  } catch (e) {
    console.error("[neon-quota-check] erro:", e);
    return NextResponse.json(
      {
        error: "internal_error",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    );
  }
}

async function raiseAlert(snap: NeonUsageSnapshot): Promise<void> {
  const message = `Neon data-transfer ${snap.level === "crit" ? "CRÍTICO" : "alto"} — ${snap.reason}`;

  const existing = await prisma.adminNotification.findFirst({
    where: { type: "neon_quota", resolved: false },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    // Atualiza o alerta ativo (sem duplicar, sem re-emailar).
    await prisma.adminNotification.update({
      where: { id: existing.id },
      data: { message, payload: snap as never, read: false },
    });
    return;
  }

  await prisma.adminNotification.create({
    data: { type: "neon_quota", message, payload: snap as never },
  });
  // Email de alerta admin REMOVIDO (17/07/2026, política). AdminNotification
  // acima ainda aparece no painel admin — é o canal certo.
}
