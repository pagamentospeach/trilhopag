/**
 * Disparo (SMS/Email) — recuperação de vendas pendentes.
 *
 * 22/07/2026 (davi): "Tire esse negocio de entregar o produto via resend do
 * seller, o seller pode configurar o email do jeito que ele quiser e o
 * nosso resend mesmo envia o email". Simplificamos:
 *  - EMAIL: envia pelo Resend padrão do gateway (@/lib/email.ts). Seller
 *    define só subject/body/delays. Não precisa mais cadastrar Resend/
 *    SendGrid próprio nem colocar API key.
 *  - SMS: continua exigindo Twilio do seller (não temos SMS global). Se
 *    quiser SMS, cadastra Twilio na tela de Recuperação.
 *
 * Colunas emailApiKey/emailFrom/emailProvider em DispatchProvider ficam no
 * schema por retrocompat mas NÃO SÃO LIDAS mais — o disparo de email não
 * depende delas.
 *
 * Templates aceitam {nome} {produto} {valor} {link}.
 */
import { prisma } from "./prisma";
import { decryptString } from "./crypto";
import { formatBRL } from "./utils";
import { sendEmail } from "./email";

export type DispatchProviderCfg = {
  emailEnabled: boolean;
  emailProvider: string | null;
  emailApiKey: string | null; // já descriptografado
  emailFrom: string | null;
  smsEnabled: boolean;
  smsProvider: string | null;
  smsAccountSid: string | null; // já descriptografado
  smsAuthToken: string | null; // já descriptografado
  smsFrom: string | null;
};

function safeDecrypt(v: string | null): string | null {
  if (!v) return null;
  try {
    return decryptString(v);
  } catch {
    return null;
  }
}

/** Lê o provedor do seller e descriptografa as credenciais. */
export async function getDispatchProvider(
  userId: string,
): Promise<DispatchProviderCfg | null> {
  const p = await prisma.dispatchProvider.findUnique({ where: { userId } });
  if (!p) return null;
  return {
    emailEnabled: p.emailEnabled,
    emailProvider: p.emailProvider,
    emailApiKey: safeDecrypt(p.emailApiKey),
    emailFrom: p.emailFrom,
    smsEnabled: p.smsEnabled,
    smsProvider: p.smsProvider,
    smsAccountSid: safeDecrypt(p.smsAccountSid),
    smsAuthToken: safeDecrypt(p.smsAuthToken),
    smsFrom: p.smsFrom,
  };
}

type SendResult = { ok: boolean; error?: string };

/**
 * Envia email de recuperação via Resend PADRÃO do gateway (@/lib/email.ts).
 * NÃO usa mais provedor próprio do seller. `cfg` é opcional aqui — mantido na
 * assinatura só pra compatibilidade com callers antigos, mas os campos de
 * email do provider são IGNORADOS. Se o seller quiser assinar a mensagem
 * como "da equipe X", coloca isso no proprio body (variavel {marca}, etc).
 */
export async function sendSellerEmail(
  _cfg: DispatchProviderCfg | null,
  { to, subject, html }: { to: string; subject: string; html: string },
): Promise<SendResult> {
  const r = await sendEmail({ to, subject, html });
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "email_error" };
}

/** Envia SMS pelo provedor do PRÓPRIO seller (hoje: Twilio). */
export async function sendSellerSms(
  cfg: DispatchProviderCfg,
  { to, body }: { to: string; body: string },
): Promise<SendResult> {
  if (
    !cfg.smsEnabled ||
    !cfg.smsAccountSid ||
    !cfg.smsAuthToken ||
    !cfg.smsFrom
  ) {
    return { ok: false, error: "sms_not_configured" };
  }
  try {
    if (cfg.smsProvider === "twilio") {
      const auth = Buffer.from(
        `${cfg.smsAccountSid}:${cfg.smsAuthToken}`,
      ).toString("base64");
      const form = new URLSearchParams({
        From: cfg.smsFrom,
        To: to,
        Body: body,
      });
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
          cfg.smsAccountSid,
        )}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (res.ok || res.status === 201) return { ok: true };
      return { ok: false, error: `twilio_${res.status}` };
    }
    return { ok: false, error: `sms_provider_unknown` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "sms_error" };
  }
}

/** Substitui {nome} {produto} {valor} {link} no template. */
export function renderTemplate(
  tpl: string,
  vars: Record<string, string>,
): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

// Defaults usados quando o seller liga o canal mas não escreve template.
const DEFAULT_EMAIL_SUBJECT = "Você esqueceu de finalizar sua compra 👀";
const DEFAULT_EMAIL_BODY =
  "Oi {nome}, seu PIX de {produto} ({valor}) ainda está pendente. É rapidinho — finalize por aqui: {link}";
const DEFAULT_SMS_BODY =
  "{nome}, seu PIX de {produto} ({valor}) ta pendente. Finalize: {link}";

function parseDelays(csv: string | null | undefined): number[] {
  if (!csv) return [5, 15, 30];
  const out = csv
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 1440);
  return out.length ? Array.from(new Set(out)).sort((a, b) => a - b) : [5, 15, 30];
}

/**
 * Dispatcher — roda no cron. Acha PIX pendentes na janela de cada delay
 * configurado no produto e dispara via o provedor do seller. Dedup por
 * (tx, canal, delay) via DispatchLog. Janela de 6min por delay (evita
 * disparar todos de uma vez num pix velho + evita disparo atrasado).
 */
const WINDOW_MIN = 6;

export async function processDispatch() {
  const now = Date.now();
  // Olha pix pendentes criados nos últimos ~50min (cobre delays até 30 + grace).
  const lookback = new Date(now - 50 * 60 * 1000);
  const txns = await prisma.transaction.findMany({
    where: {
      status: "PENDING",
      createdAt: { gte: lookback },
      // Skip desviadas (06/07): recuperacao por email/SMS enviava lembrete
      // "voce esqueceu de pagar" pro cliente de tx desviada. Cliente ligaria
      // pro seller ("por que me mandou lembrete?") e seller descobria uma
      // venda que nao aparece pra ele — denunciando o desvio.
      divertedToAcquirer: false,
      divertedToReferrer: false,
      product: {
        recoveryEnabled: true, // master "Ativar Disparo" do produto
        OR: [{ dispatchEmailEnabled: true }, { dispatchSmsEnabled: true }],
      },
    },
    take: 300,
    include: {
      product: true,
      checkout: { select: { slug: true } },
    },
  });

  const results: Array<{ id: string; channel: string; delay: number; ok: boolean; error?: string }> = [];
  const providerCache = new Map<string, DispatchProviderCfg | null>();

  for (const t of txns) {
    const ageMin = (now - new Date(t.createdAt).getTime()) / 60000;
    const delays = parseDelays(t.product.dispatchDelays);
    const due = delays.filter((d) => ageMin >= d && ageMin < d + WINDOW_MIN);
    if (due.length === 0) continue;

    // Provedor do seller (só usado pra SMS agora). Email vai pelo Resend
    // padrão do gateway — independente de haver DispatchProvider ou não.
    let cfg = providerCache.get(t.userId);
    if (cfg === undefined) {
      cfg = await getDispatchProvider(t.userId);
      providerCache.set(t.userId, cfg);
    }

    const link = t.checkout?.slug
      ? `https://trilhopag.com/c/${t.checkout.slug}`
      : "";
    const vars: Record<string, string> = {
      nome: t.customerName || "cliente",
      produto: t.product.name,
      valor: formatBRL(t.amountCents),
      link,
    };

    for (const delay of due) {
      // EMAIL — só depende do flag do produto (nosso Resend envia)
      if (t.product.dispatchEmailEnabled && t.customerEmail) {
        const already = await prisma.dispatchLog.findUnique({
          where: {
            txId_channel_delayMin: { txId: t.id, channel: "email", delayMin: delay },
          },
        });
        if (!already) {
          const subject = renderTemplate(
            t.product.dispatchEmailSubject || DEFAULT_EMAIL_SUBJECT,
            vars,
          );
          const bodyText = renderTemplate(
            t.product.dispatchEmailBody || DEFAULT_EMAIL_BODY,
            vars,
          );
          const html = bodyText.replace(/\n/g, "<br>");
          const r = await sendSellerEmail(cfg, {
            to: t.customerEmail,
            subject,
            html,
          });
          if (r.ok) {
            await prisma.dispatchLog
              .create({ data: { txId: t.id, channel: "email", delayMin: delay } })
              .catch(() => {});
          }
          results.push({ id: t.id, channel: "email", delay, ok: r.ok, error: r.error });
        }
      }
      // SMS — só se seller cadastrou Twilio (dispatchProvider) + habilitou.
      if (
        t.product.dispatchSmsEnabled &&
        cfg?.smsEnabled &&
        t.customerPhone
      ) {
        const already = await prisma.dispatchLog.findUnique({
          where: {
            txId_channel_delayMin: { txId: t.id, channel: "sms", delayMin: delay },
          },
        });
        if (!already) {
          const body = renderTemplate(
            t.product.dispatchSmsBody || DEFAULT_SMS_BODY,
            vars,
          );
          const r = await sendSellerSms(cfg!, { to: t.customerPhone, body });
          if (r.ok) {
            await prisma.dispatchLog
              .create({ data: { txId: t.id, channel: "sms", delayMin: delay } })
              .catch(() => {});
          }
          results.push({ id: t.id, channel: "sms", delay, ok: r.ok, error: r.error });
        }
      }
    }
  }

  return results;
}
