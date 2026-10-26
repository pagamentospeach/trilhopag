/**
 * IP tracking por API key.
 *
 * Motivação (auditoria 02/07/2026): descobrimos 11 sellers com keys vazadas.
 * Cada um tinha 100% do trafego de API vindo de UM SO IP externo (VPS de
 * atacante). Antes desse modulo o gateway registrava so o IP na Transaction,
 * e o seller so via os "PIX estranhos" DEPOIS de ja terem sido criados.
 *
 * Este modulo upserta o par (apiKeyId, ip) toda vez que uma request
 * autenticada entra na API v1. O seller ve o historico completo em
 * /dashboard/api-keys — cada chave lista os IPs que ja a usaram, com
 * botoes pra marcar como "confiavel" ou revogar a chave em 1 clique.
 *
 * Design:
 *  - Fire-and-forget no chamador (after() nos POST handlers) — nao bloqueia
 *    o hot path do PIX.
 *  - Idempotencia via unique (apiKeyId, ip). Concorrencia OK: race no
 *    create colide no unique e cai no update do catch.
 *  - Sem email/push — decisao 02/07 do david: notificacao spammava sem
 *    ganho real, o seller olha o historico so quando precisa. Se a gente
 *    quiser reativar notificacao no futuro, basta descomentar o bloco
 *    marcado abaixo.
 */
import { prisma } from "./prisma";

/**
 * Registra que esta API key foi usada por este IP.
 *
 * @param opts.apiKeyId - id da ApiKey autenticada
 * @param opts.userId   - dono da chave (denormalizado)
 * @param opts.ip       - IP do cliente (getClientIp) ou "unknown"
 * @param opts.countCreated - se true, incrementa createdCount (usado em
 *                            POST /v1/transactions|subscriptions apos
 *                            a tx ser efetivamente criada). Falso pra
 *                            leituras (GET).
 */
export async function trackApiKeyIp(opts: {
  apiKeyId: string;
  userId: string;
  ip: string;
  countCreated?: boolean;
}): Promise<void> {
  const { apiKeyId, userId, ip } = opts;
  if (!ip || ip === "unknown") return;

  // Existente? Se sim, so atualiza contadores.
  const existing = await prisma.apiKeyIpUsage.findUnique({
    where: { apiKeyId_ip: { apiKeyId, ip } },
    select: { id: true },
  });

  if (existing) {
    await prisma.apiKeyIpUsage.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        requestCount: { increment: 1 },
        ...(opts.countCreated ? { createdCount: { increment: 1 } } : {}),
      },
    });
    return;
  }

  // Novo par (apiKeyId, ip). Cria registro — sem notificar.
  // Concorrencia: se 2 requests do MESMO IP novo chegam juntas, a 2a
  // vai colidir no unique constraint. Trata como "ja existente".
  try {
    await prisma.apiKeyIpUsage.create({
      data: {
        apiKeyId,
        userId,
        ip,
        requestCount: 1,
        createdCount: opts.countCreated ? 1 : 0,
      },
    });
  } catch {
    // Race — outro request criou primeiro. So bumpa e sai.
    await prisma.apiKeyIpUsage
      .update({
        where: { apiKeyId_ip: { apiKeyId, ip } },
        data: {
          lastSeenAt: new Date(),
          requestCount: { increment: 1 },
          ...(opts.countCreated ? { createdCount: { increment: 1 } } : {}),
        },
      })
      .catch(() => {});
  }
}
