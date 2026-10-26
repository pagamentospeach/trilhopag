"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import {
  addDomainToVercel,
  removeDomainFromVercel,
} from "@/lib/vercel-api";
import { domainServesTrilho } from "@/lib/domain-health";

const DOMAIN_REGEX = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-)){1,}$/;

/**
 * Retorna os userIds do MESMO GRUPO (conta pai + todas as suas sub-accounts).
 * Usado pra permitir que sub-accounts gerenciem os dominios cadastrados na
 * conta pai (e vice-versa). Sub-account = mesmo dono real, so gestao segregada.
 */
async function getOwnerGroupIds(userId: string): Promise<string[]> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, parentUserId: true },
  });
  const rootId = me?.parentUserId ?? userId;
  const subs = await prisma.user.findMany({
    where: { parentUserId: rootId },
    select: { id: true },
  });
  return [rootId, ...subs.map((s) => s.id)];
}

/** Normaliza domínio: lowercase, sem protocolo, sem path/trailing slash. */
function normalizeDomain(raw: string): string | null {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (!DOMAIN_REGEX.test(d)) return null;
  // Bloqueia subdomínios da gente (proteção contra impersonation)
  if (
    d.endsWith("trilhopag.com") ||
    d.endsWith("trilhopag.com") ||
    d.endsWith("vercel.app")
  ) {
    return null;
  }
  return d;
}

const AddSchema = z.object({
  domain: z.string().trim().min(3).max(253),
});

export async function addCustomDomain(input: z.infer<typeof AddSchema>) {
  const userId = await requireUserId();
  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Domínio inválido" };
  }
  const domain = normalizeDomain(parsed.data.domain);
  if (!domain) {
    return {
      ok: false as const,
      error: "Domínio inválido. Use o formato `meusite.com.br` (sem https://).",
    };
  }
  // Bloqueia se outro user já cadastrou o mesmo.
  // Sub-accounts: conta PAI e SUBS compartilham dominios (mesmo dono real).
  // Se o dominio pertence ao pai e o seller esta logado numa sub (ou vice-versa),
  // trata como "voce ja tem" — nao como conflito com outro seller (bug reportado
  // pelo adsriya0 06/07: ele criou sub-account e o form barrou o dominio dele).
  const existing = await prisma.customDomain.findUnique({
    where: { domain },
  });
  if (existing) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { parentUserId: true },
    });
    const other = await prisma.user.findUnique({
      where: { id: existing.userId },
      select: { parentUserId: true },
    });
    // "Root" da hierarquia = parentUserId ?? self. Se batem, e o mesmo grupo.
    const myRoot = me?.parentUserId ?? userId;
    const otherRoot = other?.parentUserId ?? existing.userId;
    const sameOwner = existing.userId === userId || myRoot === otherRoot;
    if (sameOwner) {
      return { ok: false as const, error: "Você já cadastrou esse domínio." };
    }
    return {
      ok: false as const,
      error:
        "Este domínio já está em uso por outro seller. Se for seu, contate o suporte.",
    };
  }
  const verifyToken = randomBytes(16).toString("hex");
  // 09/08/2026: guarda o registro criado pra DEVOLVER no fim. O fluxo de
  // conexão virou um passo a passo contínuo (seção 16), e pra mostrar os
  // registros DNS DESTE domínio logo depois de adicionar o cliente precisa do
  // id e do token — antes só recebia `{ ok: true }` e tinha que esperar o
  // refresh, fechar o modal e caçar o card na lista.
  // Mudança ADITIVA: quem só olhava `r.ok` continua funcionando igual.
  const criado = await prisma.customDomain.create({
    data: {
      userId,
      domain,
      verifyToken,
      status: "pending",
    },
    select: { id: true, domain: true, verifyToken: true },
  });

  // CRITICAL: registra o dominio na Vercel API. Sem isso, mesmo com
  // DNS configurado, requests ao dominio retornam 404 "Domain Not
  // Configured" da propria Vercel. Best-effort: se falhar, seller
  // ainda pode clicar verify mais tarde (action chama de novo).
  const vres = await addDomainToVercel(domain);
  if (!vres.ok) {
    console.error(
      `[dominios] addDomainToVercel failed pra ${domain}:`,
      vres.error,
    );
    // Nao bloqueia o flow — seller pode tentar verify de novo depois.
    await prisma.customDomain.update({
      where: { domain },
      data: { errorMessage: `Vercel: ${vres.error.slice(0, 200)}` },
    });
  } else if ("skipped" in vres && vres.skipped) {
    console.warn("[dominios] Vercel API nao configurada — domain", domain);
  }

  revalidatePath("/dashboard/dominios");
  return { ok: true as const, id: criado.id, domain, verifyToken };
}

export async function deleteCustomDomain(id: string) {
  const userId = await requireUserId();
  const group = await getOwnerGroupIds(userId);
  const d = await prisma.customDomain.findFirst({
    where: { id, userId: { in: group } },
    select: { id: true, domain: true, userId: true },
  });
  if (!d) return { ok: false as const, error: "Domínio não encontrado" };
  // Limpa referências em Checkouts do grupo inteiro (pai + subs).
  await prisma.checkout.updateMany({
    where: { userId: { in: group }, customDomain: d.domain },
    data: { customDomain: null },
  });
  await prisma.customDomain.delete({ where: { id } });
  // Tira do projeto Vercel pra liberar o slot e nao deixar dominio
  // "fantasma" registrado. Best-effort — falhas logam mas nao quebram.
  const vres = await removeDomainFromVercel(d.domain);
  if (!vres.ok) {
    console.error(
      `[dominios] removeDomainFromVercel falhou pra ${d.domain}:`,
      vres.error,
    );
  }
  revalidatePath("/dashboard/dominios");
  return { ok: true as const };
}

/**
 * Detecta o provedor de DNS REAL do domínio pelos nameservers e devolve
 * uma dica de ONDE colar os registros.
 *
 * Resolve o ticket #1: seller cola os registros no painel ERRADO (ex:
 * Hostinger/registrador) enquanto a DNS na verdade mora em outro provedor
 * (ex: Cloudflare). Só os registros no provedor dos nameservers valem.
 */
async function detectDnsProvider(domain: string): Promise<{
  provider: string;
  panel: string | null;
  nameservers: string[];
  isCloudflare: boolean;
}> {
  const ns = await dns.resolveNs(domain).catch(() => [] as string[]);
  const low = ns.map((n) => n.toLowerCase());
  const has = (s: string) => low.some((n) => n.includes(s));
  const r = (provider: string, panel: string | null, isCloudflare = false) => ({
    provider,
    panel,
    nameservers: ns,
    isCloudflare,
  });
  if (has("cloudflare")) return r("Cloudflare", "dash.cloudflare.com", true);
  if (has("dns-parking.com") || has("hostinger"))
    return r("Hostinger", "hpanel.hostinger.com → Domínios → Zona DNS");
  if (has("domaincontrol.com") || has("godaddy"))
    return r("GoDaddy", "dcc.godaddy.com → DNS");
  if (has("registro.br") || has("dns.br"))
    return r("Registro.br", "registro.br → painel DNS");
  if (has("hostgator") || has("websitewelcome") || has("launchpad"))
    return r("HostGator", "cPanel → Zone Editor");
  if (has("namecheap") || has("registrar-servers.com"))
    return r("Namecheap", "Advanced DNS");
  if (has("awsdns")) return r("AWS Route 53", "console.aws.amazon.com/route53");
  if (has("googledomains") || has("google."))
    return r("Google / Cloud DNS", "console DNS do Google");
  if (has("dnsowl") || has("name.com")) return r("Name.com", "painel DNS");
  return r(ns.length ? "seu provedor de DNS" : "(nameservers não encontrados)", null);
}

/** Monta a dica "adicione no painel certo" baseada nos nameservers reais. */
async function dnsWhereHint(domain: string): Promise<string> {
  const p = await detectDnsProvider(domain);
  if (p.nameservers.length === 0) {
    return " (Não consegui ler os nameservers do domínio — confira se ele está ativo no seu provedor.)";
  }
  const ns0 = p.nameservers[0];
  const where = p.panel ? `${p.provider} (${p.panel})` : p.provider;
  const cf = p.isCloudflare
    ? " No A record, deixe DNS only (nuvem CINZA), NÃO Proxied (laranja)."
    : "";
  return ` ⚠️ Seu domínio usa nameservers da ${p.provider}${ns0 ? ` (${ns0})` : ""}. Adicione os registros NO PAINEL DA ${where} — registros em qualquer outro painel (registrador) são IGNORADOS.${cf}`;
}

/**
 * Resolve TXT + A consultando os NAMESERVERS AUTORITATIVOS do domínio
 * DIRETAMENTE (igual `dig @ns`), pulando o cache do resolver recursivo.
 *
 * Resolve o caso "record já adicionado mas ainda propagando": logo após o
 * seller adicionar o registro (ou trocar de nameserver), o autoritativo já
 * tem o valor certo, mas os resolvers públicos ainda servem o cache antigo
 * por minutos/horas. Consultar o autoritativo verifica na HORA.
 */
async function resolveAuthoritative(
  domain: string,
): Promise<{ txt: string[][]; a: string[] } | null> {
  try {
    const ns = await dns.resolveNs(domain);
    const ips: string[] = [];
    for (const n of ns) {
      const v4 = await dns.resolve4(n).catch(() => [] as string[]);
      ips.push(...v4);
    }
    if (ips.length === 0) return null;
    const resolver = new dns.Resolver();
    resolver.setServers(ips);
    // Procura o TXT de verificação em DOIS hosts: no próprio domínio (apex /
    // legado) E em _trilhopag-verify.<domínio> (subdomínio — onde o TXT precisa
    // ficar separado do CNAME). Junta os dois pra o caller achar em qualquer um.
    const txt = await resolver.resolveTxt(domain).catch(() => [] as string[][]);
    const txtVerify = await resolver
      .resolveTxt(`_trilhopag-verify.${domain}`)
      .catch(() => [] as string[][]);
    const a = await resolver.resolve4(domain).catch(() => [] as string[]);
    return { txt: [...txt, ...txtVerify], a };
  } catch {
    return null;
  }
}

/**
 * Verifica DNS:
 *  1. TXT record `trilhopag-verify=<token>` no domínio raiz
 *  2. CNAME apontando pra `cname.vercel-dns.com` (ou A record pra Vercel IP)
 *
 * Tenta primeiro o resolver recursivo (rápido) e, se não achar, consulta os
 * nameservers autoritativos direto (ignora cache/propagação).
 *
 * Atualiza status conforme resultado.
 */
export async function verifyCustomDomain(id: string) {
  const userId = await requireUserId();
  const group = await getOwnerGroupIds(userId);
  const d = await prisma.customDomain.findFirst({
    where: { id, userId: { in: group } },
  });
  if (!d) return { ok: false as const, error: "Domínio não encontrado" };

  // Rate limit: 1 check por minuto por domínio
  if (d.lastCheckAt && Date.now() - d.lastCheckAt.getTime() < 60_000) {
    return {
      ok: false as const,
      error: "Aguarde 1 min entre verificações.",
    };
  }

  await prisma.customDomain.update({
    where: { id },
    data: { lastCheckAt: new Date(), status: "verifying", errorMessage: null },
  });

  try {
    // 0. Garante que o dominio esta registrado na Vercel (idempotente).
    // CRITICAL: sem isso, Vercel retorna 404 mesmo com DNS apontado certo.
    const vres = await addDomainToVercel(d.domain);
    if (!vres.ok) {
      await prisma.customDomain.update({
        where: { id },
        data: {
          status: "failed",
          errorMessage: `Falha registrando na Vercel: ${vres.error}. Tente de novo em alguns segundos ou contate o suporte.`,
        },
      });
      return {
        ok: false as const,
        error: `Vercel: ${vres.error}`,
      };
    }
    if ("skipped" in vres && vres.skipped) {
      // Admin nao configurou VERCEL_TOKEN — alerta no DB mas continua
      // pq pode ser que o admin tenha adicionado manualmente no painel.
      await prisma.customDomain.update({
        where: { id },
        data: {
          errorMessage:
            "AVISO: VERCEL_TOKEN nao configurado no servidor. Admin precisa adicionar o dominio manualmente no painel Vercel.",
        },
      });
    }

    // 1. Verifica TXT — recursivo (cacheado) primeiro. Procura em DOIS hosts:
    // o próprio domínio (apex/legado) E _trilhopag-verify.<domínio> (subdomínio,
    // host separado do CNAME — senão a Hostinger recusa "dois hosts iguais").
    const txtRecords = await dns.resolveTxt(d.domain).catch(() => []);
    const txtRecordsVerify = await dns
      .resolveTxt(`_trilhopag-verify.${d.domain}`)
      .catch(() => []);
    const expectedTxt = `trilhopag-verify=${d.verifyToken}`;
    let txtFound = [...txtRecords, ...txtRecordsVerify].some((arr) =>
      arr.join("").includes(expectedTxt),
    );
    // Fallback: consulta o AUTORITATIVO direto (resolve cache/propagação —
    // ex: seller acabou de adicionar ou trocar de nameserver).
    let auth: { txt: string[][]; a: string[] } | null = null;
    if (!txtFound) {
      auth = await resolveAuthoritative(d.domain);
      if (auth) {
        txtFound = auth.txt.some((arr) => arr.join("").includes(expectedTxt));
      }
    }
    if (!txtFound) {
      const hint = await dnsWhereHint(d.domain);
      await prisma.customDomain.update({
        where: { id },
        data: {
          status: "failed",
          errorMessage: `TXT de verificação não encontrado. Adicione o TXT "${expectedTxt}" no host mostrado no painel — em SUBDOMÍNIO o host é "_trilhopag-verify.<seu-subdomínio>" (separado do CNAME; não use o mesmo host dos dois).${hint}`,
        },
      });
      return {
        ok: false as const,
        error: `Registro TXT não encontrado em ${d.domain}.`,
      };
    }

    // 2. Verifica CNAME OU A apontando pra Vercel
    const cnames = await dns.resolveCname(d.domain).catch(() => []);
    const aRecords = await dns.resolve4(d.domain).catch(() => []);
    const VERCEL_IPS = ["76.76.21.21"];
    const VERCEL_CNAMES = [
      "cname.vercel-dns.com",
    ];
    const cnameOk = cnames.some((c) =>
      VERCEL_CNAMES.some((v) => c.endsWith(v)),
    );
    let aOk = aRecords.some((ip) => VERCEL_IPS.includes(ip));
    // Fallback autoritativo (mesma razão do TXT — pula cache/propagação).
    if (!cnameOk && !aOk) {
      if (!auth) auth = await resolveAuthoritative(d.domain);
      if (auth) aOk = auth.a.some((ip) => VERCEL_IPS.includes(ip));
    }
    if (!cnameOk && !aOk) {
      const hint = await dnsWhereHint(d.domain);
      await prisma.customDomain.update({
        where: { id },
        data: {
          status: "failed",
          errorMessage: `TXT OK, mas o domínio raiz não aponta pra Vercel. Adicione um A record: Host @ → 76.76.21.21.${hint}`,
        },
      });
      return {
        ok: false as const,
        error: "CNAME/A record não aponta pra Vercel.",
      };
    }

    // 3. LIVE CHECK — confirma que o domínio SERVE A TRILHO de fato.
    // CRITICAL (fix jun/2026): DNS apontar pra Vercel NÃO basta — o IP
    // 76.76.21.21 e o cname.vercel-dns.com são GENÉRICOS da Vercel, então
    // o domínio pode estar apontado pra Vercel DO PRÓPRIO SELLER (a loja
    // dele). Nesse caso o DNS passa mas /cl/ e /c/ dão 404. Foi exatamente
    // o bug do pagamentoshop.sbs. Aqui batemos no marcador real /cl/__trilho_health.
    const servesTrilho = await domainServesTrilho(d.domain);
    if (!servesTrilho) {
      const hint = await dnsWhereHint(d.domain);
      await prisma.customDomain.update({
        where: { id },
        data: {
          status: "failed",
          errorMessage:
            `DNS OK, mas ${d.domain} NÃO respondeu como Trilho. Causas comuns: ` +
            `(1) o domínio está apontado pra OUTRA hospedagem/Vercel sua (ex: sua loja) — ` +
            `remova-o do outro projeto/hospedagem pra ele servir a Trilho; ` +
            `(2) SSL ainda provisionando — aguarde ~2 min e clique Verificar de novo.${hint}`,
        },
      });
      return {
        ok: false as const,
        error:
          "Domínio aponta pra Vercel, mas não está servindo a Trilho (provavelmente está em outra hospedagem sua, ou o SSL ainda está provisionando). Veja a mensagem e tente de novo.",
      };
    }

    // Tudo OK
    await prisma.customDomain.update({
      where: { id },
      data: {
        status: "verified",
        verifiedAt: new Date(),
        errorMessage: null,
      },
    });
    revalidatePath("/dashboard/dominios");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro DNS";
    // Mesmo no erro inesperado, tenta apontar o caminho: onde estão os
    // nameservers do domínio (= onde os registros precisam ir).
    const hint = await dnsWhereHint(d.domain).catch(() => "");
    await prisma.customDomain.update({
      where: { id },
      data: {
        status: "failed",
        errorMessage: `${msg.slice(0, 150)}.${hint}`.slice(0, 400),
      },
    });
    return { ok: false as const, error: msg };
  }
}

const UseFlagsSchema = z.object({
  id: z.string(),
  useCheckout: z.boolean().optional(),
  useCloaker: z.boolean().optional(),
  useBturb: z.boolean().optional(),
  useMembros: z.boolean().optional(),
});

export async function updateDomainUsage(input: z.infer<typeof UseFlagsSchema>) {
  const userId = await requireUserId();
  const parsed = UseFlagsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };
  const group = await getOwnerGroupIds(userId);
  const d = await prisma.customDomain.findFirst({
    where: { id: parsed.data.id, userId: { in: group } },
    select: { id: true },
  });
  if (!d) return { ok: false as const, error: "Domínio não encontrado" };
  const { id, ...flags } = parsed.data;
  await prisma.customDomain.update({ where: { id }, data: flags });
  revalidatePath("/dashboard/dominios");
  return { ok: true as const };
}

/**
 * Aplica um domínio próprio a um checkout específico. Domain precisa estar
 * verified + useCheckout=true.
 */
export async function applyDomainToCheckout(input: {
  checkoutId: string;
  domain: string | null;
}) {
  const userId = await requireUserId();
  const checkout = await prisma.checkout.findFirst({
    where: { id: input.checkoutId, userId },
    select: { id: true },
  });
  if (!checkout) return { ok: false as const, error: "Checkout não encontrado" };

  if (input.domain) {
    const group = await getOwnerGroupIds(userId);
    const dom = await prisma.customDomain.findFirst({
      where: {
        domain: input.domain.toLowerCase().trim(),
        userId: { in: group },
        status: "verified",
        useCheckout: true,
      },
    });
    if (!dom) {
      return {
        ok: false as const,
        error: "Domínio não encontrado ou não verificado pra checkout",
      };
    }
  }

  // Setando custom domain → limpa pool. São mutuamente exclusivos.
  // Se tinha pool antes, decrementa o usageCount.
  const prev = await prisma.checkout.findUnique({
    where: { id: input.checkoutId },
    select: { poolDomainId: true },
  });
  await prisma.$transaction(async (db) => {
    if (prev?.poolDomainId) {
      await db.adminCheckoutDomain
        .update({
          where: { id: prev.poolDomainId },
          data: { usageCount: { decrement: 1 } },
        })
        .catch(() => {});
    }
    await db.checkout.update({
      where: { id: input.checkoutId },
      data: { customDomain: input.domain ?? null, poolDomainId: null },
    });
  });
  revalidatePath("/dashboard/produtos");
  return { ok: true as const };
}

/**
 * Aplica um domínio do POOL da plataforma ao checkout. Limpa customDomain
 * (mutuamente exclusivos — só um pode ser ativo por vez).
 */
export async function applyPoolDomainToCheckout(input: {
  checkoutId: string;
  poolDomainId: string | null;
}) {
  const userId = await requireUserId();
  const checkout = await prisma.checkout.findFirst({
    where: { id: input.checkoutId, userId },
    select: { id: true, poolDomainId: true },
  });
  if (!checkout) return { ok: false as const, error: "Checkout não encontrado" };

  if (input.poolDomainId) {
    const pool = await prisma.adminCheckoutDomain.findUnique({
      where: { id: input.poolDomainId },
      select: { active: true },
    });
    if (!pool || !pool.active) {
      return {
        ok: false as const,
        error: "Domínio do pool não está disponível.",
      };
    }
  }

  await prisma.$transaction(async (db) => {
    if (
      checkout.poolDomainId &&
      checkout.poolDomainId !== input.poolDomainId
    ) {
      await db.adminCheckoutDomain
        .update({
          where: { id: checkout.poolDomainId },
          data: { usageCount: { decrement: 1 } },
        })
        .catch(() => {});
    }
    if (input.poolDomainId && checkout.poolDomainId !== input.poolDomainId) {
      await db.adminCheckoutDomain
        .update({
          where: { id: input.poolDomainId },
          data: { usageCount: { increment: 1 } },
        })
        .catch(() => {});
    }
    await db.checkout.update({
      where: { id: input.checkoutId },
      data: {
        poolDomainId: input.poolDomainId,
        // Pool exclui customDomain (mutuamente exclusivos)
        customDomain: input.poolDomainId ? null : undefined,
      },
    });
  });

  revalidatePath("/dashboard/produtos");
  return { ok: true as const };
}
