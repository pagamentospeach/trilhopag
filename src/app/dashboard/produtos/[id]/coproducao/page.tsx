import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { CoproducerForm } from "./form";
import { CoproducerRowActions } from "./row-actions";

export default async function CoproducaoTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUserId();
  const coproducers = await prisma.coproducer.findMany({
    where: { productId: id },
    orderBy: { createdAt: "asc" },
  });
  const totalSplit = coproducers.reduce(
    (s, c) => (c.active ? s + c.splitPercent : s),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-yellow-300">
          Coprodução / Sócios
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Divida automaticamente a receita líquida com co-produtores. A divisão
          é registrada no momento da venda (split real em breve via subaccounts SafePix).
        </p>
      </div>

      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-400">
              Total dividido
            </p>
            <p className="mt-1 text-2xl font-semibold text-white tabular-nums">
              {totalSplit.toFixed(2)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-zinc-400">
              Você recebe
            </p>
            <p className="mt-1 text-2xl font-semibold text-cyan-300 tabular-nums">
              {(100 - totalSplit).toFixed(2)}%
            </p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full bg-gradient-to-r from-yellow-400 to-orange-500"
            style={{ width: `${totalSplit}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <h3 className="text-sm font-medium text-white">Adicionar coprodutor</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Quem entra como coprodutor recebe o % definido sobre o líquido.
        </p>
        <div className="mt-4">
          <CoproducerForm productId={id} maxSplit={100 - totalSplit} />
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <h3 className="text-sm font-medium text-white">Coprodutores</h3>
        </div>
        {coproducers.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-zinc-500">
            Nenhum coprodutor adicionado.
          </div>
        ) : (
          <div>
            {coproducers.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-12 gap-4 border-b border-white/[0.04] px-5 py-4 text-sm last:border-b-0"
              >
                <div className="col-span-5">
                  <p className="font-medium text-white">
                    {c.name ?? c.email.split("@")[0]}
                  </p>
                  <p className="text-xs text-zinc-500">{c.email}</p>
                </div>
                <div className="col-span-3">
                  <p className="text-cyan-300 font-mono font-semibold">
                    {c.splitPercent.toFixed(2)}%
                  </p>
                </div>
                <div className="col-span-2">
                  {c.active ? (
                    <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs text-cyan-300">
                      Ativo
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-xs text-zinc-400">
                      Pausado
                    </span>
                  )}
                </div>
                <div className="col-span-2 flex justify-end">
                  <CoproducerRowActions coproducerId={c.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
