/**
 * Email sender — usa Resend se RESEND_API_KEY estiver configurado.
 * Sem a key, faz log no servidor (modo dev / fallback gracioso).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * POLÍTICA DE ENVIO:
 * O Trilho envia SÓ 3 tipos:
 *   1. Código de confirmação de email no signup
 *   2. Recuperação de senha (link de reset via BetterAuth)
 *   3. Entrega de produto digital pós-venda (agendado no funil do seller)
 *
 * Qualquer outro disparo (notif de venda, notif de saque, alertas admin)
 * continua REMOVIDO do código diretamente. Se aparecer novo call site,
 * revisar caso a caso antes de commitar.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Setup Vercel:
 *   - RESEND_API_KEY: pegar em https://resend.com/api-keys
 *   - RESEND_FROM (opcional): ex "Trilho Pagamentos <noreply@trilhopag.com>"
 */
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromAddress =
  process.env.RESEND_FROM ?? "Trilho Pagamentos <onboarding@resend.dev>";

const resend = apiKey ? new Resend(apiKey) : null;

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<{
  ok: boolean;
  id?: string;
  error?: string;
}> {
  if (!resend) {
    console.log("[email:dev]", { to, subject, text: text ?? html.replace(/<[^>]+>/g, "").slice(0, 200) });
    return { ok: true, id: "dev-no-send" };
  }
  try {
    const res = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
      text,
    });
    if (res.error) {
      console.error("[email] resend error", res.error);
      return { ok: false, error: res.error.message };
    }
    return { ok: true, id: res.data?.id };
  } catch (e) {
    console.error("[email] exception", e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
