import { Search } from "lucide-react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  BulkUsersTable,
  MoveAllToMode,
  FeesForAllFilter,
} from "./bulk-users-table";
import { buildLinkModeDefaults } from "@/lib/link-mode-defaults";
import {
  isOpsMode,
  OPS_MODE_LABEL,
  OPS_MODES,
  type OpsMode,
} from "@/lib/ops-modes";

type SP = {
  q?: string;
  mode?: string;
  kyc?: string;
  blocked?: string;
  page?: string;
  fee_violation?: string;
};

const PER_PAGE = 200;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const mode = isOpsMode(sp.mode) ? sp.mode : "all";
  const kyc = sp.kyc ?? "all";
  const blocked = sp.blocked ?? "all";
  const pageNum = Math.max(1, Number(sp.page) || 1);

  // WHERE base (busca + KYC + bloqueio) — SEM o filtro de modo, pra contar as abas.
  const baseWhere: Prisma.UserWhereInput = { role: { not: "admin" } };
  if (q) {
    // 23/07/2026 (davi): busca tambem no subAccountLinkedEmail — sub-contas
    // guardam o email real fornecido pelo seller nesse campo, agora aparecem
    // na busca por email como se fossem contas principais.
    baseWhere.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { subAccountLinkedEmail: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { id: q },
    ];
  }
  if (kyc === "not_started") baseWhere.kycStatus = "not_started";
  else if (kyc === "review") baseWhere.kycStatus = { in: ["under_review", "in_review"] };
  else if (kyc === "approved") baseWhere.kycStatus = "approved";
  else if (kyc === "rejected") baseWhere.kycStatus = "rejected";
  if (blocked === "1") baseWhere.blocked = true;
  else if (blocked === "0") baseWhere.blocked = false;

  // Contagem por modo (pra rótulo das abas) + WHERE final com o modo aplicado.
  const where: Prisma.UserWhereInput = { ...baseWhere };
  if (mode !== "all") where.pixOpsMode = mode;

  // FILTRO fee_violation (08/07/2026 david): admin clicou no alerta da
  // AlertsBar → lista SO os sellers com taxa PIX abaixo do minimo
  // (BLACK/WHITE). Filtro complexo (JSON em feesByMode), aplicamos em
  // memoria depois do fetch.
  const showOnlyFeeViolators = sp.fee_violation === "1";
  if (showOnlyFeeViolators) {
    // Pra ter certeza que os violators aparecem, ignora paginacao e mode
    // filter — o alerta tem urgencia sobre navegacao.
    where.pixOpsMode = undefined;
  }

  const [usersRaw, modeGroups, totalCount, modeDefaults] = await Promise.all([
    prisma.user.findMany({
      where,
      // Maior saldo SACÁVEL (disponível) no topo, conforme pedido.
      orderBy: [{ balanceCents: "desc" }, { createdAt: "desc" }],
      // No modo fee_violation, pega TODOS (limite maior + skip 0). Filtro
      // in-memory abaixo reduz pra so os violators.
      skip: showOnlyFeeViolators ? 0 : (pageNum - 1) * PER_PAGE,
      take: showOnlyFeeViolators ? 2000 : PER_PAGE,
      select: {
        id: true, email: true, name: true, balanceCents: true,
        pendingBalanceCents: true, feePercent: true, feeFixedCents: true,
        feesByMode: true, cardFeePercent: true,
        blocked: true, kycStatus: true, role: true, pixOpsMode: true, createdAt: true,
        // 23/07/2026 (davi): sub-conta agora tem email real do seller — mostra
        // ele no lugar do email interno (@subaccount.trilhopag.local).
        isSubAccount: true, subAccountLinkedEmail: true,
      },
    }),
    prisma.user.groupBy({ by: ["pixOpsMode"], where: baseWhere, _count: { _all: true } }),
    prisma.user.count({ where: baseWhere }),
    prisma.platformModeDefaults.findMany(),
  ]);

  // Aplica filtro fee_violation em memoria (feesByMode e JSONB — Prisma
  // nao tem where nativo pra "chave menor que X").
  let users = usersRaw;
  if (showOnlyFeeViolators) {
    const { MIN_PIX_FEE_PERCENT_BLACK_WHITE, MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE } =
      await import("@/lib/fees");
    users = usersRaw.filter((u) => {
      const byMode = (u.feesByMode as Record<
        string,
        Record<string, number | null> | undefined
      > | null) ?? null;
      for (const m of ["black", "white"] as const) {
        const cfg = byMode?.[m] ?? null;
        const effPct = cfg?.pixPct != null ? cfg.pixPct : u.feePercent;
        const effCents = cfg?.pixFix != null ? cfg.pixFix : u.feeFixedCents;
        if (
          effPct < MIN_PIX_FEE_PERCENT_BLACK_WHITE ||
          effCents < MIN_PIX_FEE_FIXED_CENTS_BLACK_WHITE
        ) {
          return true;
        }
      }
      return false;
    });
  }

  // Default do editor de taxas EM MASSA = PlatformModeDefaults por modo.
  const defByMode = new Map(modeDefaults.map((d) => [d.mode, d]));
  const dm = (m: string) => defByMode.get(m);
  const platformFees = buildLinkModeDefaults((mode, field) => {
    const d = dm(mode);
    if (field === "pixPct") return d?.feePercent ?? 6.99;
    if (field === "pixFix") return d?.feeFixedCents ?? 250;
    if (field === "cardPct") return d?.cardFeePercent ?? 9.9;
    return d?.cardFeeFixedCents ?? 360;
  }, dm("white")?.withdrawalFeeCents ?? dm("black")?.withdrawalFeeCents ?? 200);

  const cntByMode = new Map(modeGroups.map((g) => [g.pixOpsMode, g._count._all]));
  const modeCount = (m: string) => cntByMode.get(m) ?? 0;

  // PIX conversion rate por user — últimos 30 dias.
  const userIds = users.map((u) => u.id);
  const ago30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const pixStats = userIds.length
    ? await prisma.transaction.groupBy({
        by: ["userId", "status"],
        where: { userId: { in: userIds }, method: "PIX", createdAt: { gt: ago30d } },
        _count: { _all: true },
      })
    : [];
  const conversionByUser = new Map<string, { paid: number; lost: number }>();
  for (const g of pixStats) {
    const cur = conversionByUser.get(g.userId) ?? { paid: 0, lost: 0 };
    if (g.status === "PAID") cur.paid += g._count._all;
    if (g.status === "EXPIRED" || g.status === "FAILED" || g.status === "CANCELED") cur.lost += g._count._all;
    conversionByUser.set(g.userId, cur);
  }

  // Helpers de URL preservando os outros filtros. NÃO carrega `page` por padrão:
  // trocar busca/aba/KYC/status reseta pra página 1. Só os links de paginação
  // passam `page` explicitamente em `over`.
  function href(over: Partial<SP>) {
    const next: SP = { q: q || undefined, mode: mode === "all" ? undefined : mode, kyc: kyc === "all" ? undefined : kyc, blocked: blocked === "all" ? undefined : blocked, ...over };
    if (next.page === "1") delete next.page;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, String(v));
    const s = params.toString();
    return "/admin01/users" + (s ? `?${s}` : "");
  }

  // Paginação: total da VISÃO atual (respeita a aba de modo) → nº de páginas.
  const viewTotal = mode === "all" ? totalCount : modeCount(mode);
  const totalPages = Math.max(1, Math.ceil(viewTotal / PER_PAGE));
  const firstIdx = viewTotal === 0 ? 0 : (pageNum - 1) * PER_PAGE + 1;
  const lastIdx = (pageNum - 1) * PER_PAGE + users.length;

  // Cor da aba por modo. Vem daqui (e não de OPS_MODE_META) porque é a paleta
  // desta lista específica; o rótulo, esse sim, é o central.
  const MODE_TAB_CLS: Record<OpsMode, string> = {
    black: "text-zinc-200",
    white: "text-sky-300",
    hot: "text-orange-300",
    sag: "text-cyan-300",
  };
  const MODES = [
    { key: "all", label: "Todos", count: totalCount, cls: "text-white" },
    ...OPS_MODES.map((m) => ({
      key: m,
      label: OPS_MODE_LABEL[m],
      count: modeCount(m),
      cls: MODE_TAB_CLS[m],
    })),
  ];
  const KYCS = [
    { key: "all", label: "KYC: todos" },
    { key: "not_started", label: "Não iniciado" },
    { key: "review", label: "Em análise" },
    { key: "approved", label: "Aprovado" },
    { key: "rejected", label: "Rejeitado" },
  ];
  const BLOCKS = [
    { key: "all", label: "Status: todos" },
    { key: "0", label: "Ativos" },
    { key: "1", label: "Bloqueados" },
  ];

  return (
    <div className="space-y-4 max-w-7xl">
      <header>
        <h1 className="text-2xl font-bold text-white">Usuários</h1>
        <p className="text-sm text-zinc-400">
          Listas por modo de adquirente · ordenadas por maior saldo sacável.
        </p>
      </header>

      {/* Abas por MODO de adquirente */}
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <Link
              key={m.key}
              href={href({ mode: m.key === "all" ? undefined : (m.key as SP["mode"]) })}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                active
                  ? "border-red-500/50 bg-red-500/15 " + m.cls
                  : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]"
              }`}
            >
              {m.label}
              <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-300">
                {m.count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Filtros KYC + bloqueio + busca */}
      <div className="flex flex-wrap items-center gap-2">
        {KYCS.map((k) => (
          <Link
            key={k.key}
            href={href({ kyc: k.key === "all" ? undefined : k.key })}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
              kyc === k.key ? "bg-amber-400/20 text-amber-200 border border-amber-400/40" : "bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] border border-transparent"
            }`}
          >
            {k.label}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-white/10" />
        {BLOCKS.map((b) => (
          <Link
            key={b.key}
            href={href({ blocked: b.key === "all" ? undefined : b.key })}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
              blocked === b.key ? "bg-red-500/20 text-red-200 border border-red-500/40" : "bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] border border-transparent"
            }`}
          >
            {b.label}
          </Link>
        ))}
        <form className="ml-auto flex items-center gap-2">
          {mode !== "all" && <input type="hidden" name="mode" value={mode} />}
          {kyc !== "all" && <input type="hidden" name="kyc" value={kyc} />}
          {blocked !== "all" && <input type="hidden" name="blocked" value={blocked} />}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="email, nome ou ID..."
              className="w-64 rounded-lg border border-white/[0.08] bg-white/[0.02] pl-10 pr-3 py-2 text-sm text-white placeholder:text-zinc-500"
            />
          </div>
          <button type="submit" className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400">
            Buscar
          </button>
        </form>
      </div>

      <p className="text-[11px] text-zinc-500">
        Mostrando {firstIdx}–{lastIdx} de {viewTotal}{" "}
        {mode !== "all" ? `no modo ${mode} ` : ""}· página {pageNum} de{" "}
        {totalPages} (200 por página).
      </p>

      <MoveAllToMode
        filter={{
          q: q || undefined,
          mode: mode === "all" ? undefined : mode,
          kyc: kyc === "all" ? undefined : kyc,
          blocked: blocked === "all" ? undefined : blocked,
        }}
        count={viewTotal}
      />

      <FeesForAllFilter
        filter={{
          q: q || undefined,
          mode: mode === "all" ? undefined : mode,
          kyc: kyc === "all" ? undefined : kyc,
          blocked: blocked === "all" ? undefined : blocked,
        }}
        count={viewTotal}
        platformFees={platformFees}
      />

      <BulkUsersTable
        platformFees={platformFees}
        users={users.map((u) => {
          const stats = conversionByUser.get(u.id);
          const sample = stats ? stats.paid + stats.lost : 0;
          const convRate = sample > 0 ? (stats!.paid / sample) * 100 : null;
          return {
            id: u.id,
            name: u.name,
            // Sub-conta: mostra o email real fornecido pelo seller (o email
            // "u.email" e um placeholder interno sub-XXXX@subaccount.trilhopag.local).
            email:
              u.isSubAccount && u.subAccountLinkedEmail
                ? u.subAccountLinkedEmail
                : u.email,
            balanceCents: u.balanceCents,
            feePercent: u.feePercent,
            cardFeePercent: u.cardFeePercent,
            blocked: u.blocked,
            kycStatus: u.kycStatus,
            convRate,
            sample,
            paid: stats?.paid ?? 0,
          };
        })}
      />

      {/* Paginação — 200 por página */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3 pt-1">
          {pageNum > 1 ? (
            <Link
              href={href({ page: String(pageNum - 1) })}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.07]"
            >
              ← Anterior
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.05] px-4 py-2 text-xs font-semibold text-zinc-600">
              ← Anterior
            </span>
          )}

          <span className="text-[11px] tabular-nums text-zinc-500">
            Página {pageNum} de {totalPages}
          </span>

          {pageNum < totalPages ? (
            <Link
              href={href({ page: String(pageNum + 1) })}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/25"
            >
              Próxima →
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.05] px-4 py-2 text-xs font-semibold text-zinc-600">
              Próxima →
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
