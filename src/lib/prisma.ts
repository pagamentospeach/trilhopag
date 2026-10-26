import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * GUARD RAIL de provider (07/07/2026, david: "isso nunca mais pode acontecer").
 *
 * Contexto: cada webhook (safepix, pluggou, sharkhub, etc) busca a
 * Transaction por `provider = "<family>"` EXATO. Se algum callsite salva
 * `provider = "pluggou-black"` (code literal em vez de family name), o
 * webhook nunca encontra a tx → cliente paga, dinheiro fica no PSP, tx
 * fica presa em PENDING pra sempre.
 *
 * Ate agora dependiamos de cada callsite chamar `normalizeAcquirerCode-
 * ToProvider()` manualmente. Isso ja falhou 2x (commit 2e3189a esqueceu
 * o cobrancas/actions.ts, corrigido em 0f15077).
 *
 * SOLUCAO FINAL: intercepta TODA escrita em Transaction.provider aqui,
 * na base. Se receber code com sufixo (`safepix-1`, `pluggou-black`,
 * `mercadopago-3`), normaliza automaticamente pro family name.
 * Impossivel bypassar sem editar este arquivo.
 */
const KNOWN_FAMILIES = [
  "safepix",
  "mercadopago",
  "abacatepay",
  "sharkbanking",
  "sharkhub",
  "pluggou",
  "caju",
  "pixzy",
  "stripe",
  "flevopay",
];

function normalizeProviderInPlace(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const d = data as Record<string, unknown>;
  const p = d.provider;
  if (typeof p !== "string") return;
  for (const fam of KNOWN_FAMILIES) {
    if (p !== fam && p.startsWith(fam + "-")) {
      console.warn(
        `[prisma-guard] Transaction.provider auto-normalizado: "${p}" → "${fam}"`,
      );
      d.provider = fam;
      return;
    }
  }
}

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaNeon({ connectionString });
  const client = new PrismaClient({ adapter, log: ["error", "warn"] });

  // Wrap transaction operations com normalizer do provider.
  return client.$extends({
    query: {
      transaction: {
        async create({ args, query }) {
          normalizeProviderInPlace(args.data);
          return query(args);
        },
        async update({ args, query }) {
          normalizeProviderInPlace(args.data);
          return query(args);
        },
        async updateMany({ args, query }) {
          normalizeProviderInPlace(args.data);
          return query(args);
        },
        async upsert({ args, query }) {
          normalizeProviderInPlace(args.create);
          normalizeProviderInPlace(args.update);
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrisma();
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    if (typeof value === "function") return value.bind(client);
    return value;
  },
});
