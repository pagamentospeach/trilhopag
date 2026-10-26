/**
 * 22/07/2026 (davi: "Nao pode dar failed!") — checagem de disponibilidade
 * de adquirente CARTÃO antes de expor o método pro cliente no checkout.
 *
 * ROOT CAUSE ORIGINAL: o checkout mostrava o botão "Cartão" pra todos os
 * checkouts com `paymentMethods.includes("card")`, mesmo quando a plataforma
 * NÃO tinha nenhuma adquirente com `supportsCard=true` ativa. Cliente
 * clicava, o dispatchCardCharge retornava "Nenhuma adquirente disponível"
 * e a tx virava FAILED com `acquirer_attempts: []` — poluindo o histórico e
 * assustando o seller ("Failed! Nao pode!").
 *
 * FIX: essa função reproduz a MESMA lógica de seleção do dispatchCardCharge
 * (modo do seller + auto-switch pra black quando vazio + visibility publica/
 * própria/panel + forbiddenOpsModes) e apenas conta se HÁ pelo menos 1
 * adquirente elegível. Se ZERO, o checkout esconde CARD e o card route
 * rejeita 4xx amigável antes de criar tx.
 *
 * Cachea por 30s por (userId, method) — reduz load, aceita ~30s de delay
 * pra propagar habilitação de adquirente nova.
 */
import { prisma } from "@/lib/prisma";
import {
  acquirerOwnPanelWhere,
  acquirerSellerVisibleWhere,
  resolveEffectiveSellerEmail,
  type OwnAcquirerPanelMap,
} from "@/lib/acquirer-visibility";
import { acquirerModesFor } from "@/lib/ops-modes";

export type CardMethod = "card" | "boleto" | "apple_pay" | "google_pay";

const CAPABILITY_FLAG: Record<CardMethod, string> = {
  boleto: "supportsBoleto",
  card: "supportsCard",
  apple_pay: "supportsApplePay",
  google_pay: "supportsGooglePay",
};

// Cache in-memory (por instance de serverless). 30s TTL.
const cache = new Map<string, { value: boolean; at: number }>();
const CACHE_TTL_MS = 30_000;

function cacheKey(userId: string, method: CardMethod, includeAutoSwitch: boolean): string {
  return `${userId}:${method}:${includeAutoSwitch ? 1 : 0}`;
}

/**
 * Retorna true se o seller pode disparar `method` (card/apple/google) via
 * pelo menos 1 adquirente do PLATFORM POOL. Considera:
 *  - user.cardOpsMode (modo cartão do seller)
 *  - forbiddenOpsModes (block admin)
 *  - Visibility: painel próprio > publica/privada por email
 *  - supportsX (flag da adquirente)
 *  - Se `includeAutoSwitch=true`, também considera pool `black`/`both` como
 *    fallback (mesmo comportamento do auto-switch em runtime). Default true.
 *
 * NÃO considera UserAcquirer.cardActive porque o auto-switch em runtime
 * pode ativar. Pra o guard do checkout, basta EXISTIR uma adquirente que o
 * seller PODERIA usar, mesmo que não esteja marcada como preferida.
 */
export async function hasAvailableCardAcquirer(
  userId: string,
  method: CardMethod = "card",
  includeAutoSwitch = true,
): Promise<boolean> {
  const key = cacheKey(userId, method, includeAutoSwitch);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const [user, effectiveEmail] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        cardOpsMode: true,
        forbiddenOpsModes: true,
        ownAcquirerPanelEnabled: true,
        ownAcquirerPanel: true,
        ownAcquirerPanelPublicModes: true,
      },
    }),
    resolveEffectiveSellerEmail(prisma, userId),
  ]);
  if (!user) {
    cache.set(key, { value: false, at: Date.now() });
    return false;
  }
  const userMode = user.cardOpsMode ?? "white";
  if ((user.forbiddenOpsModes ?? []).includes(userMode)) {
    cache.set(key, { value: false, at: Date.now() });
    return false;
  }

  const flag = CAPABILITY_FLAG[method];

  const ownWhere = acquirerOwnPanelWhere(
    user.ownAcquirerPanelEnabled ?? false,
    user.ownAcquirerPanel as OwnAcquirerPanelMap | null,
    userMode,
    user.ownAcquirerPanelPublicModes ?? [],
  );
  const acqVisWhere = ownWhere ?? acquirerSellerVisibleWhere(effectiveEmail);

  const primaryModes = acquirerModesFor(userMode);

  const primaryCount = await prisma.acquirer.count({
    where: {
      active: true,
      mode: { in: primaryModes },
      [flag]: true,
      ...acqVisWhere,
    } as never,
  });
  if (primaryCount > 0) {
    cache.set(key, { value: true, at: Date.now() });
    return true;
  }

  if (!includeAutoSwitch) {
    cache.set(key, { value: false, at: Date.now() });
    return false;
  }

  // Fallback (auto-switch runtime → black/both)
  const fallbackCount = await prisma.acquirer.count({
    where: {
      active: true,
      mode: { in: ["black", "both"] },
      [flag]: true,
      ...acqVisWhere,
    } as never,
  });
  const value = fallbackCount > 0;
  cache.set(key, { value, at: Date.now() });
  return value;
}
