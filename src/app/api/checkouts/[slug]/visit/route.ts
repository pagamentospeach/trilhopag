import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Beacon de visita ao checkout. Cliente envia ao montar o checkout publico.
 *
 * Body: { sessionId: string, maxScrollPct?: number }
 *
 * Logica:
 *  - sessionId existente → atualiza lastSeenAt + maxScrollPct
 *  - sessionId novo → cria CheckoutVisit
 *
 * Idempotente. Multi-call no mesmo session = atualiza, nao duplica.
 * Usado tanto pra "tracking de visita unica" quanto "heartbeat" de
 * presenca (live now).
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const ip = getClientIp(request);
  const rl = rateLimit(`checkout-visit:${ip}`, 240, 60_000);
  if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429 });

  let body: { sessionId?: string; maxScrollPct?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : null;
  if (!sessionId || sessionId.length < 8) {
    return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  }

  // Acha o checkout pelo slug
  const checkout = await prisma.checkout.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!checkout) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const maxScrollPct = Math.min(
    100,
    Math.max(0, Math.floor(Number(body.maxScrollPct ?? 0))),
  );

  const h = await headers();
  const ua = (h.get("user-agent") ?? "").slice(0, 200);
  const country = h.get("x-vercel-ip-country") ?? null;

  // Upsert via updateMany + insert pra race-safe
  const upd = await prisma.checkoutVisit.updateMany({
    where: { sessionId, checkoutId: checkout.id },
    data: {
      lastSeenAt: new Date(),
      maxScrollPct: maxScrollPct > 0 ? { set: maxScrollPct } : undefined,
    } as never,
  });

  if (upd.count === 0) {
    // Novo session — cria
    try {
      await prisma.checkoutVisit.create({
        data: {
          sessionId,
          checkoutId: checkout.id,
          maxScrollPct,
          ua: ua || null,
          country,
        },
      });
    } catch (e) {
      // Race: outra request acabou de criar com o mesmo sessionId.
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("P2002")) {
        console.error("[checkout-visit] create error:", e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
