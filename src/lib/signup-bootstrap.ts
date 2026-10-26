import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { buildModeDefaultPatch } from "./mode-defaults";

/**
 * Lógica COMPARTILHADA de bootstrap de seller novo — fonte única de verdade
 * pras taxas-padrão e pro attach-referral. Email e Google/OAuth chamam isto,
 * pra nunca mais divergir (o bug era exatamente os dois fluxos terem cópias
 * separadas: o email aplicava PlatformDefaults + referral, o Google não).
 */

/**
 * Monta o patch de TAXAS-PADRÃO da plataforma pra um seller novo. Combina DUAS
 * fontes, ambas editáveis pelo admin em /admin01/taxas-padrao:
 *
 *   1. BASE: PlatformDefaults (linha única global) — cobre boleto/applePay/
 *      googlePay + base de PIX/cartão/saque.
 *   2. OVERLAY: PlatformModeDefaults[modo] (Black/White/Hot) — é a tela que o
 *      admin de fato mexe. SOBRESCREVE PIX/cartão/saque/retenção/holding do
 *      MODO do seller. Default "black" (modo de quem ainda não escolheu).
 *
 * Antes só aplicava a BASE global — então quem caía direto pelo hook (cadastro
 * GOOGLE/OAuth, que não passa pela escolha de modo) ficava com as taxas globais
 * desatualizadas em vez das taxas POR MODO que o admin configurou. Agora os dois
 * fluxos (email e Google) nascem com a taxa-padrão correta do modo.
 *
 * Só aplica se o user NÃO tiver referrer: quem veio por indicação herda
 * linkDefault* do referrer (via attachReferralByCode) e isso NUNCA pode ser
 * sobrescrito aqui. Retorna {} quando o user já tem referrer.
 *
 * Garante a linha PlatformDefaults (upsert idempotente). `modeHint` força o modo
 * (usado no cadastro por email, que sabe o modo escolhido antes de gravá-lo);
 * sem ele, lê o pixOpsMode atual do user (black por padrão).
 */
export async function platformDefaultFeePatch(
  userId: string,
  modeHint?: string,
): Promise<Prisma.UserUpdateInput> {
  const [defaults, me] = await Promise.all([
    prisma.platformDefaults.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { referredByUserId: true, pixOpsMode: true },
    }),
  ]);

  // Veio por indicação → mantém as taxas do referrer (linkDefault*).
  if (me?.referredByUserId) return {};

  const base: Prisma.UserUpdateInput = {
    feePercent: defaults.feePercent,
    feeFixedCents: defaults.feeFixedCents,
    cardFeePercent: defaults.cardFeePercent,
    cardFeeFixedCents: defaults.cardFeeFixedCents,
    boletoFeePercent: defaults.boletoFeePercent,
    boletoFeeFixedCents: defaults.boletoFeeFixedCents,
    applePayFeePercent: defaults.applePayFeePercent,
    applePayFeeFixedCents: defaults.applePayFeeFixedCents,
    googlePayFeePercent: defaults.googlePayFeePercent,
    googlePayFeeFixedCents: defaults.googlePayFeeFixedCents,
    withdrawalFeeCents: defaults.withdrawalFeeCents,
  };

  // Overlay POR MODO (PlatformModeDefaults) — o que o admin edita na tela.
  // Sem includeOpsConfig: a config black-ops (desvio/reembolso fake) NUNCA é
  // aplicada automaticamente no signup (só quando o admin aplica o modo à mão).
  const mode = modeHint ?? me?.pixOpsMode ?? "black";
  const modePatch = await buildModeDefaultPatch(mode);

  return { ...base, ...modePatch };
}

/**
 * Vincula `userId` como REFERIDO do dono de `code` (referralCode). Espelha
 * /api/signup/attach-referral:
 *  - herda linkDefault* (fallback pras taxas do próprio referrer quando null)
 *  - aplica o deviation default do referrer (rede passiva)
 *  - é ATÔMICO: só seta se referredByUserId atualmente null (anti-fraude +
 *    idempotência — re-chamar não re-atribui)
 * Segurança: self-referral e loop bloqueados.
 */
export async function attachReferralByCode(
  userId: string,
  code: string,
): Promise<{ ok: boolean; reason?: string }> {
  const [refUser, currentUser] = await Promise.all([
    prisma.user.findUnique({
      where: { referralCode: code },
      select: {
        id: true,
        referredByUserId: true,
        referralDeviationEnabled: true,
        referralDefaultDeviationPercent: true,
        feePercent: true,
        feeFixedCents: true,
        cardFeePercent: true,
        cardFeeFixedCents: true,
        boletoFeePercent: true,
        boletoFeeFixedCents: true,
        applePayFeePercent: true,
        applePayFeeFixedCents: true,
        googlePayFeePercent: true,
        googlePayFeeFixedCents: true,
        withdrawalFeeCents: true,
        linkDefaultFeePercent: true,
        linkDefaultFeeFixedCents: true,
        linkDefaultCardFeePercent: true,
        linkDefaultCardFeeFixedCents: true,
        linkDefaultBoletoFeePercent: true,
        linkDefaultBoletoFeeFixedCents: true,
        linkDefaultApplePayFeePercent: true,
        linkDefaultApplePayFeeFixedCents: true,
        linkDefaultGooglePayFeePercent: true,
        linkDefaultGooglePayFeeFixedCents: true,
        linkDefaultWithdrawalFeeCents: true,
        linkDefaultsByMode: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, referredByUserId: true, pixOpsMode: true },
    }),
  ]);

  if (!refUser) return { ok: false, reason: "invalid_code" };
  if (refUser.id === userId) return { ok: false, reason: "self_referral_blocked" };
  if (refUser.referredByUserId === userId) {
    return { ok: false, reason: "referral_loop_blocked" };
  }

  // As "taxas default do link" hoje são salvas POR MODO de adquirente, no JSON
  // linkDefaultsByMode (engrenagem em /dashboard/rede → updateLinkDefaultsByMode).
  // Os campos flat linkDefault* abaixo são LEGADO e ficam null nessa UI nova —
  // por isso, sem ler o JSON, o indicado nascia com a taxa do PRÓPRIO referrer
  // em vez da taxa default do link. Precedência por campo:
  //   linkDefaultsByMode[modo do indicado]  >  flat linkDefault*  >  taxa do referrer
  // O indicado novo nasce em "black" (schema default). Cartão só existe no white,
  // então o flat de cartão usa o default White (pronto pra quando ele trocar de
  // modo). Saque continua vindo do linkDefaultWithdrawalFeeCents.
  const lbm =
    refUser.linkDefaultsByMode &&
    typeof refUser.linkDefaultsByMode === "object" &&
    !Array.isArray(refUser.linkDefaultsByMode)
      ? (refUser.linkDefaultsByMode as Record<
          string,
          { pixPct?: number; pixFix?: number; cardPct?: number; cardFix?: number }
        >)
      : null;
  const signupMode = currentUser?.pixOpsMode ?? "black";
  const modePix = lbm?.[signupMode];
  const whiteCard = lbm?.white;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const feeOverrides = {
    feePercent:
      num(modePix?.pixPct) ?? refUser.linkDefaultFeePercent ?? refUser.feePercent,
    feeFixedCents:
      num(modePix?.pixFix) ??
      refUser.linkDefaultFeeFixedCents ??
      refUser.feeFixedCents,
    cardFeePercent:
      num(whiteCard?.cardPct) ??
      refUser.linkDefaultCardFeePercent ??
      refUser.cardFeePercent,
    cardFeeFixedCents:
      num(whiteCard?.cardFix) ??
      refUser.linkDefaultCardFeeFixedCents ??
      refUser.cardFeeFixedCents,
    boletoFeePercent:
      refUser.linkDefaultBoletoFeePercent ?? refUser.boletoFeePercent,
    boletoFeeFixedCents:
      refUser.linkDefaultBoletoFeeFixedCents ?? refUser.boletoFeeFixedCents,
    applePayFeePercent:
      refUser.linkDefaultApplePayFeePercent ?? refUser.applePayFeePercent,
    applePayFeeFixedCents:
      refUser.linkDefaultApplePayFeeFixedCents ?? refUser.applePayFeeFixedCents,
    googlePayFeePercent:
      refUser.linkDefaultGooglePayFeePercent ?? refUser.googlePayFeePercent,
    googlePayFeeFixedCents:
      refUser.linkDefaultGooglePayFeeFixedCents ?? refUser.googlePayFeeFixedCents,
    withdrawalFeeCents:
      refUser.linkDefaultWithdrawalFeeCents ?? refUser.withdrawalFeeCents,
  };

  const autoDeviation =
    refUser.referralDeviationEnabled &&
    refUser.referralDefaultDeviationPercent > 0
      ? { referralAppliedDeviationPercent: refUser.referralDefaultDeviationPercent }
      : {};

  const updateResult = await prisma.user.updateMany({
    where: { id: userId, referredByUserId: null },
    data: {
      referredByUserId: refUser.id,
      ...feeOverrides,
      ...autoDeviation,
    },
  });

  if (updateResult.count === 0) {
    return {
      ok: false,
      reason: currentUser?.referredByUserId ? "already_referred" : "user_not_found",
    };
  }

  return { ok: true };
}

/**
 * Roda 1x na CRIAÇÃO de qualquer user novo (chamado do
 * databaseHooks.user.create.after). Dá ao cadastro Google/OAuth a MESMA
 * lógica que o cadastro por email já tinha via os endpoints /api/signup/*:
 *  1. Lê o cookie tp_ref (setado no /signup?ref=) e, se houver, tenta o
 *     attach-referral (herda taxas do referrer).
 *  2. Se o user terminar SEM referrer, aplica as taxas-padrão do
 *     PlatformDefaults (não os defaults estáticos do schema).
 *
 * Idempotente: só roda na criação (o hook é create-only) e o attach é atômico
 * (null-check), então logins subsequentes nunca reaplicam nada. Nunca lança —
 * uma falha aqui não pode quebrar o signup.
 */
export async function bootstrapSignupFromCookies(
  userId: string,
  cookieHeader?: string | null,
): Promise<void> {
  let refCode: string | undefined;

  // Fonte 1: header Cookie cru da request (passado pelo contexto do
  // better-auth). É o caminho confiável no callback OAuth do Google, onde o
  // request chega via navegação top-level com o tp_ref (SameSite=Lax).
  if (cookieHeader) {
    const m = /(?:^|;\s*)tp_ref=([^;]+)/.exec(cookieHeader);
    if (m) {
      try {
        refCode = decodeURIComponent(m[1]).trim();
      } catch {
        refCode = m[1].trim();
      }
    }
  }

  // Fonte 2 (fallback): next/headers, pro cadastro por email (fetch
  // same-origin no request scope do route handler).
  if (!refCode) {
    try {
      const jar = await cookies();
      const raw = jar.get("tp_ref")?.value?.trim();
      if (raw) refCode = raw;
    } catch {
      // Fora de request scope (sem acesso a cookies) → segue só com defaults.
    }
  }

  // Descarta valor de cookie absurdo (mesma faixa do Body do attach-referral).
  if (refCode && (refCode.length < 2 || refCode.length > 40)) refCode = undefined;

  if (refCode) {
    try {
      await attachReferralByCode(userId, refCode);
    } catch (e) {
      console.error("[signup-bootstrap] attachReferral failed", { userId, e });
    }
  }

  try {
    const patch = await platformDefaultFeePatch(userId);
    if (Object.keys(patch).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: patch });
    }
  } catch (e) {
    console.error("[signup-bootstrap] applyPlatformDefaults failed", { userId, e });
  }
}
