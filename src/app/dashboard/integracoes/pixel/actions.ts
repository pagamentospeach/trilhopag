"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

// Pixels de CONTA (account-wide): productId = null. Disparam pra TODAS as
// vendas do seller via fireConversionEvents (tracking-dispatcher.ts).
// Foco em Facebook + TikTok, conforme pedido do seller.
const Input = z.object({
  platform: z.enum(["FACEBOOK", "TIKTOK"]),
  pixelId: z.string().trim().min(1).max(120),
  capiToken: z.string().trim().max(500).optional().nullable(),
  testEventCode: z.string().trim().max(60).optional().nullable(),
  eventPurchase: z.coerce.boolean().optional(),
  eventInitiateCheckout: z.coerce.boolean().optional(),
  valueMode: z.enum(["gross", "net"]).default("gross"),
});

export async function createAccountPixel(formData: FormData) {
  const userId = await requireUserId();

  const parsed = Input.safeParse({
    platform: formData.get("platform"),
    pixelId: formData.get("pixelId"),
    capiToken: formData.get("capiToken") || null,
    testEventCode: formData.get("testEventCode") || null,
    eventPurchase: formData.get("eventPurchase") === "on",
    eventInitiateCheckout: formData.get("eventInitiateCheckout") === "on",
    valueMode: formData.get("valueMode") ?? "gross",
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Dados inválidos." };
  }

  await prisma.trackingPixel.create({
    data: {
      userId,
      productId: null, // account-wide
      platform: parsed.data.platform,
      pixelId: parsed.data.pixelId,
      capiToken: parsed.data.capiToken || null,
      testEventCode: parsed.data.testEventCode || null,
      eventPurchase: parsed.data.eventPurchase ?? true,
      eventInitiateCheckout: parsed.data.eventInitiateCheckout ?? false,
      valueMode: parsed.data.valueMode,
    },
  });

  revalidatePath("/dashboard/integracoes/pixel");
  return { ok: true as const };
}

export async function deleteAccountPixel(pixelId: string) {
  const userId = await requireUserId();
  const pixel = await prisma.trackingPixel.findFirst({
    where: { id: pixelId, userId, productId: null },
    select: { id: true },
  });
  if (!pixel) return { ok: false as const, error: "Pixel não encontrado." };
  await prisma.trackingPixel.delete({ where: { id: pixelId } });
  revalidatePath("/dashboard/integracoes/pixel");
  return { ok: true as const };
}

export async function toggleAccountPixel(pixelId: string) {
  const userId = await requireUserId();
  const pixel = await prisma.trackingPixel.findFirst({
    where: { id: pixelId, userId, productId: null },
    select: { id: true, active: true },
  });
  if (!pixel) return { ok: false as const, error: "Pixel não encontrado." };
  await prisma.trackingPixel.update({
    where: { id: pixelId },
    data: { active: !pixel.active },
  });
  revalidatePath("/dashboard/integracoes/pixel");
  return { ok: true as const };
}
