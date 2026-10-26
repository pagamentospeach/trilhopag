"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const Input = z.object({
  phoneNumberId: z.string().trim().min(5),
  businessAccountId: z.string().trim().optional().nullable(),
  accessToken: z.string().trim().min(5),
  recoveryEnabled: z.coerce.boolean().optional(),
  recoveryDelayMinutes: z.coerce.number().int().min(5).max(1440).default(15),
  recoveryTemplate: z.string().trim().optional().nullable(),
});

export async function saveWhatsappConfig(formData: FormData) {
  const userId = await requireUserId();
  const parsed = Input.safeParse({
    phoneNumberId: formData.get("phoneNumberId"),
    businessAccountId: formData.get("businessAccountId") || null,
    accessToken: formData.get("accessToken"),
    recoveryEnabled: formData.get("recoveryEnabled") === "on",
    recoveryDelayMinutes: formData.get("recoveryDelayMinutes") || 15,
    recoveryTemplate: formData.get("recoveryTemplate") || null,
  });
  if (!parsed.success)
    return { ok: false as const, error: "Validação falhou." };

  await prisma.whatsappConfig.upsert({
    where: { userId },
    create: {
      userId,
      phoneNumberId: parsed.data.phoneNumberId,
      businessAccountId: parsed.data.businessAccountId || null,
      accessToken: parsed.data.accessToken,
      recoveryEnabled: parsed.data.recoveryEnabled ?? true,
      recoveryDelayMinutes: parsed.data.recoveryDelayMinutes,
      recoveryTemplate: parsed.data.recoveryTemplate || null,
    },
    update: {
      phoneNumberId: parsed.data.phoneNumberId,
      businessAccountId: parsed.data.businessAccountId || null,
      accessToken: parsed.data.accessToken,
      recoveryEnabled: parsed.data.recoveryEnabled ?? true,
      recoveryDelayMinutes: parsed.data.recoveryDelayMinutes,
      recoveryTemplate: parsed.data.recoveryTemplate || null,
    },
  });

  revalidatePath("/dashboard/integracoes/whatsapp");
  return { ok: true as const };
}
