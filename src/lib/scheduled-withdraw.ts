import { prisma } from "./prisma";
import { requestWithdrawal, MIN_WITHDRAWAL_CENTS } from "./withdrawals";

type PixKeyType = "cpf" | "cnpj" | "evp" | "phone" | "email";

/**
 * Processa os SAQUES AUTOMÁTICOS PROGRAMADOS pelos sellers.
 *
 * Pra cada seller com scheduledWithdrawEnabled = true, saldo disponível >=
 * scheduledWithdrawThresholdCents, destino PIX salvo válido e SEM saque aberto,
 * cria um saque PIX do SALDO INTEIRO via requestWithdrawal — que já aplica
 * TODAS as proteções (mínimo R$100, auditoria automática, débito atômico,
 * índice "1 saque aberto por usuário"). NÃO há caminho paralelo que burle
 * checagens — é exatamente como se o seller tivesse pedido o saque.
 *
 * Best-effort por seller: um erro (auditoria bloqueou, saldo mudou na corrida,
 * saque já aberto) só pula aquele seller; os outros seguem. No próximo tick do
 * cron, quem ficou pra trás é reavaliado.
 *
 * Idempotência: requestWithdrawal debita o saldo na hora + o índice único
 * impede 2 saques abertos. Então mesmo rodando a cada minuto, um seller só
 * gera 1 saque por vez (o próximo só quando o anterior fechar).
 */
export async function processScheduledWithdrawals(limit = 100): Promise<{
  processed: number;
  created: number;
  skipped: number;
  errors: number;
}> {
  // Candidatos: habilitado, não bloqueado, com destino, threshold e saldo
  // ambos >= mínimo. A comparação saldo >= threshold (duas colunas) é feita
  // em JS abaixo (Prisma não compara colunas no where).
  const candidates = await prisma.user.findMany({
    where: {
      scheduledWithdrawEnabled: true,
      blocked: false,
      scheduledWithdrawDestId: { not: null },
      scheduledWithdrawThresholdCents: { gte: MIN_WITHDRAWAL_CENTS },
      balanceCents: { gte: MIN_WITHDRAWAL_CENTS },
    },
    select: {
      id: true,
      balanceCents: true,
      scheduledWithdrawThresholdCents: true,
      scheduledWithdrawDestId: true,
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  let created = 0;
  let skipped = 0;
  let errors = 0;
  let processed = 0;

  for (const u of candidates) {
    // Só dispara quando o saldo realmente atingiu o gatilho do seller.
    if (u.balanceCents < u.scheduledWithdrawThresholdCents) {
      skipped++;
      continue;
    }
    processed++;
    try {
      // Já tem saque aberto? pula (requestWithdrawal também barra, mas evita
      // a auditoria/IO desnecessária).
      const open = await prisma.withdrawal.findFirst({
        where: { userId: u.id, status: { in: ["PENDING", "PROCESSING"] } },
        select: { id: true },
      });
      if (open) {
        skipped++;
        continue;
      }

      const dest = await prisma.payoutDestination.findFirst({
        where: { id: u.scheduledWithdrawDestId!, userId: u.id, type: "pix" },
        select: { pixKey: true, pixKeyType: true },
      });
      if (!dest?.pixKey || !dest.pixKeyType) {
        // destino apagado/ inválido — desliga pra não ficar tentando à toa
        await prisma.user
          .update({
            where: { id: u.id },
            data: { scheduledWithdrawEnabled: false },
          })
          .catch(() => {});
        skipped++;
        continue;
      }

      // Saca o SALDO DISPONÍVEL inteiro (>= threshold). requestWithdrawal faz o
      // débito atômico + cria o saque PENDING (e tenta auto-pagar se elegível).
      await requestWithdrawal({
        userId: u.id,
        amountCents: u.balanceCents,
        method: "pix",
        pixKey: dest.pixKey,
        pixKeyType: dest.pixKeyType as PixKeyType,
      });
      created++;
    } catch (e) {
      // Erro por seller não derruba o batch — re-tenta no próximo tick.
      console.error("[scheduled-withdraw] seller falhou:", u.id, e);
      errors++;
    }
  }

  return { processed, created, skipped, errors };
}
