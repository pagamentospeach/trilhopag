"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-helpers";
import { rateLimit, formatRetryIn } from "@/lib/rate-limit";
import {
  isValidSpyingPlatform,
  purchaseSpyingWithBalance,
  getSpyingPriceCents,
  SPYING_LABELS,
  type SpyingPlatform,
} from "@/lib/spying-access";

/**
 * Compra acesso a Espionagem usando saldo.
 */
export async function purchaseSpyingWithBalanceAction(rawPlatform: string) {
  const userId = await requireUserId();
  const rl = rateLimit(`spying-purchase:${userId}`, 4, 60_000);
  if (!rl.ok) {
    return {
      ok: false as const,
      error: `Muitas compras. ${formatRetryIn(rl.resetIn)}`,
    };
  }
  if (!isValidSpyingPlatform(rawPlatform)) {
    return { ok: false as const, error: "Plataforma inválida" };
  }
  const platform: SpyingPlatform = rawPlatform;

  const result = await purchaseSpyingWithBalance(userId, platform);
  if (!result.ok) {
    const reason = result.reason;
    const human =
      reason === "insufficient_balance"
        ? "Saldo insuficiente. Use a opção PIX."
        : reason === "user_not_found"
          ? "Sessão expirada. Recarregue a página."
          : "Erro ao processar compra.";
    return { ok: false as const, error: human };
  }

  revalidatePath("/dashboard/espionagem");
  return { ok: true as const };
}

/**
 * Gera PIX (via MP white) pra comprar acesso. Webhook MP libera quando paga.
 */
export async function purchaseSpyingWithPixAction(rawPlatform: string) {
  const { assertSafeOrigin } = await import("@/lib/security/origin");
  try {
    await assertSafeOrigin();
  } catch {
    return { ok: false as const, error: "Origem inválida" };
  }

  const userId = await requireUserId();
  const rl = rateLimit(`spying-pix:${userId}`, 4, 60_000);
  if (!rl.ok) {
    return {
      ok: false as const,
      error: `Muitas tentativas. ${formatRetryIn(rl.resetIn)}`,
    };
  }
  if (!isValidSpyingPlatform(rawPlatform)) {
    return { ok: false as const, error: "Plataforma inválida" };
  }
  const platform: SpyingPlatform = rawPlatform;

  const amountCents = getSpyingPriceCents(platform);
  const label = SPYING_LABELS[platform];

  const { createInternalPixCharge } = await import("@/lib/internal-purchases");
  const r = await createInternalPixCharge({
    userId,
    feature: `spying:${platform}`,
    amountCents,
    description: `Trilho · Espionagem ${label}`,
    metadata: { platform, priceCents: amountCents },
  });
  if (!r.ok) return r;
  revalidatePath("/dashboard/espionagem");
  return r;
}
