import { redirect } from "next/navigation";

/**
 * 06/08/2026 (davi): "Junte a aba VENDAS e FINANCEIRO (entradas e saidas) em
 * uma aba so (financeiro)". Vendas virou o lado ENTRADAS de
 * /dashboard/financeiro.
 *
 * A rota continua existindo como redirect em vez de sumir: /dashboard/vendas
 * está gravado em lugar que não dá pra reescrever depois de enviado — o email
 * de venda aprovada (email-templates.ts), o push de venda paga
 * (transactions.ts, com ?highlight=<id>) e o link do comprovante
 * (api/transactions/[id]/receipt). Matar a rota transformaria todos esses
 * links já entregues em 404.
 *
 * O componente da tabela continua em ./client (VendasClient) — quem renderiza
 * agora é /dashboard/financeiro.
 */
/**
 * ⚠️ O REDIRECT PRECISA CARREGAR A QUERY JUNTO.
 *
 * 08/08/2026: o comentário acima já dizia que o push de venda paga manda
 * `?highlight=<id>` — e a linha do redirect jogava a query fora. Resultado: TODA
 * notificação de venda levava o seller pra uma lista genérica em vez da venda
 * que acabou de cair. O link nunca esteve quebrado a ponto de dar erro, só
 * silenciosamente inútil, que é o tipo que ninguém reporta.
 *
 * `tab=entradas` entra como padrão porque tudo que aponta pra /dashboard/vendas
 * (email de venda aprovada, push, link do comprovante) fala de ENTRADA. Cair
 * no lado de saídas seria trocar o assunto. Se a query já trouxer um `tab`, ele
 * ganha.
 */
export default async function VendasRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    // Repassa repetições em vez de achatar: `?a=1&a=2` chega inteiro do outro
    // lado, sem este código decidir qual valor importa.
    for (const item of Array.isArray(v) ? v : [v]) qs.append(k, item);
  }
  if (!qs.has("tab")) qs.set("tab", "entradas");
  redirect(`/dashboard/financeiro?${qs.toString()}`);
}
