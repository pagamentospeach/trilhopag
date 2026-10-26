/**
 * Web Push (PWA) — envio de notificações para sellers.
 *
 * Configuração:
 *  - VAPID_PUBLIC_KEY  / NEXT_PUBLIC_VAPID_PUBLIC_KEY (mesma key, exposta no client)
 *  - VAPID_PRIVATE_KEY (server-only)
 *  - VAPID_SUBJECT      (mailto:noreply@trilhopag.com)
 *
 * Padrão de uso:
 *   await sendPushToUser(userId, {
 *     title: "Venda pendente",
 *     body: "Cliente João gerou um PIX de R$ 47,00",
 *     url: "/dashboard/vendas",
 *     kind: "sale-pending",
 *   });
 *
 * Falhas com 404/410 (subscription expirada/removida) são removidas
 * automaticamente do banco para não acumular lixo.
 */
import webpush from "web-push";
import { prisma } from "./prisma";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:noreply@trilhopag.com";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    if (process.env.NODE_ENV !== "production") {
      // Em dev, silencia; em prod, log uma vez.
    }
    return false;
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  /** URL onde abrir ao clicar (relativa ou absoluta). Default: /dashboard */
  url?: string;
  /**
   * Identificador do tipo — usado para roteamento e para o `tag` da
   * notificação (notificações com mesmo tag agrupam).
   */
  kind?: "sale-pending" | "sale-paid" | "withdraw" | "generic";
  /** Override do icon (default: logo Trilho) */
  icon?: string;
  /** Override do badge (default: logo Trilho) */
  badge?: string;
  /**
   * Quando setado, aplica template customizado do user pra esse tipo de
   * evento (User.notificationPrefs). Vars sao interpoladas em title/body.
   */
  event?: "pending" | "paid" | "withdrawal";
  /** Variaveis pra interpolar — {amount}, {customer}, {product}, etc. */
  vars?: Record<string, string>;
};

export type PushFilter = {
  /** Se true, só envia para subs com `notifyOnPending = true`. */
  onlyIfPending?: boolean;
  /** Se true, só envia para subs com `notifyOnPaid = true`. */
  onlyIfPaid?: boolean;
  /** Se true, só envia para subs com `notifyOnWithdrawalPaid = true`. */
  onlyIfWithdrawalPaid?: boolean;
};

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  filter: PushFilter = {},
): Promise<{ sent: number; removed: number }> {
  if (!ensureConfigured()) return { sent: 0, removed: 0 };

  const where: {
    userId: string;
    notifyOnPending?: boolean;
    notifyOnPaid?: boolean;
    notifyOnWithdrawalPaid?: boolean;
  } = { userId };
  if (filter.onlyIfPending) where.notifyOnPending = true;
  if (filter.onlyIfPaid) where.notifyOnPaid = true;
  if (filter.onlyIfWithdrawalPaid) where.notifyOnWithdrawalPaid = true;

  const subs = await prisma.pushSubscription.findMany({ where });
  if (subs.length === 0) return { sent: 0, removed: 0 };

  // Resolve customizacao do user: se o payload tem `event` e `vars`, aplica
  // o template do user. Senao, usa title/body como vieram (compat com
  // callers legacy que passam tudo pronto).
  let finalTitle = payload.title;
  let finalBody = payload.body;
  let soundEnabled = true;
  let vibrateEnabled = true;
  if (payload.event) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    const { resolveEventPrefs, interpolate, buildSourceLine } = await import(
      "./notification-templates"
    );
    const evp = resolveEventPrefs(
      user?.notificationPrefs as never,
      payload.event,
    );
    const vars = {
      ...(payload.vars ?? {}),
      emoji: evp.emoji,
    };
    finalTitle = interpolate(evp.title, vars);
    finalBody = interpolate(evp.body, vars);
    // 30/07/2026 (davi): se o seller ativou showSource pra esse evento,
    // appenda uma linha "📍 Via ..." com origem (bot / oferta / produto).
    // Opt-in — quem nao ativa, notificacao fica identica ao que era antes.
    if (evp.showSource) {
      const src = buildSourceLine({
        product: payload.vars?.product,
        offer: payload.vars?.offer,
        bot: payload.vars?.bot,
      });
      if (src) finalBody = `${finalBody}\n${src}`;
    }
    soundEnabled = evp.sound;
    vibrateEnabled = evp.vibrate;
  }

  const finalPayload = {
    title: finalTitle,
    body: finalBody,
    url: payload.url || "/dashboard",
    kind: payload.kind || "generic",
    icon: payload.icon || "/trilhopag-logo2.png",
    badge: payload.badge || "/trilhopag-logo2.png",
    tag: `trilhopag-${payload.kind || "generic"}-${Date.now()}`,
    soundEnabled,
    vibrateEnabled,
  };
  const json = JSON.stringify(finalPayload);

  let sent = 0;
  let removed = 0;
  const removeIds: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json,
          { TTL: 60 * 60 * 6 }, // 6h
        );
        sent += 1;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 404 = endpoint inexistente, 410 = gone (user desinscreveu)
        if (statusCode === 404 || statusCode === 410) {
          removeIds.push(sub.id);
          removed += 1;
        } else if (process.env.NODE_ENV !== "production") {
          console.warn("[push] envio falhou", { subId: sub.id, statusCode, err });
        }
      }
    }),
  );

  if (removeIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: removeIds } },
    });
  }

  // Atualiza lastUsedAt nas que funcionaram (só agrupado, performance)
  if (sent > 0 && removed < subs.length) {
    const okIds = subs.filter((s) => !removeIds.includes(s.id)).map((s) => s.id);
    if (okIds.length > 0) {
      await prisma.pushSubscription.updateMany({
        where: { id: { in: okIds } },
        data: { lastUsedAt: new Date() },
      });
    }
  }

  return { sent, removed };
}

/** Helper: detecta device a partir do User-Agent */
export function detectDevice(userAgent: string | null): string {
  if (!userAgent) return "Desconhecido";
  const ua = userAgent.toLowerCase();
  if (/iphone|ipod/.test(ua)) return "iPhone";
  if (/ipad/.test(ua)) return "iPad";
  if (/android/.test(ua)) return "Android";
  if (/macintosh|mac os x/.test(ua)) return "Mac";
  if (/windows/.test(ua)) return "Windows";
  if (/linux/.test(ua)) return "Linux";
  return "Outro";
}

/** Expõe a public key pro client decidir se push está disponível. */
export function getPushPublicKey(): string | null {
  return PUBLIC_KEY || null;
}
