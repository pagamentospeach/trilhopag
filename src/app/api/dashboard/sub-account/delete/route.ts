import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId } from "@/lib/auth-helpers";
import { ACTIVE_ACCOUNT_COOKIE } from "@/lib/effective-user";

const Body = z.object({
  accountId: z.string().min(1),
});

export async function POST(request: Request) {
  const sessionUserId = await requireSessionUserId();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 422 });
  }

  // Validar: tem que ser sub-conta deste parent
  const sub = await prisma.user.findFirst({
    where: {
      id: parsed.data.accountId,
      parentUserId: sessionUserId,
      isSubAccount: true,
    },
    select: {
      id: true,
      balanceCents: true,
      _count: {
        select: {
          transactions: { where: { status: "PAID" } },
          withdrawals: { where: { status: { in: ["PENDING", "PROCESSING"] } } },
        },
      },
    },
  });

  if (!sub) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Bloqueia exclusão se houver saldo ou saques pendentes
  if (sub.balanceCents > 0) {
    return NextResponse.json(
      {
        error: "has_balance",
        message: `Esta sub-conta tem saldo de R$ ${(sub.balanceCents / 100).toFixed(2)}. Saque tudo antes de excluir.`,
      },
      { status: 400 },
    );
  }
  if (sub._count.withdrawals > 0) {
    return NextResponse.json(
      {
        error: "pending_withdrawals",
        message: "Existem saques pendentes nesta sub-conta. Aguarde processar antes de excluir.",
      },
      { status: 400 },
    );
  }

  // Cascade delete: produtos, checkouts, transações, etc. são apagados via onDelete:Cascade
  await prisma.user.delete({ where: { id: sub.id } });

  const response = NextResponse.json({ ok: true });
  // Se a sub-conta excluída era a ativa, limpa o cookie
  response.cookies.delete(ACTIVE_ACCOUNT_COOKIE);
  return response;
}
