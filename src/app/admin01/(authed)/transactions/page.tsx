import { prisma } from "@/lib/prisma";
import { type Prisma, TransactionStatus } from "@prisma/client";
import { acquirerNominalLabel } from "@/lib/utils";
import { TxAdminRow } from "./tx-admin-row";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;

const STATUSES: TransactionStatus[] = [
  TransactionStatus.PAID,
  TransactionStatus.PENDING,
  TransactionStatus.REFUNDED,
  TransactionStatus.CHARGEBACK,
  TransactionStatus.EXPIRED,
  TransactionStatus.FAILED,
];

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = STATUSES.find((s) => s === sp.status);

  // Filtra transações reais (exclui as de teste: provider="test") + busca/status.
  const where: Prisma.TransactionWhereInput = { provider: { not: "test" } };
  if (status) where.status = status;
  if (q) {
    // 27/07/2026 (davi 'esses provider id nao estao certos, nao to conseguindo
    // achar as transacoes'). Filtro nao buscava em providerId — quando davi
    // colava o UUID do PSP (ex: Pluggou) nao achava a tx. Adicionado.
    where.OR = [
      { customerEmail: { contains: q, mode: "insensitive" } },
      { id: { contains: q, mode: "insensitive" } },
      { providerId: { contains: q, mode: "insensitive" } },
      { user: { is: { email: { contains: q, mode: "insensitive" } } } },
      { user: { is: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const txs = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PER_PAGE,
    select: {
      id: true,
      amountCents: true,
      feeCents: true,
      netCents: true,
      status: true,
      method: true,
      customerEmail: true,
      paidAt: true,
      createdAt: true,
      providerId: true,
      providerPayload: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          pixOpsMode: true,
          balanceCents: true,
        },
      },
    },
  });

  // ADQUIRENTE POR TRANSAÇÃO — resolve nominalName + shortCode de cada tx a
  // partir de providerPayload.acquirer_id (mesmo padrão do perfil do seller).
  function txAcquirerId(t: { providerPayload: unknown }): string | null {
    const p = t.providerPayload as Record<string, unknown> | null;
    return typeof p?.acquirer_id === "string" && p.acquirer_id
      ? p.acquirer_id
      : null;
  }
  const txAcqIds = [
    ...new Set(txs.map(txAcquirerId).filter((v): v is string => !!v)),
  ];
  const txAcqs = txAcqIds.length
    ? await prisma.acquirer.findMany({
        where: { id: { in: txAcqIds } },
        select: { id: true, nominalName: true, institution: true, shortCode: true, code: true },
      })
    : [];
  const txAcqById = new Map(txAcqs.map((a) => [a.id, a]));
  function acqForTx(t: { providerPayload: unknown }): {
    nominal: string;
    shortCode: string | null;
  } | null {
    const acqId = txAcquirerId(t);
    if (!acqId) return null;
    const a = txAcqById.get(acqId);
    if (!a) return { nominal: acqId, shortCode: null };
    return {
      nominal: acquirerNominalLabel(a.nominalName || a.code, a.institution),
      shortCode: a.shortCode,
    };
  }

  // Array serializável pros rows client (datas → ISO strings).
  const rows = txs.map((t) => ({
    id: t.id,
    amountCents: t.amountCents,
    feeCents: t.feeCents,
    netCents: t.netCents,
    status: t.status,
    method: t.method,
    customerEmail: t.customerEmail,
    createdAt: t.createdAt.toISOString(),
    paidAt: t.paidAt ? t.paidAt.toISOString() : null,
    // providerId sempre visivel (21/07/2026 david) — bate a tx no painel do PSP.
    providerId: t.providerId,
    acquirerNominal: acqForTx(t)?.nominal ?? null,
    acquirerShortCode: acqForTx(t)?.shortCode ?? null,
    userId: t.user.id,
    userName: t.user.name,
    userEmail: t.user.email,
    userPixOpsMode: t.user.pixOpsMode,
    userBalanceCents: t.user.balanceCents,
  }));

  return (
    <div className="space-y-5 max-w-7xl">
      <header>
        <h1 className="text-2xl font-bold text-white">Transações</h1>
        <p className="text-sm text-zinc-400">
          Últimas {PER_PAGE} transações reais da plataforma (todas as contas).
          Lucro do gateway, adquirente, modo e saldo do seller por venda.
        </p>
      </header>

      {/* Busca + filtro de status (GET, server-side) */}
      <form
        method="get"
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por email, seller ou ID da tx…"
          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-1.5 text-sm text-white placeholder:text-zinc-600"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-lg border border-white/[0.08] bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
        >
          <option value="">Todos os status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-cyan-400 px-4 py-1.5 text-sm font-bold text-black hover:bg-cyan-300"
        >
          Filtrar
        </button>
        {(q || status) && (
          <a
            href="/admin01/transactions"
            className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white"
          >
            Limpar
          </a>
        )}
      </form>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 border-b border-white/[0.06] bg-black/30 px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-500">
          <span className="col-span-2">Data</span>
          <span className="col-span-3">Seller / cliente</span>
          <span className="col-span-2">Método / status</span>
          <span className="col-span-2">Valor / lucro</span>
          <span className="col-span-3 text-right">Ações</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">
            Nenhuma transação encontrada.
          </p>
        ) : (
          rows.map((t) => <TxAdminRow key={t.id} tx={t} />)
        )}
      </div>
    </div>
  );
}
