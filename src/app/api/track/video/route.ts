import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  session_id: z.string().trim().min(8).max(64),
  checkout_id: z.string().optional().nullable(),
  type: z.enum(["play", "pause", "ended", "seeked", "progress"]),
  position: z.number().int().min(0),
  duration: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  let userId: string | null = null;
  if (parsed.data.checkout_id) {
    const c = await prisma.checkout.findUnique({
      where: { id: parsed.data.checkout_id },
      select: { userId: true },
    });
    userId = c?.userId ?? null;
  }
  await prisma.videoEvent.create({
    data: {
      userId,
      checkoutId: parsed.data.checkout_id ?? null,
      sessionId: parsed.data.session_id,
      type: parsed.data.type,
      position: parsed.data.position,
      duration: parsed.data.duration ?? null,
      metadata: (parsed.data.metadata ?? null) as never,
    },
  });
  return new NextResponse(null, { status: 204 });
}
