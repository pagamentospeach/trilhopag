"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { generateApiKey } from "@/lib/api-keys";
import { API_SCOPE_KEYS } from "@/lib/api-scopes";

const CreateInput = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(60),
});

/**
 * Criar chave de API.
 *
 * 09/08/2026: passou a gravar ESCOPOS e VALIDADE de verdade.
 *
 * Antes o `scopes: []` era fixo, e lista vazia é permissiva no `requireScope`.
 * Toda chave emitida era full access — inclusive `POST /v1/withdrawals`, que
 * tira dinheiro da conta. Uma chave feita pra um checkout externo apenas gerar
 * PIX podia sacar o saldo inteiro se vazasse.
 *
 * O `expiresAt` também nunca era setado, embora o `verifyApiKey` SEMPRE tenha
 * checado — a verificação existia e não tinha o que verificar.
 *
 * Chaves antigas seguem com lista vazia e continuam full access. Trocar isso
 * retroativamente derrubaria integração em produção sem aviso; quem quiser
 * restringir cria uma chave nova e revoga a velha.
 */
export async function createApiKey(formData: FormData) {
  const userId = await requireUserId();
  const parsed = CreateInput.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false as const, error: "Nome inválido." };
  }

  // Parte do CATÁLOGO e não do que veio no formulário: assim um `scope`
  // inventado no POST não entra no banco. E se nada for marcado, grava vazio
  // — que é o comportamento antigo, full access, escolhido explicitamente.
  const scopes = API_SCOPE_KEYS.filter(
    (k) => formData.get(`scope_${k}`) === "on",
  );

  const dias = Number(formData.get("validadeDias") ?? 0);
  const expiresAt =
    Number.isFinite(dias) && dias > 0
      ? new Date(Date.now() + dias * 86_400_000)
      : null;

  const { key, prefix, keyHash } = generateApiKey();
  await prisma.apiKey.create({
    data: {
      userId,
      name: parsed.data.name,
      prefix,
      keyHash,
      scopes,
      expiresAt,
    },
  });
  revalidatePath("/dashboard/api-keys");
  return { ok: true as const, key, prefix };
}

export async function revokeApiKey(id: string) {
  const userId = await requireUserId();
  const existing = await prisma.apiKey.findFirst({
    where: { id, userId },
    select: { id: true, revokedAt: true },
  });
  if (!existing) return { ok: false as const, error: "Chave não encontrada." };
  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: existing.revokedAt ?? new Date() },
  });
  revalidatePath("/dashboard/api-keys");
  return { ok: true as const };
}

/**
 * Marca um par (apiKey, IP) como "confiável" (silencia futuros alertas) OU
 * remove a confiança. Chamado da UI /dashboard/api-keys. Só o dono da chave
 * pode mexer (checa userId no filtro).
 */
export async function setApiKeyIpTrusted(input: {
  ipUsageId: string;
  trusted: boolean;
}) {
  const userId = await requireUserId();
  const usage = await prisma.apiKeyIpUsage.findFirst({
    where: { id: input.ipUsageId, userId },
    select: { id: true },
  });
  if (!usage) return { ok: false as const, error: "Registro não encontrado." };
  await prisma.apiKeyIpUsage.update({
    where: { id: usage.id },
    data: { trusted: input.trusted },
  });
  revalidatePath("/dashboard/api-keys");
  return { ok: true as const };
}

/**
 * Remove um registro (apiKey, IP) da lista. Útil pra "esquecer" IP antigo.
 * Se o IP voltar a aparecer, é registrado como novo e alerta é disparado.
 */
export async function deleteApiKeyIp(ipUsageId: string) {
  const userId = await requireUserId();
  const usage = await prisma.apiKeyIpUsage.findFirst({
    where: { id: ipUsageId, userId },
    select: { id: true },
  });
  if (!usage) return { ok: false as const, error: "Registro não encontrado." };
  await prisma.apiKeyIpUsage.delete({ where: { id: usage.id } });
  revalidatePath("/dashboard/api-keys");
  return { ok: true as const };
}
