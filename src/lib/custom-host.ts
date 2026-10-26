/**
 * Helper centralizado pra resolver QUAL domínio próprio do user vai
 * servir uma feature (cloaker, bturb, checkout, membros).
 *
 * Por que: NUNCA expomos trilhopag.com em URLs que vão pra anúncios
 * pagos (FB/TT/Google), senão o domínio do gateway fica queimado. As URLs
 * SEMPRE precisam ser do dominio próprio do seller, cadastrado e verificado
 * na aba Domínios.
 */
import { prisma } from "./prisma";
import { isPlatformHost } from "./platform-domains";
import { getUserGroupIds } from "./seller-checkout-url";

export type FeatureFlag = "useCheckout" | "useCloaker" | "useBturb" | "useMembros";

export type ResolvedHost = {
  /** Hostname puro (sem protocolo) — ex.: "minhamarca.com.br" */
  host: string;
  /** ID do CustomDomain row associado */
  customDomainId: string;
};

/**
 * Lista domínios verificados do user disponíveis pra essa feature.
 * Usado no UI pra mostrar dropdown de escolha.
 */
export async function listVerifiedDomainsForFeature(
  userId: string,
  feature: FeatureFlag,
): Promise<{ id: string; domain: string }[]> {
  // Sub-account herda dominios do grupo (fix 06/07 — adsriya0).
  const groupIds = await getUserGroupIds(userId);
  const rows = await prisma.customDomain.findMany({
    where: {
      userId: { in: groupIds },
      status: "verified",
      [feature]: true,
    },
    select: { id: true, domain: true },
    orderBy: { createdAt: "asc" },
  });
  // Defesa em profundidade: NUNCA expõe um domínio da plataforma como
  // se fosse domínio próprio do user (impossível em teoria — não dá pra
  // verificar trilhopag.com sem ser dono — mas é nosso último filtro).
  return rows.filter((r) => !isPlatformHost(r.domain));
}

/**
 * Resolve o host efetivo de uma feature, dado o ID do customDomain escolhido.
 * Verifica ownership + status + flag da feature. Retorna null se inválido.
 */
export async function resolveDomainHost(
  userId: string,
  customDomainId: string | null | undefined,
  feature: FeatureFlag,
): Promise<ResolvedHost | null> {
  if (!customDomainId) return null;
  // Sub-account herda dominios do grupo (fix 06/07 — adsriya0).
  const groupIds = await getUserGroupIds(userId);
  const row = await prisma.customDomain.findFirst({
    where: {
      id: customDomainId,
      userId: { in: groupIds },
      status: "verified",
      [feature]: true,
    },
    select: { id: true, domain: true },
  });
  if (!row) return null;
  return { host: row.domain, customDomainId: row.id };
}

/**
 * Constrói URL completa pra uma feature usando host customizado.
 * Se customDomainId for null/inválido, retorna null (UI decide como tratar
 * — geralmente mostra warning "configure um domínio próprio").
 */
export async function buildFeatureUrl(
  userId: string,
  customDomainId: string | null | undefined,
  feature: FeatureFlag,
  path: string,
): Promise<string | null> {
  const resolved = await resolveDomainHost(userId, customDomainId, feature);
  if (!resolved) return null;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${resolved.host}${cleanPath}`;
}
