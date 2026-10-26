import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiLog } from "@/lib/api-log";
import { prisma } from "@/lib/prisma";
import { authenticate, errorResponse, requireScope } from "@/lib/api-response";
import { slugify, uniqueSlug } from "@/lib/slugify";
import { validateSafeName, validateSafeText } from "@/lib/security/safe-input";

const UpdateBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  image: z.string().url().nullable().optional(),
  type: z.enum(["DIGITAL", "PHYSICAL", "SUBSCRIPTION", "SERVICE"]).optional(),
  price_cents: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  slug: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional(),
  interval_days: z.number().int().positive().nullable().optional(),
});

async function load(userId: string, id: string) {
  return prisma.product.findFirst({ where: { id, userId } });
}

function serialize(p: {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  type: string;
  priceCents: number;
  currency: string;
  slug: string;
  active: boolean;
  intervalDays: number | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    object: "product",
    name: p.name,
    description: p.description,
    image: p.image,
    type: p.type,
    price_cents: p.priceCents,
    currency: p.currency,
    slug: p.slug,
    active: p.active,
    interval_days: p.intervalDays,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
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
  const product = await load(record.userId, id);
  if (!product)
    return errorResponse(404, "not_found", `Product ${id} not found.`);
  return NextResponse.json(serialize(product));
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
    return errorResponse(404, "not_found", `Product ${id} not found.`);

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

  // XSS defense (16/07/2026): mesma validação do POST. Reject na entrada,
  // não confia só no escape do React.
  if (parsed.data.name !== undefined) {
    const check = validateSafeName(parsed.data.name);
    if (!check.ok) {
      return errorResponse(422, "validation_error", check.reason, { name: [check.reason] });
    }
  }
  if (parsed.data.description) {
    const check = validateSafeText(parsed.data.description, { maxLen: 2000 });
    if (!check.ok) {
      return errorResponse(422, "validation_error", check.reason, {
        description: [check.reason],
      });
    }
  }

  let finalSlug = existing.slug;
  if (parsed.data.slug && slugify(parsed.data.slug) !== existing.slug) {
    finalSlug = await uniqueSlug(parsed.data.slug, async (s) =>
      prisma.product.findFirst({ where: { slug: s, NOT: { id } }, select: { id: true } }),
    );
  }

  const d = parsed.data;
  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.description !== undefined && { description: d.description }),
      ...(d.image !== undefined && { image: d.image }),
      ...(d.type !== undefined && { type: d.type }),
      ...(d.price_cents !== undefined && { priceCents: d.price_cents }),
      ...(d.currency !== undefined && { currency: d.currency }),
      ...(d.slug !== undefined && { slug: finalSlug }),
      ...(d.active !== undefined && { active: d.active }),
      ...(d.interval_days !== undefined && { intervalDays: d.interval_days }),
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
    return errorResponse(404, "not_found", `Product ${id} not found.`);
  await prisma.product.delete({ where: { id } });
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
