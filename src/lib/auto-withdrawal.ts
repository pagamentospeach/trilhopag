/**
 * SAQUE AUTOMÁTICO via API de transferência da SafePix.
 *
 * Disparado DEPOIS que requestWithdrawal cria o saque PENDING (PIX only). Se o
 * seller tem `autoWithdrawEnabled` E existe UMA conta SafePix com saldo >=
 * payout, o saque é enviado NA HORA. Senão (saldo disperso entre as contas, ou
 * nenhuma conta com saldo suficiente), o saque fica PENDING pro admin enviar
 * manualmente — exatamente como hoje.
 *
 * SEGURANÇA (decisões de design):
 *  - Idempotência: a transição PENDING→PROCESSING é ATÔMICA (updateMany WHERE
 *    status=PENDING). Só UM processo consegue → createWithdrawal é chamado 1x.
 *    O índice `withdrawal_one_open_per_user` já garante 1 saque aberto/seller.
 *  - Confirmação: o webhook `safepix-transfer` (fail-closed HMAC) correlaciona
 *    por `metadata.withdrawal_id` e finaliza PROCESSING→PAID/FAILED de forma
 *    idempotente (markWithdrawalPaid/Failed). Por isso passamos esse metadata.
 *  - Timeout AMBÍGUO (não sabemos se a SafePix criou): NÃO estorna e NÃO
 *    re-tenta — fica PROCESSING; o webhook ainda pode chegar, e o reconcile +
 *    admin resolvem. (evita saque duplicado.)
 *  - Erro CLARO da API (não foi criado): volta pra PENDING pro admin fazer
 *    manual (saldo continua debitado — o saque ainda é devido).
 *  - Kill-switch global de emergência: env AUTO_WITHDRAW_DISABLED=1.
 *  - Teto DIÁRIO por seller (autoWithdrawDailyLimitCents). 0 = SEM LIMITE
 *    (default). Só >0 reimpõe teto (acima → manual). A trava real contra
 *    over-withdrawal é a auditoria reconciliada, não este teto.
 *
 * Best-effort: NUNCA lança. Em qualquer dúvida, deixa manual.
 */
import { prisma } from "./prisma";
import { decryptString } from "./crypto";
import {
  createWithdrawal as safePixCreateWithdrawal,
  getBalance as getSafePixBalance,
  type CreateWithdrawalOptions,
  type PixKeyType,
  type SafePixCreds,
  type SafePixWithdrawalResult,
} from "./providers/safepix";
import {
  createWithdrawal as pluggouCreateWithdrawal,
  getBalance as getPluggouBalance,
} from "./providers/pluggou";
import {
  createWithdrawal as pixzyCreateWithdrawal,
  getBalance as getPixzyBalance,
} from "./providers/pixzy";
import {
  isAutoWithdrawKilled,
  isAutoWithdrawBreakerOpen,
  recordAutoWithdrawSuccess,
  recordAutoWithdrawFailure,
  parseSafepixIpAuthError,
  recordAutoWithdrawBlockedIp,
  clearAutoWithdrawBlockedIps,
} from "./system-flags";

function killSwitchOn(): boolean {
  return process.env.AUTO_WITHDRAW_DISABLED === "1";
}

/** Adquirentes de PIX-OUT (saque automático via API). SafePix + Pluggou + Pixzy.
 *  FlevoPay foi removido em jul/2026 (nunca mais integrar). */
type PayoutProvider = "safepix" | "pluggou" | "pixzy";

/** Resolve a família da adquirente pelo code (ex: "pluggou-black" → "pluggou"). */
function payoutProviderOf(code: string): PayoutProvider | null {
  if (code.startsWith("safepix")) return "safepix";
  if (code.startsWith("pluggou")) return "pluggou";
  if (code.startsWith("pixzy")) return "pixzy";
  return null;
}

/** Lê o saldo da conta usando a API correta pra família dela. */
function getBalanceFor(provider: PayoutProvider, creds: SafePixCreds) {
  if (provider === "pluggou") return getPluggouBalance(creds);
  if (provider === "pixzy") return getPixzyBalance(creds);
  return getSafePixBalance(creds);
}

/** Cria o saque na API correta pra família da conta. */
function createWithdrawalFor(
  provider: PayoutProvider,
  opts: CreateWithdrawalOptions,
  creds: SafePixCreds,
): Promise<SafePixWithdrawalResult> {
  if (provider === "pluggou") return pluggouCreateWithdrawal(opts, creds);
  if (provider === "pixzy") return pixzyCreateWithdrawal(opts, creds);
  return safePixCreateWithdrawal(opts, creds);
}

/** Webhook de TRANSFERÊNCIA (postback do saque) por família. Pluggou e Pixzy
 *  usam webhook UNIFICADO (mesmo endpoint pra tx e saque, discrimina por
 *  event/event_type). SafePix tem endpoint dedicado pra transfer. */
function transferPostbackFor(provider: PayoutProvider, appUrl: string): string {
  if (provider === "pluggou") return `${appUrl}/api/webhooks/pluggou`;
  if (provider === "pixzy") return `${appUrl}/api/webhooks/pixzy`;
  return `${appUrl}/api/webhooks/safepix-transfer`;
}

type PayoutAccount = {
  provider: PayoutProvider;
  code: string;
  publicKey: string;
  secretKey: string;
  balanceCents: number;
};

/**
 * Acha TODAS as contas de PIX-OUT (SafePix + Pluggou) com saldo >= payoutCents.
 * Lê os saldos EM PARALELO e devolve a lista das que cobrem o valor, da MAIS
 * CHEIA pra menos cheia. Vazio = nenhuma conta sozinha cobre. O caller tenta uma
 * por uma (se a 1ª falhar — ex: transferência desabilitada/IP — cai pra próxima).
 */
async function findAccountsWithBalance(
  payoutCents: number,
): Promise<PayoutAccount[]> {
  // 24/07/2026 (davi): 'Para de usar a pixzy como pix out para saques dos
  // players'. Pixzy fica SO como PIX-IN (cobranca). Nao aparece mais no pool
  // de saques automaticos. Type/functions do pixzy no arquivo ficam pra
  // fallback futuro (basta re-incluir no OR abaixo).
  const accts = await prisma.acquirer.findMany({
    where: {
      OR: [
        { code: { startsWith: "safepix" } },
        { code: { startsWith: "pluggou" } },
      ],
      active: true,
      supportsPix: true,
      publicKey: { not: null },
      secretKeyEnc: { not: null },
    },
    orderBy: { code: "asc" },
    select: { code: true, publicKey: true, secretKeyEnc: true },
  });

  const checked = await Promise.all(
    accts.map(async (a): Promise<PayoutAccount | null> => {
      const provider = payoutProviderOf(a.code);
      if (!provider || !a.publicKey || !a.secretKeyEnc) return null;
      try {
        const secretKey = decryptString(a.secretKeyEnc);
        const bal = await getBalanceFor(provider, {
          publicKey: a.publicKey,
          secretKey,
        });
        return {
          provider,
          code: a.code,
          publicKey: a.publicKey,
          secretKey,
          balanceCents: bal.amountCents,
        };
      } catch (e) {
        console.error(
          `[auto-withdraw] saldo falhou ${a.code}:`,
          e instanceof Error ? e.message : e,
        );
        return null;
      }
    }),
  );

  // 22/07/2026 (davi: "tem que puxar o saldo real"): removi dedup por
  // (provider + balanceCents) — era fragil. Falso positivo quando 2 contas
  // legit tinham saldo identico por acaso (nao tentava sacar da 2a).
  // Cada conta com saldo suficiente vai pra fila; se por acaso compartilham
  // pool na PSP, o 2o saque falha com "saldo insuficiente" e o auto-loop
  // avanca pra proxima conta — mesmo comportamento antigo, sem risco de
  // pular conta legit por dedup errado.
  return checked
    .filter(
      (c): c is PayoutAccount => c !== null && c.balanceCents >= payoutCents,
    )
    .sort((a, b) => b.balanceCents - a.balanceCents);
}

function isTimeoutError(e: unknown): boolean {
  if (e instanceof Error) {
    if (e.name === "AbortError" || e.name === "TimeoutError") return true;
    if (/timeout|abort/i.test(e.message)) return true;
  }
  return false;
}

export type AutoWithdrawOutcome = {
  attempted: boolean;
  status: "paid" | "processing" | "skipped" | "reverted";
  reason?: string;
};

/**
 * Tenta enviar o saque PENDING automaticamente. Best-effort — nunca lança.
 * Em qualquer problema o saque fica PENDING (manual).
 *
 * opts.adminOverride: quando o ADMIN clica "Retry" no painel — ignora os freios
 * de conveniência (seller sem auto ligado, teto diário, circuit breaker), já que
 * é uma ação deliberada por saque. AINDA respeita: kill-switch global e seller
 * bloqueado (segurança real).
 */
export async function tryAutoWithdraw(
  withdrawalId: string,
  opts: { adminOverride?: boolean } = {},
): Promise<AutoWithdrawOutcome> {
  const adminOverride = opts.adminOverride === true;
  try {
    if (killSwitchOn()) return { attempted: false, status: "skipped", reason: "kill_switch" };

    const w = await prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      select: {
        id: true,
        userId: true,
        amountCents: true,
        feeCents: true,
        method: true,
        status: true,
        pixKey: true,
        pixKeyType: true,
        user: {
          select: {
            autoWithdrawEnabled: true,
            autoWithdrawDailyLimitCents: true,
            blocked: true,
          },
        },
      },
    });
    if (!w || w.status !== "PENDING" || w.method !== "pix") {
      return { attempted: false, status: "skipped", reason: "not_eligible" };
    }
    if (w.user.blocked) {
      return { attempted: false, status: "skipped", reason: "blocked" };
    }
    if (!adminOverride && !w.user.autoWithdrawEnabled) {
      return { attempted: false, status: "skipped", reason: "disabled" };
    }
    if (!w.pixKey) {
      return { attempted: false, status: "skipped", reason: "no_pix_key" };
    }

    // ===== FIRST-WITHDRAWAL HOLD (16/07/2026, pós-fraude) =====
    // Pentester ia sacar R$1952 no PRIMEIRO saque, oriundo de vendas
    // forjadas via webhook safepix. Política nova: primeiro saque de todo
    // seller SEMPRE em manual review — admin humano olha antes de aprovar.
    if (!adminOverride) {
      const paidCount = await prisma.withdrawal.count({
        where: { userId: w.userId, status: "PAID" },
      });
      if (paidCount === 0) {
        return {
          attempted: false,
          status: "skipped",
          reason: "first_withdrawal_manual_review",
        };
      }
    }

    // ===== INTEGRIDADE PLATAFORMA (16/07/2026, pós-fraude) =====
    // Cross-check: soma dos saldos INTERNOS de todos os sellers vs. soma
    // do saldo REAL em todas as adquirentes. Se interno > real (drift positivo
    // grande), alguém forjou vendas na plataforma → BLOQUEIA saque
    // automático até admin investigar. Cache 60s pra não sobrecarregar.
    // Fail-open se >50% das contas não responderem.
    // NÃO PULA quando adminOverride=true — o admin já viu o warning ao
    // aprovar; se ele apertou pra reenviar, é decisão consciente.
    if (!adminOverride) {
      const { checkPlatformBalanceIntegrity } = await import(
        "./pre-withdrawal-integrity"
      );
      const integrity = await checkPlatformBalanceIntegrity();
      if (!integrity.ok) {
        console.error(
          "[auto-withdraw] BLOQUEADO por integrity check",
          integrity,
        );
        return {
          attempted: false,
          status: "skipped",
          reason: `platform_balance_integrity_check_failed`,
        };
      }
    }

    // FORCE CAJU (10/07/2026, david): sellers com Caju como adquirente
    // disponivel sacam via Caju/Pagar.me quando ha PIN+TOTP configurado.
    // Fallback pra SafePix/Pluggou se nenhuma sub-key Caju tem creds.
    //
    // JANELA revertida (11/07/2026, david: "saque precisa ser instantaneo
    // para todos 24/7"). Antes bloqueavamos fora de 08:00-16:59 BR em dia
    // util — removido. Saque roda a qualquer hora, todo dia.
    const { sellerHasCajuAvailable } = await import("./caju-window");
    const hasCaju = await sellerHasCajuAvailable(w.userId);

    // Payout = valor − taxa (igual ao que o admin enviaria manual).
    const payoutCents = Math.max(0, w.amountCents - (w.feeCents ?? 0));
    if (payoutCents <= 0) return { attempted: false, status: "skipped", reason: "zero_payout" };

    // TETO DIÁRIO: 0 (ou negativo) = SEM LIMITE (default jun/2026 — todos os
    // sellers têm saque instantâneo sem teto). Só checa quando o admin setou um
    // valor >0 pra reimpor teto a um seller específico. A trava REAL contra
    // over-withdrawal é a auditoria reconciliada em requestWithdrawal, que roda
    // ANTES e bloqueia sacar mais do que entrou — independente deste teto.
    const dailyLimit = w.user.autoWithdrawDailyLimitCents;
    if (!adminOverride && dailyLimit > 0) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayAgg = await prisma.withdrawal.aggregate({
        where: {
          userId: w.userId,
          providerAccount: { not: null },
          createdAt: { gte: startOfDay },
          status: { in: ["PROCESSING", "PAID"] },
        },
        _sum: { amountCents: true },
      });
      const usedToday = todayAgg._sum.amountCents ?? 0;
      if (usedToday + w.amountCents > dailyLimit) {
        return { attempted: false, status: "skipped", reason: "daily_limit" };
      }
    }

    // KILL-SWITCH GLOBAL (DB) + CIRCUIT BREAKER — freios além do env. Checados
    // logo antes de gastar (ler saldos + enviar). Qualquer um ligado → manual.
    if (await isAutoWithdrawKilled()) {
      return { attempted: false, status: "skipped", reason: "kill_switch_db" };
    }
    if (!adminOverride && (await isAutoWithdrawBreakerOpen())) {
      return { attempted: false, status: "skipped", reason: "breaker_open" };
    }

    // ===== FORCE CAJU (10/07/2026) =====
    // Se o seller tem qualquer sub-key Caju disponivel, o payout DEVE sair
    // pela Caju (Pagar.me/Woovi). Sem fallback pra SafePix/Pluggou.
    //
    // EXCECAO (safety net 10/07/2026): se NENHUMA sub-key Caju tem
    // metadataEnc configurado (PIN + TOTP), cai pro fluxo antigo (SafePix/
    // Pluggou) pra nao quebrar saques em producao ate o admin configurar.
    // Sem isso, sellers com Caju ficariam TODOS em manual do dia pra noite.
    if (hasCaju) {
      const anyCajuHasPinTotp = await prisma.acquirer.count({
        where: {
          code: { startsWith: "caju" },
          active: true,
          supportsPix: true,
          metadataEnc: { not: null },
        },
      });
      if (anyCajuHasPinTotp > 0) {
        return await dispatchCajuWithdrawal({
          withdrawalId,
          userId: w.userId,
          payoutCents,
          pixKey: w.pixKey,
          pixKeyType: (w.pixKeyType as PixKeyType) || "evp",
        });
      }
      // Sem nenhuma Caju com PIN+TOTP configurado — log de warning e
      // cai pro fluxo SafePix/Pluggou pra nao travar saque.
      console.warn(
        `[auto-withdraw] seller ${w.userId} tem Caju mas nenhuma sub-key Caju ` +
          `tem PIN+TOTP configurado (metadataEnc). Fallback pra SafePix/Pluggou. ` +
          `Rode: npx tsx scripts/set-caju-pin-2fa.ts <code> <pin> <totp>`,
      );
    }

    // Acha TODAS as contas com saldo (mais cheia primeiro). Nenhuma sozinha
    // cobrindo → manual.
    const candidates = await findAccountsWithBalance(payoutCents);
    if (candidates.length === 0) {
      return { attempted: false, status: "skipped", reason: "no_account_with_balance" };
    }

    // TRANSIÇÃO ATÔMICA PENDING→PROCESSING (idempotência: só 1 processo envia).
    const claim = await prisma.withdrawal.updateMany({
      where: { id: withdrawalId, status: "PENDING" },
      data: { status: "PROCESSING", providerAccount: candidates[0].code },
    });
    if (claim.count === 0) {
      return { attempted: false, status: "skipped", reason: "already_claimed" };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";

    // Tenta cada conta em ordem. Se uma falhar com erro CLARO (ex: "Transferencia
    // desabilitada" naquela conta, saldo insuficiente) tenta a PRÓXIMA com saldo
    // — assim uma conta com transferência desligada NÃO trava o saque se outra
    // cobre. Timeout AMBÍGUO para tudo (pode ter saído — evita saque duplo).
    let lastError = "";
    for (const acct of candidates) {
      // Marca a conta da tentativa atual (pra auditoria/reconcile).
      await prisma.withdrawal
        .update({ where: { id: withdrawalId }, data: { providerAccount: acct.code } })
        .catch(() => {});
      try {
        // metadata.withdrawal_id → o webhook de transferência correlaciona.
        // Usa a API + o postback da SafePix.
        const res = await createWithdrawalFor(
          acct.provider,
          {
            amountReais: payoutCents / 100,
            pixKey: w.pixKey,
            pixKeyType: (w.pixKeyType as PixKeyType) || "evp",
            postbackUrl: transferPostbackFor(acct.provider, appUrl),
            metadata: { withdrawal_id: withdrawalId },
          },
          { publicKey: acct.publicKey, secretKey: acct.secretKey },
        );
        // SUCESSO: guarda providerId, zera breaker/IP e marca PAGO (enviado=pago).
        await prisma.withdrawal
          .update({ where: { id: withdrawalId }, data: { providerId: res.id } })
          .catch(() => {});
        await recordAutoWithdrawSuccess();
        await clearAutoWithdrawBlockedIps();
        try {
          const { markWithdrawalPaid } = await import("./withdrawals");
          await markWithdrawalPaid(withdrawalId);
        } catch (e) {
          console.error("[auto-withdraw] markWithdrawalPaid falhou:", e);
          return { attempted: true, status: "processing" };
        }
        return { attempted: true, status: "paid" };
      } catch (e) {
        if (isTimeoutError(e)) {
          // AMBÍGUO: pode ter sido criado NESSA conta. NÃO tenta outra, NÃO
          // estorna — fica PROCESSING; webhook/reconcile/admin resolvem.
          await prisma.withdrawal
            .update({
              where: { id: withdrawalId },
              data: { failReason: `auto: timeout no envio (${acct.code}) — verificar na ${acct.provider}` },
            })
            .catch(() => {});
          return { attempted: true, status: "processing", reason: "timeout_ambiguous" };
        }
        // ERRO CLARO nessa conta → registra e tenta a PRÓXIMA conta com saldo.
        lastError = e instanceof Error ? e.message : String(e);
        const blockedIp = parseSafepixIpAuthError(lastError);
        if (blockedIp) await recordAutoWithdrawBlockedIp(blockedIp, acct.code);
        console.warn(
          `[auto-withdraw] conta ${acct.code} falhou: ${lastError.slice(0, 140)} — tentando próxima`,
        );
      }
    }

    // Todas as contas com saldo falharam (erro claro) → volta pra PENDING (manual)
    // + conta no circuit breaker.
    await prisma.withdrawal.updateMany({
      where: { id: withdrawalId, status: "PROCESSING", providerId: null },
      data: {
        status: "PENDING",
        failReason: `auto falhou (todas as contas com saldo): ${lastError.slice(0, 240)}`,
      },
    });
    await recordAutoWithdrawFailure();
    return { attempted: true, status: "reverted", reason: lastError.slice(0, 120) };
  } catch (e) {
    console.error(
      "[auto-withdraw] erro inesperado:",
      e instanceof Error ? e.message : e,
    );
    return { attempted: false, status: "skipped", reason: "unexpected_error" };
  }
}

/**
 * DISPATCH CAJU (10/07/2026): sellers com Caju sacam SO por essa rota.
 *
 * Regras:
 *  - Percorre as sub-keys Caju do seller (via privateAllowedEmails).
 *  - Cada Acquirer Caju precisa de metadataEnc com { pin, totp_secret }
 *    — senao pula essa e tenta a proxima.
 *  - Auto-approve = true (Caju cria + aprova na mesma chamada).
 *  - Sucesso: marca Withdrawal.PAID. Falha em TODAS: volta pra PENDING (manual).
 */
async function dispatchCajuWithdrawal(input: {
  withdrawalId: string;
  userId: string;
  payoutCents: number;
  pixKey: string;
  pixKeyType: PixKeyType;
}): Promise<AutoWithdrawOutcome> {
  const { withdrawalId, userId, payoutCents, pixKey, pixKeyType } = input;

  // Sub-keys visiveis pro seller (respeitando privateAllowedEmails).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const email = (user?.email ?? "").trim().toLowerCase();

  const acquirers = await prisma.acquirer.findMany({
    where: {
      code: { startsWith: "caju" },
      active: true,
      supportsPix: true,
      globalEnabled: true,
      secretKeyEnc: { not: null },
      metadataEnc: { not: null },
    },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      isPrivate: true,
      privateAllowedEmails: true,
      secretKeyEnc: true,
      metadataEnc: true,
    },
  });
  const eligible = acquirers.filter((a) => {
    if (!a.isPrivate) return true;
    return (a.privateAllowedEmails ?? [])
      .map((e) => e.trim().toLowerCase())
      .includes(email);
  });

  if (eligible.length === 0) {
    return {
      attempted: false,
      status: "skipped",
      reason: "caju_no_eligible_subkey",
    };
  }

  // ATOMIC claim PENDING → PROCESSING
  const claim = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: "PENDING" },
    data: { status: "PROCESSING", providerAccount: eligible[0].code },
  });
  if (claim.count === 0) {
    return { attempted: false, status: "skipped", reason: "already_claimed" };
  }

  const { createWithdrawal: cajuCreateWithdrawal } = await import(
    "./providers/caju"
  );

  let lastError = "";
  for (const acq of eligible) {
    // Decode + parse metadataEnc pra { pin, totp_secret }.
    let pin: string, totpSecret: string, secretKey: string;
    try {
      secretKey = decryptString(acq.secretKeyEnc!);
      const meta = JSON.parse(decryptString(acq.metadataEnc!)) as {
        pin?: string;
        totp_secret?: string;
      };
      pin = String(meta.pin ?? "").trim();
      totpSecret = String(meta.totp_secret ?? "").trim();
      if (!pin || !totpSecret) throw new Error("pin/totp_secret ausente");
    } catch (e) {
      lastError = `metadataEnc invalido em ${acq.code}: ${e instanceof Error ? e.message : e}`;
      console.warn(`[auto-withdraw caju] ${lastError}`);
      continue;
    }

    try {
      await prisma.withdrawal
        .update({
          where: { id: withdrawalId },
          data: { providerAccount: acq.code },
        })
        .catch(() => {});

      const res = await cajuCreateWithdrawal(
        {
          amountReais: payoutCents / 100,
          pixKey,
          pixKeyType,
          autoApprove: true,
          comment: "Saque Trilho",
        },
        { secretKey, pin, totpSecret },
      );

      await prisma.withdrawal
        .update({ where: { id: withdrawalId }, data: { providerId: res.id } })
        .catch(() => {});
      await recordAutoWithdrawSuccess();

      // Marca PAID (Caju auto-aprovou; webhook posterior confirma).
      try {
        const { markWithdrawalPaid } = await import("./withdrawals");
        await markWithdrawalPaid(withdrawalId);
      } catch (e) {
        console.error("[auto-withdraw caju] markWithdrawalPaid falhou:", e);
        return { attempted: true, status: "processing" };
      }
      return { attempted: true, status: "paid" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isTimeoutError(e)) {
        await prisma.withdrawal
          .update({
            where: { id: withdrawalId },
            data: {
              failReason: `caju: timeout no envio (${acq.code}) — verificar na Caju`,
            },
          })
          .catch(() => {});
        return {
          attempted: true,
          status: "processing",
          reason: "timeout_ambiguous",
        };
      }
      // Saldo insuficiente numa sub-key → tenta a proxima.
      lastError = msg;
      console.warn(
        `[auto-withdraw caju] ${acq.code} falhou: ${msg.slice(0, 140)} — tenta proxima`,
      );
    }
  }

  // Todas as sub-keys Caju falharam → volta pra PENDING (admin resolve).
  await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: "PROCESSING", providerId: null },
    data: {
      status: "PENDING",
      failReason: `caju auto falhou em todas sub-keys: ${lastError.slice(0, 240)}`,
    },
  });
  await recordAutoWithdrawFailure();
  return {
    attempted: true,
    status: "reverted",
    reason: lastError.slice(0, 120),
  };
}
