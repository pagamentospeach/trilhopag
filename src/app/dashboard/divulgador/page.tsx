import { redirect } from "next/navigation";
import Link from "next/link";
import { Clapperboard, Plus, Eye, Edit3, Trash2, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatBRL } from "@/lib/utils";
import { DivulgadorListClient } from "./list-client";

export const dynamic = "force-dynamic";

/**
 * Lista de sub-contas DivulgadorAccount do user. Só acessível por user
 * com isPlayerDivulgador=true. Caso contrário, redireciona pro dashboard
 * (a página nem aparece no sidebar então o user comum nunca chega aqui).
 */
export default async function DivulgadorListPage() {
  const userId = await requireUserId();
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlayerDivulgador: true },
  });
  if (!u || !u.isPlayerDivulgador) {
    redirect("/dashboard");
  }

  const accounts = await prisma.divulgadorAccount.findMany({
    where: { ownerUserId: userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      balanceCents: true,
      last30dRevenueCents: true,
      todayRevenueCents: true,
      todaySalesCount: true,
      lifetimeNetCents: true,
      updatedAt: true,
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-purple-300 inline-flex items-center gap-2">
            <Clapperboard className="size-3.5" /> Modo Divulgador
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Sub-contas para divulgação
          </h1>
          <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
            Crie sub-contas <strong>100% visuais</strong> com números
            personalizados (saldo, faturamento, vendas, ROI). Use pra prints,
            Reels, vídeos de divulgação. <strong>Nada é real</strong> — não
            tem saldo movel, não gera PIX, não tem produtos. Cada sub-conta é
            uma view independente.
          </p>
        </div>
        <DivulgadorListClient />
      </header>

      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-purple-400/30 bg-purple-400/[0.03] p-8 text-center">
          <Clapperboard className="mx-auto size-10 text-purple-300" />
          <p className="mt-4 text-base font-semibold text-white">
            Você ainda não tem sub-contas de divulgação
          </p>
          <p className="mt-1 text-sm text-zinc-400 max-w-md mx-auto">
            Cada sub-conta tem números editáveis (saldo, faturamento de
            hoje/30d, ROI, vendas, gráfico de 30 dias, feed de vendas).
            Crie uma e personalize tudo antes de gravar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((a) => (
            <article
              key={a.id}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-purple-400/30 transition flex flex-col gap-3"
            >
              <header className="flex items-start gap-3">
                <div className="size-10 rounded-full bg-purple-400/10 inline-flex items-center justify-center overflow-hidden shrink-0">
                  {a.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.avatarUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="text-base font-bold text-purple-300">
                      {a.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {a.name}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate font-mono">
                    {a.email}
                  </p>
                </div>
              </header>

              <div className="grid grid-cols-2 gap-2 rounded-lg bg-black/30 p-3">
                <Stat
                  label="Saldo"
                  value={formatBRL(a.balanceCents)}
                  accent="text-cyan-300"
                />
                <Stat
                  label="Hoje"
                  value={formatBRL(a.todayRevenueCents)}
                  sub={`${a.todaySalesCount} venda${a.todaySalesCount !== 1 ? "s" : ""}`}
                />
                <Stat
                  label="Últimos 30d"
                  value={formatBRL(a.last30dRevenueCents)}
                  accent="text-purple-300"
                />
                <Stat label="Lifetime" value={formatBRL(a.lifetimeNetCents)} />
              </div>

              <footer className="flex gap-1.5 mt-auto">
                <Link
                  href={`/dashboard/divulgador/${a.id}/view`}
                  target="_blank"
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-purple-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-400"
                >
                  <Eye className="size-3" /> Abrir
                </Link>
                <Link
                  href={`/dashboard/divulgador/${a.id}`}
                  className="inline-flex items-center justify-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.08]"
                >
                  <Edit3 className="size-3" /> Editar
                </Link>
                <DeleteButton id={a.id} name={a.name} />
              </footer>

              <p className="text-[10px] text-zinc-600 tabular-nums">
                Atualizada {new Date(a.updatedAt).toLocaleString("pt-BR")}
              </p>
            </article>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="size-5 text-purple-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white">
              Como usar essas sub-contas?
            </p>
            <ul className="mt-2 space-y-1 text-xs text-zinc-400">
              <li>
                • Edite os números (saldo, faturamento de hoje/30d, vendas,
                ROI, ROAS, lucro, gasto em ads — tudo aceita texto livre).
              </li>
              <li>
                • Clique em &quot;Abrir&quot; pra ver a sub-conta como se
                fosse o dashboard real (perfeito pra prints/gravações).
              </li>
              <li>
                • Cada sub-conta tem URL única (
                <code className="text-zinc-300">
                  /dashboard/divulgador/&lt;id&gt;/view
                </code>
                ) — use pra screen recording.
              </li>
              <li>
                • Nada na sub-conta funciona de verdade. Não gera vendas,
                não saca, não tem produtos.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-bold tabular-nums ${
          accent ?? "text-white"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[9px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  // Client-side confirm via form action — server action wrapper
  return (
    <form action={async () => {
      "use server";
      const { deleteDivulgadorAccount } = await import("./actions");
      await deleteDivulgadorAccount(id);
    }}>
      <button
        type="submit"
        title={`Apagar "${name}"`}
        className="inline-flex items-center justify-center rounded-full border border-red-400/20 bg-red-400/[0.06] px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/[0.12]"
      >
        <Trash2 className="size-3" />
      </button>
    </form>
  );
}
