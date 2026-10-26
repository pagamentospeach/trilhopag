import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiLog } from "@/lib/api-log";
import { prisma } from "@/lib/prisma";
import { authenticate, errorResponse, requireScope } from "@/lib/api-response";
import { slugify, uniqueSlug } from "@/lib/slugify";
import { getCheckoutUrl } from "@/lib/checkout-url";

const UpdateBody = z.object({
  product_id: z.string().min(1).optional(),
  slug: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional(),
  payment_methods: z.array(z.enum(["pix", "card"])).optional(),
});

function serialize(c: {
  id: string;
  productId: string;
  slug: string;
  active: boolean;
  paymentMethods: string[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    object: "checkout",
    product_id: c.productId,
    slug: c.slug,
    url: getCheckoutUrl(c.slug),
    active: c.active,
    payment_methods: c.paymentMethods,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

async function load(userId: string, id: string) {
  return prisma.checkout.findFirst({ where: { id, userId } });
}

async function GET_handler(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "products");
  if (scopeDenied) return scopeDenied;
  const { id } = await ctx.params;
  const c = await load(record.userId, id);
  if (!c) return errorResponse(404, "not_found", `Checkout ${id} not found.`);
  return NextResponse.json(serialize(c));
}

async function PATCH_handler(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "products");
  if (scopeDenied) return scopeDenied;
  const { id } = await ctx.params;
  const existing = await load(record.userId, id);
  if (!existing)
    return errorResponse(404, "not_found", `Checkout ${id} not found.`);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
  }
  const parsed = UpdateBody.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      422,
      "validation_error",
      "Some fields are invalid.",
      parsed.error.flatten().fieldErrors,
    );
  }

  if (parsed.data.product_id) {
    const owns = await prisma.product.findFirst({
      where: { id: parsed.data.product_id, userId: record.userId },
      select: { id: true },
    });
    if (!owns)
      return errorResponse(
        404,
        "product_not_found",
        "Product not found or does not belong to this account.",
      );
  }

  let finalSlug = existing.slug;
  if (parsed.data.slug && slugify(parsed.data.slug) !== existing.slug) {
    finalSlug = await uniqueSlug(parsed.data.slug, async (s) =>
      prisma.checkout.findFirst({ where: { slug: s, NOT: { id } }, select: { id: true } }),
    );
  }

  const d = parsed.data;
  const updated = await prisma.checkout.update({
    where: { id },
    data: {
      ...(d.product_id !== undefined && { productId: d.product_id }),
      ...(d.slug !== undefined && { slug: finalSlug }),
      ...(d.active !== undefined && { active: d.active }),
      ...(d.payment_methods !== undefined && { paymentMethods: d.payment_methods }),
    },
  });
  return NextResponse.json(serialize(updated));
}

async function DELETE_handler(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "products");
  if (scopeDenied) return scopeDenied;
  const { id } = await ctx.params;
  const existing = await load(record.userId, id);
  if (!existing)
    return errorResponse(404, "not_found", `Checkout ${id} not found.`);
  await prisma.checkout.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const GET = withApiLog(GET_handler);

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const PATCH = withApiLog(PATCH_handler);

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const DELETE = withApiLog(DELETE_handler);
