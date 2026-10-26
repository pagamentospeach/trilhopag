import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autoFixPixFeeViolations } from "@/lib/fees";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AUTO-FIX de sellers com taxa PIX abaixo do minimo (4.9% + R$ 1) no
 * BLACK/WHITE (09/07/2026, david).
 *
 * Antes: violacao gerava ALERTA no admin + bloqueio do PIX + popup pro seller
 * "fale com admin". Fluxo manual — admin tinha que abrir cada perfil e ajustar.
 *
 * Agora: cron roda a cada 5min, detecta e AJUSTA AUTOMATICAMENTE pro minimo.
 * Seller nao percebe (a taxa dele so sobe), admin nao precisa fazer nada.
 *
 * Cria AdminNotification pra registrar o que foi feito (auditoria).
 * Nao remove o alerta "fee-violations" — se algo dar errado no auto-fix,
 * o alerta original ainda aparece pra intervencao manual.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fixed = await autoFixPixFeeViolations();

  if (fixed.length === 0) {
    return NextResponse.json({ ok: true, fixedCount: 0 });
  }

  // Cria notificacao pro admin com resumo (bulk). Idempotencia leve: cria 1 por
  // rodada, nao inflaciona lista.
  const preview = fixed
    .slice(0, 5)
    .map((f) => f.email ?? f.userId)
    .join(", ") + (fixed.length > 5 ? "…" : "");

  await prisma.adminNotification
    .create({
      data: {
        type: "fee_violation_auto_fixed",
        message: `${fixed.length} seller(s) tiveram taxa PIX auto-corrigida pro mínimo (4.9% + R$ 1). Ex: ${preview}`,
        payload: {
          count: fixed.length,
          sellers: fixed.slice(0, 20),
        } as never,
      },
    })
    .catch((e) => {
      console.error("[auto-fix-fee] admin notif failed:", e);
    });

  return NextResponse.json({
    ok: true,
    fixedCount: fixed.length,
    fixed: fixed.slice(0, 20),
  });
}
