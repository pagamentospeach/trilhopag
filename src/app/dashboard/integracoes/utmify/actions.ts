"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { checkOnAction } from "@/lib/achievements";
import {
  runUtmifyConnectionTest,
  type UtmifyTokenTestResult,
} from "@/lib/utmify";

const Input = z.object({
  platform: z.string().trim().min(1).max(60).default("Trilho"),
  active: z.coerce.boolean().optional(),
  productIds: z.array(z.string()).optional(),
});

export async function saveUtmifyConfig(formData: FormData) {
  const userId = await requireUserId();

  // MÚLTIPLAS UTMify: 1 input "apiToken" por conta. Junta dedupado com \n —
  // o dispatcher (parseUtmifyTokens) reparte e envia pra todos.
  const tokens = Array.from(
    new Set(
      formData
        .getAll("apiToken")
        .map((v) => String(v).trim())
        .filter((t) => t.length > 0),
    ),
  );
  if (tokens.length === 0) {
    return { ok: false as const, error: "Informe ao menos um token UTMify." };
  }
  if (tokens.some((t) => t.length < 10)) {
    return {
      ok: false as const,
      error: "Algum token está muito curto (mín. 10 caracteres).",
    };
  }
  const apiToken = tokens.join("\n");

  const productIds = formData.getAll("productIds").map((v) => String(v));
  const parsed = Input.safeParse({
    platform: formData.get("platform") || "Trilho",
    active: formData.get("active") === "on",
    productIds,
  });
  if (!parsed.success) return { ok: false as const, error: "Validação falhou." };

  // Validar que os productIds pertencem ao usuário
  let enabledIds: string[] = [];
  if (parsed.data.productIds && parsed.data.productIds.length > 0) {
    const owned = await prisma.product.findMany({
      where: { userId, id: { in: parsed.data.productIds } },
      select: { id: true },
    });
    enabledIds = owned.map((p) => p.id);
  }

  await prisma.utmifyConfig.upsert({
    where: { userId },
    create: {
      userId,
      apiToken,
      platform: parsed.data.platform,
      active: parsed.data.active ?? true,
      enabledProductIds: enabledIds,
    },
    update: {
      apiToken,
      platform: parsed.data.platform,
      active: parsed.data.active ?? true,
      enabledProductIds: enabledIds,
    },
  });

  await checkOnAction(userId, "integration_configured");
  revalidatePath("/dashboard/integracoes/utmify");
  return { ok: true as const };
}

export async function removeUtmifyConfig() {
  const userId = await requireUserId();
  await prisma.utmifyConfig.deleteMany({ where: { userId } });
  revalidatePath("/dashboard/integracoes/utmify");
  return { ok: true as const };
}

/**
 * Testa a conexão com a UTMify para os tokens informados (os atuais do
 * formulário — permite validar ANTES de salvar). Envia um pedido isTest
 * que não conta nas métricas. Retorna o status por token.
 */
export async function testUtmifyConnection(
  tokensRaw: string[],
): Promise<
  | { ok: true; results: UtmifyTokenTestResult[] }
  | { ok: false; error: string }
> {
  const userId = await requireUserId();
  const tokens = Array.from(
    new Set(
      (tokensRaw ?? [])
        .map((t) => String(t).trim())
        .filter((t) => t.length >= 10),
    ),
  );
  if (tokens.length === 0) {
    return {
      ok: false,
      error:
        "Informe ao menos um token válido (mín. 10 caracteres) antes de testar.",
    };
  }
  const config = await prisma.utmifyConfig.findUnique({
    where: { userId },
    select: { platform: true },
  });
  // orderId estável por seller → testar N vezes não cria N pedidos na UTMify.
  const results = await runUtmifyConnectionTest(
    tokens,
    config?.platform || "Trilho",
    `trilhopag-conn-test-${userId}`,
  );
  return { ok: true, results };
}
