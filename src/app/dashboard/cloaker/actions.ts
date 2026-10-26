"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { uniqueSlug } from "@/lib/slugify";
import { resolveDomainHost, listVerifiedDomainsForFeature } from "@/lib/custom-host";
import { safeHttpUrl } from "@/lib/security/safe-url";
import { domainServesTrilho } from "@/lib/domain-health";

/** Normaliza host: lowercase, sem www. */
function normHost(h: string): string {
  return h.trim().toLowerCase().replace(/^www\./, "");
}

/** True se a URL tem o MESMO host (ignorando www) que o dominio do cloaker. */
function urlSameHostAs(url: string, host: string): boolean {
  try {
    return normHost(new URL(url).hostname) === normHost(host);
  } catch {
    return false;
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  whiteUrl: safeHttpUrl(),
  moneyUrl: safeHttpUrl(),
  /**
   * OBRIGATÓRIO: ID de um CustomDomain verificado com useCloaker=true.
   * A URL final será https://<dominio>/cl/<slug>, NUNCA trilhopag.com
   * (senão queima o domínio do gateway na plataforma de anúncio).
   */
  customDomainId: z.string().min(1),
});

export async function createCloakerCampaign(
  input: z.infer<typeof CreateSchema>,
) {
  const userId = await requireUserId();
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };

  // Valida que o domínio existe, é verificado e tem useCloaker ativo
  const resolved = await resolveDomainHost(
    userId,
    parsed.data.customDomainId,
    "useCloaker",
  );
  if (!resolved) {
    return {
      ok: false as const,
      error:
        "Domínio inválido. Cadastre um domínio próprio em Domínios, verifique-o e ative 'Cloaker'.",
    };
  }

  // GUARD 1: white/money NÃO podem ser o mesmo domínio do cloaker. O domínio
  // do cloaker serve a rota /cl/ na Trilho — ele não pode ser ao mesmo
  // tempo o destino white/money (daria loop/404). White = página segura
  // (sua loja/outro site), money = sua oferta — sempre em OUTRO domínio.
  if (
    urlSameHostAs(parsed.data.whiteUrl, resolved.host) ||
    urlSameHostAs(parsed.data.moneyUrl, resolved.host)
  ) {
    return {
      ok: false as const,
      error: `A URL White e a URL Money precisam ser de OUTRO domínio, não do próprio domínio do cloaker (${resolved.host}). Use o domínio do cloaker SÓ no link /cl/ — White e Money apontam pra outras páginas (sua loja segura e sua oferta).`,
    };
  }

  // GUARD 2: confirma que o domínio realmente SERVE a Trilho agora (defesa
  // contra domínios marcados "verified" no passado mas que apontam pra outra
  // hospedagem do seller — ex: pagamentoshop.sbs). 1 tentativa (rápido).
  if (!(await domainServesTrilho(resolved.host, 1))) {
    return {
      ok: false as const,
      error: `O domínio ${resolved.host} não está respondendo como Trilho (provavelmente aponta pra outra hospedagem/Vercel sua). Vá em Domínios, confira o DNS e clique Verificar de novo antes de criar o cloaker.`,
    };
  }

  const slug = await uniqueSlug(parsed.data.name, async (s) =>
    prisma.cloakerCampaign.findUnique({
      where: { slug: s },
      select: { id: true },
    }),
  );

  const c = await prisma.cloakerCampaign.create({
    data: {
      userId,
      slug,
      name: parsed.data.name,
      whiteUrl: parsed.data.whiteUrl,
      moneyUrl: parsed.data.moneyUrl,
      customDomainId: resolved.customDomainId,
    },
  });
  revalidatePath("/dashboard/cloaker");
  return { ok: true as const, id: c.id, slug: c.slug };
}

const UpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  whiteUrl: safeHttpUrl().optional(),
  moneyUrl: safeHttpUrl().optional(),
  active: z.boolean().optional(),
  mode: z.enum(["redirect", "rewrite"]).optional(),
  blockDatacenterIps: z.boolean().optional(),
  blockBotUA: z.boolean().optional(),
  blockNoReferer: z.boolean().optional(),
  blockCountries: z.array(z.string()).optional(),
  allowCountries: z.array(z.string()).optional(),
  blockProxy: z.boolean().optional(),
  blockOldBrowsers: z.boolean().optional(),
  requireReferer: z.string().nullable().optional(),
  blockedIps: z.array(z.string()).optional(),
  allowedIps: z.array(z.string()).optional(),
  blockedUAs: z.array(z.string()).optional(),
  requireUtmSources: z.array(z.string()).optional(),
  customDomainId: z.string().min(1).optional(),
});

export async function updateCloakerCampaign(
  input: z.infer<typeof UpdateSchema>,
) {
  const userId = await requireUserId();
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };
  const { id, ...data } = parsed.data;
  const c = await prisma.cloakerCampaign.findFirst({
    where: { id, userId },
    select: { id: true, customDomainId: true },
  });
  if (!c) return { ok: false as const, error: "Campanha não encontrada" };

  // Descobre o HOST efetivo do cloaker: o novo (se está mudando) ou o atual.
  let cloakerHost: string | null = null;
  if (data.customDomainId) {
    const resolved = await resolveDomainHost(
      userId,
      data.customDomainId,
      "useCloaker",
    );
    if (!resolved) {
      return {
        ok: false as const,
        error: "Domínio inválido pra cloaker.",
      };
    }
    cloakerHost = resolved.host;
  } else if (c.customDomainId) {
    const resolved = await resolveDomainHost(
      userId,
      c.customDomainId,
      "useCloaker",
    );
    cloakerHost = resolved?.host ?? null;
  }

  // GUARD: white/money não podem ser o mesmo domínio do cloaker (loop/404).
  if (cloakerHost) {
    if (
      (data.whiteUrl && urlSameHostAs(data.whiteUrl, cloakerHost)) ||
      (data.moneyUrl && urlSameHostAs(data.moneyUrl, cloakerHost))
    ) {
      return {
        ok: false as const,
        error: `A URL White e a URL Money precisam ser de OUTRO domínio, não do próprio domínio do cloaker (${cloakerHost}). White = página segura (sua loja/outro site), Money = sua oferta.`,
      };
    }
  }

  await prisma.cloakerCampaign.update({ where: { id }, data });
  revalidatePath("/dashboard/cloaker");
  revalidatePath(`/dashboard/cloaker/${id}`);
  return { ok: true as const };
}

export async function deleteCloakerCampaign(id: string) {
  const userId = await requireUserId();
  const c = await prisma.cloakerCampaign.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!c) return { ok: false as const, error: "Campanha não encontrada" };
  await prisma.cloakerCampaign.delete({ where: { id } });
  revalidatePath("/dashboard/cloaker");
  return { ok: true as const };
}

/** Lista domínios verificados do user disponíveis pra cloaker (usado no UI). */
export async function listCloakerDomains() {
  const userId = await requireUserId();
  return listVerifiedDomainsForFeature(userId, "useCloaker");
}
