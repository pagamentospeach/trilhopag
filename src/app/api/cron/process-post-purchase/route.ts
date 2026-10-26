import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cron: envia os e-mails pós-compra agendados que já venceram (sendAt <= agora).
 * Best-effort, idempotente por linha (status PENDING → SENT/FAILED). Falhas
 * tentam de novo até 4x; depois marca FAILED.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.postPurchaseEmail.findMany({
    where: { status: "PENDING", sendAt: { lte: now } },
    orderBy: { sendAt: "asc" },
    take: 50,
  });

  let sent = 0;
  let failed = 0;
  for (const row of due) {
    try {
      const r = await sendEmail({ to: row.toEmail, subject: row.subject, html: row.bodyHtml });
      if (!r.ok) throw new Error(r.error ?? "send failed");
      await prisma.postPurchaseEmail.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
      });
      sent++;
    } catch (e) {
      const willFail = row.attempts + 1 >= 4;
      await prisma.postPurchaseEmail
        .update({
          where: { id: row.id },
          data: {
            attempts: { increment: 1 },
            lastError: (e instanceof Error ? e.message : String(e)).slice(0, 300),
            ...(willFail ? { status: "FAILED" } : {}),
          },
        })
        .catch(() => {});
      failed++;
    }
  }

  return NextResponse.json({ processed: due.length, sent, failed });
}
