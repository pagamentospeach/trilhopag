import { Repeat, TrendingUp, AlertTriangle, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatBRL } from "@/lib/utils";
import { customIntervalDays, intervalLabel } from "@/lib/recurrence";
import { EmptyState } from "@/components/empty-state";
import { PrivateText } from "@/components/dashboard/private-text";
import { PageHeader, StatCard } from "@/components/dashboard/page-kit";
import { AssinaturasList, type Assinatura } from "./client";

/**
 * ASSINATURAS — a recorrência que já rodava sem ninguém poder olhar.
 *
 * 08/08/2026, seção 9 do prompt de revamp. O model `Subscription` existe há
 * tempos, é criado por `createSubscriptionFromTransaction` e cobrado por cron,
 * mas NÃO havia uma única tela no painel: o seller tinha assinatura ativa,
 * inadimplente e cancelada acontecendo e só descobria pelo extrato. Havia API
 * pública (/api/v1/subscriptions), o que só piora — dava pra ver por curl e não
 * pelo produto.
 *
 * Como no módulo de Clientes, a subscription nasce dentro de
 * `fireSellerSidePaidDispatches`, que retorna cedo em venda de teste e em
 * desvio. Então o que está aqui é, por construção, só o que o seller pode ver.
 *
 * O QUE NÃO TEM, DE PROPÓSITO:
 *  - "Pausar". Não existe status paused no model (ver actions.ts).
 *  - "Pagamentos pendentes" como cartão separado de "inadimplência". O model
 *    tem um sinal só pra isso (`status:"past_due"` + `failedAttempts`), então
 *    dois cartões seriam o mesmo número com dois nomes.
 *  - Histórico de cobranças por assinatura. As transações filhas não guardam
 *    `subscriptionId` (só a subscription aponta pra última transação), então
 *    montar a lista exigiria casar por email+produto+data, que é adivinhação.
 *    Fica registrado como pendência de backend, não simulado na tela.
 */

/** Dias médios de um mês. Usado só pra normalizar o MRR. */
const DIAS_MES = 30.44;

/**
 * Converte o valor do ciclo em valor MENSAL equivalente.
 *
 * MRR de uma base com ciclos misturados (semanal, trimestral, anual) só faz
 * sentido normalizado — somar `amountCents` cru daria um número que não é
 * receita de mês nenhum. Anual dividido por 12, semanal multiplicado por
 * 52/12, e assim por diante.
 */
function mensalizar(amountCents: number, interval: string): number {
  switch (interval) {
    case "weekly":
      return (amountCents * 52) / 12;
    case "monthly":
      return amountCents;
    case "quarterly":
      return amountCents / 3;
    case "yearly":
      return amountCents / 12;
    default: {
      const dias = customIntervalDays(interval);
      return dias ? (amountCents * DIAS_MES) / dias : amountCents;
    }
  }
}

export default async function AssinaturasPage() {
  const userId = await requireUserId();

  const [subs, porStatus] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId },
      // Ativas primeiro (status asc põe "active" antes de "canceled"), e
      // dentro delas a que cobra mais cedo no topo — que é a ordem em que o
      // seller precisa agir.
      orderBy: [{ status: "asc" }, { nextBillingAt: "asc" }],
      take: 200,
      select: {
        id: true,
        customerEmail: true,
        customerName: true,
        interval: true,
        amountCents: true,
        status: true,
        billingsCount: true,
        failedAttempts: true,
        nextBillingAt: true,
        currentPeriodStart: true,
        product: { select: { name: true } },
      },
    }),
    prisma.subscription.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
  ]);

  const conta = (s: string) =>
    porStatus.find((g) => g.status === s)?._count._all ?? 0;
  const ativas = conta("active");
  const inadimplentes = conta("past_due");
  const canceladas = conta("canceled");
  const total = porStatus.reduce((acc, g) => acc + g._count._all, 0);

  // MRR conta só `active`. `past_due` está falhando cobrança — contar como
  // receita garantida seria contar dinheiro que não entrou. O cartão de
  // inadimplência ao lado é justamente quem mostra esse risco.
  const mrrCents = Math.round(
    subs
      .filter((s) => s.status === "active")
      .reduce((acc, s) => acc + mensalizar(s.amountCents, s.interval), 0),
  );

  const items: Assinatura[] = subs.map((s) => ({
    id: s.id,
    cliente: s.customerName?.trim() || s.customerEmail,
    email: s.customerEmail,
    produto: s.product?.name ?? "Produto removido",
    valor: formatBRL(s.amountCents),
    periodicidade: intervalLabel(s.interval),
    status: s.status,
    cobrancas: s.billingsCount,
    falhas: s.failedAttempts,
    proxima: s.nextBillingAt.toISOString(),
    desde: s.currentPeriodStart.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        Icon={Repeat}
        titulo="Assinaturas"
        descricao="Suas cobranças recorrentes: quem está ativo, quanto entra por mês e quem está falhando."
      />

      {total === 0 ? (
        <EmptyState
          title="Nenhuma assinatura ainda"
          description="Assinaturas aparecem aqui quando alguém compra um produto configurado como recorrente."
          cta={{ label: "Ver meus produtos", href: "/dashboard/produtos" }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard Icon={Repeat} label="Ativas" value={String(ativas)} />
            <StatCard
              Icon={TrendingUp}
              label="MRR"
              value={formatBRL(mrrCents)}
              sub="Receita mensal equivalente das ativas"
              money
            />
            <StatCard
              Icon={AlertTriangle}
              label="Inadimplentes"
              value={String(inadimplentes)}
              sub={
                inadimplentes > 0 ? "Cobrança falhou, ainda tentando" : undefined
              }
              accent={inadimplentes > 0 ? "text-amber-300" : undefined}
            />
            <StatCard
              Icon={XCircle}
              label="Canceladas"
              value={String(canceladas)}
            />
          </div>

          <AssinaturasList items={items} />

          {subs.length === 200 && (
            <p className="px-1 text-[11px] text-zinc-500">
              Mostrando as 200 assinaturas mais recentes.
            </p>
          )}
        </>
      )}
    </div>
  );
}

