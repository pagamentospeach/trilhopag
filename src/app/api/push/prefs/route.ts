import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { sanitizePrefs } from "@/lib/notification-templates";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/push/prefs
 * Body: NotificationPrefs (parcial — merge com o que ja existe).
 * Saneia tamanhos de strings + valida tipos.
 *
 * GET devolve as prefs atuais (atalho — settings tambem traz).
 */
export async function PATCH(request: Request) {
  const userId = await requireUserId();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const sanitized = sanitizePrefs(raw);
  // Merge com existente — patch parcial (seller pode salvar so um event)
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPrefs: true },
  });
  const merged = {
    ...((current?.notificationPrefs as object | null) ?? {}),
    ...sanitized,
  };
  await prisma.user.update({
    where: { id: userId },
    data: { notificationPrefs: merged as never },
  });
  return NextResponse.json({ ok: true, prefs: merged });
}

export async function GET() {
  const userId = await requireUserId();
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPrefs: true },
  });
  return NextResponse.json({ ok: true, prefs: u?.notificationPrefs ?? null });
}
