"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { getUserVerifiedCheckoutDomain } from "@/lib/seller-checkout-url";
import { getCheckoutUrl } from "@/lib/checkout-url";
import { parsePostPurchaseConfig } from "@/lib/post-purchase";

/* ----------------------------- Graph schema ----------------------------- */

const NodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()).optional(),
});
const EdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  data: z.object({ kind: z.string().optional() }).passthrough().optional(),
});
const GraphSchema = z.object({
  nodes: z.array(NodeSchema).max(500),
  edges: z.array(EdgeSchema).max(1000),
});
type Graph = z.infer<typeof GraphSchema>;

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/* ------------------------------- helpers -------------------------------- */

function nodeData(g: Graph, id: string): Record<string, unknown> | null {
  return (g.nodes.find((n) => n.id === id)?.data as Record<string, unknown>) ?? null;
}
function nodeCheckoutId(g: Graph, id: string): string | null {
  const v = nodeData(g, id)?.checkoutId;
  return typeof v === "string" ? v : null;
}
function nodeUrl(g: Graph, id: string): string | null {
  const v = nodeData(g, id)?.url;
  return typeof v === "string" ? v : null;
}
function edgeKind(e: Graph["edges"][number]): "upsell" | "backredirect" {
  const k = e.data?.kind;
  if (k === "backredirect") return "backredirect";
  if (k === "upsell") return "upsell";
  return e.sourceHandle === "backredirect" ? "backredirect" : "upsell";
}
/** Detecta ciclo numa adjacência com MÚLTIPLOS sucessores (A/B abre 2 saídas
 *  de upsell por oferta). DFS com cores. */
function hasUpsellCycle(adj: Map<string, string[]>): boolean {
  const color = new Map<string, number>(); // 0/undef=novo, 1=na pilha, 2=ok
  const visit = (u: string): boolean => {
    color.set(u, 1);
    for (const t of adj.get(u) ?? []) {
      const c = color.get(t);
      if (c === 1) return true;
      if (!c && visit(t)) return true;
    }
    color.set(u, 2);
    return false;
  };
  for (const u of adj.keys()) {
    if (!color.get(u) && visit(u)) return true;
  }
  return false;
}

/** Peso da variante numa aresta de upsell A/B (passthrough no grafo). */
function edgeWeight(e: Graph["edges"][number]): number {
  const w = Number((e.data as { weight?: unknown } | undefined)?.weight);
  return Number.isFinite(w) && w > 0 ? Math.round(w) : 0;
}

/** checkoutIds (ofertas) que são nós no grafo. */
function checkoutIdsInGraph(g: Graph): Set<string> {
  const s = new Set<string>();
  for (const n of g.nodes) {
    const cid = nodeCheckoutId(g, n.id);
    if (cid) s.add(cid);
  }
  return s;
}

/* ------------------------------- CRUD ----------------------------------- */

/** Cria um funil NOVO (sempre desativado). Retorna o id. */
export async function createFunnel(input: {
  name: string;
  kind: "product" | "bot";
  botId?: string | null;
}): Promise<Result<{ id: string }>> {
  const userId = await requireUserId();
  const name = input.name.trim().slice(0, 80) || "Meu funil";
  const kind = input.kind === "bot" ? "bot" : "product";
  let botId: string | null = null;
  if (kind === "bot") {
    if (!input.botId) return { ok: false, error: "botId obrigatório" };
    // ownership do bot
    const bot = await prisma.saleBot.findFirst({
      where: { id: input.botId, userId },
      select: { id: true },
    });
    if (!bot) return { ok: false, error: "bot não encontrado" };
    botId = bot.id;
  }
  const f = await prisma.funnel.create({
    data: { userId, name, kind, botId, active: false, graph: { nodes: [], edges: [] } },
    select: { id: true },
  });
  return { ok: true, id: f.id };
}

export async function renameFunnel(
  funnelId: string,
  name: string,
): Promise<Result> {
  const userId = await requireUserId();
  const clean = name.trim().slice(0, 80);
  if (!clean) return { ok: false, error: "nome vazio" };
  const r = await prisma.funnel.updateMany({
    where: { id: funnelId, userId },
    data: { name: clean },
  });
  return r.count > 0 ? { ok: true } : { ok: false, error: "não encontrado" };
}

/** Duplica um funil: cria uma CÓPIA desativada com o mesmo grafo. Serve de
 *  "template" — duplica, ajusta e ativa quando quiser. Retorna o novo id. */
export async function duplicateFunnel(
  funnelId: string,
): Promise<Result<{ id: string }>> {
  const userId = await requireUserId();
  const f = await prisma.funnel.findFirst({
    where: { id: funnelId, userId },
    select: { name: true, kind: true, botId: true, graph: true },
  });
  if (!f) return { ok: false, error: "não encontrado" };
  const name = `${f.name} (cópia)`.slice(0, 80);
  const created = await prisma.funnel.create({
    data: {
      userId,
      name,
      kind: f.kind,
      botId: f.botId,
      active: false, // cópia SEMPRE nasce desativada (não aplica links)
      graph: (f.graph as object) ?? { nodes: [], edges: [] },
    },
    select: { id: true },
  });
  revalidatePath("/dashboard/produtos");
  return { ok: true, id: created.id };
}

/** Liga/desliga a EXECUÇÃO do funil de conversa de um bot (opt-in explícito).
 *  Default false — enquanto desligado, o bot mantém o comportamento atual. */
export async function setBotFunnelRuntime(
  botId: string,
  enabled: boolean,
): Promise<Result> {
  const userId = await requireUserId();
  const r = await prisma.saleBot.updateMany({
    where: { id: botId, userId },
    data: { funnelRuntimeEnabled: enabled },
  });
  return r.count > 0 ? { ok: true } : { ok: false, error: "bot não encontrado" };
}

/** Autosave do grafo (posições/conexões). Não mexe em links. */
export async function saveFunnelGraph(
  funnelId: string,
  graphRaw: unknown,
): Promise<Result> {
  const userId = await requireUserId();
  const parsed = GraphSchema.safeParse(graphRaw);
  if (!parsed.success) return { ok: false, error: "grafo inválido" };
  const r = await prisma.funnel.updateMany({
    where: { id: funnelId, userId },
    data: { graph: parsed.data as object },
  });
  return r.count > 0 ? { ok: true } : { ok: false, error: "não encontrado" };
}

export async function deleteFunnel(funnelId: string): Promise<Result> {
  const userId = await requireUserId();
  const f = await prisma.funnel.findFirst({
    where: { id: funnelId, userId },
    select: { id: true, kind: true, active: true, graph: true },
  });
  if (!f) return { ok: false, error: "não encontrado" };
  // se era um funil de produto ATIVO, limpa os links que ele aplicou
  if (f.kind === "product" && f.active) {
    const g = GraphSchema.safeParse(f.graph);
    if (g.success) await clearOfferLinks(userId, checkoutIdsInGraph(g.data));
  }
  await prisma.funnel.delete({ where: { id: f.id } });
  revalidatePath("/dashboard/produtos");
  return { ok: true };
}

/* --------------------------- link application --------------------------- */

/** Limpa upsellUrl/backRedirectUrl/upsellAbTest das ofertas (checkouts) dadas. */
async function clearOfferLinks(userId: string, checkoutIds: Set<string>) {
  if (checkoutIds.size === 0) return;
  await prisma.checkout.updateMany({
    where: { userId, id: { in: [...checkoutIds] } },
    data: {
      upsellUrl: null,
      backRedirectUrl: null,
      upsellAbTest: Prisma.DbNull,
      upsellTargetCheckoutId: null,
      upsellRouting: Prisma.DbNull,
      postPurchaseEmail: Prisma.DbNull,
    },
  });
}

/**
 * Resolve as conexões do grafo POR OFERTA e grava upsellUrl/backRedirectUrl
 * em cada oferta-origem (checkout). Destino = outra OFERTA (vira o link do
 * checkout dela) ou um LINK externo. Detecta ciclo de upsell entre ofertas.
 */
async function applyProductLinks(
  userId: string,
  g: Graph,
): Promise<
  | { ok: true; offersUpdated: number; warnings: string[] }
  | { ok: false; error: string }
> {
  const [domain, checkouts] = await Promise.all([
    getUserVerifiedCheckoutDomain(userId),
    prisma.checkout.findMany({
      where: { userId, active: true },
      select: { id: true, slug: true },
    }),
  ]);
  const slugById = new Map(checkouts.map((c) => [c.id, c.slug]));
  const validIds = new Set(checkouts.map((c) => c.id));
  const warnings: string[] = [];

  const targetUrl = (targetNodeId: string): string | null => {
    // 1) LINK EMBUTIDO na oferta de destino tem prioridade: se a oferta-alvo
    //    tem um link interno, toda conexão que chega nela vai pra esse link
    //    (em vez do checkout dela). Não precisa de domínio (é URL completa).
    const emb = nodeData(g, targetNodeId)?.embeddedUrl;
    if (typeof emb === "string") {
      const e = emb.trim();
      if (/^https?:\/\//i.test(e)) return e;
      if (e) warnings.push("Um link interno está inválido (use http/https).");
    }
    // 2) Oferta-alvo sem link interno → vira upsell pro checkout dela.
    const cid = nodeCheckoutId(g, targetNodeId);
    if (cid) {
      const slug = slugById.get(cid);
      if (!slug) {
        warnings.push("Uma oferta de destino não está mais ativa.");
        return null;
      }
      if (!domain) {
        warnings.push("Conecte um domínio pra aplicar upsell entre ofertas.");
        return null;
      }
      return getCheckoutUrl(slug, undefined, domain);
    }
    // 3) Nó de link solto.
    const u = nodeUrl(g, targetNodeId);
    if (u && /^https?:\/\//i.test(u)) return u;
    if (u) warnings.push("Um link está inválido (use http/https).");
    return null;
  };

  // Uma oferta pode ter VÁRIAS saídas de upsell (teste A/B). Junta por origem,
  // ordena por id (estável → variante A, B, …), e resolve url + peso de cada.
  type UpEdge = { id: string; target: string; weight: number };
  const upsellAdj = new Map<string, string[]>(); // checkoutId -> [checkoutId]
  const upsellEdgesByOffer = new Map<string, UpEdge[]>();
  const srcNodeByCheckout = new Map<string, string>(); // checkoutId -> nodeId origem
  const backUrlByOffer = new Map<string, string | null>();
  for (const e of g.edges) {
    const srcCid = nodeCheckoutId(g, e.source);
    if (!srcCid || !validIds.has(srcCid)) continue; // origem precisa ser uma oferta do user
    const kind = edgeKind(e);
    if (kind === "upsell") {
      srcNodeByCheckout.set(srcCid, e.source);
      const list = upsellEdgesByOffer.get(srcCid) ?? [];
      list.push({ id: e.id, target: e.target, weight: edgeWeight(e) });
      upsellEdgesByOffer.set(srcCid, list);
      const tgtCid = nodeCheckoutId(g, e.target);
      if (tgtCid) upsellAdj.set(srcCid, [...(upsellAdj.get(srcCid) ?? []), tgtCid]);
    } else {
      if (backUrlByOffer.has(srcCid)) continue;
      backUrlByOffer.set(srcCid, targetUrl(e.target));
    }
  }
  if (hasUpsellCycle(upsellAdj)) {
    return {
      ok: false,
      error: "Loop de upsell (ex: A → B → A). Remova a conexão que fecha o ciclo.",
    };
  }

  // Pra cada oferta: resolve a saída de upsell — 1 alvo = upsellUrl simples;
  // 2+ alvos válidos = teste A/B (upsellAbTest) com upsellUrl = 1ª variante.
  const AB_LETTERS = ["A", "B", "C", "D", "E"];
  const upsellUrlByOffer = new Map<string, string | null>();
  const abTestByOffer = new Map<string, Prisma.InputJsonValue | null>();
  const routingByOffer = new Map<string, Prisma.InputJsonValue | null>();
  const upsellTargetByOffer = new Map<string, string | null>();
  for (const [cid, edgesRaw] of upsellEdgesByOffer) {
    const sorted = [...edgesRaw].sort((a, b) => a.id.localeCompare(b.id));
    const resolved = sorted
      .map((e, i) => ({
        url: targetUrl(e.target),
        weight: e.weight,
        label: AB_LETTERS[i] ?? `V${i + 1}`,
        checkoutId: nodeCheckoutId(g, e.target) ?? undefined,
      }))
      .filter(
        (v): v is { url: string; weight: number; label: string; checkoutId: string | undefined } =>
          !!v.url,
      );
    // modo de roteamento configurado na oferta-origem (node data)
    const srcNode = srcNodeByCheckout.get(cid);
    const nd = srcNode ? nodeData(g, srcNode) : null;
    const routeMode = typeof nd?.routeMode === "string" ? nd.routeMode : "ab";
    const routeValue = nd?.routeValue != null ? String(nd.routeValue) : "";
    const isCond = routeMode === "method" || routeMode === "amount" || routeMode === "uf";

    if (resolved.length === 0) {
      upsellUrlByOffer.set(cid, null);
      abTestByOffer.set(cid, null);
      routingByOffer.set(cid, null);
      upsellTargetByOffer.set(cid, null);
    } else if (resolved.length === 1) {
      upsellUrlByOffer.set(cid, resolved[0].url);
      abTestByOffer.set(cid, null);
      routingByOffer.set(cid, null);
      upsellTargetByOffer.set(cid, resolved[0].checkoutId ?? null);
    } else if (isCond) {
      // roteamento condicional: A = condição verdadeira, B = senão
      const a = resolved[0];
      const b = resolved[1];
      upsellUrlByOffer.set(cid, a.url);
      abTestByOffer.set(cid, null);
      upsellTargetByOffer.set(cid, null);
      routingByOffer.set(cid, {
        type: routeMode,
        value: routeValue,
        match: { url: a.url, ...(a.checkoutId ? { checkoutId: a.checkoutId } : {}) },
        fallback: { url: b.url, ...(b.checkoutId ? { checkoutId: b.checkoutId } : {}) },
      });
    } else {
      // teste A/B: normaliza pesos (0/ausente → distribui igual)
      const anyZero = resolved.some((v) => v.weight <= 0);
      const variants = resolved.map((v) => ({
        url: v.url,
        weight: anyZero ? Math.round(100 / resolved.length) : v.weight,
        label: v.label,
        ...(v.checkoutId ? { checkoutId: v.checkoutId } : {}),
      }));
      upsellUrlByOffer.set(cid, variants[0].url);
      abTestByOffer.set(cid, { variants });
      routingByOffer.set(cid, null);
      upsellTargetByOffer.set(cid, null); // A/B usa variantes; alvo único N/A
    }
  }

  // mapa checkoutId → data do nó de oferta (pra ler config pós-compra de
  // QUALQUER oferta, mesmo as sem upsell)
  const nodeDataByCheckout = new Map<string, Record<string, unknown>>();
  for (const n of g.nodes) {
    const cid = nodeCheckoutId(g, n.id);
    const d = nodeData(g, n.id);
    if (cid && d) nodeDataByCheckout.set(cid, d);
  }

  let offersUpdated = 0;
  for (const cid of checkoutIdsInGraph(g)) {
    if (!validIds.has(cid)) continue;
    const ab = abTestByOffer.get(cid);
    const routing = routingByOffer.get(cid);
    const ppCfg = parsePostPurchaseConfig(nodeDataByCheckout.get(cid)?.postPurchaseEmail);
    const res = await prisma.checkout.updateMany({
      where: { id: cid, userId },
      data: {
        upsellUrl: upsellUrlByOffer.get(cid) ?? null,
        backRedirectUrl: backUrlByOffer.get(cid) ?? null,
        upsellAbTest: ab ?? Prisma.DbNull,
        upsellRouting: routing ?? Prisma.DbNull,
        upsellTargetCheckoutId: upsellTargetByOffer.get(cid) ?? null,
        postPurchaseEmail: ppCfg ? (ppCfg as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
    if (res.count > 0) offersUpdated += res.count;
  }
  return { ok: true, offersUpdated, warnings: [...new Set(warnings)] };
}

/* ----------------------------- activate --------------------------------- */

/**
 * ATIVA um funil (só 1 por grupo). Salva o grafo passado (se vier), desativa
 * os irmãos e, pra funil de PRODUTO, aplica os links (limpando os do funil
 * que estava ativo antes). Pra BOT, só marca ativo (execução = fase runtime).
 */
export async function activateFunnel(
  funnelId: string,
  graphRaw?: unknown,
): Promise<
  | { ok: true; kind: string; offersUpdated?: number; warnings?: string[] }
  | { ok: false; error: string }
> {
  const userId = await requireUserId();
  const f = await prisma.funnel.findFirst({
    where: { id: funnelId, userId },
    select: { id: true, kind: true, botId: true, graph: true },
  });
  if (!f) return { ok: false, error: "funil não encontrado" };

  // salva o grafo atual do canvas (se enviado)
  let graph = f.graph;
  if (graphRaw !== undefined) {
    const parsed = GraphSchema.safeParse(graphRaw);
    if (!parsed.success) return { ok: false, error: "grafo inválido" };
    graph = parsed.data as object;
    await prisma.funnel.update({ where: { id: f.id }, data: { graph } });
  }

  if (f.kind === "product") {
    const g = GraphSchema.parse(graph);
    // limpa os links do funil que estava ativo (se for outro)
    const prevActive = await prisma.funnel.findFirst({
      where: { userId, kind: "product", active: true, NOT: { id: f.id } },
      select: { id: true, graph: true },
    });
    if (prevActive) {
      const pg = GraphSchema.safeParse(prevActive.graph);
      if (pg.success) await clearOfferLinks(userId, checkoutIdsInGraph(pg.data));
    }
    const applied = await applyProductLinks(userId, g);
    if (!applied.ok) return applied;
    // marca este ativo, desativa os outros de produto
    await prisma.$transaction([
      prisma.funnel.updateMany({
        where: { userId, kind: "product", NOT: { id: f.id } },
        data: { active: false },
      }),
      prisma.funnel.update({ where: { id: f.id }, data: { active: true } }),
    ]);
    revalidatePath("/dashboard/produtos");
    return {
      ok: true,
      kind: "product",
      offersUpdated: applied.offersUpdated,
      warnings: applied.warnings,
    };
  }

  // BOT: 1 ativo por bot. Marca funnel.active=true E JÁ liga funnelRuntimeEnabled
  // no bot (era 2 toggles separados que o seller esquecia — davi 22/07/2026:
  // "Seller reclamando que configurou certinho mas o pagamento nao aparece").
  // Ativar é intenção CLARA de "quero rodar agora" — não faz sentido pedir 2×.
  const ops: Array<Promise<unknown>> = [
    prisma.funnel.updateMany({
      where: { userId, kind: "bot", botId: f.botId, NOT: { id: f.id } },
      data: { active: false },
    }),
    prisma.funnel.update({ where: { id: f.id }, data: { active: true } }),
  ];
  if (f.botId) {
    ops.push(
      prisma.saleBot.updateMany({
        where: { id: f.botId, userId },
        data: { funnelRuntimeEnabled: true },
      }),
    );
  }
  await prisma.$transaction(ops as never);
  return { ok: true, kind: "bot" };
}

/** Desativa um funil. Pra produto, limpa os links que ele tinha aplicado. */
export async function deactivateFunnel(funnelId: string): Promise<Result> {
  const userId = await requireUserId();
  const f = await prisma.funnel.findFirst({
    where: { id: funnelId, userId },
    select: { id: true, kind: true, graph: true },
  });
  if (!f) return { ok: false, error: "não encontrado" };
  if (f.kind === "product") {
    const g = GraphSchema.safeParse(f.graph);
    if (g.success) await clearOfferLinks(userId, checkoutIdsInGraph(g.data));
  }
  await prisma.funnel.update({ where: { id: f.id }, data: { active: false } });
  revalidatePath("/dashboard/produtos");
  return { ok: true };
}
