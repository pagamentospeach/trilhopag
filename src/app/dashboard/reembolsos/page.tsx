import { redirect } from "next/navigation";
import { RotateCcw, FileX, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatBRL } from "@/lib/utils";
import { ReembolsosList } from "./client";

export const dynamic = "force-dynamic";

/**
 * Lista de reembolsos + chargebacks.
 *
 * Filtra transações com status REFUNDED ou CHARGEBACK do user (igual
 * /vendas, mas só pra essas status).
 *
 * IMPORTANTE: as taxas internas (R$10 por reembolso, R$50 por chargeback)
 * NÃO são exibidas aqui — elas são debitadas silenciosamente no momento
 * em que markTransactionRefunded/Chargedback rodam.
 */
export default async function ReembolsosPage() {
  const userId = await requireUserId();

  // Reembolso só existe em operação WHITE/HOT. Seller em BLACK não tem aba de
  // reembolsos — bloqueia o acesso direto à página (URL) também.
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { pixOpsMode: true },
  });
  if ((me?.pixOpsMode ?? "black") === "black") redirect("/dashboard");

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      // Invisibilidade total do desvio
      divertedToAcquirer: false,
      divertedToReferrer: false,
      status: { in: ["REFUNDED", "CHARGEBACK"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { product: { select: { name: true } } },
  });

  const totalRefundedCents = transactions.reduce(
    (sum, t) => sum + t.amountCents,
    0,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <RotateCcw className="size-5 text-orange-400" /> Reembolsos
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Visualize e gerencie todos os reembolsos realizados
          </p>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 flex items-center gap-4">
          <span className="inline-flex size-12 items-center justify-center rounded-xl bg-blue-400/15 text-blue-300">
            <RotateCcw className="size-5" />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">
              Total Estornado
            </p>
            <p className="mt-0.5 text-2xl font-bold text-white tabular-nums">
              {formatBRL(totalRefundedCents)}
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 flex items-center gap-4">
          <span className="inline-flex size-12 items-center justify-center rounded-xl bg-blue-400/15 text-blue-300">
            <Clock className="size-5" />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">
              Quantidade de Reembolsos
            </p>
            <p className="mt-0.5 text-2xl font-bold text-white tabular-nums">
              {transactions.length}
            </p>
          </div>
        </div>
      </div>

      {/* List */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <p className="text-sm font-semibold text-white">Lista de Reembolsos</p>
          <p className="text-[11px] text-zinc-500">
            {transactions.length} reembolso{transactions.length !== 1 ? "s" : ""}{" "}
            encontrado{transactions.length !== 1 ? "s" : ""}
          </p>
        </div>

        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-white/[0.04] text-zinc-500 mb-3">
              <FileX className="size-5" />
            </span>
            <p className="text-sm font-medium text-white">
              Nenhum reembolso encontrado
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Os reembolsos aparecerão aqui quando ocorrerem
            </p>
          </div>
        ) : (
          <ReembolsosList
            items={transactions.map((t) => ({
              id: t.id,
              createdAt: t.createdAt.toISOString(),
              updatedAt: t.updatedAt.toISOString(),
              customerName: t.customerName,
              customerEmail: t.customerEmail,
              productName: t.product.name,
              method: t.method,
              status: t.status,
              amountCents: t.amountCents,
            }))}
          />
        )}
      </section>
    </div>
  );
}
