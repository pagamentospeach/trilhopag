import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";

/**
 * Grava o modo privacidade (o olho do topbar).
 *
 * 06/08/2026 (davi: "O botao do olho ... com um delay bizarro"): agora aceita o
 * valor DESEJADO no body (`{ privacyMode: boolean }`). Antes só sabia inverter
 * o que estava no banco, o que exigia um SELECT antes do UPSERT (round-trip
 * extra no Neon) e, pior, era não-idempotente: com o toggle instantâneo dá pra
 * clicar várias vezes antes do primeiro POST responder, e inversões concorrentes
 * chegando fora de ordem deixariam o banco discordando da tela.
 *
 * O modo antigo (sem body = inverte) fica de fallback pra não quebrar chamada
 * antiga que esteja em cache de service worker.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  const userId = session.user.id;

  let desired: boolean | null = null;
  try {
    const body = (await req.json()) as { privacyMode?: unknown };
    if (typeof body?.privacyMode === "boolean") desired = body.privacyMode;
  } catch {
    // sem body / body inválido — cai no toggle abaixo
  }

  let next = desired;
  if (next === null) {
    const current = await prisma.userSettings.findUnique({ where: { userId } });
    next = !(current?.privacyMode ?? false);
  }

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, privacyMode: next },
    update: { privacyMode: next },
  });
  return NextResponse.json({ ok: true, privacyMode: next });
}
