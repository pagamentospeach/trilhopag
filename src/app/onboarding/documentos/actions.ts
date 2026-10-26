"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const InputSchema = z.object({
  cpfCnpj: z.string().trim().min(11).max(20),
  phone: z.string().trim().min(10).max(20),
  zipcode: z.string().trim().min(8).max(10),
  street: z.string().trim().min(1).max(200),
  number: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().length(2),
  docFrontUrl: z.string().url(),
  docBackUrl: z.string().url().nullable().optional(),
  selfieUrl: z.string().url(),
  /**
   * Contrato social — obrigatório SE personType === "PJ" (validado no
   * handler abaixo, não no schema, porque o personType é inferido dos
   * dígitos do CNPJ no momento).
   */
  contratoSocialUrl: z.string().url().nullable().optional(),
});

/**
 * Server action do onboarding inicial. Tudo-em-um:
 * 1. Atualiza User (cpfCnpj, phone)
 * 2. Upsert Address
 * 3. Cria/atualiza KycDocument pra cada arquivo
 * 4. Marca kycStatus = "approved" (auto-approve)
 * 5. Cria AdminNotification pra auditoria
 *
 * Idempotente. Pode ser chamado várias vezes (caso o seller refaça).
 */
export async function submitOnboarding(input: z.infer<typeof InputSchema>) {
  const userId = await requireUserId();
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error:
        "Dados inválidos: " +
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
    };
  }
  const data = parsed.data;
  const cpfDigits = data.cpfCnpj.replace(/\D/g, "");
  const isPJ = cpfDigits.length === 14;

  // Contrato social obrigatório para PJ
  if (isPJ && !data.contratoSocialUrl) {
    return {
      ok: false as const,
      error: "Contas PJ precisam enviar o contrato social.",
    };
  }

  // Tudo atômico — uma transação só
  await prisma.$transaction(async (tx) => {
    // 1. User
    await tx.user.update({
      where: { id: userId },
      data: {
        cpfCnpj: data.cpfCnpj,
        phone: data.phone,
        personType: isPJ ? "PJ" : "PF",
      },
    });

    // 2. Address (neighborhood opcional no form, mas obrigatório no schema —
    // usa string vazia se faltar; user pode preencher depois no perfil)
    await tx.address.upsert({
      where: { userId },
      create: {
        userId,
        zipcode: data.zipcode,
        street: data.street,
        number: data.number,
        neighborhood: "",
        city: data.city,
        state: data.state.toUpperCase(),
        country: "BR",
      },
      update: {
        zipcode: data.zipcode,
        street: data.street,
        number: data.number,
        city: data.city,
        state: data.state.toUpperCase(),
      },
    });

    // 3. Documents
    const docs: Array<{ type: string; url: string }> = [
      { type: "doc_front", url: data.docFrontUrl },
      { type: "selfie", url: data.selfieUrl },
    ];
    if (data.docBackUrl) {
      docs.push({ type: "doc_back", url: data.docBackUrl });
    }
    if (data.contratoSocialUrl) {
      docs.push({ type: "contrato_social", url: data.contratoSocialUrl });
    }
    for (const d of docs) {
      await tx.kycDocument.upsert({
        where: { userId_type: { userId, type: d.type } },
        create: { userId, type: d.type, url: d.url, status: "pending" },
        update: { url: d.url, status: "pending", rejectionReason: null },
      });
    }

    // 4. Auto-approve
    await tx.user.update({
      where: { id: userId },
      data: { kycStatus: "approved", kycRejectionReason: null },
    });

    // 5. Notificação admin pra auditoria
    const u = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (u) {
      await tx.adminNotification.create({
        data: {
          type: "kyc_pending_audit",
          targetUserId: userId,
          message: `Novos documentos enviados por ${u.email}. Auditoria pendente.`,
          payload: {
            userEmail: u.email,
            userName: u.name,
            personType: isPJ ? "PJ" : "PF",
            hasContratoSocial: !!data.contratoSocialUrl,
          },
        },
      });
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/perfil");
  return { ok: true as const };
}
