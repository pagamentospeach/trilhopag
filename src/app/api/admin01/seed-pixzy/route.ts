/**
 * 22/07/2026 (davi): endpoint one-shot pra cadastrar/upsertar o Acquirer
 * Pixzy no banco em produção. Precisa ser rodado UMA VEZ apos deploy —
 * usa APP_ENCRYPTION_KEY do env pra encriptar o token corretamente.
 *
 * Protegido por Authorization: Bearer <CRON_SECRET> (mesmo dos crons).
 *
 * Após rodar 1x, este arquivo pode ser removido — o Acquirer fica
 * permanente no banco.
 *
 * Config setada:
 *   code: "pixzy-1"
 *   nominalName: "pagar-me"
 *   institution: "Pagar.me"
 *   shortCode: "PXZ"
 *   mode: "black" (default seguro — admin pode trocar via /admin01/acquirers)
 *   supportsPix: true
 *   pixCostPercent: 3       (custo da plataforma)
 *   pixCostFixedCents: 100  (R$ 1,00 fixo)
 *   active: true (mas hiddenFromSellers=true por default — admin habilita)
 *   priority: 900 (baixa — só usa se admin priorizar)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptString } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const PIXZY_TOKEN = "319|1JqsN8ZQZvO5igcJWjsVwJtXvVwJQOszHb8ycJGia44223ab";
const CODE = "pixzy-1";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const secretKeyEnc = encryptString(PIXZY_TOKEN);

  const existing = await prisma.acquirer.findUnique({
    where: { code: CODE },
    select: { id: true },
  });

  if (existing) {
    // Atualiza o token (idempotente — em caso de rotação do token)
    await prisma.acquirer.update({
      where: { id: existing.id },
      data: {
        secretKeyEnc,
        // Mantem publicKey nao-null pra passar filtro em resolveWebhookAcquirers
        publicKey: "pixzy",
        supportsPix: true,
        active: true,
      },
    });
    return NextResponse.json({
      ok: true,
      action: "updated",
      id: existing.id,
      code: CODE,
    });
  }

  const created = await prisma.acquirer.create({
    data: {
      code: CODE,
      nominalName: "pagar-me",
      institution: "Pagar.me",
      shortCode: "PXZ",
      mode: "black",
      // publicKey nao usado pela API (auth eh Bearer). Setamos "pixzy" soh
      // pra passar filtro `publicKey: { not: null }` no resolveWebhookAcquirers.
      publicKey: "pixzy",
      secretKeyEnc,
      accountEmail: null,
      supportsPix: true,
      supportsCard: false,
      supportsApplePay: false,
      supportsGooglePay: false,
      // Custo da PLATAFORMA por venda (o que a Pixzy cobra da gente):
      // 3% + R$1,00 (informado pelo davi). Saque: R$5,00 (nao modelado
      // aqui — sai do saldo direto quando a Pixzy processa).
      pixCostPercent: 3,
      pixCostFixedCents: 100,
      priority: 900,
      active: true,
      // Comeca escondido — admin habilita quando quiser rotear vendas.
      hiddenFromSellers: true,
    },
    select: { id: true, code: true },
  });

  return NextResponse.json({
    ok: true,
    action: "created",
    id: created.id,
    code: created.code,
  });
}
