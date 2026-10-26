import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-helpers";
import { sendPushToUser } from "@/lib/push";
import { rateLimit, formatRetryIn } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Dispara uma notificação de teste para o user logado (em todos os devices
 * inscritos). Útil pra verificar configuração na hora.
 */
export async function POST() {
  const userId = await requireUserId();
  // Rate-limit (5/min por user): evita spam de pushes de teste (e gasto de
  // quota VAPID). Só atinge os próprios devices, mas mesmo assim limitamos.
  const rl = rateLimit(`push-test:${userId}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: `Aguarde. ${formatRetryIn(rl.resetIn)}` },
      { status: 429 },
    );
  }
  const result = await sendPushToUser(userId, {
    title: "Trilho — notificações ativas ✅",
    body: "Você vai receber alertas de vendas pendentes e pagas aqui.",
    url: "/dashboard",
    kind: "generic",
  });
  return NextResponse.json({ ok: true, ...result });
}
