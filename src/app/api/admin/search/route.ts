import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type Result = {
  type: "user" | "tx";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

/**
 * Busca global do admin (command palette Cmd+K). Procura usuarios por
 * email/nome/cpf e transacoes por ID. Admin-only.
 */
export async function GET(request: Request) {
  const r = await requireAdmin();
  if (!r) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] });

  const results: Result[] = [];

  // Transacao por ID (cuid). Se bater, vai pro perfil do seller dono.
  if (/^[a-z0-9]{20,}$/i.test(q)) {
    const tx = await prisma.transaction.findUnique({
      where: { id: q },
      select: {
        id: true,
        amountCents: true,
        status: true,
        user: { select: { id: true, email: true } },
      },
    });
    if (tx) {
      results.push({
        type: "tx",
        id: tx.id,
        title: `Tx ${tx.id.slice(0, 12)}… — ${(tx.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        subtitle: `${tx.status} · ${tx.user.email}`,
        href: `/admin01/users/${tx.user.id}`,
      });
    }
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { cpfCnpj: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      cpfCnpj: true,
      balanceCents: true,
      blocked: true,
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  for (const u of users) {
    results.push({
      type: "user",
      id: u.id,
      title: u.name ?? u.email,
      subtitle: `${u.email}${u.cpfCnpj ? ` · ${u.cpfCnpj}` : ""}${u.blocked ? " · BLOQUEADO" : ""} · ${(u.balanceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      href: `/admin01/users/${u.id}`,
    });
  }

  return NextResponse.json({ ok: true, results });
}
