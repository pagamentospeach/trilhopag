import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { getEffectiveUserId } from "@/lib/effective-user";
import { prisma } from "@/lib/prisma";
import {
  VENDAS_INCLUDE,
  parseVendasFiltros,
  serializeTx,
  vendasWhere,
} from "@/lib/vendas-query";

export const dynamic = "force-dynamic";

/**
 * Página de vendas da aba de entradas: paginação cursor-based E filtro.
 *
 * Antes (08/07/2026) servia só o botão "Ver mais": a page carregava as últimas
 * 50 fixas e esta rota trazia as próximas levas, sempre sem filtro nenhum.
 *
 * 08/08/2026 passou a fazer as duas coisas, porque os filtros saíram do
 * navegador e vieram pro banco (o porquê está em lib/vendas-query.ts). Com
 * isso mudaram duas regras:
 *
 *  - O `cursor` virou OPCIONAL. Sem cursor, a rota devolve a PRIMEIRA página
 *    do recorte — que é o que o cliente precisa assim que o seller mexe num
 *    filtro. Antes recusar sem cursor fazia sentido porque a primeira página
 *    só podia vir do server component; agora ela existe pra cada combinação
 *    de filtro, e nenhuma delas passa pelo render inicial.
 *  - O `where` e a serialização vêm do módulo compartilhado. Eram copiados à
 *    mão daqui e da page, e já tinham divergido uma vez (o `providerId` ficou
 *    quase duas semanas faltando só nas vendas paginadas).
 *
 * Params: cursor?, take (5..100), status, method, productId, checkoutId, q,
 * from, to, receipts.
 */
export async function GET(request: Request) {
  await requireSession();
  // 03/08/2026: usava session.user.id (conta PAI) enquanto a page.tsx usa
  // requireUserId() → getEffectiveUserId(). Dentro de uma sub-conta a pagina 1
  // trazia as vendas da SUB e o "Ver mais" trazia as do PAI — alem de quebrar
  // a paginacao, expunha transacao de outra conta pra quem opera a sub.
  const userId = await getEffectiveUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const takeRaw = Number(url.searchParams.get("take") ?? 50);
  const take = Math.max(5, Math.min(100, Number.isFinite(takeRaw) ? takeRaw : 50));
  const filtros = parseVendasFiltros(url.searchParams);

  // Cursor continua sendo validado contra o dono antes de virar cursor de
  // verdade — sem isso dá pra sondar a existência de ids alheios pela
  // diferença entre 404 e 200.
  if (cursor) {
    const cursorTx = await prisma.transaction.findFirst({
      where: { id: cursor, userId },
      select: { id: true },
    });
    if (!cursorTx) {
      return NextResponse.json({ error: "cursor_not_found" }, { status: 404 });
    }
  }

  const raw = await prisma.transaction.findMany({
    where: vendasWhere(userId, filtros),
    // Tiebreaker por id é obrigatório: sem ele o cursor não é determinístico
    // quando duas transações compartilham o mesmo `createdAt`.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: VENDAS_INCLUDE,
  });

  const hasMore = raw.length > take;
  const rows = hasMore ? raw.slice(0, take) : raw;

  return NextResponse.json({
    items: rows.map(serializeTx),
    hasMore,
    nextCursor: hasMore ? (rows[rows.length - 1]?.id ?? null) : null,
  });
}
