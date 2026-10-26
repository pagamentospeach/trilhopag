"use server";

import { prisma } from "@/lib/prisma";
import { requireSessionUserId } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

/**
 * Renomeia (display name) uma conta do próprio usuário da sessão OU uma
 * sub-conta dele. Atualiza só o displayName (apelido em UserSettings) — NÃO
 * mexe no User.name (nome legal/KYC). Usado pelo lápis no account-switcher.
 */
export async function renameAccount(accountId: string, name: string) {
  const sessionUserId = await requireSessionUserId();
  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false as const, error: "Nome vazio." };

  // Ownership: própria conta da sessão OU uma sub-conta dela.
  const target = await prisma.user.findFirst({
    where: {
      id: accountId,
      OR: [{ id: sessionUserId }, { parentUserId: sessionUserId }],
    },
    select: { id: true },
  });
  if (!target) return { ok: false as const, error: "Conta não encontrada." };

  await prisma.userSettings.upsert({
    where: { userId: accountId },
    create: { userId: accountId, displayName: clean },
    update: { displayName: clean },
  });
  revalidatePath("/dashboard");
  return { ok: true as const };
}
