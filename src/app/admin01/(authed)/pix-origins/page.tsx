import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDate } from "@/lib/utils";
import { Network, ExternalLink, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Auditoria: de quais domínios as APIs de PIX estão sendo chamadas.
 * Agrupa as últimas 30 dias por (originHost, userId) com counts e GMV.
 *
 * Útil pra:
 *  - Detectar se algum seller tá usando um domínio que não foi verificado
 *  - Ver concentração de tráfego por domínio (popularidade)
 *  - Auditar se o domínio custom realmente está sendo usado vs padrão
 */
export default async function AdminPixOriginsPage() {
  // Pega TODAS as transações dos últimos 30 dias e agrega manualmente
  // (Prisma groupBy não suporta múltiplas dimensões com joins facilmente)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const txs = await prisma.transaction.findMany({
    where: { createdAt: { gte: since } },
    select: {
      originHost: true,
      userId: true,
      amountCents: true,
      status: true,
      user: { select: { email: true, name: true } },
    },
    take: 50000,
  });

  // Agrupa por host + user
  type Bucket = {
    host: string;
    userId: string;
    userEmail: string;
    userName: string;
    count: number;
    paidCount: number;
    pendingCount: number;
    gmvCents: number;
  };
  const buckets = new Map<string, Bucket>();
  for (const t of txs) {
    const host = (t.originHost ?? "(sem host)").toLowerCase();
    const key = `${host}|${t.userId}`;
    const b = buckets.get(key) ?? {
      host,
      userId: t.userId,
      userEmail: t.user.email,
      userName: t.user.name ?? t.user.email,
      count: 0,
      paidCount: 0,
      pendingCount: 0,
      gmvCents: 0,
    };
    b.count++;
    if (t.status === "PAID") {
      b.paidCount++;
      b.gmvCents += t.amountCents;
    } else if (t.status === "PENDING") {
      b.pendingCount++;
    }
    buckets.set(key, b);
  }

  const rows = [...buckets.values()].sort((a, b) => b.count - a.count);

  // Verifica quais hosts são domínios verificados
  const allHosts = new Set(rows.map((r) => r.host));
  const customDomains = await prisma.customDomain.findMany({
    where: { domain: { in: [...allHosts] } },
    select: { domain: true, status: true, userId: true },
  });
  const verifiedHosts = new Map<string, { status: string; ownerUserId: string }>();
  for (const d of customDomains) {
    verifiedHosts.set(d.domain.toLowerCase(), {
      status: d.status,
      ownerUserId: d.userId,
    });
  }

  const PADRAO = "trilhopag.com";

  return (
    <div className="space-y-5 max-w-7xl">
      <header>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Network className="size-6 text-cyan-400" />
          Origem das chamadas PIX
        </h1>
        <p className="text-sm text-zinc-400">
          Últimos 30 dias. Agrupado por (domínio + seller). Mostra de onde cada
          seller está disparando geração de PIX.
        </p>
      </header>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-[2fr_1.5fr_100px_100px_100px_140px] gap-4 border-b border-white/[0.06] bg-black/30 px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-500">
          <span>Domínio</span>
          <span>Seller</span>
          <span className="text-right">Total</span>
          <span className="text-right">Pagos</span>
          <span className="text-right">Pendentes</span>
          <span className="text-right">GMV pago</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">
            Sem transações nos últimos 30 dias.
          </p>
        ) : (
          rows.map((r, i) => {
            const isPadrao = r.host === PADRAO || r.host.endsWith(`.${PADRAO}`);
            const customInfo = verifiedHosts.get(r.host);
            const ownerMismatch =
              !!customInfo && customInfo.ownerUserId !== r.userId;
            return (
              <div
                key={`${r.host}-${r.userId}-${i}`}
                className="grid grid-cols-[2fr_1.5fr_100px_100px_100px_140px] gap-4 border-b border-white/[0.04] px-5 py-3 text-sm items-center"
              >
                <div className="min-w-0">
                  <a
                    href={`https://${r.host}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-white hover:text-cyan-300 truncate"
                  >
                    {r.host}
                    <ExternalLink className="size-3 opacity-50" />
                  </a>
                  <div className="flex items-center gap-2 mt-0.5">
                    {isPadrao ? (
                      <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-[9px] text-zinc-400">
                        DOMÍNIO PADRÃO
                      </span>
                    ) : customInfo ? (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] ${
                          customInfo.status === "verified"
                            ? "bg-cyan-400/15 text-cyan-300"
                            : "bg-yellow-400/15 text-yellow-300"
                        }`}
                      >
                        CUSTOM · {customInfo.status.toUpperCase()}
                      </span>
                    ) : (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] text-red-300">
                        DOMÍNIO NÃO REGISTRADO
                      </span>
                    )}
                    {ownerMismatch && (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] text-red-300">
                        ⚠ DONO DO DOMÍNIO ≠ SELLER
                      </span>
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  <Link
                    href={`/admin01/users/${r.userId}`}
                    className="text-white truncate hover:text-cyan-300 inline-flex items-center gap-1"
                  >
                    {r.userName}
                    <ChevronRight className="size-3 opacity-50" />
                  </Link>
                  <p className="text-[10px] text-zinc-500 truncate">
                    {r.userEmail}
                  </p>
                </div>
                <div className="text-right font-mono text-white tabular-nums">
                  {r.count}
                </div>
                <div className="text-right font-mono text-cyan-300 tabular-nums">
                  {r.paidCount}
                </div>
                <div className="text-right font-mono text-yellow-300 tabular-nums">
                  {r.pendingCount}
                </div>
                <div className="text-right font-mono text-white tabular-nums text-xs">
                  {formatBRL(r.gmvCents)}
                </div>
              </div>
            );
          })
        )}
      </div>
      <p className="text-[11px] text-zinc-500">
        Limite de 50.000 transações analisadas. Período: 30 dias.{" "}
        Domínios sem registro ou com dono diferente são prováveis casos de
        uso indevido — auditar manualmente.
      </p>
    </div>
  );
}
