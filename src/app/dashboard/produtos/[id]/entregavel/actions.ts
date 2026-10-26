"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const Input = z.object({
  kind: z.enum(["url", "text", "memberArea"]).default("url"),
  contentUrl: z.string().url().optional().nullable().or(z.literal("")),
  contentText: z.string().trim().max(10000).optional().nullable(),
  memberAreaId: z.string().optional().nullable(),
  emailSubject: z.string().trim().max(200).optional().nullable(),
  emailBody: z.string().trim().max(10000).optional().nullable(),
});

export async function saveDeliverable(productId: string, formData: FormData) {
  const userId = await requireUserId();
  const product = await prisma.product.findFirst({
    where: { id: productId, userId },
    select: { id: true },
  });
  if (!product) return { ok: false as const, error: "Produto não encontrado." };

  const parsed = Input.safeParse({
    kind: formData.get("kind") ?? "url",
    contentUrl: formData.get("contentUrl") || null,
    contentText: formData.get("contentText") || null,
    memberAreaId: formData.get("memberAreaId") || null,
    emailSubject: formData.get("emailSubject") || null,
    emailBody: formData.get("emailBody") || null,
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Dados inválidos." };
  }

  // Se kind=memberArea: vincula o produto à área de membros automaticamente
  if (parsed.data.kind === "memberArea" && parsed.data.memberAreaId) {
    await prisma.memberAreaProduct.upsert({
      where: {
        memberAreaId_productId: {
          memberAreaId: parsed.data.memberAreaId,
          productId,
        },
      },
      create: { memberAreaId: parsed.data.memberAreaId, productId },
      update: {},
    });
  }

  await prisma.deliverable.upsert({
    where: { productId },
    create: {
      productId,
      kind: parsed.data.kind,
      contentUrl: parsed.data.contentUrl || null,
      contentText: parsed.data.contentText || null,
      memberAreaId: parsed.data.memberAreaId || null,
      emailSubject: parsed.data.emailSubject || null,
      emailBody: parsed.data.emailBody || null,
    },
    update: {
      kind: parsed.data.kind,
      contentUrl: parsed.data.contentUrl || null,
      contentText: parsed.data.contentText || null,
      memberAreaId: parsed.data.memberAreaId || null,
      emailSubject: parsed.data.emailSubject || null,
      emailBody: parsed.data.emailBody || null,
    },
  });
  revalidatePath(`/dashboard/produtos/${productId}/entregavel`);
  return { ok: true as const };
}
