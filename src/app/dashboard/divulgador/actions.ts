"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { assertSafeOrigin } from "@/lib/security/origin";

/**
 * Server actions pra criar/editar/deletar sub-contas DivulgadorAccount.
 *
 * Permissão: TODAS as actions requerem `user.isPlayerDivulgador=true`.
 * Caso contrário, retornam erro 403 — bloqueia user normal de criar
 * contas fakes mesmo se invocar a action diretamente.
 *
 * As sub-contas pertencem ao user que as criou (`ownerUserId`). Quando o
 * admin desativa o flag isPlayerDivulgador, todas as sub-contas do user
 * são deletadas (em adminSetPlayerDivulgador).
 */

async function requirePlayer(): Promise<string> {
  const userId = await requireUserId();
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlayerDivulgador: true },
  });
  if (!u || !u.isPlayerDivulgador) {
    throw new Error("not_authorized");
  }
  return userId;
}

const MetricsJsonSchema = z
  .record(
    z.string().min(1).max(60),
    z.object({
      value: z.string().min(1).max(40),
      sub: z.string().max(60).optional().nullable(),
    }),
  )
  .optional();

const FeedRowSchema = z.object({
  id: z.string().min(1).max(60),
  amount_cents: z.number().int().min(0).max(99_999_999_99),
  net_cents: z.number().int().min(0).max(99_999_999_99),
  product: z.string().max(120).trim(),
  customer_name: z.string().max(120).trim().nullable(),
  method: z.string().max(20).trim(),
  paid_at: z.string().max(40),
});

const WithdrawalRowSchema = z.object({
  id: z.string().min(1).max(60),
  amount_cents: z.number().int().min(0).max(99_999_999_99),
  method: z.string().max(20).trim(),
  status: z.enum(["PENDING", "PROCESSING", "PAID", "FAILED"]),
  paid_at: z.string().max(40),
  pix_key: z.string().max(120).trim().nullable().optional(),
});

const NotificationRowSchema = z.object({
  id: z.string().min(1).max(60),
  kind: z.enum(["paid", "pending", "withdrawal"]),
  title: z.string().max(120).trim(),
  body: z.string().max(240).trim(),
  amount_cents: z.number().int().min(0).max(99_999_999_99),
  at: z.string().max(40),
});

const DivulgadorInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120).trim(),
  email: z.string().max(160).trim(),
  avatarUrl: z.string().url().nullable().optional().or(z.literal("")),
  theme: z.string().max(40).default("midnight"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional()
    .or(z.literal("")),
  balanceCents: z.number().int().min(0).max(99_999_999_99),
  pendingBalanceCents: z.number().int().min(0).max(99_999_999_99),
  todayRevenueCents: z.number().int().min(0).max(99_999_999_99),
  todaySalesCount: z.number().int().min(0).max(10_000_000),
  last30dRevenueCents: z.number().int().min(0).max(99_999_999_99),
  last30dSalesCount: z.number().int().min(0).max(10_000_000),
  lifetimeRevenueCents: z.number().int().min(0).max(99_999_999_99),
  lifetimeNetCents: z.number().int().min(0).max(99_999_999_99),
  monthlyGoalCents: z.number().int().min(0).max(99_999_999_99),
  metricsJson: MetricsJsonSchema,
  seriesJson: z
    .array(z.number().int().min(0).max(99_999_999_99))
    .length(30)
    .optional(),
  feedJson: z.array(FeedRowSchema).max(50).optional(),
  withdrawalsJson: z.array(WithdrawalRowSchema).max(50).optional(),
  notificationsJson: z.array(NotificationRowSchema).max(50).optional(),
});

/**
 * Cria uma nova sub-conta divulgador OU atualiza uma existente.
 * Se `id` presente, busca primeiro pra confirmar ownership; senão cria.
 */
export async function saveDivulgadorAccount(
  raw: z.infer<typeof DivulgadorInput>,
) {
  try {
    await assertSafeOrigin();
  } catch {
    return { ok: false as const, error: "Origem da requisição inválida" };
  }
  let userId: string;
  try {
    userId = await requirePlayer();
  } catch {
    return {
      ok: false as const,
      error: "Sua conta não tem permissão pra criar divulgadores",
    };
  }
  const parsed = DivulgadorInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.flatten().formErrors[0] ?? "Dados inválidos",
    };
  }
  const data = parsed.data;
  const dataToSave = {
    name: data.name,
    email: data.email,
    avatarUrl: data.avatarUrl || null,
    theme: data.theme,
    accentColor: data.accentColor || null,
    balanceCents: data.balanceCents,
    pendingBalanceCents: data.pendingBalanceCents,
    todayRevenueCents: data.todayRevenueCents,
    todaySalesCount: data.todaySalesCount,
    last30dRevenueCents: data.last30dRevenueCents,
    last30dSalesCount: data.last30dSalesCount,
    lifetimeRevenueCents: data.lifetimeRevenueCents,
    lifetimeNetCents: data.lifetimeNetCents,
    monthlyGoalCents: data.monthlyGoalCents,
    metricsJson: (data.metricsJson ?? {}) as never,
    seriesJson: (data.seriesJson ?? []) as never,
    feedJson: (data.feedJson ?? []) as never,
    withdrawalsJson: (data.withdrawalsJson ?? []) as never,
    notificationsJson: (data.notificationsJson ?? []) as never,
  };

  let savedId: string;
  if (data.id) {
    // Verifica ownership atomicamente
    const result = await prisma.divulgadorAccount.updateMany({
      where: { id: data.id, ownerUserId: userId },
      data: dataToSave,
    });
    if (result.count === 0) {
      return { ok: false as const, error: "Sub-conta não encontrada" };
    }
    savedId = data.id;
  } else {
    const created = await prisma.divulgadorAccount.create({
      data: { ...dataToSave, ownerUserId: userId },
    });
    savedId = created.id;
  }

  revalidatePath("/dashboard/divulgador");
  revalidatePath(`/dashboard/divulgador/${savedId}`);
  revalidatePath(`/dashboard/divulgador/${savedId}/view`);
  return { ok: true as const, id: savedId };
}

/**
 * Deleta uma sub-conta divulgador (só se o user for o owner).
 */
export async function deleteDivulgadorAccount(id: string) {
  try {
    await assertSafeOrigin();
  } catch {
    return { ok: false as const, error: "Origem da requisição inválida" };
  }
  let userId: string;
  try {
    userId = await requirePlayer();
  } catch {
    return { ok: false as const, error: "Sem permissão" };
  }
  const result = await prisma.divulgadorAccount.deleteMany({
    where: { id, ownerUserId: userId },
  });
  if (result.count === 0) {
    return { ok: false as const, error: "Sub-conta não encontrada" };
  }
  revalidatePath("/dashboard/divulgador");
  return { ok: true as const };
}

/**
 * Cria uma sub-conta fake "exemplo" pra agilizar onboarding — vem
 * pré-preenchida com números realistas. User edita depois.
 */
export async function createExampleDivulgador() {
  try {
    await assertSafeOrigin();
  } catch {
    return { ok: false as const, error: "Origem da requisição inválida" };
  }
  let userId: string;
  try {
    userId = await requirePlayer();
  } catch {
    return { ok: false as const, error: "Sem permissão" };
  }
  // Série crescente realista (R$ 100 → R$ 800/dia)
  const series = Array.from({ length: 30 }, (_, i) =>
    Math.round((100 + i * 23 + Math.random() * 60) * 100),
  );
  const last30d = series.reduce((s, c) => s + c, 0);
  const created = await prisma.divulgadorAccount.create({
    data: {
      ownerUserId: userId,
      name: "Conta Exemplo",
      email: "exemplo@trilhopag.com",
      theme: "midnight",
      balanceCents: 1_234_500, // R$ 12.345,00
      pendingBalanceCents: 456_700,
      todayRevenueCents: 89_700,
      todaySalesCount: 7,
      last30dRevenueCents: last30d,
      last30dSalesCount: 142,
      lifetimeRevenueCents: 6_789_900,
      lifetimeNetCents: 5_891_600,
      monthlyGoalCents: 1_000_000, // R$ 10.000
      metricsJson: {
        roas: { value: "4.2x", sub: "Acima da média" },
        cpa: { value: "R$ 18,90", sub: "Por venda" },
        lucro: { value: "R$ 9.876,40", sub: "Líquido" },
        gasto_ads: { value: "R$ 2.340,00", sub: "Meta + TikTok" },
        taxa_aprovacao_pix: { value: "87%", sub: "PIX aprovados" },
      } as never,
      seriesJson: series as never,
      feedJson: [
        {
          id: "fake1",
          amount_cents: 9700,
          net_cents: 8980,
          product: "Mentoria Online",
          customer_name: "Maria S.",
          method: "PIX",
          paid_at: new Date().toISOString(),
        },
        {
          id: "fake2",
          amount_cents: 19700,
          net_cents: 18230,
          product: "E-book Premium",
          customer_name: "João P.",
          method: "PIX",
          paid_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        },
      ] as never,
    },
  });
  revalidatePath("/dashboard/divulgador");
  redirect(`/dashboard/divulgador/${created.id}`);
}
