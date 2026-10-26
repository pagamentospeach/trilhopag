/**
 * Honeypot logger — captura tentativas no painel `/admin` fake.
 *
 * 16/07/2026: criado pós-incidente pentester. O atacante achou `/admin01`
 * (real) via enumeração. Agora colocamos `/admin` (path óbvio) como
 * ARMADILHA — aparência 100% igual ao real mas nenhum botão funciona.
 * Qualquer request aqui = CERTEZA de atividade maliciosa (ninguém
 * legítimo abre `/admin`, o admin real usa outro path).
 *
 * O que capturamos:
 *   - IP + User-Agent + timestamp
 *   - Email + senha tentada (pra ver se estão testando creds vazadas)
 *   - Que ação tentou (view dashboard, aprovar saque X, etc)
 *   - Referer / Origin (pode indicar exploit chain)
 *   - Cookies do atacante (fingerprint)
 *
 * Onde vai:
 *   - AdminNotification type="honeypot_hit" (aparece no painel admin real)
 *   - Blocklist automática: 5+ hits do mesmo IP em 1h → adiciona em
 *     banned_identifiers.ips (bloqueia signup + zera sessions se tinha
 *     conta legítima)
 */
import { prisma } from "./prisma";
import { getClientIp } from "./rate-limit";

export type HoneypotAction =
  | "view_login"
  | "attempt_login"
  | "view_dashboard"
  | "view_users"
  | "view_transactions"
  | "view_withdrawals"
  | "view_settings"
  | "attempt_approve_withdrawal"
  | "attempt_update_user"
  | "attempt_reset_password"
  | "attempt_export_data"
  | "attempt_edit_fees"
  | "attempt_impersonate"
  | "attempt_delete"
  | "click_button"
  | "other";

/** Severity — vira alerta CRITICAL pro admin quando é ação "real". */
function severityOf(action: HoneypotAction): "low" | "medium" | "high" | "critical" {
  if (
    action === "attempt_approve_withdrawal" ||
    action === "attempt_update_user" ||
    action === "attempt_reset_password" ||
    action === "attempt_export_data" ||
    action === "attempt_edit_fees" ||
    action === "attempt_impersonate" ||
    action === "attempt_delete"
  ) {
    return "critical";
  }
  if (action === "attempt_login") return "high";
  if (action.startsWith("view_")) return "medium";
  return "low";
}

/**
 * Loga um hit no honeypot + adiciona à blocklist se passar do threshold.
 * Best-effort — nunca throws.
 */
export async function logHoneypotHit(input: {
  action: HoneypotAction;
  request: Request;
  details?: {
    email?: string;
    password?: string; // guardamos PLAIN pra ver se testam creds famosas (mailinator, etc)
    targetUserId?: string;
    targetWithdrawalId?: string;
    button?: string;
    payload?: unknown;
  };
}): Promise<void> {
  try {
    const { request, action, details } = input;
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") ?? "unknown";
    const referer = request.headers.get("referer") ?? null;
    const origin = request.headers.get("origin") ?? null;
    const cookies = request.headers.get("cookie") ?? null;
    const url = request.url;
    const severity = severityOf(action);

    // Trunca strings grandes pra não estourar JSON payload
    const trunc = (s: string | null | undefined, n = 500) =>
      s == null ? null : String(s).slice(0, n);

    const payloadObj = {
      action,
      severity,
      ip,
      userAgent: trunc(userAgent),
      referer: trunc(referer),
      origin: trunc(origin),
      cookiesPresent: !!cookies,
      cookieFingerprint: cookies
        ? Buffer.from(cookies).toString("base64").slice(0, 64)
        : null,
      url: trunc(url),
      email: trunc(details?.email),
      passwordAttempted: trunc(details?.password, 100),
      targetUserId: trunc(details?.targetUserId),
      targetWithdrawalId: trunc(details?.targetWithdrawalId),
      button: trunc(details?.button),
      payload: JSON.parse(JSON.stringify(details?.payload ?? null)),
      at: new Date().toISOString(),
    };
    await prisma.adminNotification.create({
      data: {
        type: "honeypot_hit",
        message: `[HONEYPOT · ${severity.toUpperCase()}] ${action} de IP ${ip}${
          details?.email ? ` (email: ${details.email})` : ""
        }${details?.button ? ` (botão: ${details.button})` : ""}`,
        payload: payloadObj as never,
      },
    });

    // Auto-blocklist: 5+ hits do mesmo IP em 1h vira ban
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hitCount = await prisma.adminNotification.count({
      where: {
        type: "honeypot_hit",
        createdAt: { gte: hourAgo },
        payload: { path: ["ip"], equals: ip },
      },
    });

    if (hitCount >= 5) {
      await addIpToBlocklist(ip, "honeypot_auto_ban");
    }
  } catch (e) {
    // Best-effort: nunca deixa o honeypot quebrar por erro do próprio log
    console.error("[honeypot] falha ao logar:", e);
  }
}

/**
 * Quantos users distintos precisam ter sessão num IP pra ele ser considerado
 * INFRA COMPARTILHADA (VPN, CGNAT de operadora móvel, wifi de coworking).
 * Acima disso o IP não identifica pessoa nenhuma e NINGUÉM é banido por ele.
 *
 * 31/07/2026: hoje existem 80 IPs com mais de um seller, e um deles tem 114
 * sellers na mesma saída (VPN). Dois já bastam pra o ban ser chute.
 */
const SHARED_IP_USER_THRESHOLD = 2;

/** Só olha sessão recente — quem passou por esse IP há meses não é suspeito. */
const SESSION_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export const HONEYPOT_BLOCK_REASON = "Auto-ban honeypot (/admin falso)";

/** Adiciona IP à blocklist banned_identifiers.ips. Idempotente. */
async function addIpToBlocklist(ip: string, reason: string): Promise<void> {
  try {
    const existing = await prisma.adminNotification.findFirst({
      where: { type: "banned_identifiers" },
      orderBy: { createdAt: "desc" },
      select: { id: true, payload: true },
    });
    const payload =
      (existing?.payload as {
        emails?: string[];
        ips?: string[];
        cpfs?: string[];
        emailDomains?: string[];
        phones?: string[];
      } | null) ?? {};
    const ips = new Set([...(payload.ips ?? []), ip]);
    if (existing) {
      const prevBans =
        ((payload as { autoBans?: Array<{ ip: string; reason: string; at: string }> }).autoBans) ?? [];
      const nextPayload = {
        ...payload,
        ips: [...ips],
        lastUpdated: new Date().toISOString(),
        autoBans: [...prevBans, { ip, reason, at: new Date().toISOString() }],
      };
      await prisma.adminNotification.update({
        where: { id: existing.id },
        data: {
          message: `Identifiers banidos por fraude (auto-ban IP ${ip} via honeypot em ${new Date().toISOString()})`,
          payload: nextPayload as never,
        },
      });
    }
    // ------------------------------------------------------------------
    // 31/07/2026 (davi): "Um monte de gente sendo banida sem motivo!".
    //
    // O código antigo pegava TODA sessão com esse ipAddress (sem recorte de
    // tempo) e dava `blocked: true` em todo mundo. IP NÃO É IDENTIDADE: VPN,
    // CGNAT das operadoras móveis e wifi compartilhado colocam dezenas de
    // sellers atrás do mesmo IPv4. Foi exatamente isso que baniu o
    // seller-n@exemplo.com (487 vendas, R$ 23k) — ele dividia a saída de VPN
    // 169.150.198.76 com um cara rodando curl no /admin falso. E não tinha
    // como descobrir depois, porque nem blockReason era gravado.
    //
    // Agora: (1) IP compartilhado não bane ninguém; (2) só sessão das
    // últimas 24h conta; (3) conta com venda paga ou saldo NUNCA é banida
    // automaticamente — vira alerta pro admin decidir; (4) sempre grava
    // blockReason pra existir rastro.
    // ------------------------------------------------------------------
    const since = new Date(Date.now() - SESSION_LOOKBACK_MS);
    const recentSessions = await prisma.session.findMany({
      where: { ipAddress: ip, createdAt: { gte: since } },
      select: { userId: true },
    });
    const candidateIds = [...new Set(recentSessions.map((s) => s.userId))];
    if (candidateIds.length === 0) return;

    // (1) IP compartilhado = infra, não pessoa. Não bane e não desloga.
    // Conta users de QUALQUER época no IP, não só das 24h: se o IP tem
    // histórico de várias contas, ele é compartilhado hoje também.
    const allOnIp = await prisma.session.findMany({
      where: { ipAddress: ip },
      select: { userId: true },
    });
    const distinctOnIp = new Set(allOnIp.map((s) => s.userId)).size;
    if (distinctOnIp >= SHARED_IP_USER_THRESHOLD) {
      await prisma.adminNotification.create({
        data: {
          type: "honeypot_shared_ip",
          message:
            `[HONEYPOT] IP ${ip} bateu o threshold mas é COMPARTILHADO ` +
            `(${distinctOnIp} contas distintas — provável VPN/CGNAT). ` +
            `Ninguém foi banido automaticamente. Revisar na mão.`,
          payload: { ip, distinctUsers: distinctOnIp, candidateIds } as never,
        },
      });
      console.warn(
        `[honeypot] ${ip} compartilhado por ${distinctOnIp} contas — auto-ban ABORTADO`,
      );
      return;
    }

    // (3) Conta com venda paga ou saldo é seller de verdade: não auto-bane.
    const withSales = await prisma.transaction.groupBy({
      by: ["userId"],
      where: { userId: { in: candidateIds }, status: "PAID" },
      _count: { _all: true },
    });
    const withBalance = await prisma.user.findMany({
      where: { id: { in: candidateIds }, balanceCents: { gt: 0 } },
      select: { id: true },
    });
    const protectedIds = new Set([
      ...withSales.map((t) => t.userId),
      ...withBalance.map((u) => u.id),
    ]);
    const toBan = candidateIds.filter((id) => !protectedIds.has(id));

    if (protectedIds.size > 0) {
      await prisma.adminNotification.create({
        data: {
          type: "honeypot_needs_review",
          message:
            `[HONEYPOT] ${protectedIds.size} conta(s) com venda/saldo passaram ` +
            `pelo IP ${ip} durante o ataque. NÃO foram banidas — revisar na mão.`,
          payload: { ip, protectedIds: [...protectedIds] } as never,
        },
      });
    }

    if (toBan.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: toBan } } });
      await prisma.user.updateMany({
        where: { id: { in: toBan } },
        // (4) sempre com motivo — sem isso não dá pra auditar nem reverter
        data: { blocked: true, blockReason: HONEYPOT_BLOCK_REASON },
      });
      console.warn(
        `[honeypot] auto-ban ${ip} (${reason}): ${toBan.length} conta(s) sem venda/saldo bloqueadas`,
      );
    }
  } catch (e) {
    console.error("[honeypot] falha no auto-ban:", e);
  }
}
