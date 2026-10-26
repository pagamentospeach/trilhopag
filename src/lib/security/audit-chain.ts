/**
 * Audit log signing com hash chain — tamper-proof logging.
 *
 * Cada AdminAuditLog gravado contém um HMAC do conteúdo + hash do log
 * anterior. Mesmo se alguém invadir o banco, não consegue:
 *   - Apagar um log do meio sem quebrar a cadeia (hashes não casam)
 *   - Alterar um log existente (HMAC não bate)
 *   - Inserir um log novo entre dois antigos (hash anterior não existe)
 *
 * O hash de cada entrada é gravado em `payload.__hash`. Verificação:
 *   `verifyAuditChain()` percorre na ordem cronológica e confirma a integridade.
 *
 * IMPORTANTE: requer AUDIT_CHAIN_SECRET no env. Em produção, rotacione
 * periodicamente (quebra a cadeia até o ponto da rotação — registre o
 * checkpoint).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../prisma";

const AUDIT_SECRET = () =>
  process.env.AUDIT_CHAIN_SECRET ??
  process.env.BETTER_AUTH_SECRET ??
  "fallback-not-secure";

const GENESIS = "0000000000000000000000000000000000000000000000000000000000000000";

function hash(prevHash: string, payload: object): string {
  const canonical =
    prevHash +
    "|" +
    JSON.stringify(payload, Object.keys(payload).sort());
  return createHmac("sha256", AUDIT_SECRET()).update(canonical).digest("hex");
}

/**
 * Grava um audit log COM hash chain.
 *
 * Use em vez de prisma.adminAuditLog.create() para ações sensíveis:
 *   - block/unblock user
 *   - revoke theme
 *   - approve/reject KYC
 *   - mudança de adquirente primária
 *   - mudança de fees
 */
export async function logAuditWithChain(input: {
  adminId: string;
  action: string;
  target?: string | null;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<{ id: string; hash: string }> {
  const last = await prisma.adminAuditLog.findFirst({
    orderBy: { createdAt: "desc" },
    select: { payload: true },
  });
  const lastHash =
    (last?.payload as { __hash?: string } | null)?.__hash ?? GENESIS;

  const body = {
    adminId: input.adminId,
    action: input.action,
    target: input.target ?? null,
    payload: input.payload ?? {},
    timestamp: new Date().toISOString(),
  };

  const newHash = hash(lastHash, body);

  const created = await prisma.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      target: input.target ?? null,
      payload: {
        ...input.payload,
        __hash: newHash,
        __prevHash: lastHash,
      } as object,
      ipAddress: input.ipAddress ?? null,
    },
    select: { id: true },
  });

  return { id: created.id, hash: newHash };
}

/**
 * Verifica integridade da cadeia toda. Caro — use só em auditoria periódica.
 * Retorna o primeiro log onde a cadeia quebrou, ou null se tudo OK.
 */
export async function verifyAuditChain(): Promise<
  | { ok: true; entriesChecked: number }
  | { ok: false; brokenAtId: string; reason: string }
> {
  const all = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "asc" },
  });

  let prevHash = GENESIS;
  let count = 0;

  for (const log of all) {
    const payload = log.payload as { __hash?: string; __prevHash?: string } | null;
    if (!payload?.__hash) {
      // logs antigos sem hash — pula (legacy)
      count++;
      continue;
    }
    if (payload.__prevHash && payload.__prevHash !== prevHash) {
      return {
        ok: false,
        brokenAtId: log.id,
        reason: `prevHash não bate (esperado ${prevHash.slice(0, 8)}…, achou ${payload.__prevHash.slice(0, 8)}…)`,
      };
    }
    const reconstructed = hash(prevHash, {
      adminId: log.adminId,
      action: log.action,
      target: log.target,
      payload: Object.fromEntries(
        Object.entries(payload).filter(
          ([k]) => k !== "__hash" && k !== "__prevHash",
        ),
      ),
      timestamp: log.createdAt.toISOString(),
    });
    try {
      const a = Buffer.from(payload.__hash, "hex");
      const b = Buffer.from(reconstructed, "hex");
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return {
          ok: false,
          brokenAtId: log.id,
          reason: "HMAC não bate (log foi alterado)",
        };
      }
    } catch {
      return {
        ok: false,
        brokenAtId: log.id,
        reason: "Hash mal formatado",
      };
    }
    prevHash = payload.__hash;
    count++;
  }

  return { ok: true, entriesChecked: count };
}
