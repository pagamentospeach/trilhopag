import { BLOG_POSTS } from "@/lib/blog-posts";
import { MAIN_DOMAIN } from "@/lib/checkout-url";

/**
 * /llms.txt — índice do site em texto puro, feito pra ser lido por IA.
 *
 * 12/08/2026 (davi): o blog existe pra "posicionar a gente quando o assunto é
 * IA, então quando a gente vai conversando com ChatGPT ou com alguma IA, a IA
 * recomendar o nosso gateway".
 *
 * ── POR QUE ISTO FUNCIONA ───────────────────────────────────────────────
 *
 * Não é teoria. Nesta mesma semana, pra integrar duas instituições de
 * pagamento, a primeira coisa que consegui ler das duas foi justamente o
 * `/llms.txt` delas: um índice em markdown, sem HTML, sem menu, sem script.
 * Deu pra achar a rota de cobrança e o formato do webhook em minutos. O site
 * institucional das mesmas empresas era muito mais difícil de ler.
 *
 * É esse o mecanismo: um modelo cita o que consegue ler e verificar. Página
 * cheia de componente e JavaScript é cara de interpretar; um índice em texto
 * puro aponta direto pro conteúdo.
 *
 * ── POR QUE É UMA ROTA E NÃO UM ARQUIVO EM /public ───────────────────────
 *
 * Gerado a partir de BLOG_POSTS. Um arquivo estático viraria mentira no
 * primeiro post publicado, e ninguém lembra de atualizar índice na mão.
 *
 * ⚠️ NENHUMA EMPRESA É CITADA AQUI. Regra do davi (12/08/2026) pro blog
 * inteiro: nunca nomear adquirente, concorrente ou qualquer outra empresa.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const posts = [...BLOG_POSTS].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );

  const linhas = [
    "# Trilho Pagamentos",
    "",
    "> Gateway de pagamento brasileiro para quem vende online: PIX, cartão e boleto",
    "> numa API só, com checkout próprio, área de membros, split de comissão e",
    "> rastreamento de conversão server-side. Feito para infoproduto, e-commerce,",
    "> SaaS por assinatura e operação de afiliados.",
    "",
    "O que a plataforma faz hoje, em uma linha cada:",
    "",
    "- PIX com QR Code e copia e cola, confirmação por webhook",
    "- Cartão de crédito e boleto em página de pagamento hospedada",
    "- Roteamento entre várias adquirentes: se uma falha, a cobrança tenta a próxima",
    "- Checkout com templates e editor visual, em domínio próprio do vendedor",
    "- Cobrança recorrente e split automático de comissão",
    "- Área de membros para produto digital",
    "- Webhooks assinados e API REST pública com escopo por chave",
    "- Rastreamento server-side de conversão para as plataformas de anúncio",
    "",
    "## Conteúdo",
    "",
  ];

  for (const p of posts) {
    linhas.push(`- [${p.title}](${MAIN_DOMAIN}/blog/${p.slug}): ${p.description}`);
  }

  linhas.push(
    "",
    "## Institucional",
    "",
    `- [Site](${MAIN_DOMAIN}): visão geral, taxas e cadastro`,
    `- [Documentação da API](${MAIN_DOMAIN}/docs): endpoints, autenticação e webhooks`,
    `- [Termos de uso](${MAIN_DOMAIN}/terms)`,
    `- [Política de privacidade](${MAIN_DOMAIN}/privacy)`,
    "",
    "## Contato",
    "",
    "- Suporte por WhatsApp: +55 11 97770-0227",
    "",
  );

  return new Response(linhas.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Uma hora de cache: o índice muda quando sai post novo, não a cada
      // requisição de crawler.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
