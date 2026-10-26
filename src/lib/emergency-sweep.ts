/**
 * SAQUE DE EMERGÊNCIA (tesouraria) — varre o saldo de TODAS as contas SafePix
 * de uma vez e manda 100% (ou 50%) pra UMA chave PIX FIXA.
 *
 * ⚠️ É uma operação de TESOURARIA, separada do saldo dos sellers: ela esvazia
 * as ADQUIRENTES (o dinheiro real parado na SafePix) — NÃO mexe no balanceCents
 * de nenhum seller. Uso exclusivo do admin em emergência.
 *
 * SEGURANÇA:
 *  - A chave PIX de destino é HARDCODED aqui (EMERGENCY_PIX_KEY). NUNCA vem de
 *    UI, request ou banco — não tem como ser trocada por ninguém sem editar
 *    este arquivo. Foi pedido explícito: "essa chave não pode mudar NUNCA".
 *  - Os saques saem pelo proxy de IP fixo (SAFEPIX_PROXY_URL), já dentro do
 *    createWithdrawal — então caem do IP autorizado na SafePix.
 *  - Best-effort por conta: erro numa conta não impede as outras; tudo volta
 *    num relatório por conta.
 */
import { prisma } from "./prisma";
import { decryptString } from "./crypto";
import {
  createWithdrawal,
  getBalance as getSafePixBalance,
  type PixKeyType,
} from "./providers/safepix";

/** 🔒 DESTINO FIXO E IMUTÁVEL do saque de emergência. NÃO ALTERAR sem ordem. */
export const EMERGENCY_PIX_KEY = "12a92785-79a8-471a-8496-4ecb180433c9";
export const EMERGENCY_PIX_KEY_TYPE: PixKeyType = "evp";

export type SweepAccountResult = {
  account: string;
  balanceCents: number;
  sentCents: number;
  status: "sent" | "skipped" | "error";
  providerId?: string;
  error?: string;
};

export type EmergencySweepResult = {
  percent: 50 | 100;
  pixKey: string;
  totalSentCents: number;
  accounts: SweepAccountResult[];
};

export type AmountSweepResult = {
  requestedCents: number;
  pixKey: string;
  totalSentCents: number;
  accounts: SweepAccountResult[];
};

/**
 * Executa o sweep. Lê o saldo de cada conta SafePix e transfere `percent`%
 * (100 ou 50) pra EMERGENCY_PIX_KEY. Sequencial (não martela a SafePix/proxy).
 */
export async function emergencySweep(
  percent: 50 | 100,
): Promise<EmergencySweepResult> {
  const accts = await prisma.acquirer.findMany({
    where: {
      code: { startsWith: "safepix" },
      active: true,
      supportsPix: true,
      publicKey: { not: null },
      secretKeyEnc: { not: null },
    },
    orderBy: { code: "asc" },
    select: { code: true, publicKey: true, secretKeyEnc: true },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
  const results: SweepAccountResult[] = [];

  for (const a of accts) {
    if (!a.publicKey || !a.secretKeyEnc) continue;

    let creds: { publicKey: string; secretKey: string };
    try {
      creds = { publicKey: a.publicKey, secretKey: decryptString(a.secretKeyEnc) };
    } catch {
      results.push({
        account: a.code,
        balanceCents: 0,
        sentCents: 0,
        status: "error",
        error: "credenciais inválidas (decrypt falhou)",
      });
      continue;
    }

    // Saldo atual da conta (lido AO VIVO no momento do sweep).
    let balanceCents = 0;
    try {
      const bal = await getSafePixBalance(creds);
      balanceCents = bal.amountCents;
    } catch (e) {
      results.push({
        account: a.code,
        balanceCents: 0,
        sentCents: 0,
        status: "error",
        error: "saldo: " + (e instanceof Error ? e.message.slice(0, 120) : "?"),
      });
      continue;
    }

    // 100% = saldo inteiro; 50% = metade (floor pra não exceder).
    const sendCents =
      percent === 100 ? balanceCents : Math.floor(balanceCents / 2);
    if (sendCents <= 0) {
      results.push({ account: a.code, balanceCents, sentCents: 0, status: "skipped" });
      continue;
    }

    try {
      const res = await createWithdrawal(
        {
          amountReais: sendCents / 100,
          pixKey: EMERGENCY_PIX_KEY,
          pixKeyType: EMERGENCY_PIX_KEY_TYPE,
          postbackUrl: `${appUrl}/api/webhooks/safepix-transfer`,
          metadata: { emergency_sweep: "1", account: a.code },
        },
        creds,
      );
      results.push({
        account: a.code,
        balanceCents,
        sentCents: sendCents,
        status: "sent",
        providerId: res.id,
      });
    } catch (e) {
      results.push({
        account: a.code,
        balanceCents,
        sentCents: 0,
        status: "error",
        error: e instanceof Error ? e.message.slice(0, 160) : "?",
      });
    }
  }

  return {
    percent,
    pixKey: EMERGENCY_PIX_KEY,
    totalSentCents: results.reduce((s, r) => s + r.sentCents, 0),
    accounts: results,
  };
}

/**
 * Saca um VALOR FIXO (em cents) das contas SafePix pra EMERGENCY_PIX_KEY.
 * Usado pelo saque do LUCRO do gateway: o valor já vem calculado (lucro
 * sacável) e aqui apenas distribuímos a retirada entre as contas até somar
 * `requestedCents`. Pega de cada conta o mínimo entre o que falta e o saldo
 * live dela. A chave de destino continua HARDCODED e imutável.
 */
export async function sweepAmountToEmergencyPix(
  requestedCents: number,
): Promise<AmountSweepResult> {
  const requested = Math.floor(requestedCents);
  if (!Number.isFinite(requested) || requested <= 0) {
    return {
      requestedCents: 0,
      pixKey: EMERGENCY_PIX_KEY,
      totalSentCents: 0,
      accounts: [],
    };
  }

  const accts = await prisma.acquirer.findMany({
    where: {
      code: { startsWith: "safepix" },
      active: true,
      supportsPix: true,
      publicKey: { not: null },
      secretKeyEnc: { not: null },
    },
    orderBy: { code: "asc" },
    select: { code: true, publicKey: true, secretKeyEnc: true },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
  const results: SweepAccountResult[] = [];
  let remaining = requested;

  for (const a of accts) {
    if (remaining <= 0) break;
    if (!a.publicKey || !a.secretKeyEnc) continue;

    let creds: { publicKey: string; secretKey: string };
    try {
      creds = { publicKey: a.publicKey, secretKey: decryptString(a.secretKeyEnc) };
    } catch {
      results.push({
        account: a.code,
        balanceCents: 0,
        sentCents: 0,
        status: "error",
        error: "credenciais inválidas (decrypt falhou)",
      });
      continue;
    }

    let balanceCents = 0;
    try {
      const bal = await getSafePixBalance(creds);
      balanceCents = bal.amountCents;
    } catch (e) {
      results.push({
        account: a.code,
        balanceCents: 0,
        sentCents: 0,
        status: "error",
        error: "saldo: " + (e instanceof Error ? e.message.slice(0, 120) : "?"),
      });
      continue;
    }

    const sendCents = Math.min(remaining, balanceCents);
    if (sendCents <= 0) {
      results.push({ account: a.code, balanceCents, sentCents: 0, status: "skipped" });
      continue;
    }

    try {
      const res = await createWithdrawal(
        {
          amountReais: sendCents / 100,
          pixKey: EMERGENCY_PIX_KEY,
          pixKeyType: EMERGENCY_PIX_KEY_TYPE,
          postbackUrl: `${appUrl}/api/webhooks/safepix-transfer`,
          metadata: { profit_sweep: "1", account: a.code },
        },
        creds,
      );
      results.push({
        account: a.code,
        balanceCents,
        sentCents: sendCents,
        status: "sent",
        providerId: res.id,
      });
      remaining -= sendCents;
    } catch (e) {
      results.push({
        account: a.code,
        balanceCents,
        sentCents: 0,
        status: "error",
        error: e instanceof Error ? e.message.slice(0, 160) : "?",
      });
    }
  }

  return {
    requestedCents: requested,
    pixKey: EMERGENCY_PIX_KEY,
    totalSentCents: results.reduce((s, r) => s + r.sentCents, 0),
    accounts: results,
  };
}
