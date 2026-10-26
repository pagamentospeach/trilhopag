import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { platformDefaultFeePatch } from "@/lib/signup-bootstrap";

export const dynamic = "force-dynamic";

const Body = z.object({
  cpfCnpj: z.string().min(11).max(14),
  phone: z.string().optional().nullable(),
  personType: z.enum(["PF", "PJ"]),
});

export async function POST(request: Request) {
  const userId = await requireUserId();
  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 422 });
  }

  // 08/08/2026 (davi): "os modos de adquirentes serao selecionados pelos
  // ADMINS somente". O cadastro não pergunta mais nada sobre isso — toda
  // conta nova nasce em black e só o admin01 troca depois.
  const resolvedMode = "black";

  // Taxas-padrão da plataforma — fonte única em signup-bootstrap, a MESMA usada
  // pelo fluxo Google. Já combina a base global (PlatformDefaults) com as taxas
  // POR MODO (PlatformModeDefaults) do modo escolhido. Retorna {} se o user já
  // veio por indicação, pra não sobrescrever as taxas herdadas do referrer.
  const feePatch = await platformDefaultFeePatch(userId, resolvedMode);

  await prisma.user.update({
    where: { id: userId },
    data: {
      cpfCnpj: parsed.data.cpfCnpj,
      phone: parsed.data.phone || null,
      personType: parsed.data.personType,
      pixOpsMode: resolvedMode,
      cardOpsMode: resolvedMode,
      // IMPORTANTE (17/07/2026): NÃO marcar emailVerified aqui. O fluxo antigo
      // era código no /send-code (agora removido). Fluxo NOVO é código
      // enviado em /api/signup/send-verification-code + validado em
      // /api/signup/verify-code (que marca emailVerified=true). Se marcarmos
      // aqui, o gate no dashboard/layout nunca ativa e o seller entra sem
      // confirmar o email — atacante criou dezenas de contas assim.
      ...feePatch,
    },
  });
  return NextResponse.json({ ok: true });
}
