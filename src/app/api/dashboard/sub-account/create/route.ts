import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId } from "@/lib/auth-helpers";
import { ACTIVE_ACCOUNT_COOKIE } from "@/lib/effective-user";
import { LIGHT_THEME_KEY } from "@/lib/theme-mode";

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  // 23/07/2026 (davi): email agora OBRIGATORIO na sub-conta pra o admin buscar
  // sub-contas pelo email como se fossem contas principais.
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(request: Request) {
  const parentId = await requireSessionUserId();
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

  const parent = await prisma.user.findUnique({
    where: { id: parentId },
    select: { feePercent: true, feeFixedCents: true, isSubAccount: true },
  });
  if (parent?.isSubAccount) {
    return NextResponse.json(
      { error: "sub_accounts_cannot_create_subs" },
      { status: 400 },
    );
  }

  // Cap at 10 sub-accounts per parent for sanity
  const count = await prisma.user.count({ where: { parentUserId: parentId } });
  if (count >= 10) {
    return NextResponse.json(
      { error: "limit_reached", message: "Limite de 10 sub-contas atingido." },
      { status: 400 },
    );
  }

  const internalEmail = `sub-${randomBytes(6).toString("hex")}.${parentId.slice(0, 8)}@subaccount.trilhopag.local`;

  // 08/08/2026 (davi): o seller não escolhe mais o modo — nem pra si nem pra
  // sub-conta. Nasce em black e só o admin troca depois.
  const sub = await prisma.user.create({
    data: {
      email: internalEmail,
      // Email real fornecido pelo seller — usado pelo admin em /admin01/users
      // pra buscar sub-contas por email como se fossem contas principais.
      subAccountLinkedEmail: parsed.data.email,
      name: parsed.data.name,
      parentUserId: parentId,
      isSubAccount: true,
      feePercent: parent?.feePercent ?? 5.99,
      feeFixedCents: parent?.feeFixedCents ?? 200,
      pixOpsMode: "black",
      cardOpsMode: "black",
      // Sub-conta herda a verificação do pai — NÃO pede documentos/KYC de novo
      // (estava redirecionando pra /onboarding/documentos).
      kycStatus: "approved",
      // 27/07/2026 (davi 'cheio de erro nas sub contas, ta pedindo pra verificar
      // um email nada a ver'). Sub-conta sem emailVerified caia no gate do
      // /dashboard layout e redirecionava pra /verify-email?email={internal}
      // — o internal eh sub-XXXX.YYYY@subaccount.trilhopag.local (o "email
      // nada a ver"). Marca como verificada ja que sub-conta e mesmo dono
      // real do pai (que ja verificou).
      emailVerified: true,
      settings: {
        create: {
          // 08/08/2026 (davi): tema white é o padrão de toda conta nova —
          // sub-conta segue a mesma regra do cadastro principal.
          theme: LIGHT_THEME_KEY,
          bgPattern: "mesh",
          displayName: parsed.data.name,
        },
      },
    },
  });

  const response = NextResponse.json({ ok: true, id: sub.id });
  response.cookies.set(ACTIVE_ACCOUNT_COOKIE, sub.id, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
