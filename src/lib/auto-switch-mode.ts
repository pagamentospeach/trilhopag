/**
 * Auto-switch pro modo BLACK quando o seller fica sem adquirente
 * disponível no modo atual (19/07/2026, davi).
 *
 * Contexto: se o admin remove o último adquirente do modo current do
 * seller (ex: setup do painel próprio deixou branca zerada, ou desativou
 * todas as brancas globalmente, ou o modo virou proibido), o próximo PIX
 * falha e o seller PERDE A VENDA. Comportamento antigo: retornava erro
 * "Nenhuma adquirente disponível" pro cliente.
 *
 * Agora: detectamos ZERO acquirer visível+ativa pro modo atual, trocamos
 * pro BLACK imediatamente (que costuma ter as adquirentes de fallback),
 * e a venda vai por lá. Só troca se:
 *   - Modo atual != black (senão não há pra onde ir)
 *   - Black NÃO está em forbiddenOpsModes
 *   - Black tem >= 1 adquirente visível+ativa no painel próprio (se ligado)
 *     ou na visibilidade geral (se desligado)
 *
 * NÃO reaplica mode defaults (taxas). Manter as taxas atuais evita surpresa
 * pro seller — admin ajusta depois se quiser aplicar taxas de black.
 */

import { prisma } from "./prisma";
import {
  acquirerDispatchWhere,
  acquirerOwnPanelWhere,
  resolveEffectiveSellerEmail,
  type OwnAcquirerPanelMap,
} from "./acquirer-visibility";
import { acquirerModesFor } from "./ops-modes";

export type SectorKey = "pix" | "card";

type UserForAutoSwitch = {
  pixOpsMode: string;
  cardOpsMode: string;
  forbiddenOpsModes: string[];
  email: string;
  ownAcquirerPanelEnabled: boolean;
  ownAcquirerPanel: unknown;
  ownAcquirerPanelPublicModes: string[];
};

/**
 * Constroi where das acquirers elegíveis pro sector+mode do seller, aplicando:
 * - active=true
 * - supports<Sector>=true (supportsPix ou supportsCard)
 * - mode compatível (respeita "both", "white_hot")
 * - visibilidade (painel próprio se ligado, sonão public/private normal)
 */
function eligibleAcquirerWhere(
  sector: SectorKey,
  mode: string,
  user: UserForAutoSwitch,
  effectiveEmail: string,
): Record<string, unknown> {
  const supportsFlag = sector === "pix" ? "supportsPix" : "supportsCard";
  // O fallback antigo era `[mode, "both"]`, que teria dado "both" de graça pro
  // sag e jogado o parque inteiro de adquirentes dentro dele. Ver
  // ACQUIRER_MODES_FOR em lib/ops-modes.ts.
  const modeIn = acquirerModesFor(mode);
  const ownWhere = acquirerOwnPanelWhere(
    user.ownAcquirerPanelEnabled,
    user.ownAcquirerPanel as OwnAcquirerPanelMap | null,
    mode,
    user.ownAcquirerPanelPublicModes,
  );
  // 28/07/2026 (davi 'SEMPRE que alguma conta estiver em qualquer modo sem
  // adquirente, troque pra black'): mesma logica do dispatchPixCharge.
  // 05/08/2026: acquirerDispatchWhere passou a RESPEITAR hiddenFromSellers,
  // e o auto-switch acompanha de graca — um modo servido SO por adquirente
  // escondida agora conta como "sem adquirente" e dispara a troca pra black.
  // E o comportamento certo: antes ele achava o modo servido e deixava o
  // seller parado num modo onde o dispatch nao acha mais ninguem.
  const visWhere = ownWhere ?? acquirerDispatchWhere(effectiveEmail);
  return {
    active: true,
    [supportsFlag]: true,
    mode: { in: modeIn },
    ...visWhere,
  };
}

/**
 * Se o seller não tem NENHUMA UserAcquirer ativa+elegível pro modo atual
 * do sector, troca automaticamente pra black (quando permitido). Retorna
 * `{ switched: true, from, to }` quando de fato trocou.
 *
 * IMPORTANTE: `dispatchPixCharge` chama `ensureUserAcquirerRowsExist`
 * ANTES desta função. Isso significa que UserAcquirer rows já existem
 * pra todas as acquirers visíveis. Aqui só contamos as ATIVAS pro modo.
 */
export async function autoSwitchModeIfEmpty(
  userId: string,
  sector: SectorKey,
): Promise<{
  switched: boolean;
  from: string | null;
  to: string | null;
  reason?: string;
}> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        pixOpsMode: true,
        cardOpsMode: true,
        forbiddenOpsModes: true,
        email: true,
        ownAcquirerPanelEnabled: true,
        ownAcquirerPanel: true,
        ownAcquirerPanelPublicModes: true,
      },
    });
    if (!user) return { switched: false, from: null, to: null };

    const currentMode =
      sector === "pix" ? user.pixOpsMode : user.cardOpsMode;

    // Já em black — não há pra onde escalar.
    if (currentMode === "black") {
      return { switched: false, from: currentMode, to: null };
    }

    // Black proibido pelo admin — respeita.
    if ((user.forbiddenOpsModes ?? []).includes("black")) {
      return {
        switched: false,
        from: currentMode,
        to: null,
        reason: "black_forbidden",
      };
    }

    const effectiveEmail = await resolveEffectiveSellerEmail(prisma, userId);
    const activeFlag = sector === "pix" ? "pixActive" : "cardActive";

    // 1) Conta ativas no MODO ATUAL.
    const currentCount = await prisma.userAcquirer.count({
      where: {
        userId,
        [activeFlag]: true,
        acquirer: eligibleAcquirerWhere(
          sector,
          currentMode,
          user as UserForAutoSwitch,
          effectiveEmail,
        ),
      },
    });
    if (currentCount > 0) {
      return { switched: false, from: currentMode, to: null };
    }

    // 2) Zero no modo atual — verifica se BLACK tem >= 1.
    const blackCount = await prisma.userAcquirer.count({
      where: {
        userId,
        [activeFlag]: true,
        acquirer: eligibleAcquirerWhere(
          sector,
          "black",
          user as UserForAutoSwitch,
          effectiveEmail,
        ),
      },
    });
    if (blackCount === 0) {
      return {
        switched: false,
        from: currentMode,
        to: null,
        reason: "black_also_empty",
      };
    }

    // 3) Troca! Só atualiza o campo do sector afetado — mantém o outro
    //    intacto pra não afetar outro fluxo. Não reaplica mode defaults.
    const updateData =
      sector === "pix" ? { pixOpsMode: "black" } : { cardOpsMode: "black" };
    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    console.warn(
      `[auto-switch-mode] user=${userId} sector=${sector} switched ${currentMode} → black (0 acquirer no modo atual, ${blackCount} em black)`,
    );

    // 4) Auditoria: cria AdminNotification pra admin ver que o sistema
    //    trocou o modo automaticamente (ele decide se quer intervir).
    try {
      await prisma.adminNotification.create({
        data: {
          type: "auto_switch_mode",
          targetUserId: userId,
          message: `Modo ${sector.toUpperCase()} auto-trocado de ${currentMode} → black (0 adquirente disponível no modo atual).`,
          payload: {
            sector,
            from: currentMode,
            to: "black",
            reason: "no_eligible_acquirer_in_current_mode",
            blackCandidatesCount: blackCount,
            switchedAt: new Date().toISOString(),
          } as never,
        },
      });
    } catch (e) {
      // best-effort — nunca bloqueia a troca por causa de log
      console.error("[auto-switch-mode] notification failed:", e);
    }

    return { switched: true, from: currentMode, to: "black" };
  } catch (e) {
    console.error("[auto-switch-mode] failed:", e);
    return { switched: false, from: null, to: null };
  }
}
