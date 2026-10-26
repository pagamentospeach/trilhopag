/**
 * Helpers relacionados a sellers com adquirente Caju.
 *
 * NOTA HISTORICA: existia aqui uma janela de saque instantaneo Pagar.me/Caju
 * (08:00-16:59 BRT em dia util). Removida em 11/07/2026 (david: "saque
 * precisa ser instantaneo para todos 24/7"). O force-Caju no dispatch
 * continua ativo — mas sem restricao de horario.
 */
import { prisma } from "./prisma";

/**
 * Verifica se o seller tem QUALQUER sub-key Caju (code comeca com "caju")
 * como UserAcquirer ativa E globalEnabled. Usado pelo auto-withdrawal pra
 * decidir se rotear pra pix-out via Caju vs SafePix/Pluggou.
 */
export async function sellerHasCajuAvailable(userId: string): Promise<boolean> {
  const count = await prisma.userAcquirer.count({
    where: {
      userId,
      pixActive: true,
      acquirer: {
        code: { startsWith: "caju" },
        active: true,
        globalEnabled: true,
        supportsPix: true,
      },
    },
  });
  return count > 0;
}
