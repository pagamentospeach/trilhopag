import { SkelHeader, SkelStats, SkelTable } from "@/components/dashboard/page-kit";

/**
 * Esqueleto padrão do painel — herdado por toda rota que não tem o seu.
 *
 * 08/08/2026, seção 22 do prompt de revamp: "Skeletons elegantes. Não usar
 * spinner gigante no centro da tela." Aqui morava um spinner centralizado, e
 * ele valia pras 60+ rotas do painel.
 *
 * O que se ganha trocando: o spinner ocupa o centro e some, e o conteúdo chega
 * empurrando tudo. O esqueleto já tem a forma aproximada do que vem, então a
 * página não pula quando o dado carrega. Em tela de dinheiro, layout saltando
 * é o que faz alguém clicar num botão diferente do que mirou.
 *
 * ⚠️ CONTINUA SEM LOGO. Era o pedido original de quem escreveu o spinner
 * ("evitar sensação de marca repetida em toda navegação dentro do dashboard"),
 * e ele vale igual aqui — a instrução era sobre a logo, não sobre o formato.
 *
 * Rotas com forma bem diferente têm o próprio `loading.tsx` ao lado da página
 * (clientes, assinaturas, analytics, reembolsos, configurações). Este é o
 * genérico, calibrado no formato mais comum do painel: cabeçalho, uma fileira
 * de métricas e uma lista.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SkelHeader />
      <SkelStats />
      <SkelTable linhas={5} />
    </div>
  );
}
