/**
 * Admin authentication — separate from regular user auth.
 * Hardcoded single admin account (auto-seeded on first access).
 *
 * Flow:
 *  1. Email + password → cria session com mfaPassed=false (se sem 2FA) ou redireciona pra 2FA
 *  2. Primeiro login: vai pra /admin01/2fa-setup (gera TOTP, mostra QR)
 *  3. Logins futuros: pede código TOTP → session.mfaPassed=true → libera admin
 */
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { TOTP, Secret } from "otpauth";
import { prisma } from "./prisma";
import { hashPassword, verifyPassword, shouldRehash } from "./security/password";

/**
 * OS TRÊS SÓCIOS — 08/08/2026 (davi): "vamos criar 3 logins diferentes para
 * cada socio! exclua qualquer outro login de admin, so terao esses 3 logins".
 *
 * A senha inicial de cada um vem de env var (ADMIN_PW_DAVI, ADMIN_PW_LUCAS,
 * ADMIN_PW_JOAO) — nunca do código, senão viveria pra sempre no histórico do
 * git. É usada só pra criar a conta: depois do primeiro acesso cada sócio tem
 * a chance de definir a dele.
 */
const PARTNERS = [
  { envKey: "ADMIN_PW_DAVI", name: "Davi", email: "david.fsbravo12@gmail.com" },
  { envKey: "ADMIN_PW_LUCAS", name: "Lucas", email: "adminluca@gmail.com" },
  { envKey: "ADMIN_PW_JOAO", name: "João", email: "adminjv@gmail.com" },
] as const;

const ADMIN_COOKIE = "tp_admin_session";
const SESSION_TTL_HOURS = 12;

/** Trava a conta por 15 min depois de 5 senhas erradas seguidas. */
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

/**
 * Garante que existem EXATAMENTE as três contas dos sócios.
 *
 * Cria as que faltam e apaga qualquer outra (o antigo admin@trilhopag.com
 * incluso). Nunca sobrescreve a senha de uma conta que já existe — se o sócio
 * já trocou a dele, a env var não pode desfazer isso.
 */
export async function ensureAdminsExist() {
  const wanted = PARTNERS.map((p) => p.email);

  for (const p of PARTNERS) {
    const existing = await prisma.adminAccount.findUnique({
      where: { email: p.email },
    });
    if (existing) {
      // Conta velha criada antes do campo `name` — completa sem tocar no resto.
      if (!existing.name) {
        await prisma.adminAccount.update({
          where: { id: existing.id },
          data: { name: p.name },
        });
      }
      continue;
    }

    // Piso baixo (6) porque uma das senhas iniciais que os sócios
    // escolheram tem 7 caracteres, e recusar em silêncio deixava o sócio
    // sem conta — pior que a senha curta. O que segura essa senha é o resto:
    // TOTP obrigatório, trava de 15 min a cada 5 erros e o convite pra
    // trocar no primeiro login.
    const password = process.env[p.envKey];
    if (!password || password.length < 6) {
      console.error(
        `[admin-auth] ${p.envKey} ausente/curta — conta de ${p.name} NÃO foi criada.`,
      );
      continue;
    }
    // Argon2id pra novos admins (legacy bcrypt continua aceito em login)
    const passwordHash = await hashPassword(password);
    try {
      await prisma.adminAccount.create({
        data: { email: p.email, name: p.name, passwordHash },
      });
    } catch {
      // Race condition — outro request criou primeiro. Segue.
    }
  }

  // Só limpa os extras depois de confirmar que os três existem. Se uma env
  // var estiver faltando, apagar o admin antigo deixaria o painel sem NENHUM
  // acesso — melhor conviver com um admin a mais do que ficar trancado fora.
  const partners = await prisma.adminAccount.findMany({
    where: { email: { in: [...wanted] } },
    select: { id: true },
  });
  if (partners.length !== PARTNERS.length) {
    console.error(
      "[admin-auth] nem todos os sócios existem — pulando limpeza de admins extras.",
    );
    return;
  }

  const extras = await prisma.adminAccount.findMany({
    where: { email: { notIn: [...wanted] } },
    select: { id: true, email: true },
  });
  if (extras.length === 0) return;

  const ids = extras.map((e) => e.id);
  // AdminSession não tem FK declarada — mata as sessões na mão, senão um
  // cookie antigo continuaria valendo pra uma conta que não existe mais.
  await prisma.adminSession.deleteMany({ where: { adminId: { in: ids } } });
  await prisma.adminAccount.deleteMany({ where: { id: { in: ids } } });
  console.warn(
    `[admin-auth] admins removidos (só os 3 sócios podem existir): ${extras
      .map((e) => e.email)
      .join(", ")}`,
  );
}

type AdminRow = NonNullable<
  Awaited<ReturnType<typeof prisma.adminAccount.findUnique>>
>;

export type AdminLoginResult =
  | { ok: true; admin: AdminRow }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; minutes: number };

function findAdminByEmail(email: string) {
  return prisma.adminAccount.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
}

/**
 * Verifica senha COM trava por conta (5 erros → 15 min de bloqueio).
 *
 * A trava é por conta e vive no banco — complementa o rate limit por IP
 * (em memória, que zera a cada cold start da serverless). Um atacante que
 * troca de IP a cada tentativa continua batendo na trava da conta.
 */
export async function verifyAdminPassword(
  email: string,
  password: string,
): Promise<AdminLoginResult> {
  const admin = await findAdminByEmail(email);
  // Conta inexistente: gasta o mesmo tempo de um verify real pra não vazar
  // por timing quais dos 3 emails existem.
  if (!admin) {
    await verifyPassword(password, await getDummyHash());
    return { ok: false, reason: "invalid" };
  }

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    const minutes = Math.ceil(
      (admin.lockedUntil.getTime() - Date.now()) / 60_000,
    );
    return { ok: false, reason: "locked", minutes };
  }

  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) {
    const failed = admin.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await prisma.adminAccount.update({
      where: { id: admin.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : null,
      },
    });
    // Registra a tentativa falha pra ficar rastreável na auditoria.
    await logAdminAction(admin.id, "admin.login.failed", admin.email, {
      attempt: failed,
      locked: lock,
    }).catch(() => {});
    if (lock) return { ok: false, reason: "locked", minutes: LOCK_MINUTES };
    return { ok: false, reason: "invalid" };
  }

  // Sucesso: zera o contador de falhas.
  if (admin.failedLoginCount > 0 || admin.lockedUntil) {
    await prisma.adminAccount.update({
      where: { id: admin.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  // Re-hash silencioso: migra bcrypt legacy → Argon2id na próxima vez que
  // o admin loga com sucesso. Sem impacto pro UX.
  if (shouldRehash(admin.passwordHash)) {
    try {
      const newHash = await hashPassword(password);
      await prisma.adminAccount.update({
        where: { id: admin.id },
        data: { passwordHash: newHash },
      });
    } catch {
      // re-hash não-crítico: não bloqueia o login
    }
  }

  return { ok: true, admin };
}

/**
 * Hash descartável usado só pra igualar o tempo de resposta quando o email
 * não existe. Precisa ser um Argon2id REAL (não uma string qualquer) — se
 * fosse inválido o verify falharia na hora e o tempo entregaria que a conta
 * não existe. Gerado uma vez por processo, de uma senha aleatória.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash() {
  dummyHashPromise ??= hashPassword(randomBytes(24).toString("hex"));
  return dummyHashPromise;
}

/**
 * Lê IP e User-Agent do request atual. Em contexto sem request (cron) volta
 * nulo em vez de explodir.
 */
export async function requestFingerprint(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return {
      ipAddress:
        h.get("x-real-ip") ||
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        h.get("cf-connecting-ip") ||
        null,
      userAgent: h.get("user-agent") ?? null,
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

export async function createAdminSession(adminId: string, mfaPassed: boolean) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
  // Amarra a sessão ao dispositivo: IP + User-Agent ficam gravados e são
  // conferidos em toda leitura. Cookie roubado não vale de outra máquina.
  const { ipAddress, userAgent } = await requestFingerprint();
  await prisma.adminSession.create({
    data: { adminId, token, expiresAt, mfaPassed, ipAddress, userAgent },
  });
  const c = await cookies();
  c.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    // Admin SEMPRE strict — não tem cross-site flow legítimo
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 60 * 60,
    // Prefixo __Host- só funciona com path=/ + secure + sem domain — extra
    // proteção contra subdomain takeover. Nome muda mas é tratado igual.
    // Comentado pra não quebrar sessões existentes; futura migração.
    // priority: "high" não é universalmente suportado, mas Vercel respeita.
  });
  return token;
}

export async function getCurrentAdminSession() {
  const c = await cookies();
  const token = c.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({
    where: { token },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    // Expirou: apaga em vez de só ignorar, senão a tabela vira lixão de
    // tokens válidos-por-formato que alguém poderia tentar reusar.
    await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // SESSION BINDING: o User-Agent gravado no login tem que bater. Se um
  // cookie vazar (XSS, log, print), ele só funciona no mesmo navegador —
  // qualquer curl/outro browser derruba a sessão na hora.
  const { userAgent } = await requestFingerprint();
  if (session.userAgent && userAgent && session.userAgent !== userAgent) {
    await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => {});
    await logAdminAction(session.adminId, "admin.session.hijack_blocked", undefined, {
      expected: session.userAgent.slice(0, 120),
      got: userAgent.slice(0, 120),
    }).catch(() => {});
    return null;
  }

  const admin = await prisma.adminAccount.findUnique({
    where: { id: session.adminId },
  });
  if (!admin) return null;
  return { session, admin };
}

export async function requireAdmin() {
  const r = await getCurrentAdminSession();
  if (!r || !r.session.mfaPassed) return null;
  // Sem TOTP configurado não existe admin válido, ponto. `mfaPassed` sozinho
  // é um booleano numa linha de tabela; exigir o secret junto significa que
  // uma sessão forjada direto no banco ainda não abre o painel de quem nunca
  // passou pelo Google Authenticator.
  if (!r.admin.totpSecret) return null;
  return r;
}

/**
 * Igual ao `requireAdmin`, mas só devolve a sessão se este admin PODE
 * escrever na aba em que está — ou seja, se nenhum outro sócio pegou o
 * controle dela antes. Toda Server Action que altera dados usa esta versão.
 */
export async function requireAdminWrite() {
  const r = await requireAdmin();
  if (!r) return null;
  const { isEditBlocked } = await import("./admin-presence");
  if (await isEditBlocked(r.admin.id)) return null;
  return r;
}

export async function destroyAdminSession() {
  const c = await cookies();
  const token = c.get(ADMIN_COOKIE)?.value;
  if (token) {
    await prisma.adminSession.deleteMany({ where: { token } });
  }
  c.delete(ADMIN_COOKIE);
}

export async function markSessionMfaPassed(sessionId: string) {
  await prisma.adminSession.update({
    where: { id: sessionId },
    data: { mfaPassed: true },
  });
}

/** Gera novo TOTP secret + URL pra QR code. */
export function generateTotpSecret(label = "Trilho Admin") {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: "Trilho",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return {
    base32: secret.base32,
    otpauthUrl: totp.toString(),
  };
}

export function verifyTotp(secretBase32: string, code: string): boolean {
  try {
    const totp = new TOTP({
      issuer: "Trilho",
      label: "Admin",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    });
    // Aceita window de ±1 step (~30s clock skew)
    const delta = totp.validate({ token: code.trim(), window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

/**
 * Grava ação admin em AdminAuditLog COM contexto forense:
 *  - IP capturado dos headers do request (x-forwarded-for / x-real-ip)
 *  - User-Agent salvo no payload pra rastreio
 *
 * Headers só estão disponíveis em Server Actions / API routes que usam
 * `headers()` do next/headers (async). Em contextos sem request (cron),
 * passa null silenciosamente.
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  target?: string,
  payload: Record<string, unknown> = {},
) {
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    ipAddress =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      h.get("cf-connecting-ip") ||
      null;
    userAgent = h.get("user-agent") ?? null;
  } catch {
    // headers() não disponível (cron, etc) — segue sem
  }

  await prisma.adminAuditLog.create({
    data: {
      adminId,
      action,
      target,
      payload: { ...payload, __userAgent: userAgent } as never,
      ipAddress,
    },
  });
}
