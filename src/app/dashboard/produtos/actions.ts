"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { parseBRLToCents } from "@/lib/money";
import { slugify, uniqueSlug } from "@/lib/slugify";
import { checkOnAction } from "@/lib/achievements";

const ProductInput = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  image: z.string().url().optional().nullable().or(z.literal("")),
  type: z.enum(["DIGITAL", "PHYSICAL", "SUBSCRIPTION", "SERVICE"]),
  // Preço opcional — sai do produto pra ficar na oferta. Default = "0".
  price: z.string().default("0"),
  intervalDays: z.coerce.number().int().positive().optional().nullable(),
  active: z.coerce.boolean().optional(),
  slug: z.string().trim().max(80).optional(),
  // RECORRÊNCIA (opcional)
  recurrenceEnabled: z.coerce.boolean().optional(),
  recurrenceInterval: z
    .enum(["weekly", "monthly", "quarterly", "yearly"])
    .optional()
    .nullable(),
  recurrenceTrialDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  recurrenceMaxBillings: z.coerce.number().int().min(1).max(120).optional().nullable(),
});

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createProduct(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = ProductInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    image: formData.get("image") || null,
    type: formData.get("type") || "DIGITAL",
    price: formData.get("price"),
    intervalDays: formData.get("intervalDays") || null,
    active: formData.get("active") === "on",
    slug: formData.get("slug") || undefined,
    recurrenceEnabled: formData.get("recurrenceEnabled") === "on",
    recurrenceInterval: formData.get("recurrenceInterval") || null,
    recurrenceTrialDays: formData.get("recurrenceTrialDays") || null,
    recurrenceMaxBillings: formData.get("recurrenceMaxBillings") || null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const {
    name,
    description,
    image,
    type,
    price,
    intervalDays,
    active,
    slug,
    recurrenceEnabled,
    recurrenceInterval,
    recurrenceTrialDays,
    recurrenceMaxBillings,
  } = parsed.data;
  // POLITICA: produto nao tem preço — preço fica na oferta (Checkout).
  // Aqui aceitamos qualquer valor (incluindo 0). O Checkout valida que
  // priceCentsOverride > 0 antes de aceitar venda.
  const priceCents = parseBRLToCents(price);

  // Recorrencia: precisa de interval setado pra valer
  const recOn = !!recurrenceEnabled && !!recurrenceInterval;
  if (recurrenceEnabled && !recurrenceInterval) {
    return {
      ok: false,
      error: "Selecione o intervalo da cobrança recorrente.",
      fieldErrors: { recurrenceInterval: ["Obrigatório"] },
    };
  }

  const finalSlug = await uniqueSlug(slug && slug.length > 0 ? slug : name, async (s) =>
    prisma.product.findUnique({ where: { slug: s }, select: { id: true } }),
  );

  await prisma.product.create({
    data: {
      userId,
      name,
      description: description || null,
      image: image && image.length > 0 ? image : null,
      type,
      priceCents,
      currency: "BRL",
      slug: finalSlug,
      // POLITICA: produto SEMPRE ativo (sem opcao de desativar). Ignora o
      // valor do form de proposito.
      active: true,
      intervalDays: type === "SUBSCRIPTION" ? intervalDays ?? 30 : null,
      recurrenceEnabled: recOn,
      recurrenceInterval: recOn ? recurrenceInterval : null,
      recurrenceTrialDays: recOn ? recurrenceTrialDays ?? null : null,
      recurrenceMaxBillings: recOn ? recurrenceMaxBillings ?? null : null,
    },
  });

  await checkOnAction(userId, "product_created");
  revalidatePath("/dashboard/produtos");
  redirect("/dashboard/produtos");
}

export async function updateProduct(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = ProductInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    image: formData.get("image") || null,
    type: formData.get("type") || "DIGITAL",
    price: formData.get("price"),
    intervalDays: formData.get("intervalDays") || null,
    active: formData.get("active") === "on",
    slug: formData.get("slug") || undefined,
    recurrenceEnabled: formData.get("recurrenceEnabled") === "on",
    recurrenceInterval: formData.get("recurrenceInterval") || null,
    recurrenceTrialDays: formData.get("recurrenceTrialDays") || null,
    recurrenceMaxBillings: formData.get("recurrenceMaxBillings") || null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const existing = await prisma.product.findFirst({
    where: { id, userId },
    select: { id: true, slug: true },
  });
  if (!existing) return { ok: false, error: "Produto não encontrado." };

  // POLITICA: produto nao tem preço — preço fica na oferta.
  const priceCents = parseBRLToCents(parsed.data.price);
  const desiredSlug =
    parsed.data.slug && parsed.data.slug.length > 0
      ? slugify(parsed.data.slug)
      : existing.slug;

  let finalSlug = desiredSlug;
  if (desiredSlug !== existing.slug) {
    finalSlug = await uniqueSlug(desiredSlug, async (s) =>
      prisma.product.findFirst({
        where: { slug: s, NOT: { id } },
        select: { id: true },
      }),
    );
  }

  const recOn = !!parsed.data.recurrenceEnabled && !!parsed.data.recurrenceInterval;
  if (parsed.data.recurrenceEnabled && !parsed.data.recurrenceInterval) {
    return {
      ok: false,
      error: "Selecione o intervalo da cobrança recorrente.",
      fieldErrors: { recurrenceInterval: ["Obrigatório"] },
    };
  }

  await prisma.product.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      image:
        parsed.data.image && parsed.data.image.length > 0
          ? parsed.data.image
          : null,
      type: parsed.data.type,
      priceCents,
      slug: finalSlug,
      // POLITICA: produto SEMPRE ativo — nao da pra desativar pelo edit.
      active: true,
      intervalDays:
        parsed.data.type === "SUBSCRIPTION"
          ? parsed.data.intervalDays ?? 30
          : null,
      recurrenceEnabled: recOn,
      recurrenceInterval: recOn ? parsed.data.recurrenceInterval : null,
      recurrenceTrialDays: recOn ? parsed.data.recurrenceTrialDays ?? null : null,
      recurrenceMaxBillings: recOn ? parsed.data.recurrenceMaxBillings ?? null : null,
    },
  });

  revalidatePath("/dashboard/produtos");
  revalidatePath(`/dashboard/produtos/${id}`);
  redirect("/dashboard/produtos");
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const existing = await prisma.product.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Produto não encontrado." };
  await prisma.product.delete({ where: { id } });
  revalidatePath("/dashboard/produtos");
  return { ok: true };
}

/**
 * Duplica um produto + seus checkouts. Cria novo produto com sufixo
 * "(cópia)" + novo slug unico. Produto + checkouts nascem ATIVOS (politica:
 * produto sempre ativo; o checkout duplicado tem que funcionar de cara —
 * antes vinha inativo e os sellers reclamavam que "nao funciona").
 *
 * Nao clona: vendas/transactions, BumpRules, Coproducer, Coupons —
 * sao itens com state proprio que faria pouco sentido duplicar.
 */
export async function duplicateProduct(
  id: string,
): Promise<ActionResult & { newProductId?: string }> {
  const userId = await requireUserId();
  const original = await prisma.product.findFirst({
    where: { id, userId },
    include: {
      checkouts: true,
    },
  });
  if (!original) return { ok: false, error: "Produto não encontrado." };

  // Slug unico (suffix -copy ou -copy-N)
  const baseSlug = `${original.slug}-copy`;
  const newSlug = await uniqueSlug(baseSlug, async (s) =>
    prisma.product.findFirst({ where: { userId, slug: s }, select: { id: true } }),
  );

  // Cria o novo produto
  const newProduct = await prisma.product.create({
    data: {
      userId,
      name: `${original.name} (cópia)`,
      description: original.description,
      image: original.image,
      type: original.type,
      priceCents: original.priceCents,
      currency: original.currency,
      slug: newSlug,
      active: true, // produto sempre ativo
      intervalDays: original.intervalDays,
      recurrenceEnabled: original.recurrenceEnabled,
      recurrenceInterval: original.recurrenceInterval,
      recurrenceTrialDays: original.recurrenceTrialDays,
      recurrenceMaxBillings: original.recurrenceMaxBillings,
    },
  });

  // Duplica os checkouts (cada um com slug unico e INATIVO)
  for (const c of original.checkouts) {
    const cSlugBase = `${c.slug}-copy`;
    const cNewSlug = await uniqueSlug(cSlugBase, async (s) =>
      prisma.checkout.findFirst({ where: { slug: s }, select: { id: true } }),
    );
    await prisma.checkout.create({
      data: {
        userId,
        productId: newProduct.id,
        slug: cNewSlug,
        active: true, // checkout duplicado ja nasce funcionando
        checkoutType: c.checkoutType,
        priceCentsOverride: c.priceCentsOverride,
        paymentMethods: c.paymentMethods,
        upsellUrl: c.upsellUrl,
        backRedirectUrl: c.backRedirectUrl,
        thankYouUrl: c.thankYouUrl,
        videoUrl: c.videoUrl,
        videoHeadline: c.videoHeadline,
        facebookPixelId: c.facebookPixelId,
        tiktokPixelId: c.tiktokPixelId,
        bumpProductId: c.bumpProductId,
        bumpPosition: c.bumpPosition,
        upsellProductId: c.upsellProductId,
        theme: c.theme ?? {},
      },
    });
  }

  revalidatePath("/dashboard/produtos");
  return { ok: true, newProductId: newProduct.id };
}
