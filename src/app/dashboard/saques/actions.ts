"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { parseBRLToCents } from "@/lib/money";
import {
  WithdrawalError,
  requestWithdrawal,
  MIN_WITHDRAWAL_CENTS,
} from "@/lib/withdrawals";
import { checkOnAction } from "@/lib/achievements";
import { assertSafeOrigin } from "@/lib/security/origin";
import { verifyTotp } from "@/lib/totp";

const Input = z.object({
  amount: z.string().min(1),
  method: z.enum(["pix", "usdt_solana"]).default("pix"),
  pixKey: z.string().trim().max(100).optional(),
  pixKeyType: z.enum(["cpf", "cnpj", "evp", "phone", "email"]).optional(),
  walletAddress: z.string().trim().max(100).optional(),
});

export async function createWithdrawalAction(formData: FormData) {
  // CSRF defense-in-depth (auditoria jun/2026): saque MOVE dinheiro pra fora.
  // Next.js já valida Origin em Server Actions, mas esta é a ação mais
  // sensível do app — segunda barreira via assertSafeOrigin (igual à compra
  // de tema/assinatura). Sem isso, um POST cross-site forjado poderia tentar
  // sacar pro destino do atacante.
  try {
    await assertSafeOrigin();
  } catch {
    return { ok: false as const, error: "Origem da requisição inválida." };
  }
  const userId = await requireUserId();
  const parsed = Input.safeParse({
    amount: formData.get("amount"),
    method: formData.get("method") ?? "pix",
    pixKey: formData.get("pixKey") ?? undefined,
    pixKeyType: formData.get("pixKeyType") ?? undefined,
    walletAddress: formData.get("walletAddress") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Dados inválidos." };
  }
  const amountCents = parseBRLToCents(parsed.data.amount);
  if (amountCents <= 0) {
    return { ok: false as const, error: "Valor inválido." };
  }

  /**
   * ⚠️ SEGUNDO FATOR — a promessa que a interface fazia e o código não cumpria.
   *
   * 08/08/2026. O painel de segurança (/dashboard/perfil) mostra o texto
   * "Exigir 2FA para saques e operações sensíveis" e deixa o seller ativar,
   * com QR code, app autenticador e tudo. A infraestrutura toda existia:
   * `twoFactorEnabled`, `twoFactorSecret` e `verifyTotp`.
   *
   * O saque nunca consultava nenhum dos três. Ou seja: quem ligava o 2FA
   * acreditando estar protegendo o dinheiro ganhava um cadeado de mentira —
   * com um cookie de sessão roubado, o saque saía igual, direto pro destino do
   * atacante. Pior que não ter a opção, porque a opção induzia à confiança.
   *
   * A checagem mora AQUI e não no formulário de propósito. Validação de client
   * é conveniência; quem move dinheiro é esta action, e é ela que precisa
   * recusar. Um POST forjado não passa pelo formulário.
   */
  const seguranca = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  });

  if (seguranca?.twoFactorEnabled) {
    // Sem segredo gravado não há como validar. Recusar é a única saída segura:
    // deixar passar transformaria um estado inconsistente em bypass.
    if (!seguranca.twoFactorSecret) {
      return {
        ok: false as const,
        error:
          "Sua verificação em duas etapas está inconsistente. Desative e ative de novo em Perfil > Segurança antes de sacar.",
        needsTwoFactor: true as const,
      };
    }
    const code = String(formData.get("twoFactorCode") ?? "").trim();
    if (!code) {
      return {
        ok: false as const,
        error: "Digite o código do seu app autenticador pra confirmar o saque.",
        needsTwoFactor: true as const,
      };
    }
    if (!verifyTotp({ secretBase32: seguranca.twoFactorSecret, code })) {
      return {
        ok: false as const,
        error: "Código inválido ou expirado. Tente o código atual do app.",
        needsTwoFactor: true as const,
      };
    }
  }

  try {
    await requestWithdrawal({
      userId,
      amountCents,
      method: parsed.data.method,
      pixKey: parsed.data.pixKey,
      pixKeyType: parsed.data.pixKeyType,
      walletAddress: parsed.data.walletAddress,
    });
    await checkOnAction(userId, "withdrawal_created");
    revalidatePath("/dashboard/financeiro");
    revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (e) {
    if (e instanceof WithdrawalError) {
      return { ok: false as const, error: e.message };
    }
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Erro desconhecido",
    };
  }
}

/* ============ PAYOUT DESTINATIONS (Chaves PIX / Carteiras USDT salvas) ============ */

const SavePixDestSchema = z.object({
  label: z.string().trim().min(1).max(60),
  pixKey: z.string().trim().min(3).max(150),
  pixKeyType: z.enum(["cpf", "cnpj", "evp", "phone", "email"]),
  isDefault: z.boolean().optional(),
});

export async function savePixDestination(input: z.infer<typeof SavePixDestSchema>) {
  const userId = await requireUserId();
  const parsed = SavePixDestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Dados inválidos" };
  }

  // Se for marcado como default, desmarca os outros
  if (parsed.data.isDefault) {
    await prisma.payoutDestination.updateMany({
      where: { userId, type: "pix", isDefault: true },
      data: { isDefault: false },
    });
  }

  const created = await prisma.payoutDestination.create({
    data: {
      userId,
      type: "pix",
      label: parsed.data.label,
      pixKey: parsed.data.pixKey,
      pixKeyType: parsed.data.pixKeyType,
      isDefault: parsed.data.isDefault ?? false,
    },
  });
  revalidatePath("/dashboard/financeiro");
  return { ok: true as const, id: created.id };
}

const SaveUsdtDestSchema = z.object({
  label: z.string().trim().min(1).max(60),
  walletAddress: z.string().trim().min(30).max(100),
  isDefault: z.boolean().optional(),
});

export async function saveUsdtDestination(input: z.infer<typeof SaveUsdtDestSchema>) {
  const userId = await requireUserId();
  const parsed = SaveUsdtDestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Dados inválidos (endereço mín. 30 chars)" };
  }

  if (parsed.data.isDefault) {
    await prisma.payoutDestination.updateMany({
      where: { userId, type: "usdt_solana", isDefault: true },
      data: { isDefault: false },
    });
  }

  const created = await prisma.payoutDestination.create({
    data: {
      userId,
      type: "usdt_solana",
      label: parsed.data.label,
      walletAddress: parsed.data.walletAddress,
      isDefault: parsed.data.isDefault ?? false,
    },
  });
  revalidatePath("/dashboard/financeiro");
  return { ok: true as const, id: created.id };
}

export async function deletePayoutDestination(id: string) {
  const userId = await requireUserId();
  const dest = await prisma.payoutDestination.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!dest) return { ok: false as const, error: "Destino não encontrado" };
  await prisma.payoutDestination.delete({ where: { id } });
  revalidatePath("/dashboard/financeiro");
  return { ok: true as const };
}

export async function setDefaultPayoutDestination(id: string) {
  const userId = await requireUserId();
  const dest = await prisma.payoutDestination.findFirst({
    where: { id, userId },
    select: { id: true, type: true },
  });
  if (!dest) return { ok: false as const, error: "Destino não encontrado" };
  await prisma.payoutDestination.updateMany({
    where: { userId, type: dest.type, isDefault: true },
    data: { isDefault: false },
  });
  await prisma.payoutDestination.update({
    where: { id },
    data: { isDefault: true },
  });
  revalidatePath("/dashboard/financeiro");
  return { ok: true as const };
}

/* ============ SAQUE AUTOMÁTICO PROGRAMADO ============ */

const SchedWithdrawSchema = z.object({
  enabled: z.boolean(),
  thresholdCents: z.number().int().min(0).max(50_000_000),
  destId: z.string().trim().min(1).max(60).optional().nullable(),
});

/**
 * Liga/desliga + configura o saque automático programado do seller. Quando
 * ligado, exige threshold >= mínimo de saque e uma chave PIX salva válida. Um
 * cron (/api/cron/scheduled-withdraw) faz o saque quando o saldo atinge o valor.
 */
export async function saveScheduledWithdraw(
  input: z.infer<typeof SchedWithdrawSchema>,
) {
  const userId = await requireUserId();
  const parsed = SchedWithdrawSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos." };
  const { enabled, thresholdCents, destId } = parsed.data;

  if (enabled) {
    if (thresholdCents < MIN_WITHDRAWAL_CENTS) {
      return {
        ok: false as const,
        error: `O valor mínimo de saque é R$ ${(MIN_WITHDRAWAL_CENTS / 100)
          .toFixed(2)
          .replace(".", ",")}.`,
      };
    }
    if (!destId) {
      return { ok: false as const, error: "Escolha uma chave PIX salva." };
    }
    const dest = await prisma.payoutDestination.findFirst({
      where: { id: destId, userId, type: "pix" },
      select: { id: true },
    });
    if (!dest) {
      return { ok: false as const, error: "Chave PIX inválida ou não é sua." };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      scheduledWithdrawEnabled: enabled,
      scheduledWithdrawThresholdCents: thresholdCents,
      scheduledWithdrawDestId: enabled ? (destId ?? null) : null,
    },
  });
  revalidatePath("/dashboard/financeiro");
  return { ok: true as const };
}
