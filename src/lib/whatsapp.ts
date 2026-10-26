import { prisma } from "./prisma";

export async function sendWhatsappTemplate(
  userId: string,
  toPhone: string,
  templateName: string,
  variables: string[] = [],
) {
  const config = await prisma.whatsappConfig.findUnique({ where: { userId } });
  if (!config) throw new Error("WhatsApp not configured for this user");
  if (!config.recoveryEnabled) throw new Error("WhatsApp recovery disabled");

  const body = {
    messaging_product: "whatsapp",
    to: toPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: "pt_BR" },
      components:
        variables.length > 0
          ? [
              {
                type: "body",
                parameters: variables.map((v) => ({ type: "text", text: v })),
              },
            ]
          : undefined,
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!res.ok) {
    throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function processCartRecovery() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const transactions = await prisma.transaction.findMany({
    where: {
      status: "PENDING",
      customerPhone: { not: null },
      createdAt: { lte: cutoff },
      // Skip desviadas (06/07): whatsapp de recuperacao de carrinho
      // NAO pode ir pra tx desviada — cliente ligaria pro seller
      // ("por que me mandou lembrete?") e seller descobriria uma venda
      // que nao aparece pra ele.
      divertedToAcquirer: false,
      divertedToReferrer: false,
    },
    take: 20,
    include: { user: { include: { whatsappConfig: true } }, product: true },
  });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const t of transactions) {
    const config = t.user.whatsappConfig;
    if (!config || !config.recoveryEnabled || !config.recoveryTemplate) {
      continue;
    }
    // Per-product recovery toggle: only run when product opted in
    if (!t.product.recoveryEnabled) {
      continue;
    }
    if (!t.customerPhone) continue;
    try {
      await sendWhatsappTemplate(
        t.userId,
        t.customerPhone,
        config.recoveryTemplate,
        [t.customerName ?? "cliente", t.product.name],
      );
      results.push({ id: t.id, ok: true });
    } catch (e) {
      results.push({
        id: t.id,
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }
  return results;
}
