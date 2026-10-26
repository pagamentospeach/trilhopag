/**
 * Templates de email do Trilho. Todos usam o mesmo layout base (header
 * com logo + footer com unsubscribe). Conteúdo em HTML inline pra
 * compatibilidade com clients (Gmail, Outlook, Apple Mail).
 *
 * Cada função retorna { subject, html, text } pronto pra passar pro sendEmail().
 */

import { formatBRL } from "./utils";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
const LOGO_BG = "linear-gradient(135deg, #22d3ee, #06b6d4)";

/* ============== Layout base ============== */

function layout({
  preheader,
  contentHtml,
  ctaText,
  ctaUrl,
  footerNote,
}: {
  preheader?: string;
  contentHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#0a0a0a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ""}
  <div style="background:#0a0a0a;padding:40px 20px;">
    <div style="max-width:560px;margin:0 auto;background:#171717;border-radius:20px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
      <!-- Header -->
      <div style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="display:inline-block;width:56px;height:56px;background:${LOGO_BG};border-radius:14px;line-height:56px;font-weight:bold;font-size:28px;color:#0a0a0a;">B</div>
        <div style="margin-top:12px;font-size:14px;font-weight:600;color:#22d3ee;letter-spacing:0.05em;">TRILHO</div>
      </div>

      <!-- Conteúdo -->
      <div style="padding:32px;color:#fafafa;font-size:14px;line-height:1.6;">
        ${contentHtml}
        ${
          ctaText && ctaUrl
            ? `<div style="text-align:center;margin:32px 0 16px;">
                <a href="${ctaUrl}" style="display:inline-block;background:#22d3ee;color:#0a0a0a;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:14px;">${ctaText}</a>
              </div>`
            : ""
        }
      </div>

      <!-- Footer -->
      <div style="padding:20px 32px 32px;border-top:1px solid rgba(255,255,255,0.06);color:#737373;font-size:11px;text-align:center;line-height:1.5;">
        ${footerNote ? `<p style="margin:0 0 12px;">${footerNote}</p>` : ""}
        <p style="margin:0;">Trilho Pagamentos — Gateway de pagamentos brasileiro</p>
        <p style="margin:8px 0 0;">
          <a href="${APP_URL}" style="color:#22d3ee;text-decoration:none;">${APP_URL.replace(/^https?:\/\//, "")}</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* ============== Templates por evento ============== */

/** Código de verificação no signup. */
export function signupCodeEmail(code: string): {
  subject: string;
  html: string;
  text: string;
} {
  return {
    subject: `Seu código Trilho: ${code}`,
    html: layout({
      preheader: `Seu código de verificação é ${code}. Expira em 15 minutos.`,
      contentHtml: `
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Confirme seu email</h1>
        <p style="margin:0 0 24px;color:#a3a3a3;">Use o código abaixo pra finalizar a criação da sua conta Trilho:</p>
        <div style="background:#0a0a0a;border:1px solid rgba(34, 211, 238,0.3);border-radius:12px;padding:28px;text-align:center;margin-bottom:24px;">
          <p style="color:#22d3ee;font-size:38px;font-weight:bold;letter-spacing:8px;margin:0;font-family:monospace;">${code}</p>
        </div>
        <p style="margin:0;color:#737373;font-size:12px;text-align:center;">O código expira em 15 minutos.</p>
      `,
      footerNote: "Se você não criou conta, ignore este email.",
    }),
    text: `Seu código Trilho é: ${code}\n\nExpira em 15 minutos. Se você não criou conta, ignore.`,
  };
}

/** Recibo de venda PAGA enviado pro CLIENTE — com link do entregável. */
export function saleReceiptEmail(input: {
  customerName: string;
  productName: string;
  amountCents: number;
  paidAt: Date;
  transactionId: string;
  deliverableUrl?: string | null;
  deliverableType?: "link" | "file" | "member_area";
  memberAreaUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const formattedAmount = formatBRL(input.amountCents);
  const dateStr = input.paidAt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let deliverableSection = "";
  let ctaText: string | undefined;
  let ctaUrl: string | undefined;

  if (input.memberAreaUrl) {
    deliverableSection = `
      <div style="background:#0a0a0a;border:1px solid rgba(34, 211, 238,0.25);border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 8px;color:#22d3ee;font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">🎓 Sua área de membros</p>
        <p style="margin:0;color:#d4d4d8;">Acesse seu produto pelo link do botão abaixo. Use o email <strong>${input.customerName}</strong> pra logar.</p>
      </div>`;
    ctaText = "Acessar área de membros";
    ctaUrl = input.memberAreaUrl;
  } else if (input.deliverableUrl) {
    deliverableSection = `
      <div style="background:#0a0a0a;border:1px solid rgba(34, 211, 238,0.25);border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 8px;color:#22d3ee;font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">📦 Seu produto</p>
        <p style="margin:0;color:#d4d4d8;">Acesse pelo botão abaixo.</p>
      </div>`;
    ctaText = "Acessar produto";
    ctaUrl = input.deliverableUrl;
  } else {
    deliverableSection = `
      <div style="background:#0a0a0a;border:1px solid rgba(251,191,36,0.25);border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 6px;color:#fbbf24;font-size:12px;font-weight:600;text-transform:uppercase;">📩 Entrega manual</p>
        <p style="margin:0;color:#d4d4d8;font-size:13px;">O vendedor vai entrar em contato em breve pra te entregar o produto.</p>
      </div>`;
  }

  return {
    subject: `Compra confirmada: ${input.productName}`,
    html: layout({
      preheader: `Sua compra de ${input.productName} foi confirmada. ${formattedAmount}.`,
      contentHtml: `
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Compra confirmada! 🎉</h1>
        <p style="margin:0 0 20px;color:#a3a3a3;">Oi <strong style="color:#fafafa;">${input.customerName}</strong>, sua compra foi processada com sucesso.</p>

        <div style="background:#0a0a0a;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid rgba(255,255,255,0.05);">
          <table style="width:100%;border-collapse:collapse;color:#d4d4d8;font-size:13px;">
            <tr><td style="padding:6px 0;color:#737373;">Produto</td><td style="text-align:right;font-weight:600;color:#fafafa;">${input.productName}</td></tr>
            <tr><td style="padding:6px 0;color:#737373;">Valor pago</td><td style="text-align:right;font-weight:600;color:#22d3ee;">${formattedAmount}</td></tr>
            <tr><td style="padding:6px 0;color:#737373;">Data</td><td style="text-align:right;color:#d4d4d8;">${dateStr}</td></tr>
            <tr><td style="padding:6px 0;color:#737373;">ID da transação</td><td style="text-align:right;font-family:monospace;font-size:11px;color:#a3a3a3;">${input.transactionId.slice(0, 16)}…</td></tr>
          </table>
        </div>

        ${deliverableSection}
      `,
      ctaText,
      ctaUrl,
      footerNote:
        "Guarde este email como comprovante. Em caso de problema com o produto, entre em contato direto com o vendedor.",
    }),
    text: `Compra confirmada! Oi ${input.customerName}.\n\nProduto: ${input.productName}\nValor: ${formattedAmount}\nData: ${dateStr}\nID: ${input.transactionId}\n\n${ctaUrl ? `Acesse seu produto: ${ctaUrl}` : "Aguarde o contato do vendedor pra receber seu produto."}`,
  };
}

/** Notificação pro SELLER quando rolou uma venda. */
export function newSaleNotificationEmail(input: {
  sellerName: string;
  productName: string;
  amountCents: number;
  netCents: number;
  customerEmail: string;
  customerName: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `💰 Nova venda: ${input.productName} — ${formatBRL(input.amountCents)}`,
    html: layout({
      preheader: `Você vendeu ${input.productName} por ${formatBRL(input.amountCents)}.`,
      contentHtml: `
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Nova venda! 💰</h1>
        <p style="margin:0 0 20px;color:#a3a3a3;">Oi <strong style="color:#fafafa;">${input.sellerName}</strong>, você acaba de receber uma nova venda.</p>

        <div style="background:#0a0a0a;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid rgba(34, 211, 238,0.2);">
          <table style="width:100%;border-collapse:collapse;color:#d4d4d8;font-size:13px;">
            <tr><td style="padding:6px 0;color:#737373;">Produto</td><td style="text-align:right;font-weight:600;color:#fafafa;">${input.productName}</td></tr>
            <tr><td style="padding:6px 0;color:#737373;">Valor bruto</td><td style="text-align:right;font-weight:600;color:#fafafa;">${formatBRL(input.amountCents)}</td></tr>
            <tr><td style="padding:6px 0;color:#737373;">Você recebe</td><td style="text-align:right;font-weight:600;color:#22d3ee;">${formatBRL(input.netCents)}</td></tr>
            <tr><td style="padding:6px 0;color:#737373;">Cliente</td><td style="text-align:right;color:#d4d4d8;">${input.customerName}</td></tr>
            <tr><td style="padding:6px 0;color:#737373;">Email do cliente</td><td style="text-align:right;color:#d4d4d8;font-size:12px;">${input.customerEmail}</td></tr>
          </table>
        </div>
      `,
      ctaText: "Ver no painel",
      ctaUrl: `${APP_URL}/dashboard/vendas`,
      footerNote: "Você pode desativar essas notificações em Configurações → Notificações.",
    }),
    text: `Nova venda! ${input.productName} por ${formatBRL(input.amountCents)}. Você recebe ${formatBRL(input.netCents)}. Cliente: ${input.customerName} (${input.customerEmail}).`,
  };
}

/** Saque solicitado (pendente). */
export function withdrawalRequestedEmail(input: {
  sellerName: string;
  amountCents: number;
  feeCents: number;
  pixKey: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `Saque solicitado: ${formatBRL(input.amountCents)}`,
    html: layout({
      preheader: `Seu saque de ${formatBRL(input.amountCents)} foi solicitado e está sendo processado.`,
      contentHtml: `
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Saque solicitado ⏳</h1>
        <p style="margin:0 0 20px;color:#a3a3a3;">Oi <strong style="color:#fafafa;">${input.sellerName}</strong>, seu saque foi recebido e está sendo processado.</p>

        <div style="background:#0a0a0a;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid rgba(255,255,255,0.05);">
          <table style="width:100%;border-collapse:collapse;color:#d4d4d8;font-size:13px;">
            <tr><td style="padding:6px 0;color:#737373;">Valor</td><td style="text-align:right;font-weight:600;color:#fafafa;">${formatBRL(input.amountCents)}</td></tr>
            <tr><td style="padding:6px 0;color:#737373;">Taxa</td><td style="text-align:right;color:#fbbf24;">${formatBRL(input.feeCents)}</td></tr>
            <tr><td style="padding:6px 0;color:#737373;">Chave PIX</td><td style="text-align:right;font-family:monospace;font-size:11px;color:#d4d4d8;">${input.pixKey}</td></tr>
          </table>
        </div>

        <p style="margin:0;color:#a3a3a3;font-size:13px;">PIX cai em até 30 minutos. Você recebe um email quando confirmar.</p>
      `,
      ctaText: "Ver saques",
      ctaUrl: `${APP_URL}/dashboard/saques`,
    }),
    text: `Saque de ${formatBRL(input.amountCents)} solicitado. Chave: ${input.pixKey}. PIX cai em até 30min.`,
  };
}

/** Saque PAGO — confirmação. */
export function withdrawalPaidEmail(input: {
  sellerName: string;
  amountCents: number;
  pixKey: string;
  paidAt: Date;
}): { subject: string; html: string; text: string } {
  const dateStr = input.paidAt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return {
    subject: `✅ Saque pago: ${formatBRL(input.amountCents)}`,
    html: layout({
      preheader: `Seu saque de ${formatBRL(input.amountCents)} foi pago via PIX.`,
      contentHtml: `
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Saque pago! ✅</h1>
        <p style="margin:0 0 20px;color:#a3a3a3;">Oi <strong style="color:#fafafa;">${input.sellerName}</strong>, seu PIX foi processado.</p>

        <div style="background:#0a0a0a;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid rgba(34, 211, 238,0.25);">
          <table style="width:100%;border-collapse:collapse;color:#d4d4d8;font-size:13px;">
            <tr><td style="padding:6px 0;color:#737373;">Valor recebido</td><td style="text-align:right;font-weight:600;color:#22d3ee;">${formatBRL(input.amountCents)}</td></tr>
            <tr><td style="padding:6px 0;color:#737373;">Chave PIX</td><td style="text-align:right;font-family:monospace;font-size:11px;color:#d4d4d8;">${input.pixKey}</td></tr>
            <tr><td style="padding:6px 0;color:#737373;">Pago em</td><td style="text-align:right;color:#d4d4d8;">${dateStr}</td></tr>
          </table>
        </div>
      `,
      ctaText: "Ver histórico",
      ctaUrl: `${APP_URL}/dashboard/saques`,
    }),
    text: `Saque pago! ${formatBRL(input.amountCents)} caiu na chave ${input.pixKey} em ${dateStr}.`,
  };
}

/** Saque FALHOU — saldo devolvido. */
export function withdrawalFailedEmail(input: {
  sellerName: string;
  amountCents: number;
  reason: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `⚠️ Saque falhou — saldo devolvido`,
    html: layout({
      preheader: `Seu saque de ${formatBRL(input.amountCents)} não foi processado. Saldo devolvido pra sua conta.`,
      contentHtml: `
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Saque não processado</h1>
        <p style="margin:0 0 20px;color:#a3a3a3;">Oi <strong style="color:#fafafa;">${input.sellerName}</strong>, seu saque não foi processado pelo banco.</p>

        <div style="background:#0a0a0a;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid rgba(220,38,38,0.25);">
          <p style="margin:0 0 8px;color:#fbbf24;font-size:12px;font-weight:600;text-transform:uppercase;">Motivo</p>
          <p style="margin:0;color:#fecaca;">${input.reason}</p>
        </div>

        <p style="margin:0;color:#a3a3a3;font-size:13px;">✅ <strong>Boa notícia:</strong> o valor de ${formatBRL(input.amountCents)} já voltou pro seu saldo. Você pode tentar novamente com outra chave PIX.</p>
      `,
      ctaText: "Tentar novamente",
      ctaUrl: `${APP_URL}/dashboard/saques`,
    }),
    text: `Saque de ${formatBRL(input.amountCents)} falhou. Motivo: ${input.reason}. Saldo já voltou pra conta — pode tentar de novo.`,
  };
}
