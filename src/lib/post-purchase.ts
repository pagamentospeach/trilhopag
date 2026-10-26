import { prisma } from "@/lib/prisma";

/**
 * Sequência pós-compra por e-mail (configurada no funil de produtos).
 *
 * Fluxo: markTransactionPaid chama `enqueuePostPurchaseEmail(txId)` (best-effort,
 * fire-and-forget). Se o checkout da venda tem uma sequência configurada, cria
 * UMA linha na fila PostPurchaseEmail com sendAt = agora + delay. O cron
 * `process-post-purchase` envia os que venceram via Resend.
 *
 * Idempotente: dedup por transactionId @unique (uma venda → no máx. 1 e-mail).
 */

type Config = { delayMin: number; subject: string; body: string };

export function parsePostPurchaseConfig(raw: unknown): Config | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const subject = typeof r.subject === "string" ? r.subject.trim() : "";
  const body = typeof r.body === "string" ? r.body.trim() : "";
  if (!subject || !body) return null;
  const delayRaw = Number(r.delayMin);
  const delayMin = Number.isFinite(delayRaw) && delayRaw >= 0 ? Math.round(delayRaw) : 0;
  return { delayMin, subject, body };
}

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

function toHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111">${esc.replace(/\n/g, "<br>")}</div>`;
}

/** Best-effort: agenda o e-mail pós-compra se o checkout tiver sequência. */
export async function enqueuePostPurchaseEmail(transactionId: string): Promise<void> {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      customerEmail: true,
      customerName: true,
      product: { select: { name: true } },
      checkout: { select: { postPurchaseEmail: true } },
    },
  });
  if (!tx || !tx.customerEmail || !tx.checkout) return;
  const cfg = parsePostPurchaseConfig(tx.checkout.postPurchaseEmail);
  if (!cfg) return;

  const vars = { nome: tx.customerName ?? "", produto: tx.product?.name ?? "" };
  const subject = render(cfg.subject, vars).slice(0, 200);
  const bodyHtml = toHtml(render(cfg.body, vars).slice(0, 8000));
  const sendAt = new Date(Date.now() + cfg.delayMin * 60 * 1000);

  try {
    await prisma.postPurchaseEmail.create({
      data: {
        userId: tx.userId,
        transactionId: tx.id,
        toEmail: tx.customerEmail,
        subject,
        bodyHtml,
        sendAt,
      },
    });
  } catch (e: unknown) {
    // P2002 = já agendado pra esta transação (idempotente). Outros erros sobem.
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code !== "P2002") throw e;
  }
}
