import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiLog } from "@/lib/api-log";
import { prisma } from "@/lib/prisma";
import { authenticate, errorResponse, requireScope } from "@/lib/api-response";
import { uniqueSlug } from "@/lib/slugify";
import { getCheckoutUrl } from "@/lib/checkout-url";

async function GET_handler(request: Request) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "products");
  if (scopeDenied) return scopeDenied;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const checkouts = await prisma.checkout.findMany({
    where: { userId: record.userId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = checkouts.length > limit;
  const data = hasMore ? checkouts.slice(0, -1) : checkouts;

  return NextResponse.json({
    data: data.map(serializeCheckout),
    has_more: hasMore,
    next_cursor: hasMore ? data[data.length - 1]?.id : null,
  });
}

const CreateBody = z.object({
  product_id: z.string().min(1),
  slug: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().default(true),
  payment_methods: z.array(z.enum(["pix", "card"])).default(["pix", "card"]),
});

async function POST_handler(request: Request) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "products");
  if (scopeDenied) return scopeDenied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      422,
      "validation_error",
      "Some fields are invalid.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.product_id, userId: record.userId },
    select: { id: true, name: true },
  });
  if (!product)
    return errorResponse(
      404,
      "product_not_found",
      "Product not found or does not belong to this account.",
    );

  const finalSlug = await uniqueSlug(
    parsed.data.slug && parsed.data.slug.length > 0 ? parsed.data.slug : product.name,
    async (s) => prisma.checkout.findUnique({ where: { slug: s }, select: { id: true } }),
  );

  const created = await prisma.checkout.create({
    data: {
      userId: record.userId,
      productId: product.id,
      slug: finalSlug,
      active: parsed.data.active,
      paymentMethods: parsed.data.payment_methods,
    },
  });

  return NextResponse.json(serializeCheckout(created), { status: 201 });
}

function serializeCheckout(c: {
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

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const GET = withApiLog(GET_handler);

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const POST = withApiLog(POST_handler);
