/**
 * Flags GLOBAIS do saque automático, persistidas no singleton PlatformDefaults
 * (id="default"). Servem de:
 *  - KILL-SWITCH (#2): botão de emergência no admin que pausa TODOS os saques
 *    auto. Independe do env AUTO_WITHDRAW_DISABLED — qualquer um liga o freio.
 *  - CIRCUIT BREAKER (#3): conta falhas CLARAS consecutivas da API de
 *    transferência SafePix; ao estourar o limite, "abre" e pausa os saques auto
 *    por alguns minutos (fallback manual), auto-fechando depois do cooldown.
 *
 * Tudo best-effort: em qualquer erro de leitura, NÃO trava o fluxo (retorna
 * "destravado") — o saque cai pro manual no pior caso, nunca duplica.
 */
import { prisma } from "./prisma";

/** Estado do circuit breaker do saque automático. */
export type AutoWithdrawBreaker = {
  /** Falhas CLARAS consecutivas (NÃO conta timeout ambíguo). */
  fails: number;
  /** ISO até quando o breaker fica ABERTO (auto pausado). null = fechado. */
  trippedUntil: string | null;
};

/** Nº de falhas claras seguidas pra ABRIR o breaker. */
const BREAKER_THRESHOLD = 3;
/** Quanto tempo o breaker fica aberto após estourar (10 min). */
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000;

const DEFAULT_BREAKER: AutoWithdrawBreaker = { fails: 0, trippedUntil: null };

async function readDefaults() {
  return prisma.platformDefaults.findUnique({
    where: { id: "default" },
    select: {
      autoWithdrawKill: true,
      autoWithdrawBreaker: true,
      autoWithdrawBlockedIps: true,
    },
  });
}

// ---------------- Kill-switch (#2) ----------------

/** True se o kill-switch GLOBAL (DB) estiver ligado. Erro → false (best-effort). */
export async function isAutoWithdrawKilled(): Promise<boolean> {
  try {
    const d = await readDefaults();
    return d?.autoWithdrawKill === true;
  } catch {
    return false;
  }
}

/** Liga/desliga o kill-switch global (botão admin). */
export async function setAutoWithdrawKill(
  on: boolean,
  adminId?: string,
): Promise<void> {
  await prisma.platformDefaults.upsert({
    where: { id: "default" },
    create: { id: "default", autoWithdrawKill: on, updatedById: adminId ?? null },
    update: { autoWithdrawKill: on, updatedById: adminId ?? null },
  });
}

// ---------------- Circuit breaker (#3) ----------------

function parseBreaker(v: unknown): AutoWithdrawBreaker {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return {
      fails: typeof o.fails === "number" ? o.fails : 0,
      trippedUntil: typeof o.trippedUntil === "string" ? o.trippedUntil : null,
    };
  }
  return { ...DEFAULT_BREAKER };
}

export async function getAutoWithdrawBreaker(): Promise<AutoWithdrawBreaker> {
  try {
    const d = await readDefaults();
    return parseBreaker(d?.autoWithdrawBreaker);
  } catch {
    return { ...DEFAULT_BREAKER };
  }
}

/** True se o breaker está ABERTO agora (saques auto pausados). Erro → false. */
export async function isAutoWithdrawBreakerOpen(): Promise<boolean> {
  try {
    const b = await getAutoWithdrawBreaker();
    return !!b.trippedUntil && new Date(b.trippedUntil).getTime() > Date.now();
  } catch {
    return false;
  }
}

async function writeBreaker(b: AutoWithdrawBreaker): Promise<void> {
  await prisma.platformDefaults.upsert({
    where: { id: "default" },
    create: { id: "default", autoWithdrawBreaker: b as never },
    update: { autoWithdrawBreaker: b as never },
  });
}

/** SUCESSO de envio auto → zera o contador (fecha o breaker). Best-effort. */
export async function recordAutoWithdrawSuccess(): Promise<void> {
  try {
    const b = await getAutoWithdrawBreaker();
    if (b.fails === 0 && !b.trippedUntil) return; // já zerado
    await writeBreaker({ fails: 0, trippedUntil: null });
  } catch {
    // best-effort
  }
}

/**
 * FALHA CLARA de envio auto. Incrementa o contador; ao atingir o limite, ABRE o
 * breaker por BREAKER_COOLDOWN_MS. NÃO chamar em timeout ambíguo (não sabemos
 * se a transferência saiu). Retorna o novo estado.
 */
export async function recordAutoWithdrawFailure(): Promise<AutoWithdrawBreaker> {
  try {
    const cur = await getAutoWithdrawBreaker();
    const fails = cur.fails + 1;
    const trip = fails >= BREAKER_THRESHOLD;
    const next: AutoWithdrawBreaker = {
      fails,
      trippedUntil: trip
        ? new Date(Date.now() + BREAKER_COOLDOWN_MS).toISOString()
        : cur.trippedUntil,
    };
    await writeBreaker(next);
    return next;
  } catch {
    return { ...DEFAULT_BREAKER };
  }
}

/** Reseta o breaker manualmente (botão admin). */
export async function resetAutoWithdrawBreaker(): Promise<void> {
  await writeBreaker({ fails: 0, trippedUntil: null });
}

// ---------------- IP bloqueado pela SafePix (allowlist) ----------------

/** IP que a SafePix recusou em saque, pra você adicionar na allowlist. */
export type AutoWithdrawBlockedIp = {
  ip: string;
  /** ISO de quando foi recusado. */
  at: string;
  /** Conta SafePix que recusou (ex: "safepix-1"). */
  account: string;
};

/** Máximo de IPs bloqueados guardados (mais recentes). */
const MAX_BLOCKED_IPS = 10;

/**
 * Detecta o erro "IP não autorizado para realizar saques externos. IP: x.x.x.x"
 * da SafePix e extrai o IP. Retorna null se NÃO for esse erro (pra não disparar
 * o alerta em falhas comuns). Aceita IPv4 e IPv6.
 */
export function parseSafepixIpAuthError(msg: string): string | null {
  if (!/n[ãa]o autorizado/i.test(msg) || !/\bIP\b/i.test(msg)) return null;
  // Pega o token logo após "IP:" (IPv4 dotted, IPv6 com ":", ou com porta).
  const m = msg.match(/\bIP:\s*([0-9a-fA-F.:]+)/);
  return m ? m[1].replace(/[).,;:]+$/, "") : null;
}

function parseBlockedIps(v: unknown): AutoWithdrawBlockedIp[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (x): x is AutoWithdrawBlockedIp =>
        !!x &&
        typeof x === "object" &&
        typeof (x as Record<string, unknown>).ip === "string",
    )
    .map((x) => ({
      ip: String(x.ip),
      at: typeof x.at === "string" ? x.at : new Date().toISOString(),
      account: typeof x.account === "string" ? x.account : "?",
    }));
}

export async function getAutoWithdrawBlockedIps(): Promise<
  AutoWithdrawBlockedIp[]
> {
  try {
    const d = await readDefaults();
    return parseBlockedIps(d?.autoWithdrawBlockedIps);
  } catch {
    return [];
  }
}

/**
 * Grava um IP recusado pela SafePix (dedup por IP, mais recente primeiro, cap
 * MAX_BLOCKED_IPS). Vira alerta no admin. Best-effort.
 */
export async function recordAutoWithdrawBlockedIp(
  ip: string,
  account: string,
): Promise<void> {
  try {
    const cur = await getAutoWithdrawBlockedIps();
    const next: AutoWithdrawBlockedIp[] = [
      { ip, at: new Date().toISOString(), account },
      ...cur.filter((x) => x.ip !== ip),
    ].slice(0, MAX_BLOCKED_IPS);
    await prisma.platformDefaults.upsert({
      where: { id: "default" },
      create: { id: "default", autoWithdrawBlockedIps: next as never },
      update: { autoWithdrawBlockedIps: next as never },
    });
  } catch {
    // best-effort
  }
}

/** Limpa a lista de IPs bloqueados (admin já adicionou, ou saque voltou a sair). */
export async function clearAutoWithdrawBlockedIps(): Promise<void> {
  try {
    await prisma.platformDefaults.upsert({
      where: { id: "default" },
      create: { id: "default", autoWithdrawBlockedIps: [] as never },
      update: { autoWithdrawBlockedIps: [] as never },
    });
  } catch {
    // best-effort
  }
}

export { BREAKER_THRESHOLD, BREAKER_COOLDOWN_MS };
