import { prisma } from "./prisma";

/**
 * CENTRAL DE NOTIFICAÇÕES DO SELLER (seção 19 do prompt de revamp).
 *
 * O sino do topbar existia e guardava só a CONFIGURAÇÃO de push. Não havia
 * lista de nada: o seller descobria uma venda pelo toast (que some em
 * segundos), por push (se tivesse autorizado no navegador) ou abrindo o
 * extrato de propósito. Quem fechou a aba perdeu o aviso pra sempre.
 *
 * ⚠️ ONDE ISTO PODE SER CHAMADO, E ONDE NÃO PODE.
 *
 * Notificação é a porta dos fundos clássica pra vazar o que a tela esconde:
 * se um aviso de "venda aprovada" disparasse antes do filtro de desvio, o
 * seller veria no sino uma venda que não existe no extrato — e a diferença
 * denunciaria o desvio melhor que a própria venda.
 *
 * Por isso `notificarVenda` só é chamada de dentro de
 * `fireSellerSidePaidDispatches`, que dá return early em `provider === "test"`
 * e em `divertedToAcquirer`, e trata `divertedToReferrer` num ramo que nunca
 * chega lá. Mesmo lugar de onde saem o webhook, o push e o e-mail do seller.
 *
 * NUNCA chamar do `markTransactionPaid` direto.
 */

type Kind = "sale" | "withdrawal" | "domain" | "subscription" | "system";

/**
 * Grava uma notificação. Nunca lança.
 *
 * Fire-and-forget de propósito: isto roda no meio do fluxo de pagamento, e um
 * erro ao gravar aviso não pode derrubar a confirmação de uma venda. O pior
 * caso aceito é o seller não ver o sino piscar — o dinheiro e o extrato não
 * dependem disto.
 */
export async function notificar(input: {
  userId: string;
  kind: Kind;
  title: string;
  body?: string | null;
  /** Caminho INTERNO. Ver a validação abaixo. */
  href?: string | null;
}) {
  try {
    // O `href` acaba num <Link>. Aceitar URL absoluta aqui transformaria a
    // central num vetor de redirecionamento externo — o mesmo buraco que o
    // `?from=` do login tinha (ver lib/safe-redirect.ts). Caminho interno ou
    // nada.
    const href =
      input.href && input.href.startsWith("/") && !input.href.startsWith("//")
        ? input.href
        : null;

    await prisma.sellerNotification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title.slice(0, 160),
        body: input.body?.slice(0, 300) ?? null,
        href,
      },
    });
  } catch (e) {
    console.error("[notifications] falha ao gravar", e);
  }
}

/** Venda aprovada. Só de dentro de `fireSellerSidePaidDispatches`. */
export async function notificarVenda(input: {
  userId: string;
  transactionId: string;
  produto: string;
  amountCents: number;
}) {
  const valor = (input.amountCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  await notificar({
    userId: input.userId,
    kind: "sale",
    title: `Venda aprovada · ${valor}`,
    body: input.produto,
    // Usa o mesmo `?highlight=` do push, que passou a funcionar em 08/08.
    href: `/dashboard/financeiro?tab=entradas&highlight=${input.transactionId}`,
  });
}

/** Saque pago ou recusado. */
export async function notificarSaque(input: {
  userId: string;
  ok: boolean;
  amountCents: number;
  motivo?: string | null;
}) {
  const valor = (input.amountCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  await notificar({
    userId: input.userId,
    kind: "withdrawal",
    title: input.ok ? `Saque pago · ${valor}` : `Saque recusado · ${valor}`,
    body: input.ok
      ? "O dinheiro já saiu para a sua conta."
      : (input.motivo ?? "Confira o histórico de saques."),
    href: "/dashboard/financeiro?tab=saidas",
  });
}

/** Últimas notificações + quantas não lidas. Usado pelo sino. */
export async function listarNotificacoes(userId: string, take = 15) {
  const [itens, naoLidas] = await Promise.all([
    prisma.sellerNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.sellerNotification.count({ where: { userId, readAt: null } }),
  ]);
  return { itens, naoLidas };
}
