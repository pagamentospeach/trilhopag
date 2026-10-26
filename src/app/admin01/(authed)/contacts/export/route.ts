import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Export dos CONTATOS REAIS de compradores (telefones + emails), em CSV
 * (Excel) ou TXT. Somente admin. Mesma regra de "contato real" da página
 * /admin01/contacts:
 *  - provider <> 'test'
 *  - providerPayload->>'admin_pix' IS DISTINCT FROM '1'
 *  - o campo NÃO está em providerPayload->'auto_filled_fields' (chaves
 *    "phone"/"email" empurradas por ensureValidCustomer)
 *  - valor não-nulo e não-vazio.
 *
 * PII sensível de comprador — admin-only, sem vazar.
 */

type Row = {
  phone: string | null;
  email: string | null;
  sellerEmail: string | null;
  amountCents: number;
  currency: string;
  createdAt: Date;
  checkoutSlug: string | null;
  transactionId: string;
};

/**
 * Anti-CSV-injection + RFC-4180 quoting (próprio, espelhando o esc() do
 * antigo export de cartões, MAS endurecido contra fórmulas).
 *
 *  1. Se a célula começa com `= + - @`, TAB (\t) ou CR (\r), prefixa com `'`
 *     pra neutralizar fórmulas/DDE no Excel/Sheets.
 *  2. Se a célula contém `"`, `,`, `\n` ou `\r`, envolve em aspas duplas e
 *     escapa as aspas internas duplicando-as ("" ).
 */
function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // 1) Neutraliza injeção de fórmula: primeiro caractere perigoso.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  // 2) Quoting CSV se houver caractere especial.
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "txt" ? "txt" : "csv";

  // Mesma regra REAL da página. Campos auto-preenchidos viram NULL
  // individualmente (telefone gerado some, email real fica, e vice-versa).
  // Linha entra se TEM telefone real OU email real. Cap 50.000.
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      CASE WHEN COALESCE(t."providerPayload"->'auto_filled_fields' ? 'phone', false)
           THEN NULL ELSE t."customerPhone" END AS phone,
      CASE WHEN COALESCE(t."providerPayload"->'auto_filled_fields' ? 'email', false)
           THEN NULL ELSE t."customerEmail" END AS email,
      u."email" AS "sellerEmail",
      t."amountCents" AS "amountCents",
      t."currency" AS currency,
      t."createdAt" AS "createdAt",
      c."slug" AS "checkoutSlug",
      t."id" AS "transactionId"
    FROM "Transaction" t
    LEFT JOIN "User" u ON u."id" = t."userId"
    LEFT JOIN "Checkout" c ON c."id" = t."checkoutId"
    WHERE t."provider" <> 'test'
      AND (t."providerPayload"->>'admin_pix') IS DISTINCT FROM '1'
      AND (
        (
          t."customerPhone" IS NOT NULL AND t."customerPhone" <> ''
          AND NOT COALESCE(t."providerPayload"->'auto_filled_fields' ? 'phone', false)
        )
        OR
        (
          t."customerEmail" IS NOT NULL AND t."customerEmail" <> ''
          AND NOT COALESCE(t."providerPayload"->'auto_filled_fields' ? 'email', false)
        )
      )
    ORDER BY t."createdAt" DESC
    LIMIT 50000
  `;

  const dateStr = new Date().toISOString().split("T")[0];

  // Auditoria best-effort — não quebra o export se falhar.
  await logAdminAction(admin.admin.id, "contacts_export", undefined, {
    format,
    rowCount: rows.length,
  }).catch(() => {});

  if (format === "txt") {
    // Uma linha por contato: "phone | email | sellerEmail".
    const body = rows
      .map((r) =>
        [r.phone ?? "", r.email ?? "", r.sellerEmail ?? ""].join(" | "),
      )
      .join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="contatos-${dateStr}.txt"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // CSV (Excel abre). BOM pra UTF-8 correto no Excel.
  const headers = [
    "phone",
    "email",
    "sellerEmail",
    "amountCents",
    "currency",
    "createdAt",
    "checkoutSlug",
    "transactionId",
  ];
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((r) =>
      [
        r.phone,
        r.email,
        r.sellerEmail,
        r.amountCents,
        r.currency,
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : new Date(r.createdAt).toISOString(),
        r.checkoutSlug,
        r.transactionId,
      ]
        .map(esc)
        .join(","),
    ),
  ];
  const csv = "﻿" + lines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contatos-${dateStr}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
