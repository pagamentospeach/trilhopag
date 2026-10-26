import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const Body = z.object({
  endpoint: z.string().min(1).optional(),
});

/**
 * Remove uma subscription específica (por endpoint) ou TODAS as do user.
 * Cliente passa `endpoint` quando navega/desinstala; sem endpoint =
 * "desligar push em todos os devices".
 */
export async function POST(request: Request) {
  const userId = await requireUserId();
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { endpoint } = parsed.data;
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  } else {
    await prisma.pushSubscription.deleteMany({ where: { userId } });
  }

  return NextResponse.json({ ok: true });
}
