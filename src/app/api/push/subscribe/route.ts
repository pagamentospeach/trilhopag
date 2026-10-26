import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { detectDevice } from "@/lib/push";

export const dynamic = "force-dynamic";

// Aceita AS DUAS formas de payload por robustez:
//   { endpoint, keys: { p256dh, auth } }   (PushSubscription.toJSON padrão)
//   { endpoint, p256dh, auth }              (forma achatada que alguns clients enviavam)
// Antes o schema exigia só a forma aninhada — a tela de Perfil > Notificações
// mandava a achatada e o server respondia 400, então a inscrição NUNCA era
// salva por aquele caminho (push só funcionava em quem ativou pelo topo).
const Body = z
  .object({
    endpoint: z.string().url().min(1),
    keys: z
      .object({ p256dh: z.string().min(1), auth: z.string().min(1) })
      .optional(),
    p256dh: z.string().min(1).optional(),
    auth: z.string().min(1).optional(),
  })
  .transform((b) => ({
    endpoint: b.endpoint,
    p256dh: b.keys?.p256dh ?? b.p256dh,
    auth: b.keys?.auth ?? b.auth,
  }))
  .refine((b) => !!b.p256dh && !!b.auth, {
    message: "missing_keys",
  });

export async function POST(request: Request) {
  const userId = await requireUserId();
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { endpoint, p256dh, auth } = parsed.data;
  const keys = { p256dh: p256dh as string, auth: auth as string };
  const userAgent = request.headers.get("user-agent") || null;
  const device = detectDevice(userAgent);

  // upsert por endpoint (single-source-of-truth do device)
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
      device,
    },
    update: {
      userId,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
      device,
      lastUsedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
