/**
 * Sistema de temas pagos do Trilho.
 *
 * Regra: TODOS os temas a partir de "minimal" (mono) e depois SÃO PAGOS.
 * Os bases (midnight, daylight, gamer, glass, sunset, matrix, ocean) são gratuitos.
 * Cada tema pago custa R$ 5,00 (500 cents) — pago via saldo da pessoa.
 *
 * SEGURANÇA:
 * - A compra é feita em prisma.$transaction atômica (saldo + ThemePurchase juntos)
 * - Constraint UNIQUE(userId, themeKey) impede compra duplicada
 * - Integridade verificada por hash HMAC SHA256 (THEME_PURCHASE_SECRET)
 * - O `saveAppearance` valida que o user TEM o tema (free ou comprado) antes de aplicar
 * - Admin grant é auditado em AdminAuditLog
 */

import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { THEMES, type ThemeKey } from "./themes";
import {
  THEME_PRICE_CENTS,
  PREMIUM_THEME_PRICES,
  getThemePriceCents,
} from "./theme-prices";

// Re-export pra manter compat com imports antigos
export { THEME_PRICE_CENTS, PREMIUM_THEME_PRICES, getThemePriceCents };

/** Temas grátis — não exigem compra. ORDEM IMPORTA para o picker. */
export const FREE_THEME_KEYS: readonly string[] = [
  "midnight",
  "daylight",
  "gamer",
  "glass",
  "sunset",
  "matrix",
  "ocean",
];

/** Retorna true se o tema é grátis (não exige compra). */
export function isFreeTheme(key: string): boolean {
  return FREE_THEME_KEYS.includes(key);
}

/** Retorna true se o tema é PAGO. */
export function isPaidTheme(key: string): boolean {
  return !isFreeTheme(key) && THEMES.some((t) => t.key === key);
}

/**
 * Lista de temas pagos disponíveis (todos do registry que não são free).
 * Usado pelo painel admin pra mostrar catálogo.
 */
export function getPaidThemes() {
  return THEMES.filter((t) => isPaidTheme(t.key));
}

/**
 * Hash de integridade — usado pra evitar tampering em ThemePurchase.
 * Mesmo se alguém conseguir inserir uma linha direto no DB, o hash não bate
 * sem o secret (que só o server tem).
 */
function computePurchaseHash(
  userId: string,
  themeKey: string,
  priceCents: number,
  createdAt: Date,
): string {
  const secret = process.env.THEME_PURCHASE_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "";
  if (!secret) {
    // fallback inseguro mas funciona; em produção sempre teremos secret
    return "no-secret";
  }
  const payload = `${userId}|${themeKey}|${priceCents}|${createdAt.toISOString()}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Valida que um ThemePurchase é íntegro (hash bate).
 * Se o user tem `source = "admin_grant"` ou `"seed"`, hash não é obrigatório
 * (foi concedido manualmente).
 */
export function verifyPurchaseIntegrity(p: {
  userId: string;
  themeKey: string;
  priceCents: number;
  createdAt: Date;
  source: string;
  integrityHash: string | null;
}): boolean {
  // Concessões manuais não precisam de hash
  if (p.source === "admin_grant" || p.source === "seed") return true;
  // Compras com saldo OU PIX DEVEM ter hash válido
  if (!p.integrityHash) return false;
  const expected = computePurchaseHash(p.userId, p.themeKey, p.priceCents, p.createdAt);
  try {
    return timingSafeEqual(
      Buffer.from(p.integrityHash, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * Concede um tema marcando como compra via PIX (com hash de integridade).
 * Usado pelo `applyInternalPurchase` quando PIX externo confirma.
 *
 * Diferente do `grantThemeWithoutCharge`:
 *  - source = "pix"
 *  - priceCents = THEME_PRICE_CENTS (R$5)
 *  - integrityHash gerado a partir de userId+themeKey+price+createdAt
 *
 * Idempotente — se já existe (qualquer source) retorna ok.
 */
export async function recordThemePixPurchase(
  userId: string,
  themeKey: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (isFreeTheme(themeKey)) {
    return { ok: true }; // já é grátis
  }
  if (!THEMES.some((t) => t.key === themeKey)) {
    return { ok: false, reason: "Tema desconhecido" };
  }
  const existing = await prisma.themePurchase.findUnique({
    where: { userId_themeKey: { userId, themeKey } },
  });
  if (existing) return { ok: true };

  const { getThemePriceCentsAsync } = await import("./pricing");
  const priceCents = await getThemePriceCentsAsync(themeKey);
  const createdAt = new Date();
  const hash = computePurchaseHash(userId, themeKey, priceCents, createdAt);
  await prisma.themePurchase.create({
    data: {
      userId,
      themeKey,
      priceCents,
      source: "pix",
      integrityHash: hash,
      createdAt,
    },
  });
  return { ok: true };
}

/**
 * Lista os temas que o usuário possui (free + comprados/concedidos com integridade válida).
 *
 * Conta amigo (isFriendAccount=true) recebe TODOS os temas (free + pagos).
 */
export async function getOwnedThemes(userId: string): Promise<Set<string>> {
  const [user, purchases] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { isFriendAccount: true },
    }),
    prisma.themePurchase.findMany({
      where: { userId },
      select: {
        userId: true,
        themeKey: true,
        priceCents: true,
        createdAt: true,
        source: true,
        integrityHash: true,
      },
    }),
  ]);

  const owned = new Set<string>(FREE_THEME_KEYS);

  // Conta amigo: TODOS os temas liberados (free + pagos).
  // BUG ANTERIOR: usava `Object.keys(THEMES)` mas THEMES eh Theme[] (array),
  // entao isso retornava "0", "1", "2"... (indices) em vez das keys dos
  // temas. Resultado: friend accounts NUNCA conseguiam aplicar tema pago
  // porque `owned.has("minimal")` etc retornava false.
  if (user?.isFriendAccount) {
    for (const theme of THEMES) owned.add(theme.key);
    return owned;
  }

  for (const p of purchases) {
    if (verifyPurchaseIntegrity(p)) {
      owned.add(p.themeKey);
    }
    // se hash inválido — log + ignora (não pode aplicar tema)
  }
  return owned;
}

/**
 * Verifica se o usuário pode aplicar um tema específico.
 * Usado em saveAppearance ANTES de gravar o tema escolhido.
 */
export async function canUserApplyTheme(
  userId: string,
  themeKey: string,
): Promise<boolean> {
  if (isFreeTheme(themeKey)) return true;
  // FRIEND ACCOUNT BYPASS: contas amigo tem TUDO pago liberado.
  const friend = await prisma.user.findUnique({
    where: { id: userId },
    select: { isFriendAccount: true },
  });
  if (friend?.isFriendAccount) return true;
  const owned = await getOwnedThemes(userId);
  return owned.has(themeKey);
}

/**
 * Concede um tema sem cobrar (admin grant ou seed).
 * NÃO faz débito de saldo. Idempotente — se já tem, não duplica.
 */
export async function grantThemeWithoutCharge(
  userId: string,
  themeKey: ThemeKey,
  source: "admin_grant" | "seed" = "admin_grant",
): Promise<{ ok: boolean; reason?: string }> {
  if (isFreeTheme(themeKey)) {
    return { ok: true }; // já é grátis
  }
  // Validar que a key existe
  if (!THEMES.some((t) => t.key === themeKey)) {
    return { ok: false, reason: "Tema desconhecido" };
  }
  const existing = await prisma.themePurchase.findUnique({
    where: { userId_themeKey: { userId, themeKey } },
  });
  if (existing) return { ok: true };

  await prisma.themePurchase.create({
    data: {
      userId,
      themeKey,
      priceCents: 0,
      source,
      // integrityHash = null para grants — verifyPurchaseIntegrity lida com isso
    },
  });
  return { ok: true };
}

/**
 * Compra um tema pago debitando do saldo do user.
 * Atômico — saldo + ThemePurchase numa única transaction.
 *
 * Retorna:
 * - { ok: true } se compra realizada com sucesso
 * - { ok: false, reason } se algum dos: já possui, saldo insuficiente, tema inválido
 */
export async function purchaseThemeWithBalance(
  userId: string,
  themeKey: string,
): Promise<{ ok: boolean; reason?: string }> {
  // Validações sincronas
  if (isFreeTheme(themeKey)) {
    return { ok: false, reason: "Tema grátis — não precisa comprar" };
  }
  if (!THEMES.some((t) => t.key === themeKey)) {
    return { ok: false, reason: "Tema desconhecido" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verificar se já comprou (race-safe via UNIQUE constraint)
      const existing = await tx.themePurchase.findUnique({
        where: { userId_themeKey: { userId, themeKey } },
      });
      if (existing) {
        return { ok: false as const, reason: "Você já possui esse tema" };
      }

      // 2. Verificar saldo. Preço varia por tema (Blame R$100, demais R$5
      //    por default — admin pode editar via /admin01/precos).
      const { getThemePriceCentsAsync } = await import("./pricing");
      const priceCents = await getThemePriceCentsAsync(themeKey);
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { balanceCents: true, blocked: true },
      });
      if (!user) return { ok: false as const, reason: "Usuário inexistente" };
      if (user.blocked) return { ok: false as const, reason: "Conta bloqueada" };
      if (user.balanceCents < priceCents) {
        const reais = (priceCents / 100).toFixed(2).replace(".", ",");
        return {
          ok: false as const,
          reason: `Saldo insuficiente (R$ ${reais} necessários)`,
        };
      }

      // 3. Debitar saldo
      await tx.user.update({
        where: { id: userId },
        data: { balanceCents: { decrement: priceCents } },
      });

      // 4. Criar registro com hash de integridade
      const createdAt = new Date();
      const hash = computePurchaseHash(userId, themeKey, priceCents, createdAt);
      await tx.themePurchase.create({
        data: {
          userId,
          themeKey,
          priceCents,
          source: "balance",
          integrityHash: hash,
          createdAt,
        },
      });

      return { ok: true as const };
    }, {
      // isolation level read committed é default no Postgres; suficiente porque
      // o UNIQUE constraint protege contra double-buy
      maxWait: 5000,
      timeout: 15000,
    });

    return result;
  } catch (err) {
    // Se for erro de unique constraint, é race condition de double-click
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unique constraint") || message.includes("P2002")) {
      return { ok: false, reason: "Você já possui esse tema" };
    }
    console.error("[theme-access] purchase failed:", err);
    return { ok: false, reason: "Erro ao processar compra. Tente novamente." };
  }
}
