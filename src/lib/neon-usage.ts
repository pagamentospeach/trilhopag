/**
 * Monitor de consumo de DATA-TRANSFER do Neon.
 *
 * Contexto: em 2026-06-17 o gateway caiu inteiro porque o projeto Neon
 * estourou a cota de data-transfer (na época, free tier 5 GB) e TODA query
 * passou a responder HTTP 402. A causa-raiz (cron de reconcile transferindo
 * o `providerPayload` JSON inteiro) foi corrigida e o plano foi upgradado,
 * mas faltava um alarme pra isso nunca mais passar batido.
 *
 * Este módulo faz UMA chamada/dia (via cron) à management API do Neon, lê o
 * `data_transfer_bytes` do período de consumo corrente, compara com um teto
 * configurável e projeta linearmente até o fim do período. O snapshot é
 * persistido em PlatformDefaults.neonUsage pra ser lido de graça pelo
 * dashboard admin e pela barra de alertas (sem bater na API do Neon a cada
 * pageview).
 *
 * Config (env vars no Vercel):
 *   - NEON_API_KEY                 (obrigatória) — Personal API key `napi_...`
 *   - NEON_PROJECT_ID              (default old-cloud-28077958)
 *   - NEON_DATA_TRANSFER_CAP_GB    (default 50) — teto/budget do período
 *   - NEON_QUOTA_WARN_PCT          (default 0.75)
 *   - NEON_QUOTA_CRIT_PCT          (default 0.90)
 */
import { prisma } from "./prisma";

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const GB = 1024 ** 3;
const DEFAULT_PROJECT_ID = "old-cloud-28077958";

export type NeonUsageLevel = "ok" | "warn" | "crit";

export type NeonUsageSnapshot = {
  /** ISO timestamp de quando o cron leu a API. */
  fetchedAt: string;
  projectId: string;
  usedBytes: number;
  usedGb: number;
  /** Teto/budget de data-transfer do período (GB). */
  capGb: number;
  /** usado / teto, 0..1+ */
  pct: number;
  periodStart: string;
  periodEnd: string;
  /** Fração do período já decorrida, 0..1. */
  elapsedFraction: number;
  /** Projeção linear de uso ao fim do período (GB). */
  projectedGb: number;
  /** projectedGb / teto, 0..1+ */
  projectedPct: number;
  level: NeonUsageLevel;
  /** Texto curto pt-BR explicando o nível (pra alerta/email/UI). */
  reason: string;
  computeTimeSeconds: number;
  storageBytes: number;
  subscriptionType: string | null;
};

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function neonProjectId(): string {
  return process.env.NEON_PROJECT_ID || DEFAULT_PROJECT_ID;
}

export function neonCapGb(): number {
  return envNum("NEON_DATA_TRANSFER_CAP_GB", 50);
}

function warnPct(): number {
  return envNum("NEON_QUOTA_WARN_PCT", 0.75);
}

function critPct(): number {
  return envNum("NEON_QUOTA_CRIT_PCT", 0.9);
}

/** Shape parcial do `project` retornado por GET /projects/{id}. */
type NeonProject = {
  data_transfer_bytes?: number;
  consumption_period_start?: string;
  consumption_period_end?: string;
  compute_time_seconds?: number;
  synthetic_storage_size?: number;
  owner?: { subscription_type?: string | null } | null;
};

function fmtDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleDateString("pt-BR");
}

/** Constrói o snapshot (com nível/projeção) a partir do objeto `project`. */
export function buildSnapshot(p: NeonProject): NeonUsageSnapshot {
  const usedBytes = Number(p.data_transfer_bytes ?? 0);
  const usedGb = usedBytes / GB;
  const capGb = neonCapGb();
  const pct = capGb > 0 ? usedGb / capGb : 0;

  const periodStart = String(p.consumption_period_start ?? "");
  const periodEnd = String(p.consumption_period_end ?? "");
  const now = Date.now();
  const startMs = Date.parse(periodStart);
  const endMs = Date.parse(periodEnd);
  let elapsedFraction = 0;
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    elapsedFraction = Math.min(1, Math.max(0, (now - startMs) / (endMs - startMs)));
  }
  // Projeção linear: extrapola o ritmo atual até o fim do período. Só projeta
  // quando já passou tempo suficiente (>1% do período) pra não dividir por ~0.
  const projectedGb = elapsedFraction > 0.01 ? usedGb / elapsedFraction : usedGb;
  const projectedPct = capGb > 0 ? projectedGb / capGb : 0;

  const w = warnPct();
  const c = critPct();

  let level: NeonUsageLevel = "ok";
  let reason = `${usedGb.toFixed(2)} GB de ${capGb} GB (${(pct * 100).toFixed(0)}%) neste período`;
  if (pct >= c) {
    level = "crit";
    reason = `Uso CRÍTICO: ${usedGb.toFixed(2)} GB de ${capGb} GB (${(pct * 100).toFixed(0)}%)`;
  } else if (pct >= w) {
    level = "warn";
    reason = `Uso alto: ${usedGb.toFixed(2)} GB de ${capGb} GB (${(pct * 100).toFixed(0)}%)`;
  } else if (projectedPct >= 1) {
    level = "warn";
    reason = `Projeção de estouro: ~${projectedGb.toFixed(1)} GB até ${fmtDate(periodEnd)} (${(projectedPct * 100).toFixed(0)}% do teto de ${capGb} GB)`;
  }

  return {
    fetchedAt: new Date(now).toISOString(),
    projectId: neonProjectId(),
    usedBytes,
    usedGb,
    capGb,
    pct,
    periodStart,
    periodEnd,
    elapsedFraction,
    projectedGb,
    projectedPct,
    level,
    reason,
    computeTimeSeconds: Number(p.compute_time_seconds ?? 0),
    storageBytes: Number(p.synthetic_storage_size ?? 0),
    subscriptionType: p.owner?.subscription_type ?? null,
  };
}

/** Bate na management API do Neon e retorna o snapshot normalizado. */
export async function fetchNeonUsage(): Promise<NeonUsageSnapshot> {
  const key = process.env.NEON_API_KEY;
  if (!key) throw new Error("NEON_API_KEY ausente no ambiente");

  const res = await fetch(`${NEON_API_BASE}/projects/${neonProjectId()}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Neon API ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { project?: NeonProject } & NeonProject;
  const project = json.project ?? json;
  return buildSnapshot(project);
}

/** Persiste o snapshot no singleton PlatformDefaults (id="default"). */
export async function saveNeonUsage(snap: NeonUsageSnapshot): Promise<void> {
  await prisma.platformDefaults.upsert({
    where: { id: "default" },
    create: { id: "default", neonUsage: snap as never },
    update: { neonUsage: snap as never },
  });
}

/** Lê o último snapshot persistido (sem bater na API). */
export async function getStoredNeonUsage(): Promise<NeonUsageSnapshot | null> {
  const row = await prisma.platformDefaults.findUnique({
    where: { id: "default" },
    select: { neonUsage: true },
  });
  const v = row?.neonUsage;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as unknown as NeonUsageSnapshot;
}
