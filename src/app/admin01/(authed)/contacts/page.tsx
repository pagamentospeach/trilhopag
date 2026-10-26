import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate } from "@/lib/utils";
import { Contact, Phone, Mail, FileSpreadsheet, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * "Contatos capturados (reais)" — lista os telefones/emails de COMPRADORES
 * REAIS (não os dados que NÓS geramos via fake-customer pra destravar o PIX).
 *
 * REGRA do "contato real" (mesma no SQL e no /export):
 *  - provider <> 'test'  (exclui transações de teste)
 *  - providerPayload->>'admin_pix' IS DISTINCT FROM '1'  (exclui PIX de teste
 *    do admin — refresh de nominal / depósito nominal)
 *  - o campo NÃO foi auto-preenchido por nós: a chave do campo ("phone" /
 *    "email", exatamente como ensureValidCustomer empurra em autoFilled) NÃO
 *    está no array providerPayload->'auto_filled_fields'.
 *  - valor não-nulo e não-vazio.
 *
 * Dados sensíveis (PII de comprador) — somente admin. Sem vazamento.
 */
export default async function AdminContactsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin01/login");

  // Contagens DISTINCT de telefones e emails reais (cada uma com sua própria
  // regra de auto-fill: um telefone pode ser real mesmo que o email tenha sido
  // gerado, e vice-versa).
  const [phoneCountRows, emailCountRows] = await Promise.all([
    prisma.$queryRaw<Array<{ cnt: number }>>`
      SELECT COUNT(DISTINCT "customerPhone")::int AS cnt
      FROM "Transaction"
      WHERE "provider" <> 'test'
        AND ("providerPayload"->>'admin_pix') IS DISTINCT FROM '1'
        AND "customerPhone" IS NOT NULL
        AND "customerPhone" <> ''
        AND NOT COALESCE("providerPayload"->'auto_filled_fields' ? 'phone', false)
    `,
    prisma.$queryRaw<Array<{ cnt: number }>>`
      SELECT COUNT(DISTINCT "customerEmail")::int AS cnt
      FROM "Transaction"
      WHERE "provider" <> 'test'
        AND ("providerPayload"->>'admin_pix') IS DISTINCT FROM '1'
        AND "customerEmail" IS NOT NULL
        AND "customerEmail" <> ''
        AND NOT COALESCE("providerPayload"->'auto_filled_fields' ? 'email', false)
    `,
  ]);

  const distinctPhones = phoneCountRows[0]?.cnt ?? 0;
  const distinctEmails = emailCountRows[0]?.cnt ?? 0;

  // Lista (mais recentes primeiro, cap 500). Uma linha é "real" se o telefone
  // OU o email for real — e nessa linha mascaramos o campo que foi gerado por
  // nós (mostra "—") pra não exibir lixo aleatório como se fosse contato.
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      phone: string | null;
      email: string | null;
      amountCents: number;
      currency: string;
      createdAt: Date;
      sellerEmail: string | null;
      sellerName: string | null;
    }>
  >`
    SELECT
      t."id" AS id,
      CASE WHEN COALESCE(t."providerPayload"->'auto_filled_fields' ? 'phone', false)
           THEN NULL ELSE t."customerPhone" END AS phone,
      CASE WHEN COALESCE(t."providerPayload"->'auto_filled_fields' ? 'email', false)
           THEN NULL ELSE t."customerEmail" END AS email,
      t."amountCents" AS "amountCents",
      t."currency" AS currency,
      t."createdAt" AS "createdAt",
      u."email" AS "sellerEmail",
      u."name" AS "sellerName"
    FROM "Transaction" t
    LEFT JOIN "User" u ON u."id" = t."userId"
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
    LIMIT 500
  `;

  const fmtMoney = (cents: number, currency: string) => {
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: (currency || "BRL").toUpperCase(),
      }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`;
    }
  };

  return (
    <div className="space-y-5 max-w-7xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Contact className="size-6 text-red-400" />
          Contatos capturados (reais)
        </h1>
        <p className="text-sm text-zinc-400">
          Telefones e emails de compradores REAIS — exclui os dados que o sistema
          gera automaticamente pra destravar o PIX, PIX de teste do admin e
          transações de teste. PII sensível: uso interno, não compartilhar.
        </p>
      </header>

      {/* Métricas: totais DISTINCT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
            <Phone className="size-3.5 text-red-400" />
            Telefones reais (distintos)
          </div>
          <div className="mt-1 text-3xl font-bold text-white tabular-nums">
            {distinctPhones.toLocaleString("pt-BR")}
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
            <Mail className="size-3.5 text-red-400" />
            Emails reais (distintos)
          </div>
          <div className="mt-1 text-3xl font-bold text-white tabular-nums">
            {distinctEmails.toLocaleString("pt-BR")}
          </div>
        </div>
      </div>

      {/* Botões de download */}
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/admin01/contacts/export?format=csv"
          className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
        >
          <FileSpreadsheet className="size-4" />
          Baixar Excel
        </a>
        <a
          href="/admin01/contacts/export?format=txt"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
        >
          <FileText className="size-4" />
          Baixar TXT
        </a>
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-[1.3fr_1.6fr_1.6fr_110px_150px] gap-4 border-b border-white/[0.06] bg-black/30 px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-500">
          <span>Telefone</span>
          <span>Email</span>
          <span>Seller</span>
          <span className="text-right">Valor</span>
          <span className="text-right">Data</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">
            Nenhum contato real capturado ainda.
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[1.3fr_1.6fr_1.6fr_110px_150px] gap-4 border-b border-white/[0.04] px-5 py-3 text-sm items-center"
            >
              <div className="min-w-0 font-mono text-white truncate">
                {r.phone || <span className="text-zinc-600">—</span>}
              </div>
              <div className="min-w-0 text-zinc-200 truncate">
                {r.email || <span className="text-zinc-600">—</span>}
              </div>
              <div className="min-w-0">
                <p className="text-white truncate">
                  {r.sellerName || r.sellerEmail || "—"}
                </p>
                {r.sellerName && r.sellerEmail ? (
                  <p className="text-[10px] text-zinc-500 truncate">
                    {r.sellerEmail}
                  </p>
                ) : null}
              </div>
              <div className="text-right font-mono text-white tabular-nums text-xs">
                {fmtMoney(r.amountCents, r.currency)}
              </div>
              <div className="text-right text-[11px] text-zinc-400 tabular-nums">
                {formatDate(r.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-[11px] text-zinc-500">
        Mostrando as 500 transações mais recentes com contato real. As contagens
        no topo são DISTINCT sobre toda a base. Use os botões acima pra exportar
        tudo (até 50.000 linhas).
      </p>
    </div>
  );
}
