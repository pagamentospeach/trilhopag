/**
 * PRESENÇA AO VIVO DO ADMIN — 08/08/2026 (davi): "cria algo mostrando quem
 * esta ao vivo mexendo no admin e em que aba a pessoa esta AO VIVO, de um
 * jeito que evite 100% um de mexer em algo que outro ja esta mexendo".
 *
 * Como funciona:
 *  - Cada aba do admin manda um heartbeat a cada 10s pra /api/admin/presence
 *    dizendo em que rota está.
 *  - O heartbeat grava `AdminPresence` (1 linha por admin) e devolve a lista
 *    de quem mais está online.
 *  - Quem chegou PRIMEIRO numa rota fica com o "controle" dela (comparando
 *    `claimedAt`). Os outros entram em modo somente-leitura naquela aba, com
 *    a opção de assumir o controle (o dono é derrubado pra leitura).
 *
 * Presença sem heartbeat há mais de STALE_MS é considerada offline — quem
 * fecha o navegador libera a aba sozinho em ~30s.
 */
import { prisma } from "./prisma";

/** Sem heartbeat por 30s = saiu. O client bate a cada 10s (3 chances). */
export const PRESENCE_STALE_MS = 30_000;

export type PresencePeer = {
  adminId: string;
  name: string;
  email: string;
  path: string;
  label: string;
  claimedAt: string;
  self: boolean;
};

export type PresenceState = {
  peers: PresencePeer[];
  /** Quem está com o controle da rota atual (null = ninguém/eu). */
  lockedBy: { adminId: string; name: string } | null;
  /** true = posso editar. false = alguém chegou antes nessa aba. */
  canEdit: boolean;
};

function staleCutoff() {
  return new Date(Date.now() - PRESENCE_STALE_MS);
}

/**
 * Normaliza a rota pro que interessa pro lock: `/admin01/users/abc` e
 * `/admin01/users` são a MESMA aba. Sem isso dois admins abrindo usuários
 * diferentes se bloqueariam à toa — e, pior, dois admins no mesmo usuário
 * por sub-rotas diferentes não se bloqueariam.
 */
export function normalizePath(pathname: string): string {
  const clean = (pathname || "").split("?")[0].replace(/\/+$/, "");
  const parts = clean.split("/").filter(Boolean);
  // ["admin01", "users", "<id>"] → "/admin01/users"
  return "/" + parts.slice(0, 2).join("/");
}

/**
 * Grava o heartbeat e devolve o estado de presença.
 *
 * `takeover` = o admin clicou em "assumir controle": renova o claimedAt dele
 * e invalida o de quem estava na frente (empurrando o claimedAt dos outros
 * pra depois do dele).
 */
export async function heartbeat(args: {
  adminId: string;
  sessionId: string;
  pathname: string;
  label: string;
  takeover?: boolean;
}): Promise<PresenceState> {
  const path = normalizePath(args.pathname);
  const now = new Date();

  const existing = await prisma.adminPresence.findUnique({
    where: { adminId: args.adminId },
  });

  // Só renova o claimedAt quando MUDA de aba (ou no takeover). Se renovasse
  // a cada heartbeat, o "quem chegou primeiro" nunca se decidiria.
  const keepClaim =
    !args.takeover &&
    existing &&
    existing.path === path &&
    existing.lastSeenAt >= staleCutoff();

  const claimedAt = keepClaim ? existing.claimedAt : now;

  await prisma.adminPresence.upsert({
    where: { adminId: args.adminId },
    create: {
      adminId: args.adminId,
      sessionId: args.sessionId,
      path,
      label: args.label.slice(0, 60),
      claimedAt,
      lastSeenAt: now,
    },
    update: {
      sessionId: args.sessionId,
      path,
      label: args.label.slice(0, 60),
      claimedAt,
      lastSeenAt: now,
    },
  });

  if (args.takeover) {
    // Empurra todo mundo que está nessa aba pra trás de mim. Eles continuam
    // online (só viram leitura) e podem retomar o controle depois.
    await prisma.adminPresence.updateMany({
      where: {
        path,
        adminId: { not: args.adminId },
      },
      data: { claimedAt: new Date(now.getTime() + 1) },
    });
  }

  return readState(args.adminId, path);
}

/** Lista quem está online agora + resolve o lock da rota `path`. */
export async function readState(
  adminId: string,
  path: string,
): Promise<PresenceState> {
  const rows = await prisma.adminPresence.findMany({
    where: { lastSeenAt: { gte: staleCutoff() } },
    include: { admin: { select: { name: true, email: true } } },
    orderBy: { claimedAt: "asc" },
  });

  const peers: PresencePeer[] = rows.map((r) => ({
    adminId: r.adminId,
    name: r.admin.name || r.admin.email.split("@")[0],
    email: r.admin.email,
    path: r.path,
    label: r.label,
    claimedAt: r.claimedAt.toISOString(),
    self: r.adminId === adminId,
  }));

  // Dono da aba = menor claimedAt entre quem está nela (lista já ordenada).
  const onPath = peers.filter((p) => p.path === path);
  const owner = onPath[0] ?? null;
  const mine = !owner || owner.adminId === adminId;

  return {
    peers,
    lockedBy: mine || !owner ? null : { adminId: owner.adminId, name: owner.name },
    canEdit: mine,
  };
}

/**
 * Backstop de servidor pro lock de aba.
 *
 * O overlay no client já bloqueia a interação inteira (`inert`), mas quem
 * chamar a Server Action na mão (fetch/curl com o cookie) passaria por cima
 * dele. Aqui a gente descobre em que aba o admin está pelo header de origem
 * do request e recusa a escrita se outro sócio tem o controle dela.
 *
 * Fail-open de propósito quando não dá pra descobrir a rota: melhor deixar
 * passar do que travar o painel inteiro por causa de um header ausente.
 */
export async function isEditBlocked(adminId: string): Promise<boolean> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();

    // Só vale pra invocação de Server Action. Num carregamento normal de
    // página o `referer` é a página ANTERIOR — usar ele ali faria a aba nova
    // herdar o lock da antiga e travar o painel sem motivo.
    if (!h.get("next-action")) return false;

    const raw = h.get("next-url") || h.get("referer");
    if (!raw) return false;
    const pathname = raw.startsWith("http") ? new URL(raw).pathname : raw;
    if (!pathname.startsWith("/admin01")) return false;

    const state = await readState(adminId, normalizePath(pathname));
    return !state.canEdit;
  } catch {
    return false;
  }
}

/** Sai da presença (logout / fechar aba). */
export async function clearPresence(adminId: string) {
  await prisma.adminPresence
    .deleteMany({ where: { adminId } })
    .catch(() => {});
}
