/**
 * Decide QUAL HOST serve o checkout de um seller.
 *
 * 09/08/2026 (davi): "vamos aceitar a criacao de checkouts pelo nosso dominio
 * mesmo". REVERTE a politica de jun/2026, que obrigava dominio proprio e
 * deixava o produto INATIVO (404 em trilhopag.com) enquanto nao houvesse um.
 *
 * Agora dominio proprio e PREFERENCIA, nao requisito: quem tem, o checkout
 * sai no dominio dele; quem nao tem, cai no dominio da plataforma e vende
 * do mesmo jeito. Nenhum caminho devolve null — nao existe mais o estado
 * "produto inativo por falta de dominio".
 *
 * O fallback e CHECKOUT_HOST e nao a string "trilhopag.com" porque o admin
 * pode apontar o checkout publico pra outro host por env.
 */
import { prisma } from "./prisma";
import { getCheckoutUrl, CHECKOUT_HOST } from "./checkout-url";

/**
 * Retorna todos os userIds do MESMO GRUPO (conta pai + subs). Usado pra
 * queries de CustomDomain — sub-account herda dominios cadastrados no pai.
 */
export async function getUserGroupIds(userId: string): Promise<string[]> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { parentUserId: true },
  });
  const rootId = me?.parentUserId ?? userId;
  const subs = await prisma.user.findMany({
    where: { parentUserId: rootId },
    select: { id: true },
  });
  return [rootId, ...subs.map((s) => s.id)];
}

/**
 * Retorna o PRIMEIRO dominio verificado do GRUPO (conta pai + subs) que tem
 * useCheckout=true. Ninguem do grupo tem dominio elegivel → CHECKOUT_HOST
 * (o dominio da plataforma). Ordenado por createdAt asc (mais antigo
 * primeiro = source-of-truth estavel).
 *
 * Sub-account: como e o mesmo dono real (fix 06/07 — reportado pelo adsriya0
 * "n da pra usar o dominio, o davi q setou por la, nem conectei"), a sub
 * herda automaticamente os dominios cadastrados na conta pai. Sem isso, o
 * dashboard da sub mostrava "conecte um dominio" mesmo com o pai ja tendo
 * dominio verificado.
 *
 * 23/07/2026 (davi): agora tambem respeita CustomDomain.sharedWithUserIds —
 * dominios que outros sellers compartilharam com o grupo entram no lookup.
 * O dono continua sendo o `userId` (edita/deleta), os compartilhados sao
 * read-only. Ordem: primeiro os do proprio grupo (createdAt asc), depois os
 * compartilhados (createdAt asc). Dominio proprio tem preferencia — evita
 * que um shared "sequestre" a UI de um seller que ja tem o dele.
 */
export async function getUserVerifiedCheckoutDomain(
  userId: string,
): Promise<string> {
  const groupIds = await getUserGroupIds(userId);

  // 1) Prioridade: dominio proprio do grupo.
  const own = await prisma.customDomain.findFirst({
    where: {
      userId: { in: groupIds },
      status: "verified",
      useCheckout: true,
    },
    select: { domain: true },
    orderBy: { createdAt: "asc" },
  });
  if (own) return own.domain.toLowerCase();

  // 2) Fallback: dominio compartilhado por outro seller com algum user do grupo.
  const shared = await prisma.customDomain.findFirst({
    where: {
      sharedWithUserIds: { hasSome: groupIds },
      status: "verified",
      useCheckout: true,
    },
    select: { domain: true },
    orderBy: { createdAt: "asc" },
  });
  // 3) Sem dominio proprio nem compartilhado: o checkout sai no dominio da
  //    plataforma. Antes daqui saia `null`, e o null era o que apagava o
  //    link no painel e derrubava a pagina publica em 404.
  return shared?.domain.toLowerCase() ?? CHECKOUT_HOST;
}

/** URL de checkout pro seller. Sempre resolve: dominio dele, ou o da plataforma. */
export async function getSellerCheckoutUrl(
  userId: string,
  slug: string,
  params?: Record<string, string>,
): Promise<string> {
  return getCheckoutUrl(slug, params, await getUserVerifiedCheckoutDomain(userId));
}

/**
 * Variante sincrona: o caller ja sabe o dominio do seller (passou via
 * select acima na pagina). `null` continua aceito na assinatura porque
 * varias telas ainda tipam a prop assim — e cai no dominio da plataforma,
 * que e o mesmo que getCheckoutUrl faz sem hostOverride.
 */
export function buildSellerCheckoutUrl(
  domain: string | null,
  slug: string,
  params?: Record<string, string>,
): string {
  return getCheckoutUrl(slug, params, domain);
}
