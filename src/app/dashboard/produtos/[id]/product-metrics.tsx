import { TrendingUp, Receipt, Percent, Repeat, MousePointerClick } from "lucide-react";
import { formatBRL } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/page-kit";
import type { getProductMetrics } from "@/lib/product-metrics";

/**
 * A faixa de números do produto.
 *
 * Cinco cartões e nada mais: a seção 24 pede pra não transformar a tela em
 * mural de cartão, e estes são exatamente os que a seção 8 lista. O resto
 * (série no tempo, comparação entre produtos) é pergunta de Analytics, e
 * repetir lá e aqui só cria dois lugares pra checar o mesmo número.
 *
 * Cartões que dependem de dado inexistente somem em vez de mostrar zero.
 * "0 assinaturas ativas" num produto que nem é recorrente não informa nada e
 * ocupa a mesma largura de um número que importa.
 */
export function ProductMetrics({
  m,
}: {
  m: Awaited<ReturnType<typeof getProductMetrics>>;
}) {
  // Produto sem nenhuma tentativa de compra: a faixa inteira seria uma fileira
  // de zeros. O card de ofertas logo abaixo já diz o que fazer.
  if (m.vendas === 0 && m.visitas === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard
        Icon={TrendingUp}
        label="Faturamento"
        value={formatBRL(m.faturamentoCents)}
        sub={`Líquido ${formatBRL(m.liquidoCents)}`}
        money
      />
      <StatCard
        Icon={Receipt}
        label="Vendas"
        value={String(m.vendas)}
        sub={`Ticket ${formatBRL(m.ticketMedioCents)}`}
      />
      <StatCard
        Icon={Percent}
        label="Aprovação"
        value={m.aprovacaoPct === null ? "—" : `${m.aprovacaoPct.toFixed(1)}%`}
        sub={m.aprovacaoPct === null ? "Nenhuma cobrança gerada" : "Pagas ÷ geradas"}
      />
      <StatCard
        Icon={MousePointerClick}
        label="Conversão"
        value={m.conversaoPct === null ? "—" : `${m.conversaoPct.toFixed(2)}%`}
        sub={
          m.conversaoPct === null
            ? "Sem visita registrada"
            : `${m.visitas} visita${m.visitas === 1 ? "" : "s"}`
        }
      />
      {m.assinaturasAtivas > 0 ? (
        <StatCard
          Icon={Repeat}
          label="Assinaturas"
          value={String(m.assinaturasAtivas)}
          sub="Ativas agora"
          href="/dashboard/assinaturas"
        />
      ) : (
        // Sem assinatura, o quinto slot vira o atalho pro histórico completo
        // deste produto — que é a pergunta seguinte de quem olhou os números.
        <StatCard
          Icon={Receipt}
          label="Ver vendas"
          value="Extrato"
          sub="Todas as transações"
          href="/dashboard/financeiro?tab=entradas"
        />
      )}
    </div>
  );
}
