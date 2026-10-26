import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const Body = z.object({
  notifyOnPending: z.boolean().optional(),
  notifyOnPaid: z.boolean().optional(),
  notifyOnWithdrawalPaid: z.boolean().optional(),
});

/**
 * Atualiza os flags de "o que notificar" em TODAS as subscriptions do user.
 * Mexer em cada device separado é overkill — sellers querem ligar/desligar
 * vendas pendentes ou pagas como um conjunto.
 */
export async function PATCH(request: Request) {
  const userId = await requireUserId();
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const data: {
    notifyOnPending?: boolean;
    notifyOnPaid?: boolean;
    notifyOnWithdrawalPaid?: boolean;
  } = {};
  if (typeof parsed.data.notifyOnPending === "boolean") {
    data.notifyOnPending = parsed.data.notifyOnPending;
  }
  if (typeof parsed.data.notifyOnPaid === "boolean") {
    data.notifyOnPaid = parsed.data.notifyOnPaid;
  }
  if (typeof parsed.data.notifyOnWithdrawalPaid === "boolean") {
    data.notifyOnWithdrawalPaid = parsed.data.notifyOnWithdrawalPaid;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: "no_changes" }, { status: 400 });
  }

  await prisma.pushSubscription.updateMany({ where: { userId }, data });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const userId = await requireUserId();
  const [subs, user] = await Promise.all([
    prisma.pushSubscription.findMany({
      where: { userId },
      select: {
        id: true,
        device: true,
        notifyOnPending: true,
        notifyOnPaid: true,
        notifyOnWithdrawalPaid: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { lastUsedAt: "desc" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true, isFriendAccount: true },
    }),
  ]);
  const anyPending = subs.some((s) => s.notifyOnPending);
  const anyPaid = subs.some((s) => s.notifyOnPaid);
  const anyWithdrawal = subs.some((s) => s.notifyOnWithdrawalPaid);
  return NextResponse.json({
    ok: true,
    subscriptions: subs,
    aggregate: {
      notifyOnPending: anyPending,
      notifyOnPaid: anyPaid,
      notifyOnWithdrawalPaid: anyWithdrawal,
      count: subs.length,
    },
    prefs: user?.notificationPrefs ?? null,
    isFriendAccount: user?.isFriendAccount ?? false,
  });
}
