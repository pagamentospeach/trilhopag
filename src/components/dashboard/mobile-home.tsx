import Link from "next/link";
import { ArrowRight, QrCode, CreditCard } from "lucide-react";
import { PixIcon } from "@/components/icons/pix-icon";
import type { MetricValue } from "@/lib/dashboard-metrics";
import { MobileBalance } from "@/components/dashboard/mobile-balance";
import { PrivateText } from "@/components/dashboard/private-text";

/**
 * A HOME DO PAINEL NO CELULAR — 08/08/2026 (davi): "faça uma versao da trilho
 * para celular estilo app de banco (...) com tudo diferente da versao de PC".
 *
 * No desktop a home e um painel de analise: linha de filtros, quatro KPIs,
 * grafico de receita de 30 dias e o feed ao vivo do lado. Isso e o certo numa
 * tela larga, e o errado num celular — vira uma coluna de cartoes empilhados
 * onde o grafico fica ilegivel e o dado que a pessoa abriu o app pra ver
 * (quanto tem e quanto entrou) e o ultimo a aparecer.
 *
 * Aqui a ordem e a de um app de banco, que e a ordem da pergunta que se faz ao
 * abrir o app:
 *
 *   1. quanto eu tenho          -> o saldo, grande, primeiro
 *   2. o que eu faco com isso   -> sacar e cobrar, dentro do proprio cartao
 *   3. como foi o dia           -> tres numeros, sem grafico
 *   4. o que entrou             -> o extrato
 *
 * NENHUM dado novo e buscado por causa desta tela. Saldo, KPIs e ultimas
 * vendas ja eram carregados pela home do desktop; aqui eles so sao
 * apresentados de outro jeito. E nada e inventado: o que nao veio do banco
 * nao aparece.
 *
 * O grafico de receita nao tem equivalente aqui de proposito. Trinta pontos em
 * 320px de largura nao se leem, e o que ele responde ("como esta o mes") os
 * tres numeros de cima ja respondem. Quem quiser o grafico abre o Extrato.
 */

export type MobileSale = {
  id: string;
  net_cents: number;
  product: string;
  customer_name: string | null;
  method: string;
  paid_at: string;
};

export function MobileHome({
  greeting,
  name,
  balanceCents,
  values,
  periodLabel,
  sales,
}: {
  greeting: string;
  name: string;
  balanceCents: number;
  values: Record<string, MetricValue>;
  /** Rotulo do recorte que os numeros representam ("Hoje", "Últimos 7 dias"). */
  periodLabel: string;
  sales: MobileSale[];
}) {
  return (
    <div className="space-y-5">
      <p className="text-[15px] text-zinc-400">
        {greeting}, <span className="font-semibold text-white">{name}</span>
      </p>

      <MobileBalance initialCents={balanceCents} />

      {/* Os tres numeros do recorte. `items-start` pra linha de tres nao
       *  esticar todos os cartoes na altura do rotulo mais longo. */}
      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {periodLabel}
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Vendas" v={values.faturamento_liquido} money />
          <Stat label="Pedidos" v={values.vendas_pagas} />
          <Stat label="Aprovação" v={values.taxa_aprovacao_pix} />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Últimas entradas
          </h2>
          <Link
            href="/dashboard/financeiro"
            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300"
          >
            Ver extrato <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-black">
          {sales.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">
              Nenhuma venda por aqui ainda.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {sales.slice(0, 6).map((s) => (
                <SaleRow key={s.id} sale={s} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  v,
  money = false,
}: {
  label: string;
  v: MetricValue | undefined;
  /** Valor em dinheiro: some junto com o olho do modo privacidade. */
  money?: boolean;
}) {
  const text = v?.available ? v.value : "—";
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black px-3 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 truncate text-[15px] font-bold tabular-nums text-white">
        {money ? <PrivateText>{text}</PrivateText> : text}
      </p>
    </div>
  );
}

function SaleRow({ sale }: { sale: MobileSale }) {
  const who = sale.customer_name?.trim() || "Cliente";
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-cyan-300">
        <MethodIcon method={sale.method} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-white">
          {who}
        </span>
        <span className="block truncate text-[11px] text-zinc-500">
          {sale.product} · <PaidAt iso={sale.paid_at} />
        </span>
      </span>
      <span className="shrink-0 text-[14px] font-bold tabular-nums text-emerald-400">
        <PrivateText>
          +{" "}
          {(sale.net_cents / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        </PrivateText>
      </span>
    </li>
  );
}

function MethodIcon({ method }: { method: string }) {
  const m = method?.toLowerCase() ?? "";
  if (m.includes("pix")) return <PixIcon className="size-4" />;
  if (m.includes("card") || m.includes("cartao") || m.includes("cartão"))
    return <CreditCard className="size-4" />;
  return <QrCode className="size-4" />;
}

/**
 * Hora da venda no fuso de Brasilia.
 *
 * Formatado no SERVIDOR, com timeZone fixo: `toLocaleTimeString` sem fuso usa
 * o do processo, que na Vercel e UTC — a venda das 21h sairia como 00h. Fixar
 * o fuso tambem faz o texto do servidor bater com o do cliente, entao nao ha
 * erro de hidratacao.
 */
function PaidAt({ iso }: { iso: string }) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  const hoje =
    d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ===
    new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (hoje) return <>{hora}</>;
  return (
    <>
      {d.toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
      })}{" "}
      {hora}
    </>
  );
}
