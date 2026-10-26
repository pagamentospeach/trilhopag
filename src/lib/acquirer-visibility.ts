/**
 * Filtro CANONICO de visibilidade de adquirente pra sellers (05/07/2026).
 *
 * Regras (todas ao mesmo tempo):
 *   1. hiddenFromSellers = false  → sempre respeitado (esconde de TODOS).
 *   2. Publicas (isPrivate=false) precisam de globalEnabled=true.
 *   3. Privadas (isPrivate=true) sao visiveis SO pros sellers cujo email esta
 *      em privateAllowedEmails — INDEPENDENTE do globalEnabled. Ou seja,
 *      privada BYPASSA o globalEnabled. Semantica: "globalEnabled" = "aberta
 *      pra todo mundo". Quando a adquirente e privada, ela nao esta "aberta
 *      pra todo mundo" (nao deveria mesmo estar globalEnabled=true), mas
 *      os autorizados devem VER. Antes do fix, ligar privada com
 *      globalEnabled=false (o padrao) escondia da lista de TODO MUNDO —
 *      incluindo os emails permitidos. Zero utilidade. Fix (05/07/2026,
 *      reclamacao seller-b@exemplo.com): OR entre publica-e-global vs
 *      privada-e-autorizada.
 *
 * Uso: substitui `where: { globalEnabled: true, ...acquirerSellerVisibleWhere(email) }`
 * — agora o helper ja embarca globalEnabled corretamente. Callers so precisam
 * espalhar `...acquirerSellerVisibleWhere(email)`. Campos ortogonais
 * (active/supportsPix/supportsCard/mode) continuam por conta do caller.
 */

/**
 * Where fragment que deixa passar so as adquirentes visiveis pro seller.
 * Cobre hiddenFromSellers + isPrivate + globalEnabled. Os demais
 * (active/supportsPix/supportsCard/mode) sao ortogonais e ficam pro caller.
 *
 * @param sellerEmail  email do dono da conta. String vazia = trata como
 *                     "nao logado" e nunca ve privada.
 */
export function acquirerSellerVisibleWhere(sellerEmail: string) {
  const email = (sellerEmail ?? "").trim().toLowerCase();
  return {
    hiddenFromSellers: false,
    // DENYLIST por email (07/07/2026): se o email do seller esta em
    // hiddenFromEmails, a adquirente some da vista dele independente de
    // qualquer outra regra. Sem email (SSR sem contexto), ignora denylist.
    ...(email ? { NOT: { hiddenFromEmails: { has: email } } } : {}),
    OR: [
      // Publica + habilitada globalmente
      { isPrivate: false, globalEnabled: true },
      // Privada + email autorizado (BYPASSA globalEnabled). Se nao ha email
      // (usuario nao logado / SSR sem contexto), nao inclui esse ramo.
      ...(email
        ? [{ isPrivate: true, privateAllowedEmails: { has: email } }]
        : []),
    ],
  };
}

/**
 * WHERE fragment do DISPATCHER (dispatchPixCharge/dispatchCardCharge).
 *
 * ====== 05/08/2026 (davi) — ESCONDIDA = NAO PROCESSA ======
 * "quando a adquirente ta escondida, nao pode ser gerado nenhum pix nela!
 *  so nas que tao mostrando pro seller! O fallback so funciona pra
 *  adquirentes visiveis pro seller!"
 *
 * Agora este helper e IDENTICO ao `acquirerSellerVisibleWhere` — dispatch e
 * UI usam exatamente a mesma regra. Foi mantido como funcao separada so pra
 * os call sites continuarem declarando a intencao ("isto e roteamento"), mas
 * ele DELEGA, entao os dois nao podem mais divergir sem querer.
 *
 * HISTORICO — por que ele existiu separado (28/07/2026 a 05/08/2026):
 * o dispatch ignorava `hiddenFromSellers` de proposito, porque o docstring do
 * campo dizia "Continua PROCESSANDO normal". Efeito colateral que motivou a
 * volta atras: a SP5 (safepix-5) estava escondida e mesmo assim era a
 * adquirente que MAIS processava na plataforma (469 tx num dia), concentrando
 * 100% dos reembolsos — e nenhum seller conseguia ve-la nem desliga-la,
 * porque ela nao aparecia em tela nenhuma.
 *
 * RISCO QUE ISTO REINTRODUZ (o bug 'seller-f@exemplo.com nao gera pix'):
 * se TODAS as adquirentes elegiveis de um seller estiverem escondidas, ele
 * fica sem nenhuma e o PIX nao gera. Medido em 05/08/2026 antes de aplicar:
 * 0 sellers (de 347 ativos em 30d) ficariam sem adquirente; 138 so perdem
 * opcoes de fallback. Sobram 8 publicas visiveis cobrindo todos os modos
 * (black/white/hot). Se voltar a acontecer, o sintoma e "Nenhuma adquirente
 * disponivel" — a correcao e DESESCONDER uma adquirente do modo do seller,
 * nao reverter isto aqui.
 *
 * Pra tirar uma adquirente de circulacao SEM esconder da UI, o campo e
 * `globalEnabled=false` (desliga pra todo mundo, continua listavel no admin).
 */
export function acquirerDispatchWhere(sellerEmail: string) {
  return acquirerSellerVisibleWhere(sellerEmail);
}

/**
 * PAINEL PRÓPRIO (19/07/2026, davi): quando o seller tem ownAcquirerPanelEnabled
 * true, o filtro público/privado do `acquirerSellerVisibleWhere` é IGNORADO
 * — seller enxerga APENAS as adquirentes explicitamente listadas em
 * `ownAcquirerPanel[mode]`. Ainda respeita `active` + `supportsPix/Card` +
 * mode (isso continua ortogonal, por conta do caller).
 *
 * PER-MODE PUBLIC (19/07/2026 v2, davi: "de uma opcao de deixar publico por
 * modos"): se o modo está em `publicModes`, o painel próprio DELEGA pra
 * visibilidade geral daquele modo — mesmo com ownEnabled=true. Uso: black
 * público (todas visíveis) + white próprio (whitelist) no mesmo seller.
 *
 * Retorna `null` quando:
 *   - Painel próprio está OFF (comportamento antigo — caller usa filtro geral).
 *   - Modo está em `publicModes` (fallback pro filtro geral só nesse modo).
 * Retorna `{ id: { in: [...] } }` quando ON e modo NÃO é público — usa a
 * whitelist. Lista vazia = zero adquirentes visíveis (semantica correta).
 */
import { toOpsMode, type OpsMode } from "./ops-modes";

export type OwnAcquirerPanelMap = Partial<Record<OpsMode, string[]>>;

export function acquirerOwnPanelWhere(
  ownEnabled: boolean,
  ownPanel: OwnAcquirerPanelMap | null | undefined,
  mode: string,
  publicModes: string[] = [],
): { id: { in: string[] } } | null {
  if (!ownEnabled) return null;
  // Modo marcado como público → cai no filtro geral (mesmo com painel ligado).
  if (publicModes.includes(mode)) return null;
  const modeKey = toOpsMode(mode);
  const allowed =
    ownPanel && Array.isArray(ownPanel[modeKey]) ? ownPanel[modeKey]! : [];
  return { id: { in: allowed } };
}

/**
 * Retorna o email EFETIVO pra filtro de visibilidade de adquirentes privadas.
 *
 * Regra (06/07/2026): sub-account e mesmo dono real da conta pai. Quando o
 * admin autoriza um email pra ver adquirente privada, o email autorizado eh
 * SEMPRE o da conta pai. As sub-accounts herdam automaticamente.
 *
 * - Se o user eh conta principal → retorna seu proprio email.
 * - Se eh sub-account → retorna o email da conta pai (root).
 *
 * Bug reportado 06/07 (seller-b): ele criou sub-account, e a adquirente
 * SHK6 (privada, autorizada pro email seller-b@exemplo.com) sumiu na sub
 * porque o email da sub e um synthetic `sub-XXX.PARENT@subaccount...`.
 */
import type { PrismaClient } from "@prisma/client";
export async function resolveEffectiveSellerEmail(
  prismaClient: PrismaClient,
  userId: string,
): Promise<string> {
  const me = await prismaClient.user.findUnique({
    where: { id: userId },
    select: { email: true, parentUserId: true },
  });
  if (!me) return "";
  if (!me.parentUserId) return me.email ?? "";
  const parent = await prismaClient.user.findUnique({
    where: { id: me.parentUserId },
    select: { email: true },
  });
  return parent?.email ?? me.email ?? "";
}
