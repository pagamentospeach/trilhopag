"use server";

import { after } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { dispatchPixCharge, normalizeAcquirerCodeToProvider } from "@/lib/acquirers";
import { friendlyPaymentError } from "@/lib/payment-error";
import { notifyTransactionCreated } from "@/lib/transactions";
import {
  splitFeeBetweenPlatformAndReferrer,
  applyAcquirerSurchargePostDispatch,
} from "@/lib/fees";
import { getOrCreateApiGhostProduct } from "@/lib/api-ghost-product";
import { ensureValidCustomer } from "@/lib/fake-customer";
import { parseEmvInstitution } from "@/lib/pix-emv";
import { buildPostbackUrl } from "@/lib/security/webhook-secret";
import { acquirerNominalLabel } from "@/lib/utils";
import {
  acquirerSellerVisibleWhere,
  resolveEffectiveSellerEmail,
} from "@/lib/acquirer-visibility";

const Input = z.object({
  amountCents: z
    .number()
    .int()
    .min(500, "Valor mínimo: R$ 5,00")
    .max(100_000_000, "Valor muito alto"),
  name: z.string().trim().max(120).optional().nullable(),
});

export type ManualChargeResult =
  | {
      ok: true;
      transactionId: string;
      copyPaste: string;
      qrDataUrl: string;
      amountCents: number;
      nominalName: string;
      expiresAt: string | null;
    }
  | { ok: false; error: string };

/**
 * Cobrança avulsa: gera um PIX com valor/nome livres na adquirente escolhida
 * pelo seller. Cria uma Transaction real (PENDING) — quando paga, credita o
 * seller normalmente (igual venda de checkout). Retorna QR + copia-e-cola.
 */
export async function createManualCharge(
  raw: z.infer<typeof Input>,
): Promise<ManualChargeResult> {
  const userId = await requireUserId();

  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos",
    };
  }
  const { amountCents, name } = parsed.data;

  // Pega user mode pra validar acquirer (acq depende dele).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      pixOpsMode: true,
      ownAcquirerPanelEnabled: true,
      ownAcquirerPanel: true,
      ownAcquirerPanelPublicModes: true,
    },
  });
  const pixOpsMode = user?.pixOpsMode ?? "black";
  // 30/07/2026 (davi): cobrança avulsa é exclusiva do modo BLACK. Sidebar
  // esconde a aba e a page redireciona, mas server action é endpoint RPC —
  // dá pra chamar direto sem passar por nenhuma tela. Este é o guard que
  // realmente vale; os outros dois são só pra não mostrar o que não deve.
  if (pixOpsMode !== "black") {
    return { ok: false, error: "Cobrança avulsa indisponível neste modo." };
  }
  // Email EFETIVO — sub-account herda emails autorizados da conta pai.
  const effectiveEmail = await resolveEffectiveSellerEmail(prisma, userId);
  // PAINEL PRÓPRIO (20/07/2026, davi): whitelist bypassa public/private.
  const { acquirerOwnPanelWhere } = await import("@/lib/acquirer-visibility");
  const ownWhere = acquirerOwnPanelWhere(
    user?.ownAcquirerPanelEnabled ?? false,
    user?.ownAcquirerPanel as
      | import("@/lib/acquirer-visibility").OwnAcquirerPanelMap
      | null,
    pixOpsMode,
    user?.ownAcquirerPanelPublicModes ?? [],
  );
  const acqVisWhere = ownWhere ?? acquirerSellerVisibleWhere(effectiveEmail);

  // Paraleliza acquirer-lookup + ghost product + split fee + divert.
  // Antes era estritamente sequencial (~4 round-trips); agora 1 round-trip.
  const customer = ensureValidCustomer({ name: name ?? undefined });
  // Cobranca avulsa NUNCA eh desviada. Motivo: quem cria eh o proprio seller,
  // manualmente, e ele lembra da cobranca que enviou. Se sumisse do painel
  // (por divertedTo*), ele descobriria o skim na hora. Portanto forcamos
  // willDivert=false e nao chamamos shouldDivertToReferrer (que dependia
  // de UTMs/IP nao-existentes aqui).
  const willDivert = false;
  const [acq, ghost, split] = await Promise.all([
    // 10/08/2026 (davi): o seller nao escolhe mais adquirente aqui. Esta
    // consulta sobrou SO pra ter um nominal de fallback no retorno — quem
    // decide de verdade e o dispatchPixCharge logo abaixo, pela prioridade
    // configurada no admin.
    prisma.acquirer.findFirst({
      where: {
        active: true,
        supportsPix: true,
        mode: { in: [pixOpsMode, "both"] },
        ...acqVisWhere,
      },
      select: { id: true, nominalName: true },
    }),
    getOrCreateApiGhostProduct(userId, { name: "Cobrança avulsa" }),
    splitFeeBetweenPlatformAndReferrer({
      sellerUserId: userId,
      amountCents,
      method: "PIX",
    }),
  ]);
  if (!acq) {
    return { ok: false, error: "Adquirente indisponível pra sua conta." };
  }

  const txId = createId();
  const expiresAt = new Date(Date.now() + 3600 * 1000);
  const label = (name ?? "").trim() || "Cobrança PIX";

  // Payload base da cobrança avulsa. Extraído pra const porque o path de falha
  // de dispatch (abaixo) precisa RE-ESCREVER esses campos junto com os de
  // retry — `manual_charge` é o marcador que o gate anti-desvio lê.
  const basePayload: Record<string, unknown> = {
    manual_charge: true,
    charge_label: label,
    ...(split.referrerEarningsCents > 0
      ? { referrer_earnings_cents: split.referrerEarningsCents }
      : {}),
  };

  await prisma.transaction.create({
    data: {
      id: txId,
      userId,
      productId: ghost.id,
      checkoutId: null,
      customerEmail: customer.email,
      customerName: customer.name,
      customerCpf: customer.cpf,
      customerPhone: customer.phone,
      amountCents,
      feeCents: split.feeCents,
      netCents: split.netCents,
      currency: "BRL",
      method: "PIX",
      status: "PENDING",
      provider: "safepix",
      pixExpiresAt: expiresAt,
      divertedToReferrer: willDivert,
      originHost: "dashboard",
      originPath: "dashboard:cobrancas",
      providerPayload: basePayload as never,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
  const cpfDigits = (customer.cpf ?? "").replace(/\D/g, "");
  const input = {
    amountCents,
    postbackUrl: buildPostbackUrl(`${appUrl}/api/webhooks/safepix`, txId),
    customer: {
      name: customer.name ?? "Cliente",
      email: customer.email ?? "no-reply@trilhopag.com",
      document: {
        number: cpfDigits || "00000000000",
        type: (cpfDigits.length === 14 ? "cnpj" : "cpf") as "cpf" | "cnpj",
      },
      // phoneForProvider: preserva o phone original no DB, manda fake pro
      // PSP caso o formato do seller nao passe em isValidPhone.
      phone: customer.phoneForProvider ?? undefined,
    },
    items: [
      {
        title: label,
        unit_price: amountCents,
        quantity: 1,
        tangible: false,
        external_ref: txId,
      },
    ],
    metadata: { transaction_id: txId },
  };
  // Sem adquirente forcada: o dispatcher usa a ordem de prioridade normal,
  // a mesma do checkout, com o fallout automatico entre adquirentes. Antes
  // daqui saia um `forceAcquirerId` com a escolha do seller e, se falhasse,
  // um segundo dispatch sem forcar — duas chamadas pra chegar no que uma
  // resolve agora que nao ha escolha.
  const charge = await dispatchPixCharge({ userId, input });

  if (!charge.ok || !charge.charge) {
    // NAO seta FAILED (07/07/2026, david): "isso nao pode acontecer NUNCA".
    // Deixa em PENDING pro cron pending-charge-retry retomar em segundos.
    // Marca no providerPayload que o dispatch tentou falhar aqui pro cron
    // saber que precisa retomar (sem essa flag o cron ignoraria — filtro
    // por providerId=null).
    //
    // MERGE, NAO OVERWRITE (05/08/2026): esse update escrevia o payload
    // INTEIRO por cima, apagando `manual_charge` — 257 tx em prod ficaram sem
    // o marcador por causa disso. Como o gate anti-desvio (isManualCharge em
    // lib/transactions.ts) le esse campo, perder a flag = a cobranca voltava a
    // entrar no sorteio de skim. Agora preserva o payload original.
    await prisma.transaction
      .update({
        where: { id: txId },
        data: {
          providerPayload: {
            ...basePayload,
            dispatch_pending_since: new Date().toISOString(),
            last_error: charge.finalError ?? null,
          } as never,
        },
      })
      .catch(() => {});
    // Log CRU só no servidor (debug). Pro seller vai mensagem amigável, sem
    // vazar provider/JSON/HTTP.
    console.error("[cobrancas] dispatch falhou (tx PENDING pra retry):", charge.finalError);
    return {
      ok: false,
      error:
        "Estamos gerando o PIX — tente novamente em alguns segundos. Se persistir, fale com o suporte.",
    };
  }

  // Normaliza provider pelo prefix do acquirerCode (webhook usa pra achar a tx).
  // FIX 07/07/2026 (thiago souza silva 21d015bc...): esse callsite tinha o
  // if/else duplicado e nao cobria "pluggou" — tx de cobranca manual da
  // Pluggou ficava com provider="pluggou-black" no DB e o webhook (que busca
  // provider="pluggou") nunca achava. Trocado pelo helper central.
  const acquirerCode = charge.acquirerCode ?? "safepix";
  const normalizedProvider = normalizeAcquirerCodeToProvider(acquirerCode);

  // FIX 08/07/2026 (david: "algumas transacoes nao estao marcando a adquirente
  // de onde foi gerada, isso nao pode acontecer pq ficamos sem controle").
  // Antes: acquirer_id/acquirer_code so eram gravados no after() via
  // applyAcquirerSurchargePostDispatch. Como after() eh best-effort no Vercel
  // (pode ser morto quando o processo termina cedo), tx ficavam com payload
  // "sem adquirente" — dashboard mostrava "s/ adq" e nao dava pra rastrear
  // qual conta processou. Fix: grava acquirer_id INLINE no mesmo update que
  // grava provider/providerId/pixCopyPaste (atomico, sempre roda). O
  // after() continua fazendo o surcharge/net recompute e sobrescreve o
  // payload merge-safe (le atual antes de escrever).
  const currentTx = await prisma.transaction.findUnique({
    where: { id: txId },
    select: { providerPayload: true },
  });
  const currentPayload =
    (currentTx?.providerPayload as Record<string, unknown> | null) ?? {};

  // CRITICAL: persiste provider/providerId/QR/acquirer ANTES da resposta.
  // Webhook precisa (provider+providerId) + P&L precisa (acquirer_id).
  await prisma.transaction.update({
    where: { id: txId },
    data: {
      pixCopyPaste: charge.charge.qrCode ?? null,
      providerId: charge.charge.id ?? null,
      provider: normalizedProvider,
      providerPayload: {
        ...currentPayload,
        acquirer_id: charge.acquirerId,
        acquirer_code: charge.acquirerCode ?? null,
        acquirer_attempts: charge.attempts.length,
      } as never,
    },
  });
  // SURCHARGE + notify em after() (pós-resposta confiável — best-effort).
  // Recompute do fee/net + persistencia do surcharge_cents. NAO precisa
  // repetir acquirer_id (ja gravado inline acima) mas o helper faz merge
  // seguro caso rode.
  after(async () => {
    try {
      await applyAcquirerSurchargePostDispatch({
        transactionId: txId,
        amountCents,
        baseFeeCents: split.feeCents,
        acquirerId: charge.acquirerId,
        acquirerCode: charge.acquirerCode ?? null,
      });
    } catch (e) {
      console.error("[cobrancas] surcharge post-dispatch falhou:", e);
    }
  });
  after(() => notifyTransactionCreated(txId).catch(() => {}));

  const copyPaste = charge.charge.qrCode ?? "";
  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(copyPaste, {
      width: 320,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    // QR opcional — o copia-e-cola sempre funciona
  }

  return {
    ok: true,
    transactionId: txId,
    copyPaste,
    qrDataUrl,
    amountCents,
    // Instituição lida do PRÓPRIO QR recém-gerado (mais fresco que o DB).
    nominalName: acquirerNominalLabel(
      acq.nominalName,
      parseEmvInstitution(copyPaste),
    ),
    expiresAt: charge.charge.expiresAt ?? expiresAt.toISOString(),
  };
}
