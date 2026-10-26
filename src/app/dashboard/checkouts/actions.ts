"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { slugify, uniqueSlug } from "@/lib/slugify";
import { checkOnAction } from "@/lib/achievements";
import { safeHttpUrl } from "@/lib/security/safe-url";

const CheckoutInput = z.object({
  productId: z.string().min(1, "Selecione um produto"),
  slug: z.string().trim().max(80).optional(),
  active: z.coerce.boolean().optional(),
  paymentMethods: z.array(z.string()).optional(),
  priceCentsOverride: z.coerce.number().int().min(0).optional().nullable(),
  videoUrl: safeHttpUrl().optional().nullable().or(z.literal("")),
  videoHeadline: z.string().trim().max(200).optional().nullable(),
  bumpProductId: z.string().optional().nullable(),
  bumpPosition: z.enum(["top", "above_payment", "below_payment", "after_cta"]).optional().nullable(),
  // safeHttpUrl: SÓ http(s) — bloqueia javascript:/data: (XSS via
  // window.location no back-redirect/thank-you/upsell do checkout).
  upsellUrl: safeHttpUrl().optional().nullable().or(z.literal("")),
  thankYouUrl: safeHttpUrl().optional().nullable().or(z.literal("")),
  backRedirectUrl: safeHttpUrl().optional().nullable().or(z.literal("")),
  facebookPixelId: z.string().trim().max(120).optional().nullable(),
  tiktokPixelId: z.string().trim().max(120).optional().nullable(),
  themeJson: z.string().optional().nullable(),
});

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createCheckout(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();

  const methods: string[] = [];
  if (formData.get("method_pix") === "on") methods.push("pix");
  if (formData.get("method_card") === "on") methods.push("card");
  if (
    formData.get("method_applepay") === "on" ||
    formData.get("method_apple_pay") === "on"
  )
    methods.push("apple_pay");
  if (
    formData.get("method_googlepay") === "on" ||
    formData.get("method_google_pay") === "on"
  )
    methods.push("google_pay");

  const parsed = CheckoutInput.safeParse({
    productId: formData.get("productId"),
    slug: formData.get("slug") || undefined,
    active: formData.get("active") === "on",
    paymentMethods: methods,
    // CRITICAL FIX (jun/2026): faltava ler priceCentsOverride aqui.
    // Resultado: TODO checkout novo era criado SEM preco proprio, caindo
    // no priceCents do Product (que ficou em R$ 0,01 desde a mudanca pra
    // "preco por oferta"). Sellers viam preco fixo R$ 0,01 em tudo.
    priceCentsOverride: formData.get("priceCentsOverride") || undefined,
    upsellUrl: formData.get("upsellUrl") || null,
    backRedirectUrl: formData.get("backRedirectUrl") || null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, userId },
    select: { id: true, name: true },
  });
  if (!product) return { ok: false, error: "Produto não encontrado." };

  const internalName = (formData.get("internalName") as string | null)?.trim() || null;
  const visibleName = (formData.get("visibleName") as string | null)?.trim() || null;
  const template = ((formData.get("template") as string | null) || "auto").trim();

  const finalSlug = await uniqueSlug(
    parsed.data.slug && parsed.data.slug.length > 0
      ? parsed.data.slug
      : internalName || product.name,
    async (s) =>
      prisma.checkout.findUnique({ where: { slug: s }, select: { id: true } }),
  );

  // Moeda do checkout — guardada no theme.currency. Default BRL.
  // Valida pra so aceitar moedas suportadas pelo formatter.
  const currencyRaw = (formData.get("currency") as string | null) || "BRL";
  const currency = ["BRL", "USD", "EUR"].includes(currencyRaw.toUpperCase())
    ? currencyRaw.toUpperCase()
    : "BRL";

  // Salva nomes interno/visível, template e currency no theme JSON
  const themeData: Record<string, string | null> = {
    template,
    currency,
  };
  if (internalName) themeData.internalName = internalName;
  if (visibleName) themeData.visibleName = visibleName;

  await prisma.checkout.create({
    data: {
      userId,
      productId: product.id,
      slug: finalSlug,
      active: parsed.data.active ?? true,
      paymentMethods: methods.length > 0 ? methods : ["pix"],
      priceCentsOverride:
        parsed.data.priceCentsOverride && parsed.data.priceCentsOverride > 0
          ? parsed.data.priceCentsOverride
          : null,
      upsellUrl: parsed.data.upsellUrl || null,
      backRedirectUrl: parsed.data.backRedirectUrl || null,
      theme: themeData as unknown as object,
    },
  });

  await checkOnAction(userId, "checkout_created");
  revalidatePath(`/dashboard/produtos/${product.id}`);
  redirect(`/dashboard/produtos/${product.id}`);
}

export async function updateCheckout(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const methods: string[] = [];
  if (formData.get("method_pix") === "on") methods.push("pix");
  if (formData.get("method_card") === "on") methods.push("card");
  if (
    formData.get("method_applepay") === "on" ||
    formData.get("method_apple_pay") === "on"
  )
    methods.push("apple_pay");
  if (
    formData.get("method_googlepay") === "on" ||
    formData.get("method_google_pay") === "on"
  )
    methods.push("google_pay");

  const parsed = CheckoutInput.safeParse({
    productId: formData.get("productId"),
    slug: formData.get("slug") || undefined,
    active: formData.get("active") === "on",
    paymentMethods: methods,
    priceCentsOverride: formData.get("priceCentsOverride") || undefined,
    videoUrl: formData.get("videoUrl") || null,
    videoHeadline: formData.get("videoHeadline") || null,
    bumpProductId: formData.get("bumpProductId") || null,
    bumpPosition: formData.get("bumpPosition") || null,
    upsellUrl: formData.get("upsellUrl") || null,
    thankYouUrl: formData.get("thankYouUrl") || null,
    backRedirectUrl: formData.get("backRedirectUrl") || null,
    facebookPixelId: formData.get("facebookPixelId") || null,
    tiktokPixelId: formData.get("tiktokPixelId") || null,
    themeJson: formData.get("themeJson") || null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const existing = await prisma.checkout.findFirst({
    where: { id, userId },
    select: { id: true, slug: true, productId: true },
  });
  if (!existing) return { ok: false, error: "Checkout não encontrado." };

  const desiredSlug =
    parsed.data.slug && parsed.data.slug.length > 0
      ? slugify(parsed.data.slug)
      : existing.slug;

  let finalSlug = desiredSlug;
  if (desiredSlug !== existing.slug) {
    finalSlug = await uniqueSlug(desiredSlug, async (s) =>
      prisma.checkout.findFirst({
        where: { slug: s, NOT: { id } },
        select: { id: true },
      }),
    );
  }

  let themeData: unknown = undefined;
  if (parsed.data.themeJson) {
    try {
      themeData = JSON.parse(parsed.data.themeJson);
    } catch {
      // ignore invalid JSON, keep current theme
    }
  }

  await prisma.checkout.update({
    where: { id },
    data: {
      productId: parsed.data.productId,
      slug: finalSlug,
      active: parsed.data.active ?? true,
      paymentMethods: methods.length > 0 ? methods : ["pix"],
      priceCentsOverride:
        parsed.data.priceCentsOverride && parsed.data.priceCentsOverride > 0
          ? parsed.data.priceCentsOverride
          : null,
      videoUrl:
        parsed.data.videoUrl && parsed.data.videoUrl.length > 0
          ? parsed.data.videoUrl
          : null,
      videoHeadline: parsed.data.videoHeadline || null,
      bumpProductId: parsed.data.bumpProductId || null,
      bumpPosition: parsed.data.bumpPosition || "below_payment",
      upsellUrl: parsed.data.upsellUrl || null,
      thankYouUrl: parsed.data.thankYouUrl || null,
      backRedirectUrl: parsed.data.backRedirectUrl || null,
      facebookPixelId: parsed.data.facebookPixelId || null,
      tiktokPixelId: parsed.data.tiktokPixelId || null,
      ...(themeData !== undefined ? { theme: themeData as never } : {}),
    },
  });

  revalidatePath(`/dashboard/produtos/${existing.productId}`);
  revalidatePath(`/dashboard/produtos/${existing.productId}/ofertas/${id}`);
  revalidatePath(`/c/${finalSlug}`);
  return { ok: true };
}

export async function deleteCheckout(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const existing = await prisma.checkout.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Checkout não encontrado." };
  await prisma.checkout.delete({ where: { id } });
  revalidatePath("/dashboard/checkouts");
  return { ok: true };
}

export async function duplicateCheckout(
  id: string,
): Promise<{ ok: true; newId: string } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const source = await prisma.checkout.findFirst({
    where: { id, userId },
  });
  if (!source) return { ok: false, error: "Checkout não encontrado." };

  const newSlug = await uniqueSlug(`${source.slug}-copy`, async (s) =>
    prisma.checkout.findUnique({ where: { slug: s }, select: { id: true } }),
  );

  const copy = await prisma.checkout.create({
    data: {
      userId,
      productId: source.productId,
      slug: newSlug,
      active: source.active,
      theme: source.theme as never,
      paymentMethods: source.paymentMethods,
      bumpProductId: source.bumpProductId,
      upsellProductId: source.upsellProductId,
      videoUrl: source.videoUrl,
      videoHeadline: source.videoHeadline,
    },
  });

  revalidatePath(`/dashboard/produtos/${source.productId}`);
  return { ok: true, newId: copy.id };
}

/** Quick-update: upsell + backRedirect + preço da oferta (usado em /produtos/[id]) */
export async function updateCheckoutUrls(
  id: string,
  upsellUrl: string | null,
  backRedirectUrl: string | null,
  priceCentsOverride?: number | null,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const c = await prisma.checkout.findFirst({
    where: { id, userId },
    select: { id: true, productId: true },
  });
  if (!c) return { ok: false, error: "Oferta não encontrada." };

  // Valida URLs (vazio = null). SÓ http(s) — `new URL()` cru aceitava
  // javascript:/data: → XSS no back-redirect/upsell (window.location).
  function valid(u: string | null): string | null {
    if (!u) return null;
    const trimmed = u.trim();
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }
      return trimmed;
    } catch {
      return null;
    }
  }

  // Valida preço: positivo > 0 ou null (= usa preço base do produto)
  let priceCleaned: number | null | undefined = undefined;
  if (priceCentsOverride !== undefined) {
    if (priceCentsOverride === null || priceCentsOverride <= 0) {
      priceCleaned = null;
    } else if (priceCentsOverride > 100_000_000) {
      return { ok: false, error: "Preço inválido (máximo R$ 1.000.000)." };
    } else {
      priceCleaned = Math.floor(priceCentsOverride);
    }
  }

  await prisma.checkout.update({
    where: { id },
    data: {
      upsellUrl: valid(upsellUrl),
      backRedirectUrl: valid(backRedirectUrl),
      ...(priceCleaned !== undefined ? { priceCentsOverride: priceCleaned } : {}),
    },
  });
  revalidatePath(`/dashboard/produtos/${c.productId}`);
  return { ok: true };
}
