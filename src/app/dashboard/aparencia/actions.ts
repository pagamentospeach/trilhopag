"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { parseBRLToCents } from "@/lib/money";
import { checkOnAction } from "@/lib/achievements";
import { THEMES } from "@/lib/themes";
import {
  canUserApplyTheme,
  purchaseThemeWithBalance,
} from "@/lib/theme-access";
import { rateLimit, formatRetryIn } from "@/lib/rate-limit";

// Aceita qualquer key registrada no THEMES (gera dinamicamente pra não
// quebrar quando adicionarmos temas novos).
const VALID_THEME_KEYS = new Set(THEMES.map((t) => t.key));

const Input = z.object({
  theme: z.string().refine((v) => VALID_THEME_KEYS.has(v as never), {
    message: "Tema inválido",
  }),
  displayName: z.string().trim().max(60).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable().or(z.literal("")),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .nullable()
    .or(z.literal("")),
  bgPattern: z.enum(["grid", "dots", "noise", "waves", "mesh", "none"]),
  monthlyGoal: z.string().optional(),
  soundEnabled: z.coerce.boolean().optional(),
  privacyMode: z.coerce.boolean().optional(),
});

export async function saveAppearance(formData: FormData) {
  const userId = await requireUserId();
  const parsed = Input.safeParse({
    theme: formData.get("theme"),
    displayName: formData.get("displayName") || null,
    avatarUrl: formData.get("avatarUrl") || null,
    accentColor: formData.get("accentColor") || null,
    bgPattern: formData.get("bgPattern") || "grid",
    monthlyGoal: formData.get("monthlyGoal") || "0",
    soundEnabled: formData.get("soundEnabled") === "on",
    privacyMode: formData.get("privacyMode") === "on",
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Dados inválidos." };
  }

  // SEGURANÇA: valida que o user tem permissão pra aplicar esse tema
  // (free ou comprado/concedido).
  const allowed = await canUserApplyTheme(userId, parsed.data.theme);
  if (!allowed) {
    return {
      ok: false as const,
      error: "Você precisa comprar esse tema (R$ 5,00) antes de aplicá-lo.",
    };
  }

  const monthlyGoalCents = parsed.data.monthlyGoal
    ? parseBRLToCents(parsed.data.monthlyGoal)
    : 0;

  const before = await prisma.userSettings.findUnique({ where: { userId } });
  const themeChanged = before?.theme !== parsed.data.theme;

  await prisma.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      theme: parsed.data.theme,
      displayName: parsed.data.displayName?.trim() || null,
      avatarUrl: parsed.data.avatarUrl?.trim() || null,
      accentColor: parsed.data.accentColor?.trim() || null,
      bgPattern: parsed.data.bgPattern,
      monthlyGoalCents,
      soundEnabled: parsed.data.soundEnabled ?? true,
      privacyMode: parsed.data.privacyMode ?? false,
    },
    update: {
      theme: parsed.data.theme,
      displayName: parsed.data.displayName?.trim() || null,
      avatarUrl: parsed.data.avatarUrl?.trim() || null,
      accentColor: parsed.data.accentColor?.trim() || null,
      bgPattern: parsed.data.bgPattern,
      monthlyGoalCents,
      soundEnabled: parsed.data.soundEnabled ?? true,
      privacyMode: parsed.data.privacyMode ?? false,
    },
  });

  if (themeChanged) {
    await checkOnAction(userId, "skin_changed");
  }

  revalidatePath("/dashboard/aparencia");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard", "layout");
  return { ok: true as const };
}

/**
 * Server action: compra um tema pago (R$ 5,00 do saldo do user).
 * Idempotente, atômica, segura contra double-buy + CSRF.
 */
export async function purchaseTheme(themeKey: string) {
  // Defesa em profundidade contra CSRF (além do SameSite cookie do Next)
  const { assertSafeOrigin } = await import("@/lib/security/origin");
  try {
    await assertSafeOrigin();
  } catch {
    return { ok: false as const, error: "Origem da requisição inválida" };
  }

  const userId = await requireUserId();
  // FIX BUG-3: rate-limit 6/min por user (cada tema R$5, atacante poderia
  // tentar drenar saldo num for-loop)
  const rl = rateLimit(`theme-purchase:${userId}`, 6, 60_000);
  if (!rl.ok) {
    return {
      ok: false as const,
      error: `Muitas compras. ${formatRetryIn(rl.resetIn)}`,
    };
  }
  if (typeof themeKey !== "string" || themeKey.length < 2 || themeKey.length > 50) {
    return { ok: false as const, error: "Tema inválido" };
  }
  // Valida que a chave existe no registry
  if (!THEMES.some((t) => t.key === themeKey)) {
    return { ok: false as const, error: "Tema desconhecido" };
  }

  const result = await purchaseThemeWithBalance(userId, themeKey);
  if (!result.ok) {
    return { ok: false as const, error: result.reason ?? "Erro" };
  }

  revalidatePath("/dashboard/aparencia");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/**
 * Gera PIX (via Mercado Pago white) pra comprar um tema. Webhook MP
 * confirma e libera o tema quando o cliente paga.
 *
 * Use isso quando o saldo do user é insuficiente.
 */
export async function purchaseThemeWithPix(themeKey: string) {
  const { assertSafeOrigin } = await import("@/lib/security/origin");
  try {
    await assertSafeOrigin();
  } catch {
    return { ok: false as const, error: "Origem da requisição inválida" };
  }

  const userId = await requireUserId();
  // FIX BUG-3: rate-limit 4/min por user (cada PIX gera InternalPurchase
  // pending + chama MP API — spam evitado)
  const rl = rateLimit(`theme-pix:${userId}`, 4, 60_000);
  if (!rl.ok) {
    return {
      ok: false as const,
      error: `Muitas tentativas. ${formatRetryIn(rl.resetIn)}`,
    };
  }
  if (typeof themeKey !== "string" || themeKey.length < 2 || themeKey.length > 50) {
    return { ok: false as const, error: "Tema inválido" };
  }
  const theme = THEMES.find((t) => t.key === themeKey);
  if (!theme) return { ok: false as const, error: "Tema desconhecido" };

  // Checa se já possui
  const existing = await prisma.themePurchase.findUnique({
    where: { userId_themeKey: { userId, themeKey } },
  });
  if (existing) return { ok: false as const, error: "Você já possui esse tema" };

  const { createInternalPixCharge } = await import(
    "@/lib/internal-purchases"
  );
  const { getThemePriceCentsAsync } = await import("@/lib/pricing");
  const amountCents = await getThemePriceCentsAsync(themeKey);
  const r = await createInternalPixCharge({
    userId,
    feature: `theme:${themeKey}`,
    amountCents,
    description: `Trilho · Tema ${theme.label ?? themeKey}`,
    metadata: { themeKey, themeName: theme.label, priceCents: amountCents },
  });

  if (!r.ok) return r;
  revalidatePath("/dashboard/aparencia");
  return r;
}

/**
 * Compra "Criar tema próprio" (17/07/2026, davi): seller paga R$100+ via
 * PIX (Pluggou) OU saldo da plataforma e o admin recebe alerta pra desenhar
 * o tema em ~1h. Fica marcado como pedido em AdminNotification pra o suporte
 * agir.
 *
 * ATUALIZADO 17/07/2026 (davi: "adcione mais opcoes... preço, nome, descrisao,
 * amigos que vao ganha o tema de graça"): agora seller pode
 *  - nomear o tema (aparece no dashboard depois de entregue)
 *  - subir o preço (até R$5000) pra pagar por scope maior/prioridade
 *  - listar emails de amigos que ganham o tema desbloqueado de graça
 */
const CUSTOM_THEME_PRICE_CENTS = 10_000; // R$100 minimo
const CUSTOM_THEME_MAX_PRICE_CENTS = 500_000; // R$5000 teto (guard-rail anti-typo)
const CUSTOM_THEME_MAX_FRIENDS = 10;

const CustomThemeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Nome precisa ter pelo menos 3 letras")
    .max(60, "Nome muito longo (máx. 60 caracteres)"),
  description: z
    .string()
    .trim()
    .min(20, "Descreve com pelo menos 20 caracteres pro time entender")
    .max(1000),
  referenceUrl: z.string().url().optional().nullable().or(z.literal("")),
  // Preço custom em centavos. Opcional: se omitido, usa CUSTOM_THEME_PRICE_CENTS.
  // Piso R$100 (não deixamos abaixo pra proteger o time), teto R$5000 (guard-rail).
  priceCents: z
    .number()
    .int()
    .min(CUSTOM_THEME_PRICE_CENTS, "Preço mínimo é R$ 100,00")
    .max(CUSTOM_THEME_MAX_PRICE_CENTS, "Preço máximo é R$ 5.000,00")
    .optional()
    .nullable(),
  // Emails de amigos que ganham o tema de graça quando pronto.
  // Não validamos "existe na plataforma" agora — suporte confere na entrega.
  friendEmails: z
    .array(z.string().trim().toLowerCase().email("Email de amigo inválido"))
    .max(CUSTOM_THEME_MAX_FRIENDS, `Máximo ${CUSTOM_THEME_MAX_FRIENDS} amigos`)
    .optional()
    .default([]),
});

type CustomThemeInput = {
  name: string;
  description: string;
  referenceUrl?: string | null;
  priceCents?: number | null;
  friendEmails?: string[];
};

export async function purchaseCustomTheme(input: CustomThemeInput) {
  const { assertSafeOrigin } = await import("@/lib/security/origin");
  try {
    await assertSafeOrigin();
  } catch {
    return { ok: false as const, error: "Origem da requisição inválida" };
  }

  const userId = await requireUserId();
  const parsed = CustomThemeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos",
    };
  }

  const rl = rateLimit(`custom-theme:${userId}`, 3, 60_000);
  if (!rl.ok) {
    return {
      ok: false as const,
      error: `Muitas tentativas. ${formatRetryIn(rl.resetIn)}`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user) return { ok: false as const, error: "Usuário não encontrado" };

  const priceCents = parsed.data.priceCents ?? CUSTOM_THEME_PRICE_CENTS;
  const friendEmails = parsed.data.friendEmails ?? [];
  const priceBRL = `R$ ${(priceCents / 100).toFixed(2).replace(".", ",")}`;

  const { createInternalPixCharge } = await import(
    "@/lib/internal-purchases"
  );
  const r = await createInternalPixCharge({
    userId,
    feature: "custom_theme_request",
    amountCents: priceCents,
    description: `Trilho · Tema "${parsed.data.name}" sob demanda`,
    metadata: {
      customTheme: true,
      themeName: parsed.data.name,
      description: parsed.data.description,
      referenceUrl: parsed.data.referenceUrl || null,
      friendEmails,
      sellerEmail: user.email,
      sellerName: user.name,
      requestedAt: new Date().toISOString(),
    },
  });

  if (!r.ok) return r;

  // Cria AdminNotification pra suporte pegar depois que pagar
  try {
    await prisma.adminNotification.create({
      data: {
        type: "custom_theme_request",
        message: `${user.name ?? user.email} pediu tema "${parsed.data.name}" (${priceBRL}${friendEmails.length ? ` · +${friendEmails.length} amigos` : ""}). ${parsed.data.description.slice(0, 100)}...`,
        payload: {
          userId,
          userEmail: user.email,
          userName: user.name,
          themeName: parsed.data.name,
          description: parsed.data.description,
          referenceUrl: parsed.data.referenceUrl || null,
          friendEmails,
          purchaseId: r.purchaseId,
          amountCents: priceCents,
          status: "awaiting_payment",
        } as never,
      },
    });
  } catch (e) {
    console.error("[custom-theme] falha ao criar notif admin:", e);
  }

  revalidatePath("/dashboard/aparencia");
  return r;
}

/**
 * Compra "Criar tema próprio" DEBITANDO SALDO da plataforma (17/07/2026).
 * Alternativa ao PIX. Atômico: valida saldo → debita → cria notif suporte.
 */
export async function purchaseCustomThemeWithBalance(input: CustomThemeInput) {
  const { assertSafeOrigin } = await import("@/lib/security/origin");
  try {
    await assertSafeOrigin();
  } catch {
    return { ok: false as const, error: "Origem da requisição inválida" };
  }

  const userId = await requireUserId();
  const parsed = CustomThemeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos",
    };
  }

  const rl = rateLimit(`custom-theme-bal:${userId}`, 3, 60_000);
  if (!rl.ok) {
    return {
      ok: false as const,
      error: `Muitas tentativas. ${formatRetryIn(rl.resetIn)}`,
    };
  }

  const priceCents = parsed.data.priceCents ?? CUSTOM_THEME_PRICE_CENTS;
  const friendEmails = parsed.data.friendEmails ?? [];
  const priceBRL = `R$ ${(priceCents / 100).toFixed(2).replace(".", ",")}`;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { balanceCents: true, blocked: true, email: true, name: true },
      });
      if (!user) return { ok: false as const, error: "Usuário inexistente" };
      if (user.blocked) return { ok: false as const, error: "Conta bloqueada" };
      if (user.balanceCents < priceCents) {
        return {
          ok: false as const,
          error: `Saldo insuficiente. Necessário ${priceBRL}, você tem R$ ${(user.balanceCents / 100).toFixed(2).replace(".", ",")}.`,
        };
      }

      await tx.user.update({
        where: { id: userId },
        data: { balanceCents: { decrement: priceCents } },
      });

      await tx.adminNotification.create({
        data: {
          type: "custom_theme_request",
          message: `${user.name ?? user.email} pediu tema "${parsed.data.name}" (${priceBRL} · pago com SALDO${friendEmails.length ? ` · +${friendEmails.length} amigos` : ""}). ${parsed.data.description.slice(0, 100)}...`,
          payload: {
            userId,
            userEmail: user.email,
            userName: user.name,
            themeName: parsed.data.name,
            description: parsed.data.description,
            referenceUrl: parsed.data.referenceUrl || null,
            friendEmails,
            amountCents: priceCents,
            paidWith: "balance",
            status: "paid_awaiting_delivery",
            paidAt: new Date().toISOString(),
          } as never,
        },
      });

      return { ok: true as const };
    });

    if (!result.ok) return result;

    revalidatePath("/dashboard/aparencia");
    revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (e) {
    console.error("[custom-theme-balance] falha:", e);
    return {
      ok: false as const,
      error: "Não foi possível concluir agora. Tenta de novo.",
    };
  }
}
