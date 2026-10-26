"use server";

import { revalidatePath } from "next/cache";
import { headers, cookies } from "next/headers";
import { randomBytes, createHmac } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  verifyAdminPassword,
  createAdminSession,
  getCurrentAdminSession,
  destroyAdminSession,
  generateTotpSecret,
  verifyTotp,
  markSessionMfaPassed,
  requireAdmin,
  requireAdminWrite,
  logAdminAction,
} from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { rateLimit, PRESETS } from "@/lib/rate-limit";
import {
  ACQUIRER_MODES,
  acquirerModesFor,
  isOpsMode,
  OPS_MODES,
  toOpsMode,
  type OpsMode,
} from "@/lib/ops-modes";

async function clientIpFromHeaders(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

export async function loginAdminAction(email: string, password: string) {
  if (!email || !password) {
    return { ok: false as const, error: "Email e senha obrigatórios." };
  }
  // Anti brute-force severo: 3 tentativas a cada 15 min por IP
  const ip = await clientIpFromHeaders();
  const rl = rateLimit(
    `admin-login:${ip}`,
    PRESETS.adminLogin.limit,
    PRESETS.adminLogin.windowMs,
  );
  if (!rl.ok) {
    return {
      ok: false as const,
      error: `Muitas tentativas. Tente em ${Math.ceil(rl.resetIn / 60_000)} min.`,
    };
  }
  const result = await verifyAdminPassword(email, password);
  if (!result.ok) {
    if (result.reason === "locked") {
      return {
        ok: false as const,
        error: `Conta bloqueada por ${result.minutes} min (senhas erradas demais).`,
      };
    }
    return { ok: false as const, error: "Credenciais inválidas." };
  }
  const admin = result.admin;
  // Se não tem 2FA, cria session sem mfaPassed e manda pro setup
  await createAdminSession(admin.id, false);
  return {
    ok: true as const,
    nextStep: admin.totpSecret ? ("2fa" as const) : ("2fa-setup" as const),
  };
}

export async function logoutAdminAction() {
  // Tira da barra de presença ANTES de matar a sessão — senão o nome do
  // sócio ficaria pendurado como "online" por até 30s depois da saída.
  const r = await getCurrentAdminSession();
  if (r) {
    const { clearPresence } = await import("@/lib/admin-presence");
    await clearPresence(r.admin.id);
  }
  await destroyAdminSession();
  return { ok: true as const };
}

/* ============ PRIMEIRO LOGIN: TROCA DE SENHA ============ */

/**
 * 08/08/2026 (davi): "tambem na primeira vez logando, pergunte se o admin
 * quer alterar a senha dele, se sim da a opcao dele criar senha dele".
 *
 * A pergunta aparece uma vez só (`mustPromptPasswordChange`). Responder —
 * trocando OU recusando — desliga a flag pra sempre.
 */
export async function changeOwnAdminPassword(
  currentPassword: string,
  newPassword: string,
) {
  const r = await requireAdmin();
  if (!r) return { ok: false as const, error: "Não autenticado" };

  if (typeof newPassword !== "string" || newPassword.length < 10) {
    return { ok: false as const, error: "A senha precisa ter 10+ caracteres." };
  }
  const strong =
    /[a-z]/.test(newPassword) &&
    /[A-Z]/.test(newPassword) &&
    /[0-9]/.test(newPassword) &&
    /[^a-zA-Z0-9]/.test(newPassword);
  if (!strong) {
    return {
      ok: false as const,
      error: "Use maiúscula, minúscula, número e símbolo.",
    };
  }

  // Confere a senha atual — evita que alguém que pegou a sessão aberta
  // (máquina destravada) mude a senha e tome a conta.
  const check = await verifyAdminPassword(r.admin.email, currentPassword);
  if (!check.ok) {
    return { ok: false as const, error: "Senha atual incorreta." };
  }
  if (currentPassword === newPassword) {
    return { ok: false as const, error: "A nova senha é igual à atual." };
  }

  const { hashPassword } = await import("@/lib/security/password");
  await prisma.adminAccount.update({
    where: { id: r.admin.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      mustPromptPasswordChange: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  // Derruba as OUTRAS sessões dele: trocar senha tem que expulsar qualquer
  // dispositivo que já estivesse logado.
  await prisma.adminSession.deleteMany({
    where: { adminId: r.admin.id, id: { not: r.session.id } },
  });

  await logAdminAction(r.admin.id, "admin.password.changed");
  return { ok: true as const };
}

/** "Agora não" — não pergunta mais, mantém a senha atual. */
export async function skipAdminPasswordChange() {
  const r = await requireAdmin();
  if (!r) return { ok: false as const, error: "Não autenticado" };
  await prisma.adminAccount.update({
    where: { id: r.admin.id },
    data: { mustPromptPasswordChange: false },
  });
  await logAdminAction(r.admin.id, "admin.password.change_declined");
  return { ok: true as const };
}

/** Assumir o controle de uma aba que outro sócio estava mexendo. */
export async function takeoverAdminTab(pathname: string) {
  const r = await requireAdmin();
  if (!r) return { ok: false as const, error: "Não autenticado" };
  const { heartbeat, normalizePath } = await import("@/lib/admin-presence");
  const state = await heartbeat({
    adminId: r.admin.id,
    sessionId: r.session.id,
    pathname,
    label: "",
    takeover: true,
  });
  await logAdminAction(
    r.admin.id,
    "admin.presence.takeover",
    normalizePath(pathname),
  );
  return { ok: true as const, state };
}

/** Gera secret + retorna URL pra QR. Não persiste ainda. */
export async function startTotpSetup() {
  const r = await getCurrentAdminSession();
  if (!r) return { ok: false as const, error: "Não autenticado" };
  if (r.admin.totpSecret) {
    return { ok: false as const, error: "2FA já configurado" };
  }
  const { base32, otpauthUrl } = generateTotpSecret(r.admin.email);
  // SEGURANÇA: cifra o TOTP secret antes de gravar. Se DB vaza, atacante
  // não consegue gerar códigos válidos sem a APP_ENCRYPTION_KEY.
  const { encryptString } = await import("@/lib/crypto");
  await prisma.adminAccount.update({
    where: { id: r.admin.id },
    data: { totpSecret: encryptString(base32) },
  });
  return { ok: true as const, base32, otpauthUrl };
}

/** Helper: decifra TOTP secret salvo (com fallback pra valores legacy plaintext). */
async function decryptTotpSecret(stored: string): Promise<string> {
  const { decryptString } = await import("@/lib/crypto");
  try {
    return decryptString(stored);
  } catch {
    // Legacy: valor não cifrado (configurado antes da migração)
    return stored;
  }
}

export async function confirmTotpSetup(code: string) {
  const r = await getCurrentAdminSession();
  if (!r) return { ok: false as const, error: "Não autenticado" };
  if (!r.admin.totpSecret) {
    return { ok: false as const, error: "Setup ainda não iniciado" };
  }
  const secret = await decryptTotpSecret(r.admin.totpSecret);
  const ok = verifyTotp(secret, code);
  if (!ok) return { ok: false as const, error: "Código inválido" };
  await markSessionMfaPassed(r.session.id);
  await prisma.adminAccount.update({
    where: { id: r.admin.id },
    data: { lastLoginAt: new Date() },
  });
  await logAdminAction(r.admin.id, "admin.login.2fa_setup_completed");
  return { ok: true as const };
}

export async function verify2faLogin(code: string) {
  const r = await getCurrentAdminSession();
  if (!r) return { ok: false as const, error: "Sessão expirada" };
  if (!r.admin.totpSecret) {
    return { ok: false as const, error: "2FA não configurado" };
  }
  // Anti brute-force: 5 tentativas a cada 5 min por sessão
  const rl = rateLimit(
    `admin-2fa:${r.session.id}`,
    PRESETS.twofa.limit,
    PRESETS.twofa.windowMs,
  );
  if (!rl.ok) {
    return { ok: false as const, error: "Muitas tentativas. Aguarde alguns minutos." };
  }
  const secret2fa = await decryptTotpSecret(r.admin.totpSecret);
  const ok = verifyTotp(secret2fa, code);
  if (!ok) return { ok: false as const, error: "Código inválido" };
  await markSessionMfaPassed(r.session.id);
  await prisma.adminAccount.update({
    where: { id: r.admin.id },
    data: { lastLoginAt: new Date() },
  });
  await logAdminAction(r.admin.id, "admin.login.2fa_passed");
  return { ok: true as const };
}

/* ============ AÇÕES DE GESTÃO ============ */

/**
 * Schema do update de user pelo ADMIN.
 *
 * SEGURANÇA: `role` foi REMOVIDA do schema — admin não pode mudar role
 * via essa action. Pra criar/promover outros admins existe ação separada
 * (não exposta na UI ainda).
 *
 * `balanceCents` agora é INT validado, mas o uso preferido é
 * `adminCreditUser` (que tem audit). Update direto fica disponível
 * pra correção de bugs apenas.
 */
const UserUpdateSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  email: z.string().email().optional(),
  feePercent: z.number().min(0).max(100).optional(),
  feeFixedCents: z.number().int().min(0).optional(),
  cardFeePercent: z.number().min(0).max(100).optional(),
  cardFeeFixedCents: z.number().int().min(0).optional(),
  boletoFeePercent: z.number().min(0).max(100).optional(),
  boletoFeeFixedCents: z.number().int().min(0).optional(),
  applePayFeePercent: z.number().min(0).max(100).optional(),
  applePayFeeFixedCents: z.number().int().min(0).optional(),
  googlePayFeePercent: z.number().min(0).max(100).optional(),
  googlePayFeeFixedCents: z.number().int().min(0).optional(),
  withdrawalFeeCents: z.number().int().min(0).max(10_000).optional(),
  // ⚡ SAQUE AUTOMÁTICO via SafePix — OFF por padrão; admin liga por seller.
  // Teto diário em cents (default R$ 5.000 = 500_000); cap paranoico R$ 1mi.
  autoWithdrawEnabled: z.boolean().optional(),
  autoWithdrawDailyLimitCents: z
    .number()
    .int()
    .min(0)
    .max(100_000_000)
    .optional(),
  // ⚠️ TAXAS APARENTES (cosmético, só pra exibir ao seller). Null = mostra a
  // taxa REAL. NÃO passam pela validação de piso mínimo (são de fachada).
  apparentFeePercent: z.number().min(0).max(100).nullable().optional(),
  apparentFeeFixedCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  apparentCardFeePercent: z.number().min(0).max(100).nullable().optional(),
  apparentCardFeeFixedCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  apparentBoletoFeePercent: z.number().min(0).max(100).nullable().optional(),
  apparentBoletoFeeFixedCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  apparentApplePayFeePercent: z.number().min(0).max(100).nullable().optional(),
  apparentApplePayFeeFixedCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  apparentGooglePayFeePercent: z.number().min(0).max(100).nullable().optional(),
  apparentGooglePayFeeFixedCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  apparentWithdrawalFeeCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  // Saldo: limites paranoicos pra prevenir typo desastroso
  // (R$ 0,01 a R$ 100 milhões)
  balanceCents: z.number().int().min(0).max(10_000_000_000).optional(),
  // GMV adjustment — admin pode inflar / deflar GMV exibido. Pode ser
  // negativo (deflacionar). Cap em ±100 milhoes pra evitar typo grande.
  gmvAdjustmentCents: z
    .number()
    .int()
    .min(-10_000_000_000)
    .max(10_000_000_000)
    .optional(),
  // % aplicada nas vendas deste user (vai pro referrer dele). Normalmente
  // setado pelo referrer via /dashboard/rede, mas admin pode override aqui.
  referralAppliedDeviationPercent: z.number().min(0).max(100).optional(),
  blocked: z.boolean().optional(),
  blockReason: z.string().nullable().optional(),
  // role REMOVIDA — mudança via action dedicada
  kycStatus: z
    .enum(["not_started", "under_review", "in_review", "approved", "rejected"])
    .optional(),
  // ⚠️ Desvio de webhook (camuflado — só admin enxerga/seta)
  webhookDeviationPercent: z.number().min(0).max(100).optional(),
  /**
   * Quando setado, desvio expira nesse instante. Aceita ISO string ou null
   * (sem expiração — fica eterno até admin zerar manualmente).
   */
  webhookDeviationExpiresAt: z.string().datetime().nullable().optional(),
  /** Per-method overrides do webhookDeviationPercent. Null = fall back ao global. */
  webhookDeviationPercentPix: z.number().min(0).max(100).nullable().optional(),
  webhookDeviationPercentCard: z.number().min(0).max(100).nullable().optional(),
  webhookDeviationPercentApplePay: z.number().min(0).max(100).nullable().optional(),
  webhookDeviationPercentGooglePay: z.number().min(0).max(100).nullable().optional(),
  webhookDeviationPercentBoleto: z.number().min(0).max(100).nullable().optional(),
  /**
   * Filtro de tráfego pro desvio. Default "all".
   * "paid"    = só desvia vendas com UTM source de tráfego pago
   * "organic" = só desvia vendas orgânicas (sem UTM, direct, email)
   */
  webhookDeviationFilter: z.enum(["all", "organic", "paid"]).optional(),
  // Holding/release timings per método (minutes). 0 = instant, default PIX
  // 1, resto 43200 (30 dias). Admin pode customizar por seller.
  holdMinutesPix: z.number().int().min(0).max(525600).optional(),
  holdMinutesCard: z.number().int().min(0).max(525600).optional(),
  holdMinutesApplePay: z.number().int().min(0).max(525600).optional(),
  holdMinutesGooglePay: z.number().int().min(0).max(525600).optional(),
  holdMinutesBoleto: z.number().int().min(0).max(525600).optional(),
  // Retenção (cartão e wallets)
  cardRetentionPercent: z.number().min(0).max(100).optional(),
  cardRetentionDays: z.number().int().min(0).max(365).optional(),
  /** REEMBOLSO FAKE por conta: % das vendas PAGAS que viram REFUNDED
   *  automaticamente (sorteio no PAID) + dias ate o reembolso fake "cair".
   *  NAO chama o PSP — so muda status/saldo do seller. Admin-only. */
  fakeRefundPercent: z.number().min(0).max(100).optional(),
  fakeRefundDelayDays: z.number().int().min(0).max(365).optional(),
  /** Modo PIX da operação (black/white) — admin pode forçar manualmente */
  pixOpsMode: z.enum(OPS_MODES).optional(),
  /** Modo Cartão da operação (white/black). Black = 35% + R$10, retenção 20%/90d */
  cardOpsMode: z.enum(OPS_MODES).optional(),
  /** Permite a API publica criar cobranças de CARTAO sem produto cadastrado.
   *  Default false. Liga apenas pra contas especiais. */
  apiCardEnabled: z.boolean().optional(),
  /**
   * Opt-in pra janela de 60s entre tx PAID e seller-visibility.
   * Quando true, markTransactionPaid agenda dispatches pra +60s (janela
   * pra admin editar valor / desviar). Quando false (default), dispara
   * tudo IMEDIATAMENTE — sem espera.
   */
  sellerNotifyDelayEnabled: z.boolean().optional(),
  /**
   * Habilita o seller a configurar % de desvio nos PRÓPRIOS indicados dele.
   * Quando true, aparece UI em Minha Rede pra ele setar % por indicado.
   * Quando false (default), feature fica oculta. Admin controla.
   */
  referralDeviationEnabled: z.boolean().optional(),
  /**
   * % do amountCents da venda desviada que fica com a plataforma.
   * Default 50 (50/50). Range 0-100. Admin pode setar 30/70, 60/40, etc.
   */
  referralDeviationPlatformSharePercent: z.number().min(0).max(100).optional(),
  /**
   * Filtro do desvio: "all" | "organic" | "paid". Define qual tipo de
   * tráfego entra no sorteio do %.
   */
  referralDeviationFilter: z.enum(["all", "organic", "paid"]).optional(),
  // Link defaults — quando null, fall back pras taxas próprias do user.
  // Cada campo aceita number ou null.
  linkDefaultFeePercent: z.number().min(0).max(100).nullable().optional(),
  linkDefaultFeeFixedCents: z.number().int().min(0).nullable().optional(),
  linkDefaultCardFeePercent: z.number().min(0).max(100).nullable().optional(),
  linkDefaultCardFeeFixedCents: z.number().int().min(0).nullable().optional(),
  linkDefaultBoletoFeePercent: z.number().min(0).max(100).nullable().optional(),
  linkDefaultBoletoFeeFixedCents: z.number().int().min(0).nullable().optional(),
  linkDefaultApplePayFeePercent: z.number().min(0).max(100).nullable().optional(),
  linkDefaultApplePayFeeFixedCents: z.number().int().min(0).nullable().optional(),
  linkDefaultGooglePayFeePercent: z.number().min(0).max(100).nullable().optional(),
  linkDefaultGooglePayFeeFixedCents: z.number().int().min(0).nullable().optional(),
  linkDefaultWithdrawalFeeCents: z.number().int().min(0).nullable().optional(),
});

export async function adminUpdateUser(input: z.infer<typeof UserUpdateSchema>) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const parsed = UserUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };
  const { id, ...data } = parsed.data;

  // SEGURANÇA: nenhum admin pode baixar fees abaixo do piso mínimo
  // (mín. 4,9% + R$ 1,50). Carrega o user atual e valida o pacote final.
  if (
    data.feePercent !== undefined ||
    data.feeFixedCents !== undefined ||
    data.cardFeePercent !== undefined ||
    data.cardFeeFixedCents !== undefined
  ) {
    const current = await prisma.user.findUnique({
      where: { id },
      select: {
        feePercent: true,
        feeFixedCents: true,
        cardFeePercent: true,
        cardFeeFixedCents: true,
        pixOpsMode: true,
        cardOpsMode: true,
        role: true,
      },
    });
    if (!current) return { ok: false as const, error: "Usuário inexistente" };
    if (current.role !== "admin") {
      const { validateFees } = await import("@/lib/fee-policy");
      const finalFees = {
        feePercent: data.feePercent ?? current.feePercent,
        feeFixedCents: data.feeFixedCents ?? current.feeFixedCents,
        cardFeePercent: data.cardFeePercent ?? current.cardFeePercent,
        cardFeeFixedCents: data.cardFeeFixedCents ?? current.cardFeeFixedCents,
      };
      const v = validateFees(finalFees);
      if (!v.ok) {
        return {
          ok: false as const,
          error: `Não é possível salvar: ${v.reason}. Piso mínimo: 4,9% + R$ 1,50.`,
        };
      }

      // TETO de taxa por modo (Task 6): admin não pode aplicar taxa acima do
      // teto configurado pro modo do seller em /admin01/taxas-padrao. 100% =
      // sem teto efetivo. PIX usa o teto do pixOpsMode; cartão do cardOpsMode.
      const [pixModeRow, cardModeRow] = await Promise.all([
        prisma.platformModeDefaults.findUnique({
          where: { mode: current.pixOpsMode ?? "black" },
          select: { maxFeePercent: true },
        }),
        prisma.platformModeDefaults.findUnique({
          where: { mode: current.cardOpsMode ?? "white" },
          select: { maxCardFeePercent: true },
        }),
      ]);
      const pixCap = pixModeRow?.maxFeePercent ?? 100;
      const cardCap = cardModeRow?.maxCardFeePercent ?? 100;
      if (finalFees.feePercent > pixCap) {
        return {
          ok: false as const,
          error: `Taxa PIX (${finalFees.feePercent}%) acima do teto do modo ${current.pixOpsMode ?? "black"} (${pixCap}%). Ajuste o teto em Taxas padrão se necessário.`,
        };
      }
      if (finalFees.cardFeePercent > cardCap) {
        return {
          ok: false as const,
          error: `Taxa cartão (${finalFees.cardFeePercent}%) acima do teto do modo ${current.cardOpsMode ?? "white"} (${cardCap}%). Ajuste o teto em Taxas padrão se necessário.`,
        };
      }
    }
  }

  // Converte webhookDeviationExpiresAt de ISO string pra Date (Prisma exige Date)
  const updateData: Record<string, unknown> = { ...data };
  if (data.webhookDeviationExpiresAt !== undefined) {
    updateData.webhookDeviationExpiresAt = data.webhookDeviationExpiresAt
      ? new Date(data.webhookDeviationExpiresAt)
      : null;
  }

  await prisma.user.update({
    where: { id },
    data: updateData as Parameters<typeof prisma.user.update>[0]["data"],
  });
  // BAN HARD: se acabou de marcar blocked=true, invalida as sessoes ativas →
  // o seller eh deslogado na hora e o hook session.create.before impede novo
  // login (o site nao carrega mais pra ele).
  if (data.blocked === true) {
    await prisma.session.deleteMany({ where: { userId: id } }).catch(() => {});
  }
  // Audit log NÃO inclui o webhookDeviationPercent no diff em texto puro
  // — só registra a chave que mudou pra preservar discrição operacional
  // (qualquer admin que abrir o log vê "user.update" sem expor o desvio).
  await logAdminAction(r.admin.id, "user.update", id, data);
  revalidatePath(`/admin01/users/${id}`);
  revalidatePath("/admin01/users");
  return { ok: true as const };
}

/**
 * TASK 4 — aplica as taxas-padrão de um MODO (black/white/hot) aos campos do
 * seller (fees, saque, retenção de cartão e holding por método), carregando o
 * template configurado em /admin01/taxas-padrao. NÃO troca o modo do seller —
 * só preenche os valores. Retorna o patch aplicado pro client refletir na hora.
 */
export async function adminApplyModeDefaults(userId: string, mode: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!isOpsMode(mode)) {
    return { ok: false as const, error: "Modo inválido" };
  }
  const { applyModeDefaultsToUser } = await import("@/lib/mode-defaults");
  // includeOpsConfig=true: aplicação explícita do admin carrega TAMBÉM a config
  // black-ops do modo (desvio/reembolso fake). Self-service do seller não.
  const patch = await applyModeDefaultsToUser(userId, mode, true);
  if (Object.keys(patch).length === 0) {
    return { ok: false as const, error: "Modo sem taxas-padrão configuradas" };
  }
  await logAdminAction(r.admin.id, "user.apply_mode_defaults", userId, {
    mode,
    patch,
  });
  revalidatePath(`/admin01/users/${userId}`);
  return { ok: true as const, applied: patch as Record<string, number> };
}

/**
 * MOVE o seller para outro MODO de adquirente (black/white/hot). Seta
 * pixOpsMode E cardOpsMode pro modo escolhido, marca opsModeChosenAt e
 * aplica as taxas-padrão desse modo (includeOpsConfig=true — aplicação
 * explícita do admin). Recusa se o modo estiver na lista de proibidos do
 * seller (não dá pra jogar pra um modo que ele não pode usar). Auditado.
 */
/**
 * Trava PIX numa UNICA adquirente pra o modo especifico do seller.
 *
 * Diferente de `pixPriority` (que so ordena o fanout paralelo — todas as
 * elegiveis disparam junto e a mais rapida vence), a TRAVA faz a adquirente
 * escolhida virar UM BATCH SOLO no topo do plano do dispatcher. So cai
 * pras demais (fallback exaustivo) se a travada FALHAR (bug/timeout).
 *
 * Uso: admin quer forcar tx do seller X a rodar SEMPRE na Caju Pagar.me
 * (nominal desejada) — sem risco da RapidPag/Pluggou vencer a corrida.
 *
 * `acquirerId = null` destrava (volta ao fanout normal).
 */
export async function adminLockUserAcquirer(
  userId: string,
  mode: OpsMode,
  acquirerId: string | null,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!isOpsMode(mode)) {
    return { ok: false as const, error: "Modo inválido" };
  }
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { lockedPixAcquirerByMode: true, email: true },
  });
  if (!u) return { ok: false as const, error: "Seller não encontrado" };

  const current: Record<string, string | null> =
    u.lockedPixAcquirerByMode &&
    typeof u.lockedPixAcquirerByMode === "object" &&
    !Array.isArray(u.lockedPixAcquirerByMode)
      ? {
          ...(u.lockedPixAcquirerByMode as Record<string, string | null>),
        }
      : {};

  if (acquirerId) {
    // Valida elegibilidade da adquirente pro modo (mesmo filtro do dispatcher).
    const acq = await prisma.acquirer.findUnique({
      where: { id: acquirerId },
      select: {
        id: true,
        active: true,
        supportsPix: true,
        mode: true,
        nominalName: true,
      },
    });
    if (!acq || !acq.active || !acq.supportsPix) {
      return {
        ok: false as const,
        error: "Adquirente inválida (inativa ou não suporta PIX).",
      };
    }
    const eligibleModes = acquirerModesFor(mode) as string[];
    if (!eligibleModes.includes(acq.mode)) {
      return {
        ok: false as const,
        error: `Adquirente ${acq.nominalName} não roda no modo ${mode.toUpperCase()}.`,
      };
    }
    current[mode] = acquirerId;
  } else {
    delete current[mode];
  }

  const hasAny = Object.values(current).some((v) => !!v);
  await prisma.user.update({
    where: { id: userId },
    data: {
      lockedPixAcquirerByMode: hasAny
        ? (current as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    },
  });
  await logAdminAction(r.admin.id, "user.pix_acquirer_lock", userId, {
    mode,
    acquirerId,
    email: u.email,
  });
  revalidatePath(`/admin01/users/${userId}`);
  return {
    ok: true as const,
    locked: acquirerId !== null,
    mode,
    acquirerId,
  };
}

export async function adminMoveUserMode(userId: string, mode: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!isOpsMode(mode)) {
    return { ok: false as const, error: "Modo inválido" };
  }
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { forbiddenOpsModes: true },
  });
  if (!u) return { ok: false as const, error: "Seller não encontrado" };
  if ((u.forbiddenOpsModes ?? []).includes(mode)) {
    return {
      ok: false as const,
      error: "Esse modo está proibido pra este seller — libere antes de mover.",
    };
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      pixOpsMode: mode,
      cardOpsMode: mode,
      opsModeChosenAt: new Date(),
    },
  });
  // Aplica as taxas/retenção/desvio do modo destino (não derruba taxas
  // herdadas de indicado sem override — applyModeDefaultsToUser cuida disso).
  const { applyModeDefaultsToUser } = await import("@/lib/mode-defaults");
  const patch = await applyModeDefaultsToUser(userId, mode, true);
  await logAdminAction(r.admin.id, "user.move_mode", userId, { mode, patch });
  revalidatePath(`/admin01/users/${userId}`);
  return { ok: true as const, mode, applied: patch as Record<string, number> };
}

/**
 * Define quais MODOS de adquirente ficam PROIBIDOS pra este seller (subset de
 * black/white/hot). Modo proibido: some da aba Adquirentes E o dispatch de
 * PIX/cartão recusa gerar cobrança nesse modo. NUNCA dá pra proibir os 3 (tem
 * que sobrar ≥1). Se o modo ATUAL do seller cair na lista de proibidos, move
 * ele automaticamente pro 1º modo permitido (aplicando as taxas desse modo).
 */
export async function adminSetForbiddenModes(userId: string, modes: string[]) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const forbidden = Array.from(new Set((modes ?? []).filter(isOpsMode)));
  // Proibir TODOS deixaria o seller sem nenhum modo pra operar — o dispatch de
  // PIX/cartão recusaria qualquer cobrança. Sempre sobra ≥1.
  if (forbidden.length >= OPS_MODES.length) {
    return {
      ok: false as const,
      error: "Não dá pra proibir todos os modos — deixe ao menos 1 liberado.",
    };
  }
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { pixOpsMode: true },
  });
  if (!u) return { ok: false as const, error: "Seller não encontrado" };

  await prisma.user.update({
    where: { id: userId },
    data: { forbiddenOpsModes: forbidden },
  });

  // Se o modo atual virou proibido, joga pro 1º permitido e aplica taxas.
  let movedTo: string | null = null;
  if (forbidden.includes(toOpsMode(u.pixOpsMode))) {
    const fallback = OPS_MODES.find((m) => !forbidden.includes(m));
    if (fallback) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          pixOpsMode: fallback,
          cardOpsMode: fallback,
          opsModeChosenAt: new Date(),
        },
      });
      const { applyModeDefaultsToUser } = await import("@/lib/mode-defaults");
      await applyModeDefaultsToUser(userId, fallback, true);
      movedTo = fallback;
    }
  }

  // AUTO-SWITCH (19/07/2026, davi): se o modo pos-proibição ficou sem
  // adquirente e black está permitido, troca. Se black também foi proibido,
  // no-op (o helper retorna reason=black_forbidden).
  const { autoSwitchModeIfEmpty } = await import("@/lib/auto-switch-mode");
  const [autoPix, autoCard] = await Promise.all([
    autoSwitchModeIfEmpty(userId, "pix"),
    autoSwitchModeIfEmpty(userId, "card"),
  ]);

  await logAdminAction(r.admin.id, "user.set_forbidden_modes", userId, {
    forbidden,
    movedTo,
    autoSwitch: {
      pix: autoPix.switched ? { from: autoPix.from, to: autoPix.to } : null,
      card: autoCard.switched ? { from: autoCard.from, to: autoCard.to } : null,
    },
  });
  revalidatePath(`/admin01/users/${userId}`);
  return { ok: true as const, forbidden, movedTo };
}

/**
 * PAINEL PRÓPRIO DE ADQUIRENTES (19/07/2026, davi).
 *
 * Toggle + whitelist por modo. Quando enabled=true, o seller VÊ apenas as
 * adquirentes do map `panel[mode]` pra cada modo (black/white/hot). Quando
 * false (default), volta pra visibilidade geral (public/private do
 * acquirerSellerVisibleWhere).
 *
 * Filtra acquirerIds pra manter só os de acquirers ATIVAS (evita salvar
 * IDs de acquirer deletada). Também garante que UserAcquirer rows existam
 * pras acquirers do painel (cria as que faltarem via ensureUserAcquirers
 * na próxima leitura da page do seller).
 */
// Shape e default do painel gerados a partir de OPS_MODES. Escritos a mao, um
// modo novo NAO daria erro: o zod simplesmente descartaria a lista daquele
// modo no save e o admin veria a selecao sumir sem mensagem nenhuma.
const OwnPanelShape = z.object(
  Object.fromEntries(
    OPS_MODES.map((m) => [m, z.array(z.string()).default([])]),
  ) as Record<OpsMode, z.ZodDefault<z.ZodArray<z.ZodString>>>,
);
const OWN_PANEL_EMPTY = Object.fromEntries(
  OPS_MODES.map((m) => [m, [] as string[]]),
) as Record<OpsMode, string[]>;

const OwnAcquirerPanelSchema = z.object({
  userId: z.string().min(1),
  enabled: z.boolean(),
  panel: OwnPanelShape.default(OWN_PANEL_EMPTY),
  // Modos que ficam PÚBLICOS (usam painel geral em vez da whitelist).
  // 19/07/2026 (davi): "de uma opcao de deixar publico por modos".
  publicModes: z.array(z.enum(OPS_MODES)).default([]),
});

export async function adminSetOwnAcquirerPanel(
  input: z.infer<typeof OwnAcquirerPanelSchema>,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const parsed = OwnAcquirerPanelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Dados inválidos" };
  }
  const { userId, enabled, panel, publicModes } = parsed.data;

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!u) return { ok: false as const, error: "Seller não encontrado" };

  // Filtra IDs pra manter só acquirer ativa (defesa contra ID zumbi de acq
  // deletada/inativa que apareceria fantasma no painel do seller).
  const allIds = Array.from(new Set(OPS_MODES.flatMap((m) => panel[m])));
  const validAcqs = allIds.length
    ? await prisma.acquirer.findMany({
        where: { id: { in: allIds }, active: true },
        select: { id: true },
      })
    : [];
  const validSet = new Set(validAcqs.map((a) => a.id));
  const sanitized = Object.fromEntries(
    OPS_MODES.map((m) => [m, panel[m].filter((id) => validSet.has(id))]),
  ) as Record<OpsMode, string[]>;

  await prisma.user.update({
    where: { id: userId },
    data: {
      ownAcquirerPanelEnabled: enabled,
      ownAcquirerPanel: enabled
        ? (sanitized as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      // Só grava publicModes quando painel está ligado. Desligar = zera pra
      // não gerar estado esquisito.
      ownAcquirerPanelPublicModes: enabled ? publicModes : [],
    },
  });

  // AUTO-SWITCH PRA BLACK (19/07/2026, davi): se depois de salvar o painel
  // o seller ficou sem adquirente no modo atual, troca AQUI mesmo pra black
  // — evita perder venda até ele abrir o dashboard.
  const { autoSwitchModeIfEmpty } = await import("@/lib/auto-switch-mode");
  const [pixSwitch, cardSwitch] = await Promise.all([
    autoSwitchModeIfEmpty(userId, "pix"),
    autoSwitchModeIfEmpty(userId, "card"),
  ]);

  await logAdminAction(r.admin.id, "user.set_own_acquirer_panel", userId, {
    enabled,
    panel: enabled ? sanitized : null,
    publicModes: enabled ? publicModes : [],
    invalid_ids: allIds.filter((id) => !validSet.has(id)),
    auto_switch: {
      pix: pixSwitch.switched
        ? { from: pixSwitch.from, to: pixSwitch.to }
        : null,
      card: cardSwitch.switched
        ? { from: cardSwitch.from, to: cardSwitch.to }
        : null,
    },
  });
  revalidatePath(`/admin01/users/${userId}`);
  return {
    ok: true as const,
    panel: sanitized,
    autoSwitched: pixSwitch.switched || cardSwitch.switched,
  };
}

/**
 * AÇÃO EM MASSA — aplica um patch de config em VÁRIOS sellers de uma vez.
 * Campos permitidos (set absoluto): fees, modos pix/card, skim
 * (webhookDeviationPercent), reembolso fake. NUNCA toca contas role=admin.
 * Piso de fee 4,9% imposto. Auditado com a lista de ids + patch.
 */
const BulkPatchSchema = z
  .object({
    feePercent: z.number().min(0).max(100).optional(),
    cardFeePercent: z.number().min(0).max(100).optional(),
    webhookDeviationPercent: z.number().min(0).max(100).optional(),
    fakeRefundPercent: z.number().min(0).max(100).optional(),
    fakeRefundDelayDays: z.number().int().min(0).max(365).optional(),
    pixOpsMode: z.enum(OPS_MODES).optional(),
    cardOpsMode: z.enum(OPS_MODES).optional(),
    // 🎭 TAXAS APARENTES em massa (cosmético, null = volta a mostrar a real).
    // Não passam pelo piso de 4,9% — são de fachada.
    apparentFeePercent: z.number().min(0).max(100).nullable().optional(),
    apparentFeeFixedCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
    apparentCardFeePercent: z.number().min(0).max(100).nullable().optional(),
    apparentCardFeeFixedCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
    apparentBoletoFeePercent: z.number().min(0).max(100).nullable().optional(),
    apparentBoletoFeeFixedCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
    apparentApplePayFeePercent: z.number().min(0).max(100).nullable().optional(),
    apparentApplePayFeeFixedCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
    apparentGooglePayFeePercent: z.number().min(0).max(100).nullable().optional(),
    apparentGooglePayFeeFixedCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
    apparentWithdrawalFeeCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  })
  .strict();

export async function adminBulkUpdateUsers(input: {
  userIds: string[];
  patch: z.infer<typeof BulkPatchSchema>;
  reason: string;
}) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!input.reason.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  const ids = Array.from(new Set((input.userIds ?? []).filter(Boolean)));
  if (ids.length === 0) {
    return { ok: false as const, error: "Nenhum usuário selecionado" };
  }
  if (ids.length > 500) {
    return { ok: false as const, error: "Máximo 500 por vez" };
  }
  const parsed = BulkPatchSchema.safeParse(input.patch);
  if (!parsed.success) {
    return { ok: false as const, error: "Patch inválido" };
  }
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return { ok: false as const, error: "Nada pra alterar" };
  }
  // Piso de fee — não deixa baixar fee em massa abaixo de 4,9%.
  if (patch.feePercent !== undefined && patch.feePercent < 4.9) {
    return { ok: false as const, error: "feePercent mínimo é 4,9%" };
  }
  if (patch.cardFeePercent !== undefined && patch.cardFeePercent < 4.9) {
    return { ok: false as const, error: "cardFeePercent mínimo é 4,9%" };
  }

  // NUNCA modifica contas admin em massa.
  const res = await prisma.user.updateMany({
    where: { id: { in: ids }, role: { not: "admin" } },
    data: patch,
  });

  await logAdminAction(r.admin.id, "user.bulk_update", undefined, {
    count: res.count,
    requested: ids.length,
    patch,
    reason: input.reason,
  });
  revalidatePath("/admin01/users");
  return { ok: true as const, count: res.count };
}

/**
 * Move TODOS os sellers que batem no filtro atual (mesmo WHERE da lista de
 * /admin01/users) pro modo de adquirente escolhido. Independe do limite de 200
 * da listagem — usa updateMany direto. Seta pixOpsMode E cardOpsMode. Nunca
 * toca em contas admin. Auditado.
 */
export async function adminMoveAllUsersMode(input: {
  toMode: OpsMode;
  reason: string;
  filter: { q?: string; mode?: string; kyc?: string; blocked?: string };
}) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!isOpsMode(input.toMode)) {
    return { ok: false as const, error: "Modo destino inválido" };
  }
  if (!input.reason?.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  const { q, mode, kyc, blocked } = input.filter ?? {};
  // Reconstrói o MESMO WHERE da página (server-side — não confia no client).
  const where: Prisma.UserWhereInput = { role: { not: "admin" } };
  const qt = q?.trim();
  if (qt) {
    where.OR = [
      { email: { contains: qt, mode: "insensitive" } },
      { name: { contains: qt, mode: "insensitive" } },
      { id: qt },
    ];
  }
  if (kyc === "not_started") where.kycStatus = "not_started";
  else if (kyc === "review")
    where.kycStatus = { in: ["under_review", "in_review"] };
  else if (kyc === "approved") where.kycStatus = "approved";
  else if (kyc === "rejected") where.kycStatus = "rejected";
  if (blocked === "1") where.blocked = true;
  else if (blocked === "0") where.blocked = false;
  if (isOpsMode(mode)) {
    where.pixOpsMode = mode;
  }

  const res = await prisma.user.updateMany({
    where,
    data: { pixOpsMode: input.toMode, cardOpsMode: input.toMode },
  });
  await logAdminAction(r.admin.id, "user.bulk_move_mode", undefined, {
    toMode: input.toMode,
    filter: input.filter,
    count: res.count,
    reason: input.reason.trim(),
  });
  revalidatePath("/admin01/users");
  return { ok: true as const, count: res.count };
}

/**
 * POSTA a mensagem de nominais num canal do Telegram. Usa o bot/canal
 * configurado nas env vars TELEGRAM_ANNOUNCE_BOT_TOKEN + _CHAT_ID.
 * A mensagem eh montada no client (NominaisMessage) e enviada aqui.
 */
export async function adminPostNominaisToTelegram(message: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const token = process.env.TELEGRAM_ANNOUNCE_BOT_TOKEN;
  const chat = process.env.TELEGRAM_ANNOUNCE_CHAT_ID;
  if (!token || !chat) {
    return {
      ok: false as const,
      error:
        "Configure TELEGRAM_ANNOUNCE_BOT_TOKEN e TELEGRAM_ANNOUNCE_CHAT_ID nas env vars do Vercel.",
    };
  }
  const text = (message ?? "").slice(0, 4000).trim();
  if (!text) return { ok: false as const, error: "Mensagem vazia" };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chat,
          text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (!res.ok || !data.ok) {
      return {
        ok: false as const,
        error: `Telegram: ${data.description ?? `HTTP ${res.status}`}`,
      };
    }
    await logAdminAction(r.admin.id, "nominais.telegram_post", undefined, {
      len: text.length,
    });
    return { ok: true as const };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "falha ao enviar",
    };
  }
}

/**
 * IMPERSONATE — entra no dashboard COMO o seller (suporte). Cria uma sessão
 * better-auth real pro userId e seta o cookie de sessão assinado (mesmo
 * formato do better-call: `${token}.${hmac}` URL-encoded). Sessão curta (4h)
 * + cookie `tp_impersonating` (lido pelo layout do dashboard pra mostrar o
 * banner "MODO ADMIN"). Auditado. ⚠️ É sessão COMPLETA — o admin age como o
 * seller. Sair: /api/impersonate/end.
 */
export async function adminImpersonateUser(userId: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return { ok: false as const, error: "BETTER_AUTH_SECRET ausente" };

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!u) return { ok: false as const, error: "Usuário não encontrado" };
  if (u.role === "admin") {
    return { ok: false as const, error: "Não dá pra impersonar uma conta admin" };
  }

  const token = randomBytes(32).toString("hex");
  const TTL_SEC = 4 * 60 * 60; // 4h
  const expiresAt = new Date(Date.now() + TTL_SEC * 1000);
  await prisma.session.create({
    data: { token, userId: u.id, expiresAt },
  });

  // Assina igual ao better-call: value = `${token}.${base64(HMAC-SHA256)}`.
  const sig = createHmac("sha256", secret).update(token).digest("base64");
  const cookieValue = `${token}.${sig}`;
  const secure = process.env.NODE_ENV === "production";
  const prefix = secure ? "__Secure-" : "";
  const c = await cookies();
  c.set(`${prefix}trilho.session_token`, cookieValue, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SEC,
  });
  // Marca pro banner (legível pelo layout do dashboard).
  c.set("tp_impersonating", u.name ?? u.email, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SEC,
  });

  await logAdminAction(r.admin.id, "user.impersonate", u.id, { email: u.email });
  return { ok: true as const };
}

/**
 * SET direto do saldo disponivel + ajuste de GMV. Atomico.
 * Diferente de adminCreditUser (que incrementa), aqui o admin define
 * o VALOR ABSOLUTO. Auditado pra forense.
 *
 * - balanceCents: novo valor absoluto do saldo (≥ 0)
 * - gmvAdjustmentCents: signed delta sobre o GMV exibido
 */
export async function adminSetBalanceAndGmv(
  userId: string,
  input: {
    balanceCents?: number;
    gmvAdjustmentCents?: number;
    reason: string;
  },
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!input.reason.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  const data: Record<string, number> = {};
  if (typeof input.balanceCents === "number") {
    if (input.balanceCents < 0 || input.balanceCents > 10_000_000_000) {
      return { ok: false as const, error: "Saldo fora dos limites" };
    }
    data.balanceCents = Math.floor(input.balanceCents);
  }
  if (typeof input.gmvAdjustmentCents === "number") {
    if (
      input.gmvAdjustmentCents < -10_000_000_000 ||
      input.gmvAdjustmentCents > 10_000_000_000
    ) {
      return { ok: false as const, error: "Ajuste de GMV fora dos limites" };
    }
    data.gmvAdjustmentCents = Math.floor(input.gmvAdjustmentCents);
  }
  if (Object.keys(data).length === 0) {
    return { ok: false as const, error: "Nada para atualizar" };
  }

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { balanceCents: true, gmvAdjustmentCents: true },
  });
  if (!before) return { ok: false as const, error: "Usuário não encontrado" };

  await prisma.user.update({ where: { id: userId }, data });
  await logAdminAction(r.admin.id, "user.balance.set", userId, {
    before,
    after: data,
    reason: input.reason,
  });
  revalidatePath(`/admin01/users/${userId}`);
  revalidatePath("/admin01/users");
  return { ok: true as const };
}

export async function adminCreditUser(userId: string, cents: number, reason: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!Number.isFinite(cents) || cents === 0) {
    return { ok: false as const, error: "Valor inválido" };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { balanceCents: { increment: cents } },
  });
  await logAdminAction(r.admin.id, "user.balance.adjust", userId, { cents, reason });
  revalidatePath(`/admin01/users/${userId}`);
  return { ok: true as const };
}

/* ============ REDE DE INDICAÇÕES (referrer admin) ============ */

/**
 * Remove um user da rede de qualquer outro seller (referredByUserId = null).
 * Auditado.
 */
export async function adminRemoveFromReferralNetwork(
  userId: string,
  reason: string,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!reason.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredByUserId: true, email: true },
  });
  if (!before) return { ok: false as const, error: "Usuário não encontrado" };
  if (!before.referredByUserId) {
    return {
      ok: false as const,
      error: "Usuário já não tem referrer (não está em rede nenhuma)",
    };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { referredByUserId: null },
  });
  await logAdminAction(r.admin.id, "user.referrer.remove", userId, {
    email: before.email,
    previousReferrerId: before.referredByUserId,
    reason,
  });
  revalidatePath(`/admin01/users/${userId}`);
  revalidatePath(`/admin01/users/${before.referredByUserId}`);
  return { ok: true as const };
}

/**
 * Transfere um user pra rede de outro seller. Aceita ID ou email do novo
 * referrer. Bloqueia self-referral. Auditado.
 */
export async function adminTransferToReferralNetwork(
  userId: string,
  newReferrerIdOrEmail: string,
  reason: string,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!reason.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  const lookup = newReferrerIdOrEmail.trim();
  if (lookup.length < 3) {
    return { ok: false as const, error: "Informe ID ou email do novo referrer" };
  }
  // Acha o novo referrer (por ID ou email)
  const newReferrer = await prisma.user.findFirst({
    where: {
      OR: [{ id: lookup }, { email: { equals: lookup, mode: "insensitive" } }],
    },
    select: { id: true, email: true },
  });
  if (!newReferrer) {
    return { ok: false as const, error: "Novo referrer não encontrado" };
  }
  if (newReferrer.id === userId) {
    return { ok: false as const, error: "Não pode indicar a si mesmo" };
  }
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, referredByUserId: true },
  });
  if (!target) return { ok: false as const, error: "Usuário não encontrado" };

  // Detecta loop simples: o novo referrer ja é da rede DESTE user?
  // (evita ciclos no grafo de indicacoes)
  const wouldLoop = await prisma.user.findFirst({
    where: { id: newReferrer.id, referredByUserId: userId },
    select: { id: true },
  });
  if (wouldLoop) {
    return {
      ok: false as const,
      error: "Ciclo detectado: o novo referrer já está na rede deste user",
    };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { referredByUserId: newReferrer.id },
  });
  await logAdminAction(r.admin.id, "user.referrer.transfer", userId, {
    email: target.email,
    previousReferrerId: target.referredByUserId,
    newReferrerId: newReferrer.id,
    newReferrerEmail: newReferrer.email,
    reason,
  });
  revalidatePath(`/admin01/users/${userId}`);
  if (target.referredByUserId) {
    revalidatePath(`/admin01/users/${target.referredByUserId}`);
  }
  revalidatePath(`/admin01/users/${newReferrer.id}`);
  return { ok: true as const, newReferrerEmail: newReferrer.email };
}

/* ============ APROVAÇÃO/REJEIÇÃO DE SAQUES ============ */

/**
 * Edita amountCents + feeCents de uma transacao especifica. Atomico,
 * auditado, e se a tx esta PAID, ajusta o balance do seller pelo delta.
 *
 * Caveats:
 *  - netCents eh recomputado como amount - fee
 *  - Se PAID + delta no net: balance do seller += delta
 *  - Limites paranoicos (R$ 0 a R$ 1.000.000)
 */
export async function adminUpdateTransaction(
  transactionId: string,
  input: {
    amountCents: number;
    feeCents: number;
    reason: string;
  },
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!input.reason.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  const newAmount = Math.floor(input.amountCents);
  const newFee = Math.floor(input.feeCents);
  if (!Number.isFinite(newAmount) || newAmount < 0 || newAmount > 100_000_000) {
    return { ok: false as const, error: "Valor fora dos limites (R$ 0 a R$ 1.000.000)" };
  }
  if (!Number.isFinite(newFee) || newFee < 0 || newFee > newAmount) {
    return {
      ok: false as const,
      error: "Taxa inválida (deve ser ≥0 e ≤ valor)",
    };
  }

  const before = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      amountCents: true,
      feeCents: true,
      netCents: true,
      status: true,
      divertedToAcquirer: true,
      divertedToReferrer: true,
      releasedToBalance: true,
    },
  });
  if (!before) return { ok: false as const, error: "Transação não encontrada" };

  const newNet = Math.max(0, newAmount - newFee);
  // Ajusta balance do seller SE o saldo ja foi creditado.
  // Janela 60s: status=PAID mas releasedToBalance=false → cron ainda nao
  // creditou. Editar nesse momento NAO precisa mexer no saldo (cron usa
  // o netCents NOVO ja). Apos release, o net antigo esta no saldo do seller
  // — ajustamos pelo delta.
  const isCreditedTx =
    before.status === "PAID" &&
    !before.divertedToAcquirer &&
    !before.divertedToReferrer &&
    before.releasedToBalance;
  const netDelta = newNet - before.netCents;

  await prisma.$transaction(async (db) => {
    await db.transaction.update({
      where: { id: transactionId },
      data: {
        amountCents: newAmount,
        feeCents: newFee,
        netCents: newNet,
      },
    });
    if (isCreditedTx && netDelta !== 0) {
      // Se netDelta negativo, debita do seller (admin reduziu o valor).
      // Race-safe: se balance < |delta|, deixa balance ir pra 0 (nao
      // permite ficar negativo).
      if (netDelta > 0) {
        await db.user.update({
          where: { id: before.userId },
          data: { balanceCents: { increment: netDelta } },
        });
      } else {
        // delta negativo — debita ate zerar
        const abs = Math.abs(netDelta);
        const u = await db.user.findUnique({
          where: { id: before.userId },
          select: { balanceCents: true },
        });
        const safeDebit = Math.min(abs, u?.balanceCents ?? 0);
        if (safeDebit > 0) {
          await db.user.update({
            where: { id: before.userId },
            data: { balanceCents: { decrement: safeDebit } },
          });
        }
      }
    }
  });

  await logAdminAction(r.admin.id, "tx.value.edit", transactionId, {
    userId: before.userId,
    before: {
      amountCents: before.amountCents,
      feeCents: before.feeCents,
      netCents: before.netCents,
    },
    after: { amountCents: newAmount, feeCents: newFee, netCents: newNet },
    balanceDelta: isCreditedTx ? netDelta : 0,
    status: before.status,
    reason: input.reason,
  });
  revalidatePath(`/admin01/users/${before.userId}`);
  revalidatePath("/admin01/transactions");
  return { ok: true as const, balanceDelta: isCreditedTx ? netDelta : 0 };
}

/**
 * EXCLUIR uma transação (admin) — apaga a tx E reverte o saldo do seller se o
 * net dela já tinha sido creditado (mesma regra do adminUpdateTransaction:
 * PAID && não-desviada && releasedToBalance). REFUNDED/CHARGEBACK já tiveram o
 * saldo revertido pelo estorno → NÃO debita de novo. Debita seguro (nunca
 * deixa o saldo negativo). Atômico + auditado. Motivo obrigatório.
 */
export async function adminDeleteTransaction(transactionId: string, reason: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!reason?.trim()) return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      netCents: true,
      amountCents: true,
      status: true,
      divertedToAcquirer: true,
      divertedToReferrer: true,
      releasedToBalance: true,
      providerPayload: true,
    },
  });
  if (!tx) return { ok: false as const, error: "Transação não encontrada" };
  const wasCredited =
    tx.status === "PAID" &&
    !tx.divertedToAcquirer &&
    !tx.divertedToReferrer &&
    tx.releasedToBalance;
  // Descobre o acquirer_id pra decrementar os counters lifetime (05/07/2026).
  // Antes: tx.delete sem tocar em UserAcquirer.totalAttempts/totalApproved →
  // o histórico "melhor lifetime" ficava inflado depois de qualquer exclusão.
  const acqId = (() => {
    const p = tx.providerPayload as Record<string, unknown> | null;
    const v = p?.acquirer_id;
    return typeof v === "string" ? v : null;
  })();
  let debited = 0;
  try {
    await prisma.$transaction(async (db) => {
      if (wasCredited && tx.netCents > 0) {
        const u = await db.user.findUnique({
          where: { id: tx.userId },
          select: { balanceCents: true },
        });
        const safeDebit = Math.min(tx.netCents, u?.balanceCents ?? 0);
        if (safeDebit > 0) {
          await db.user.update({
            where: { id: tx.userId },
            data: { balanceCents: { decrement: safeDebit } },
          });
          debited = safeDebit;
        }
      }
      // Decrementa counters lifetime (best-effort: só se acqId conhecido e o
      // UserAcquirer existe pra este par seller+acquirer). updateMany é
      // idempotente contra count>0 pra não estourar negativo se soma andou.
      if (acqId) {
        await db.userAcquirer.updateMany({
          where: {
            userId: tx.userId,
            acquirerId: acqId,
            totalAttempts: { gt: 0 },
          },
          data: { totalAttempts: { decrement: 1 } },
        });
        if (tx.status === "PAID") {
          await db.userAcquirer.updateMany({
            where: {
              userId: tx.userId,
              acquirerId: acqId,
              totalApproved: { gt: 0 },
            },
            data: { totalApproved: { decrement: 1 } },
          });
        }
      }
      await db.transaction.delete({ where: { id: transactionId } });
    });
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof Error && /Foreign key|constraint/i.test(e.message)
          ? "Não dá pra excluir: a transação tem registros vinculados."
          : "Falha ao excluir a transação.",
    };
  }
  await logAdminAction(r.admin.id, "tx.delete", transactionId, {
    userId: tx.userId,
    netCents: tx.netCents,
    amountCents: tx.amountCents,
    status: tx.status,
    debited,
    reason: reason.trim(),
  });
  revalidatePath(`/admin01/users/${tx.userId}`);
  revalidatePath("/admin01/transactions");
  return { ok: true as const, debited };
}

/**
 * MARCAR VENDA COMO PAGA manualmente (admin). Pega uma transação PENDENTE (ou
 * EXPIRED — pagamento PIX tardio é legítimo) e roda o MESMO fluxo de um
 * pagamento real via markTransactionPaid: credita o saldo do seller (respeitando
 * holding/retention), agenda/dispara webhooks, pixels e notificações. Atômico e
 * idempotente. NUNCA marca uma tx já PAID/REFUNDED/CHARGEBACK.
 */
export async function adminMarkTransactionPaidAction(transactionId: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, status: true, userId: true, amountCents: true },
  });
  if (!tx) return { ok: false as const, error: "Transação não encontrada" };
  if (tx.status === "PAID") {
    return { ok: false as const, error: "Transação já está PAGA." };
  }
  if (tx.status === "REFUNDED" || tx.status === "CHARGEBACK") {
    return {
      ok: false as const,
      error: `Transação está ${tx.status} — não pode virar paga.`,
    };
  }
  try {
    const { markTransactionPaid } = await import("@/lib/transactions");
    await markTransactionPaid(transactionId);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao marcar como paga.",
    };
  }
  await logAdminAction(r.admin.id, "transaction.mark_paid", transactionId, {
    from: tx.status,
    amountCents: tx.amountCents,
    userId: tx.userId,
  });
  revalidatePath(`/admin01/users/${tx.userId}`);
  revalidatePath("/admin01/transactions");
  return { ok: true as const };
}

/**
 * REVERTE um chargeback já aplicado (08/07/2026, david). Devolve tudo pro
 * seller:
 *   1. Muda status: CHARGEBACK → PAID
 *   2. Re-credita o net (netCents - retention se ainda em holding) no
 *      balance do seller
 *   3. Devolve a multa (CHARGEBACK_PLATFORM_FEE_CENTS) ao seller
 *   4. Re-credita o referrer se havia split
 *   5. Marca release/retention no estado original (releasedToBalance=true)
 *   6. Log adminAction transaction.reverse_chargeback
 *
 * Usa uma logica ESPELHO de reverseSaleCredits — soma no seller o que
 * antes debitava. Idempotente por status: se ja nao esta em CHARGEBACK,
 * retorna erro amigavel.
 */
export async function adminReverseChargebackAction(
  transactionId: string,
  input: { reason: string },
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!input.reason.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      status: true,
      amountCents: true,
      netCents: true,
      feeCents: true,
      paidAt: true,
      retentionAmountCents: true,
      releasedToBalance: true,
      retentionReleased: true,
      providerPayload: true,
      divertedToAcquirer: true,
    },
  });
  if (!tx) return { ok: false as const, error: "Transação não encontrada" };
  if (tx.status !== "CHARGEBACK") {
    return {
      ok: false as const,
      error: `Transação está ${tx.status} — só reverte CHARGEBACK.`,
    };
  }
  // Constant da transactions.ts (mudou pra 150 no commit 08/07 — nao
  // precisamos importar, so somamos R$ 1,50 pra devolver a multa).
  const CHARGEBACK_FEE_CENTS = 150;

  // ─── VALOR DEVOLVIDO AO SELLER (08/07/2026 v2 — david: "volta o valor
  //     da multa + o valor da venda") ───
  //
  // Antes: creditedOriginally variava conforme o estado de holding no
  //   momento do CB. Se a tx nunca tinha sido liberada (releasedToBalance
  //   = false), creditedOriginally = 0 → seller so recebia a multa de
  //   R$ 1,50 quando reverte. Ficava perdido o net da venda.
  //
  // Agora: RE-EFETIVA a venda como se paga hoje — sempre credita net
  //   COMPLETO no balance + a multa devolvida. Ignora estado anterior de
  //   holding pra simplificar (edge case cartao com retencao raramente
  //   cai em CB e mesmo assim faz sentido creditar tudo agora).
  //
  // Excecao unica: tx com divertedToAcquirer=true — seller nunca viu a
  //   venda (skim silencioso pra plataforma), reverter CB nao credita
  //   pra nao dar dinheiro que ele nao teria mesmo se a venda tivesse
  //   ficado paga. Ainda muda status pra PAID pra manter integridade
  //   do painel admin.
  const saleValue = tx.divertedToAcquirer ? 0 : tx.netCents;
  const sellerRefund = saleValue + CHARGEBACK_FEE_CENTS;

  // Referrer split — se havia, reverte tambem
  const referrerEarnings = Number(
    (tx.providerPayload as Record<string, unknown> | null)?.[
      "referrer_earnings_cents"
    ] ?? 0,
  );

  try {
    await prisma.$transaction(async (db) => {
      // 1. Muda status pra PAID
      // FIX 08/07/2026 (Felipe Lopes zumbi no topo do live feed): preserva
      // o paidAt original se ele existir (venda foi paga → CB → agora
      // reverte, a data de pagamento continua a mesma). Se nao existir
      // (edge case: tx nunca teve paidAt), seta agora pra evitar zumbi
      // com paidAt=null que o Postgres joga pro topo do ORDER BY.
      await db.transaction.update({
        where: { id: transactionId },
        data: {
          status: "PAID",
          paidAt: tx.paidAt ?? new Date(),
          releasedToBalance: true,
          retentionReleased: true,
          providerPayload: {
            ...((tx.providerPayload as Record<string, unknown> | null) ?? {}),
            chargeback_reversed_at: new Date().toISOString(),
            chargeback_reverse_reason: input.reason,
            chargeback_reverse_by: r.admin.id,
          } as never,
        },
      });

      // 2. Credita seller
      if (sellerRefund > 0 && !tx.divertedToAcquirer) {
        await db.user.update({
          where: { id: tx.userId },
          data: { balanceCents: { increment: sellerRefund } },
        });
      }

      // 3. Re-credita referrer se havia split
      if (referrerEarnings > 0 && tx.releasedToBalance) {
        const seller = await db.user.findUnique({
          where: { id: tx.userId },
          select: { referredByUserId: true },
        });
        if (seller?.referredByUserId) {
          await db.user.update({
            where: { id: seller.referredByUserId },
            data: {
              balanceCents: { increment: referrerEarnings },
              referralEarningsCents: { increment: referrerEarnings },
            },
          });
        }
      }
    });
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao reverter chargeback.",
    };
  }

  await logAdminAction(r.admin.id, "transaction.reverse_chargeback", transactionId, {
    userId: tx.userId,
    amountCents: tx.amountCents,
    sellerRefundCents: sellerRefund,
    referrerRefundCents: referrerEarnings,
    reason: input.reason,
  });
  revalidatePath(`/admin01/users/${tx.userId}`);
  revalidatePath("/admin01/transactions");
  return {
    ok: true as const,
    sellerRefundCents: sellerRefund,
    referrerRefundCents: referrerEarnings,
  };
}

/**
 * Anotação livre do ADMIN numa transação (observação interna). Só admin vê.
 * Vazio limpa a nota. Auditado (transaction.set_note).
 */
export async function adminSetTransactionNote(
  transactionId: string,
  note: string,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const trimmed = (note ?? "").trim().slice(0, 1000);
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, userId: true },
  });
  if (!tx) return { ok: false as const, error: "Transação não encontrada" };
  await prisma.transaction.update({
    where: { id: transactionId },
    data: { adminNote: trimmed || null },
  });
  await logAdminAction(r.admin.id, "transaction.set_note", transactionId, {
    hasNote: !!trimmed,
  });
  revalidatePath(`/admin01/users/${tx.userId}`);
  return { ok: true as const, note: trimmed || null };
}

/**
 * Solicita REENVIO de documento(s) KYC. Marca o documento (ou TODOS, quando
 * type é omitido) como "rejected" com motivo, e reabre o kycStatus do user pra
 * "rejected" — o seller vê a pendência e é obrigado a reenviar. Auditado.
 */
export async function adminRequestKycResend(userId: string, type?: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const reason = "Reenvio solicitado pelo admin";
  if (type) {
    const doc = await prisma.kycDocument.findUnique({
      where: { userId_type: { userId, type } },
      select: { id: true },
    });
    if (!doc) return { ok: false as const, error: "Documento não encontrado" };
    await prisma.kycDocument.update({
      where: { id: doc.id },
      data: { status: "rejected", rejectionReason: reason },
    });
  } else {
    await prisma.kycDocument.updateMany({
      where: { userId },
      data: { status: "rejected", rejectionReason: reason },
    });
  }
  // Reabre o KYC pra forçar o reenvio (seller vê pendência na dashboard).
  await prisma.user.update({
    where: { id: userId },
    data: { kycStatus: "rejected" },
  });
  await logAdminAction(r.admin.id, "kyc.request_resend", userId, {
    type: type ?? "all",
  });
  revalidatePath(`/admin01/users/${userId}`);
  return { ok: true as const };
}

/**
 * REJEITAR / REVERTER um PRODUTO (anti-fraude). Quando rejected=true, todos os
 * checkouts do produto saem do ar na hora (/c/[slug] checa product.adminRejected)
 * e o seller vê aviso na dashboard. reverter (rejected=false) limpa tudo.
 */
export async function adminSetProductRejected(
  productId: string,
  rejected: boolean,
  reason?: string,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, userId: true },
  });
  if (!p) return { ok: false as const, error: "Produto não encontrado" };
  await prisma.product.update({
    where: { id: productId },
    data: {
      adminRejected: rejected,
      adminRejectReason: rejected ? (reason?.trim() || "Reprovado pelo admin") : null,
      adminRejectedAt: rejected ? new Date() : null,
    },
  });
  await logAdminAction(
    r.admin.id,
    rejected ? "product.reject" : "product.unreject",
    productId,
    { reason: reason ?? null },
  );
  revalidatePath(`/admin01/users/${p.userId}`);
  return { ok: true as const };
}

/**
 * REJEITAR / REVERTER um CHECKOUT isolado (anti-fraude). Tira só este checkout
 * do ar (/c/[slug] → 404). reverter limpa.
 */
export async function adminSetCheckoutRejected(
  checkoutId: string,
  rejected: boolean,
  reason?: string,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const c = await prisma.checkout.findUnique({
    where: { id: checkoutId },
    select: { id: true, userId: true },
  });
  if (!c) return { ok: false as const, error: "Checkout não encontrado" };
  await prisma.checkout.update({
    where: { id: checkoutId },
    data: {
      adminRejected: rejected,
      adminRejectReason: rejected ? (reason?.trim() || "Reprovado pelo admin") : null,
      adminRejectedAt: rejected ? new Date() : null,
    },
  });
  await logAdminAction(
    r.admin.id,
    rejected ? "checkout.reject" : "checkout.unreject",
    checkoutId,
    { reason: reason ?? null },
  );
  revalidatePath(`/admin01/users/${c.userId}`);
  return { ok: true as const };
}

// adminDivertTransaction REMOVIDO (06/07/2026 — a pedido do david).
// Motivos:
//  1. O desvio automatico no PAID (webhookDeviationPercent do seller) ja
//     cobre 100% dos casos operacionais — nao ha necessidade de botao
//     manual dentro da janela 60s.
//  2. Desvio manual criava race com UTMify que exigia sendUtmifyCancellation
//     como workaround. Removendo o caminho manual, elimina a superficie.
// adminUndivertTransaction (abaixo) FICA — continua util pra reverter
// desvios AUTOMATICOS que ficaram muito na cara.

/**
 * REVERTE um desvio (de-desviar). Util quando o desvio foi "muito na cara"
 * e o seller comecou a reclamar. Devolve a venda como PAID legitima:
 *  - Limpa divertedToAcquirer + divertedToReferrer.
 *  - Se foi rede (cron ja creditou referrer): DEBITA o referrer (balance,
 *    referralEarnings, referralDeviationEarnings) pelo valor do split.
 *  - Credita o seller (netCents - retencao) imediatamente.
 *  - Marca releasedToBalance=true pra holding-release nao re-creditar.
 *  - Dispara webhook/push/email/sale-bot pro seller (fireSellerSidePaid-
 *    Dispatches) — agora a venda aparece pra ele de verdade.
 *  - Limpa diversion_*_cents do providerPayload.
 *  - Log "tx.undivert" pra auditoria.
 */
export async function adminUndivertTransaction(
  transactionId: string,
  input: { reason: string },
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!input.reason.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      amountCents: true,
      netCents: true,
      retentionAmountCents: true,
      status: true,
      divertedToAcquirer: true,
      divertedToReferrer: true,
      releasedToBalance: true,
      providerPayload: true,
      sellerNotifiedAt: true,
    },
  });
  if (!tx) return { ok: false as const, error: "Transação não encontrada" };
  if (tx.status !== "PAID") {
    return { ok: false as const, error: "Tx não está PAID" };
  }
  if (!tx.divertedToAcquirer && !tx.divertedToReferrer) {
    return {
      ok: false as const,
      error: "Tx não está desviada — nada pra reverter",
    };
  }

  const payload = (tx.providerPayload as Record<string, unknown> | null) ?? {};
  const wasReferrer = tx.divertedToReferrer;
  const referrerShareRaw = Number(payload.diversion_referrer_cents ?? 0);
  const referrerShare = Number.isFinite(referrerShareRaw)
    ? referrerShareRaw
    : 0;
  const referrerId =
    typeof payload.diversion_referrer_id === "string"
      ? payload.diversion_referrer_id
      : null;
  const wasKind = tx.divertedToAcquirer ? "acquirer" : "referrer";

  await prisma.$transaction(async (db) => {
    // 1. Limpa flags + diversion_*_cents
    const cleanPayload = { ...payload };
    delete cleanPayload.diversion_platform_cents;
    delete cleanPayload.diversion_referrer_cents;
    delete cleanPayload.diversion_referrer_id;
    // BUG-FIX (rede): também remove referrer_earnings_cents. Uma venda desviada
    // carrega ESTE campo congelado (do checkout/upsell), mas o referrer foi
    // creditado só pelo SPLIT do desvio (diversion_referrer_cents), nunca por
    // referrer_earnings_cents (markPaid/holding-release pulam divertedToReferrer).
    // Como o undivert seta releasedToBalance=true sem creditar o split normal,
    // um refund/chargeback POSTERIOR cairia no bloco de clawback de
    // referrer_earnings_cents (gated em releasedToBalance) e DEBITARIA o referrer
    // por dinheiro que ele nunca recebeu. Removendo o campo aqui, o estorno
    // futuro não fantasma-debita o referrer.
    delete cleanPayload.referrer_earnings_cents;
    await db.transaction.update({
      where: { id: transactionId },
      data: {
        divertedToAcquirer: false,
        divertedToReferrer: false,
        providerPayload: cleanPayload as never,
        // Marca releasedToBalance=true pra holding-release nao tentar
        // creditar de novo (estamos creditando manualmente abaixo).
        releasedToBalance: true,
        // Marca notificacao agora pra views do seller verem a venda.
        sellerNotifiedAt: tx.sellerNotifiedAt ?? new Date(),
        // Reagenda UTMify pro proximo cron pegar como paid (audit 06/07).
        // adminDivertTransaction seta utmifyDispatchedAt=now pra bloquear
        // o cron; undivert precisa desbloquear pra a venda voltar a aparecer
        // corretamente no painel do seller. Reset scheduledAt=now,
        // dispatchedAt=null → cron dispatch-utmify pega em <=1min e envia
        // status=paid (idempotente por orderId — sobrescreve o refused).
        utmifyScheduledAt: new Date(),
        utmifyDispatchedAt: null,
      },
    });

    // 2. Reverte credito do referrer se foi divertedToReferrer + ja tinha
    //    creditado (payload tem diversion_referrer_cents > 0).
    if (wasReferrer && referrerId && referrerShare > 0) {
      // FIX 08/07/2026 (audit ohipnotic): so decrement o deviation lifetime,
      // matching o increment corrigido (nao mais duplicado).
      // updateMany com guard (balanceCents >= debit) seria ideal mas pode
      // resultar em saldo negativo se ja saiu via outro saque do referrer.
      // Aceitamos negativacao aqui — admin esta cientemente revertendo.
      await db.user.update({
        where: { id: referrerId },
        data: {
          balanceCents: { decrement: referrerShare },
          referralDeviationEarningsCents: { decrement: referrerShare },
        },
      });
    }

    // 3. Credita seller imediato (net - retencao).
    const creditCents = tx.netCents - (tx.retentionAmountCents ?? 0);
    if (creditCents > 0) {
      await db.user.update({
        where: { id: tx.userId },
        data: { balanceCents: { increment: creditCents } },
      });
    }
  });

  // 4. Dispara webhook+push+email+sale-bot+conquistas pro seller agora.
  //    fire-and-forget pra nao bloquear a resposta.
  import("@/lib/transactions")
    .then(({ fireSellerSidePaidDispatches }) =>
      fireSellerSidePaidDispatches(transactionId),
    )
    .catch((e) => console.error("[tx.undivert] dispatches failed:", e));

  await logAdminAction(r.admin.id, "tx.undivert", transactionId, {
    userId: tx.userId,
    wasKind,
    amountCents: tx.amountCents,
    netCents: tx.netCents,
    creditedToSeller: Math.max(0, tx.netCents - (tx.retentionAmountCents ?? 0)),
    referrerDebit: wasReferrer ? referrerShare : 0,
    referrerId,
    reason: input.reason,
  });

  revalidatePath(`/admin01/users/${tx.userId}`);
  revalidatePath("/admin01/transactions");
  return { ok: true as const };
}

/**
 * REEMBOLSO FAKE por transacao — agenda esta venda PAID pra virar REFUNDED
 * automaticamente daqui a `days` dias. O cron /api/cron/fake-refunds aplica
 * (reverte saldo + taxa + dispara webhook transaction.refunded), marcando
 * providerPayload.fake_refund=true. NAO chama o PSP. days=0 → cai na proxima
 * rodada do cron (quase imediato).
 */
export async function adminScheduleFakeRefund(
  transactionId: string,
  input: { days: number; reason: string },
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!input.reason.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  const days = Math.max(0, Math.min(365, Math.floor(input.days)));

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      status: true,
      amountCents: true,
      divertedToAcquirer: true,
      divertedToReferrer: true,
      fakeRefundApplied: true,
    },
  });
  if (!tx) return { ok: false as const, error: "Transação não encontrada" };
  if (tx.status !== "PAID") {
    return { ok: false as const, error: "Tx não está PAID — só dá pra reembolsar venda paga" };
  }
  if (tx.fakeRefundApplied) {
    return { ok: false as const, error: "Reembolso fake já foi aplicado nessa tx" };
  }
  if (tx.divertedToAcquirer || tx.divertedToReferrer) {
    return { ok: false as const, error: "Tx desviada — reembolso fake não se aplica" };
  }

  // 23/07/2026 (davi: "Tira esse negocio de agendado pra 7 dias, eu fiz o
  // med fake para aparecer agora ja!"). Se days=0, aplica IMEDIATAMENTE em
  // vez de agendar — chama a mesma logica do cron fake-refunds inline (claim
  // atomico + markTransactionRefunded). Se days>0, agenda pra virar refund
  // no futuro (cron pega quando now >= scheduledAt).
  const scheduledAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.transaction.update({
    where: { id: transactionId },
    data: { fakeRefundScheduledAt: scheduledAt, fakeRefundApplied: false },
  });

  let appliedNow = false;
  if (days === 0) {
    // Aplica AGORA — mesma logica do cron fake-refunds
    try {
      const claim = await prisma.transaction.updateMany({
        where: { id: transactionId, status: "PAID", fakeRefundApplied: false },
        data: {
          fakeRefundApplied: true,
          providerPayload: {
            ...((await prisma.transaction.findUnique({
              where: { id: transactionId },
              select: { providerPayload: true },
            }))?.providerPayload as Record<string, unknown> | null ?? {}),
            fake_refund: true,
            fake_refund_at: new Date().toISOString(),
            fake_refund_admin_manual: true,
          } as never,
        },
      });
      if (claim.count > 0) {
        const { markTransactionRefunded } = await import("@/lib/transactions");
        await markTransactionRefunded(transactionId);
        appliedNow = true;
      }
    } catch (e) {
      console.error("[adminScheduleFakeRefund] apply-now falhou:", e);
      // Nao explode — se falhar, deixa agendado pro cron pegar depois (o
      // fakeRefundScheduledAt=agora ja garante que o proximo cron aplica).
    }
  }

  await logAdminAction(r.admin.id, "tx.fake_refund_schedule", transactionId, {
    userId: tx.userId,
    days,
    appliedNow,
    amountCents: tx.amountCents,
    reason: input.reason,
  });

  revalidatePath(`/admin01/users/${tx.userId}`);
  revalidatePath("/admin01/transactions");
  return { ok: true as const, scheduledAt: scheduledAt.toISOString(), appliedNow };
}

/** Cancela um reembolso fake AGENDADO (ainda não aplicado). */
export async function adminCancelFakeRefund(transactionId: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, userId: true, fakeRefundApplied: true },
  });
  if (!tx) return { ok: false as const, error: "Transação não encontrada" };
  if (tx.fakeRefundApplied) {
    return { ok: false as const, error: "Reembolso fake já aplicado — não dá pra cancelar" };
  }

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { fakeRefundScheduledAt: null },
  });

  await logAdminAction(r.admin.id, "tx.fake_refund_cancel", transactionId, {
    userId: tx.userId,
  });

  revalidatePath(`/admin01/users/${tx.userId}`);
  revalidatePath("/admin01/transactions");
  return { ok: true as const };
}

export async function adminApproveWithdrawalAction(withdrawalId: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const { adminApproveWithdrawal } = await import("@/lib/withdrawals");
  const result = await adminApproveWithdrawal(withdrawalId);
  await logAdminAction(
    r.admin.id,
    result.ok ? "withdrawal.approve" : "withdrawal.approve.fail",
    withdrawalId,
    result,
  );
  revalidatePath("/admin01/withdrawals");
  return result;
}

/**
 * RETRY do saque AUTOMÁTICO (botão no painel). Re-dispara o envio via SafePix
 * pra um saque PENDING — tentando todas as contas com saldo. Override de admin:
 * ignora "auto desligado pro seller", teto diário e circuit breaker (mas
 * respeita kill-switch global e seller bloqueado). Útil quando o auto falhou
 * por algo transitório/conta específica (ex: "transferência desabilitada").
 */
export async function adminRetryAutoWithdrawAction(withdrawalId: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const { tryAutoWithdraw } = await import("@/lib/auto-withdrawal");
  const outcome = await tryAutoWithdraw(withdrawalId, { adminOverride: true });
  await logAdminAction(r.admin.id, "withdrawal.auto_retry", withdrawalId, {
    outcome,
  });
  revalidatePath("/admin01/withdrawals");
  if (outcome.status === "paid") {
    return { ok: true as const, message: "Enviado e marcado como PAGO ✓" };
  }
  if (outcome.status === "processing") {
    return {
      ok: true as const,
      message:
        "Enviado — em processamento (timeout ambíguo na SafePix; confira o saldo).",
    };
  }
  // skipped / reverted → não enviou
  const REASONS: Record<string, string> = {
    kill_switch: "Kill-switch global LIGADO — desligue pra enviar.",
    kill_switch_db: "Kill-switch global LIGADO — desligue pra enviar.",
    blocked: "Seller bloqueado.",
    not_eligible: "Saque não está PENDENTE ou não é PIX.",
    no_pix_key: "Saque sem chave PIX.",
    zero_payout: "Valor líquido zero.",
    no_account_with_balance:
      "Nenhuma conta SafePix sozinha tem saldo pro valor (saldo disperso).",
    already_claimed: "Saque já está sendo processado.",
  };
  const reason = outcome.reason ?? "erro_desconhecido";
  return {
    ok: false as const,
    error: REASONS[reason] ?? `Não enviou: ${reason}`,
  };
}

export async function adminRejectWithdrawalAction(
  withdrawalId: string,
  reason: string,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!reason.trim()) {
    return { ok: false as const, error: "Motivo obrigatório" };
  }
  const { adminRejectWithdrawal } = await import("@/lib/withdrawals");
  const result = await adminRejectWithdrawal(withdrawalId, reason);
  await logAdminAction(
    r.admin.id,
    result.ok ? "withdrawal.reject" : "withdrawal.reject.fail",
    withdrawalId,
    { reason, result },
  );
  revalidatePath("/admin01/withdrawals");
  return result;
}

/* ============ ADQUIRENTES ============ */

const AcquirerSchema = z.object({
  code: z.string().min(1).max(40),
  nominalName: z.string().min(1).max(200),
  /**
   * Instituição/PSP por trás da nominal. Normalmente auto-detectada do código
   * PIX (domínio do URL na tag 26 do EMV), mas em PIX de CHAVE ESTÁTICA não há
   * domínio — então o admin preenche manualmente. Exibida como "Nominal - inst".
   */
  institution: z.string().trim().max(40).optional().nullable(),
  shortCode: z.string().min(1).max(10),
  /**
   * "black" (sem MED PIX, sem reembolso), "white" (com MED + reembolso),
   * "both" (disponível pra ambos os modos do user), "hot" (categoria separada
   * — só sellers em pixOpsMode=hot usam; cobra +R$0,75/venda) ou "sag"
   * (categoria exclusiva do modo sub adquirente gateway).
   */
  mode: z.enum(ACQUIRER_MODES).optional(),
  supportsPix: z.boolean().optional(),
  supportsCard: z.boolean().optional(),
  supportsApplePay: z.boolean().optional(),
  supportsGooglePay: z.boolean().optional(),
  extraFeePercent: z.number().min(0).max(100).optional(),
  /** Prioridade global (menor = primária) */
  priority: z.number().int().min(0).max(9999).optional(),
  /** Custo que a PLATAFORMA paga pra adquirente por PIX (default SafePix: 4.99% + R$ 1,00) */
  pixCostPercent: z.number().min(0).max(100).optional(),
  pixCostFixedCents: z.number().int().min(0).max(10000).optional(),
  cardCostPercent: z.number().min(0).max(100).optional(),
  cardCostFixedCents: z.number().int().min(0).max(10000).optional(),
  /** Surcharge no fee do seller quando essa adquirente eh usada (soma direto) */
  extraSellerFeePercent: z.number().min(0).max(100).optional(),
  extraSellerFeeFixedCents: z.number().int().min(0).max(100000).optional(),
  /** Override no % de desvio quando essa adquirente eh usada (soma direto) */
  extraDiversionPercent: z.number().min(0).max(100).optional(),
  /** Reembolso fake por adquirente: % das vendas roteadas por ela que viram
   *  REFUNDED automaticamente + dias ate cair. */
  fakeRefundPercent: z.number().min(0).max(100).optional(),
  fakeRefundDelayDays: z.number().int().min(0).max(365).optional(),
  /** Credenciais da conta — salva publicKey plain e secretKey encriptada */
  publicKey: z.string().trim().max(300).optional().nullable(),
  secretKey: z.string().trim().max(300).optional().nullable(),
  companyId: z.string().trim().max(100).optional().nullable(),
  /** E-mail da conta da adquirente (login no PSP). Plaintext, admin-only. */
  accountEmail: z.string().trim().max(200).optional().nullable(),
  active: z.boolean().optional(),
  /**
   * Observação livre do admin. Aparece como tag pequena ao lado do
   * nominal pros sellers quando preenchida. Vazio/null = sem tag.
   * Útil pra "instável hoje", "promoção até sábado", etc.
   */
  adminNote: z.string().trim().max(200).optional().nullable(),
  /**
   * Trava o nominal name pra NUNCA ser atualizado automaticamente pelo
   * dispatcher (que normalmente lê o nome do recebedor do QR Code).
   * Útil quando admin quer manter um nome "comercial" fixo.
   */
  lockNominalName: z.boolean().optional(),
  /** Esconde a adquirente das telas do seller (continua processando normal). */
  hiddenFromSellers: z.boolean().optional(),
  /**
   * Adquirente privada (05/07/2026): so aparece pros sellers cujo email esta
   * em privateAllowedEmails. Se true e a lista esta vazia, NINGUEM ve
   * (equivalente a hiddenFromSellers pra todos). Comparacao case-insensitive
   * e com trim aplicados no filtro em runtime.
   */
  isPrivate: z.boolean().optional(),
  privateAllowedEmails: z.array(z.string().trim().toLowerCase().email()).max(500).optional(),
  /**
   * DENYLIST por email (07/07/2026): esses emails NAO veem essa adquirente,
   * mesmo que ela seja publica. Vale por cima de tudo. Uso: esconder
   * adquirente pra um seller especifico sem virar privada.
   */
  hiddenFromEmails: z.array(z.string().trim().toLowerCase().email()).max(500).optional(),
});

/**
 * Trava anti-typo: o roteamento pra SafePix é por `code.startsWith("safepix")`
 * (lib/acquirers.ts, acquirer-balance.ts, emergency-sweep.ts). Se a chave é
 * SafePix mas o code não começa com "safepix" (ex: "safe-pix-7"), a adquirente
 * é salva mas NUNCA roteia — falha silenciosa. Bloqueamos aqui com mensagem clara.
 */
function checkSafePixCodeMatch(
  code: string | undefined | null,
  publicKey: string | undefined | null,
): { ok: true } | { ok: false; error: string } {
  const isSafePixKey = !!publicKey && /^safepix_/i.test(publicKey.trim());
  if (!isSafePixKey || !code) return { ok: true };
  if (!code.trim().toLowerCase().startsWith("safepix")) {
    return {
      ok: false,
      error: `Código de adquirente SafePix deve começar com "safepix" (ex: safepix-7). Você digitou "${code.trim()}".`,
    };
  }
  return { ok: true };
}

export async function adminCreateAcquirer(input: z.infer<typeof AcquirerSchema>) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const parsed = AcquirerSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };
  const codeCheck = checkSafePixCodeMatch(parsed.data.code, parsed.data.publicKey);
  if (!codeCheck.ok) return { ok: false as const, error: codeCheck.error };
  try {
    const { secretKey, ...rest } = parsed.data;
    const data = {
      ...rest,
      ...(secretKey
        ? { secretKeyEnc: (await import("@/lib/crypto")).encryptString(secretKey) }
        : {}),
    };
    const a = await prisma.acquirer.create({ data });
    // log sem expor secret
    await logAdminAction(r.admin.id, "acquirer.create", a.id, {
      ...rest,
      secretKey: secretKey ? "(set)" : null,
    });
    revalidatePath("/admin01/acquirers");
    return { ok: true as const, id: a.id };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof Error && e.message.includes("Unique")
          ? "Code já existe"
          : "Erro ao criar adquirente",
    };
  }
}

const AcquirerUpdateSchema = AcquirerSchema.partial().extend({
  id: z.string(),
});

export async function adminUpdateAcquirer(
  input: z.infer<typeof AcquirerUpdateSchema>,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const parsed = AcquirerUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };
  const codeCheck = checkSafePixCodeMatch(parsed.data.code, parsed.data.publicKey);
  if (!codeCheck.ok) return { ok: false as const, error: codeCheck.error };
  const { id, secretKey, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (secretKey !== undefined) {
    if (!secretKey) data.secretKeyEnc = null;
    else data.secretKeyEnc = (await import("@/lib/crypto")).encryptString(secretKey);
  }
  await prisma.acquirer.update({ where: { id }, data });

  // Cascade: se desativou a adquirente, desativa também todas as
  // UserAcquirer que apontam pra ela. Senão sellers continuariam
  // tentando usar uma adquirente "morta" até o filtro do dispatcher
  // pegar (que pega — mas isso garante que stats não atualizem).
  if (rest.active === false) {
    await prisma.userAcquirer.updateMany({
      where: { acquirerId: id },
      data: { active: false },
    });
  }

  await logAdminAction(r.admin.id, "acquirer.update", id, {
    ...rest,
    ...(secretKey !== undefined ? { secretKey: secretKey ? "(set)" : "(cleared)" } : {}),
  });
  revalidatePath("/admin01/acquirers");
  return { ok: true as const };
}

/**
 * Promove a adquirente passada pra primária GLOBAL (priority=0) e demove as
 * outras pra priority=100. Opcionalmente reseta as UserAcquirer dos sellers
 * pra eles passarem a usar a nova primária no próximo Pix.
 */
export async function adminMakeAcquirerPrimary(
  id: string,
  resetUserAcquirers: boolean,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };

  const target = await prisma.acquirer.findUnique({ where: { id } });
  if (!target) return { ok: false as const, error: "Adquirente não encontrada" };

  await prisma.$transaction([
    // Demove todas as outras (que estão em 0 ou abaixo da nova)
    prisma.acquirer.updateMany({
      where: { id: { not: id }, priority: { lt: 100 } },
      data: { priority: 100 },
    }),
    // Promove a alvo
    prisma.acquirer.update({
      where: { id },
      data: { priority: 0, active: true },
    }),
  ]);

  let resetCount = 0;
  if (resetUserAcquirers) {
    // Deleta todas as UserAcquirer pra forçar lazy bootstrap usando a nova primária.
    // ⚠️ Apaga stats acumulados (totalAttempts/totalApproved) — usar com cuidado.
    const del = await prisma.userAcquirer.deleteMany({});
    resetCount = del.count;
  }

  await logAdminAction(r.admin.id, "acquirer.make_primary", id, {
    code: target.code,
    resetUserAcquirers,
    resetCount,
  });
  revalidatePath("/admin01/acquirers");
  return { ok: true as const, resetCount };
}

export async function adminDeleteAcquirer(id: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  await prisma.acquirer.delete({ where: { id } });
  await logAdminAction(r.admin.id, "acquirer.delete", id);
  revalidatePath("/admin01/acquirers");
  return { ok: true as const };
}

/**
 * ADMIN-ONLY: gera um PIX avulso numa adquirente especifica. Serve pra
 * DEPOSITAR dinheiro no gateway (gera + paga → cai na conta PSP) ou TESTAR
 * o nominal (nome do recebedor no QR) daquela conta. Nao cria Transaction.
 * Auditado.
 */
export async function adminGeneratePix(input: {
  acquirerId: string;
  amountCents: number;
}) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };

  const amountCents = Math.floor(Number(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return { ok: false as const, error: "Valor mínimo R$ 0,50." };
  }
  if (amountCents > 5_000_00) {
    return { ok: false as const, error: "Valor máximo R$ 5.000,00 por geração." };
  }

  const { adminChargePixOnAcquirer } = await import("@/lib/acquirers");
  const res = await adminChargePixOnAcquirer({
    acquirerId: input.acquirerId,
    amountCents,
  });

  if (!res.ok || !res.charge) {
    return { ok: false as const, error: res.error ?? "Falha ao gerar PIX." };
  }

  await logAdminAction(r.admin.id, "acquirer.generate_pix", input.acquirerId, {
    amountCents,
    acquirerCode: res.acquirerCode,
    nominalName: res.nominalName,
    providerId: res.charge.id,
  });

  return {
    ok: true as const,
    providerId: res.charge.id,
    copyPaste: res.charge.qrCode,
    nominalName: res.nominalName ?? null,
    expiresAt: res.charge.expiresAt,
    amountCents,
  };
}

/**
 * Refresh de nominal de UMA adquirente especifica. Chama refreshOneNominal
 * (via wrapper adminRefreshOneNominal) — gera 1 PIX no PSP, re-parseia o
 * nome do recebedor e atualiza Acquirer.nominalName + loga historico.
 *
 * Usado pelo botao "Atualizar nominal" em cada linha do /admin01/acquirers
 * (substituiu o antigo botao "PIX" — pedido do david 05/07). Retorna o
 * antes/depois pra UI mostrar toast do resultado.
 */
export async function adminRefreshOneNominalAction(acquirerId: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const { adminRefreshOneNominal } = await import("@/lib/acquirers");
  const result = await adminRefreshOneNominal(acquirerId);
  await logAdminAction(
    r.admin.id,
    "acquirer.refresh_one_nominal",
    acquirerId,
    {
      ok: result.ok,
      ...(result.ok
        ? {
            oldNominal: result.oldNominal,
            newNominal: result.newNominal,
            changed: result.changed,
            locked: "locked" in result ? result.locked : false,
          }
        : { error: (result as { error?: string }).error }),
    },
  );
  revalidatePath("/admin01/acquirers");
  return result;
}

/**
 * Gera 1 PIX em TODAS as adquirentes (PIX) de uma vez pra RE-PARSEAR e
 * atualizar as nominais (Acquirer.nominalName) a partir do QR. Reporta o
 * que mudou. Auditado.
 */
export async function adminRefreshAllNominaisAction(amountCents?: number) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const { adminRefreshAllNominais } = await import("@/lib/acquirers");
  const { results } = await adminRefreshAllNominais(amountCents ?? 500);
  const changed = results.filter((x) => x.changed).length;
  const failed = results.filter((x) => !x.ok).length;
  await logAdminAction(
    r.admin.id,
    "acquirer.refresh_all_nominais",
    undefined,
    { total: results.length, changed, failed },
  );
  revalidatePath("/admin01/acquirers");
  return { ok: true as const, results };
}

/**
 * Forca refresh do saldo de uma adquirente (busta o cache 60s in-memory).
 * Util quando admin quer ver o saldo atualizado sem esperar TTL.
 */
export async function adminRefreshAcquirerBalance(acquirerId: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  try {
    const { getAcquirerBalance } = await import("@/lib/acquirer-balance");
    const result = await getAcquirerBalance(acquirerId, true);
    await logAdminAction(r.admin.id, "acquirer.balance.refresh", acquirerId, {
      availableCents: result.availableCents,
      currency: result.currency,
    });
    revalidatePath("/admin01/acquirers");
    revalidatePath("/admin01/withdrawals");
    return { ok: true as const, balance: result };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao atualizar",
    };
  }
}

/**
 * Define ajuste manual no saldo exibido (signed cents).
 * Util pra reconciliar com o saldo real do banco quando ha diff vs API.
 * Auditado.
 */
export async function adminSetAcquirerAdjustment(
  acquirerId: string,
  adjustmentCents: number,
  reason: string,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!reason.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  if (
    !Number.isFinite(adjustmentCents) ||
    adjustmentCents < -100_000_000_000 ||
    adjustmentCents > 100_000_000_000
  ) {
    return { ok: false as const, error: "Valor fora dos limites" };
  }
  const before = await prisma.acquirer.findUnique({
    where: { id: acquirerId },
    select: { balanceAdjustmentCents: true, code: true },
  });
  if (!before) return { ok: false as const, error: "Adquirente não encontrada" };

  await prisma.acquirer.update({
    where: { id: acquirerId },
    data: { balanceAdjustmentCents: Math.floor(adjustmentCents) },
  });
  await logAdminAction(r.admin.id, "acquirer.balance.adjust", acquirerId, {
    code: before.code,
    before: before.balanceAdjustmentCents,
    after: Math.floor(adjustmentCents),
    reason,
  });
  revalidatePath("/admin01/acquirers");
  revalidatePath("/admin01/withdrawals");
  return { ok: true as const };
}

/* ============ TEMAS PAGOS (admin) ============ */

export async function adminGrantTheme(input: { userId: string; themeKey: string }) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!input.userId || !input.themeKey) return { ok: false as const, error: "Dados inválidos" };
  const { grantThemeWithoutCharge, isFreeTheme } = await import("@/lib/theme-access");
  const { THEMES } = await import("@/lib/themes");
  if (!THEMES.some((t) => t.key === input.themeKey)) {
    return { ok: false as const, error: "Tema desconhecido" };
  }
  if (isFreeTheme(input.themeKey)) {
    return { ok: false as const, error: "Tema é grátis — não precisa conceder" };
  }
  const res = await grantThemeWithoutCharge(input.userId, input.themeKey as never, "admin_grant");
  if (!res.ok) return { ok: false as const, error: res.reason ?? "Erro" };
  await logAdminAction(r.admin.id, "theme.grant", input.userId, { themeKey: input.themeKey });
  revalidatePath("/admin01/themes");
  return { ok: true as const };
}

export async function adminRevokeTheme(input: { userId: string; themeKey: string }) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!input.userId || !input.themeKey) return { ok: false as const, error: "Dados inválidos" };
  await prisma.themePurchase.deleteMany({
    where: { userId: input.userId, themeKey: input.themeKey },
  });
  await logAdminAction(r.admin.id, "theme.revoke", input.userId, { themeKey: input.themeKey });
  revalidatePath("/admin01/themes");
  return { ok: true as const };
}

/* ============ RANKING OVERRIDES ============ */

const RankingSchema = z.object({
  monthKey: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "monthKey inválido (YYYY-MM)"),
  position: z.number().int().min(1).max(5),
  name: z.string().trim().min(1).max(60),
  avatarUrl: z.string().url().nullable().optional(),
});

export async function adminUpdateRankingOverride(input: z.infer<typeof RankingSchema>) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const parsed = RankingSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };
  await prisma.rankingOverride.upsert({
    where: {
      monthKey_position: {
        monthKey: parsed.data.monthKey,
        position: parsed.data.position,
      },
    },
    create: {
      monthKey: parsed.data.monthKey,
      position: parsed.data.position,
      name: parsed.data.name,
      avatarUrl: parsed.data.avatarUrl ?? null,
      editedBy: r.admin.id,
    },
    update: {
      name: parsed.data.name,
      avatarUrl: parsed.data.avatarUrl ?? null,
      editedBy: r.admin.id,
    },
  });
  await logAdminAction(
    r.admin.id,
    "ranking.update",
    `${parsed.data.monthKey}/${parsed.data.position}`,
    parsed.data,
  );
  revalidatePath("/admin01/ranking");
  revalidatePath("/dashboard/ranking");
  return { ok: true as const };
}

export async function adminClearRankingOverride(input: {
  monthKey: string;
  position: number;
}) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (input.position < 1 || input.position > 5)
    return { ok: false as const, error: "Posição inválida" };
  if (!/^\d{4}-\d{2}$/.test(input.monthKey))
    return { ok: false as const, error: "monthKey inválido" };
  await prisma.rankingOverride.deleteMany({
    where: { monthKey: input.monthKey, position: input.position },
  });
  await logAdminAction(
    r.admin.id,
    "ranking.clear",
    `${input.monthKey}/${input.position}`,
  );
  revalidatePath("/admin01/ranking");
  revalidatePath("/dashboard/ranking");
  return { ok: true as const };
}

/* ============ ADQUIRENTES — toggle global ============ */

export async function adminToggleAcquirerGlobal(input: {
  acquirerId: string;
  enabled: boolean;
}) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const updated = await prisma.acquirer.update({
    where: { id: input.acquirerId },
    data: { globalEnabled: input.enabled },
    select: { id: true, code: true, nominalName: true, globalEnabled: true },
  });
  await logAdminAction(
    r.admin.id,
    input.enabled ? "acquirer.global.enable" : "acquirer.global.disable",
    updated.id,
    { code: updated.code, name: updated.nominalName },
  );
  revalidatePath("/admin01/acquirers");
  return { ok: true as const, acquirer: updated };
}

/* ============ KYC: auditoria pós-aprovação automática ============ */

/**
 * Quando o seller envia docs, o sistema marca `approved` na hora.
 * Esta ação permite o admin REVERTER essa aprovação (rejeitar após análise).
 * Bloqueia o seller até reenviar os documentos.
 */
export async function adminRevertKycApproval(input: {
  userId: string;
  reason: string;
}) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!input.userId) return { ok: false as const, error: "User inválido" };
  if (!input.reason || input.reason.trim().length < 5) {
    return { ok: false as const, error: "Motivo obrigatório (mín. 5 caracteres)" };
  }

  await prisma.user.update({
    where: { id: input.userId },
    data: {
      kycStatus: "rejected",
      kycRejectionReason: input.reason.slice(0, 280),
    },
  });
  // Marca a notificação correspondente como tratada
  await prisma.adminNotification.updateMany({
    where: { type: "kyc_pending_audit", targetUserId: input.userId, resolved: false },
    data: { resolved: true, resolution: "rejected", resolvedAt: new Date() },
  });
  await logAdminAction(r.admin.id, "kyc.revert_approval", input.userId, {
    reason: input.reason,
  });
  revalidatePath("/admin01/documents");
  revalidatePath("/admin01/dashboard");
  return { ok: true as const };
}

/**
 * Confirma a aprovação automática após auditoria (mantém o status atual approved).
 * Marca a notificação como resolvida.
 */
/**
 * Confirma aprovacao KYC de um seller — opcionalmente ajusta as taxas
 * dele no mesmo ato. Util pra admin definir taxas customizadas DIRETO
 * na auditoria de docs sem ter que ir em /admin01/users/[id] depois.
 *
 * Se `fees` vier: valida ranges + aplica antes do confirm. Se nao vier,
 * mantem o que ja esta (default 6.99% + R$ 2.50 pra PIX, 9.90% + R$ 3.60
 * pra cartao).
 */
const FeesSchema = z.object({
  feePercent: z.number().min(0).max(100).optional(),
  feeFixedCents: z.number().int().min(0).max(100000).optional(),
  cardFeePercent: z.number().min(0).max(100).optional(),
  cardFeeFixedCents: z.number().int().min(0).max(100000).optional(),
});

export async function adminConfirmKycApproval(
  userId: string,
  fees?: z.infer<typeof FeesSchema>,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };

  // Se admin passou taxas customizadas, valida e aplica antes do confirm
  if (fees) {
    const parsed = FeesSchema.safeParse(fees);
    if (!parsed.success) {
      return { ok: false as const, error: "Taxas inválidas" };
    }
    const data: Record<string, number> = {};
    if (parsed.data.feePercent !== undefined)
      data.feePercent = parsed.data.feePercent;
    if (parsed.data.feeFixedCents !== undefined)
      data.feeFixedCents = parsed.data.feeFixedCents;
    if (parsed.data.cardFeePercent !== undefined)
      data.cardFeePercent = parsed.data.cardFeePercent;
    if (parsed.data.cardFeeFixedCents !== undefined)
      data.cardFeeFixedCents = parsed.data.cardFeeFixedCents;
    if (Object.keys(data).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data,
      });
      await logAdminAction(r.admin.id, "kyc.fees_set", userId, data);
    }
  }

  await prisma.adminNotification.updateMany({
    where: { type: "kyc_pending_audit", targetUserId: userId, resolved: false },
    data: { resolved: true, resolution: "approved", resolvedAt: new Date() },
  });
  await logAdminAction(r.admin.id, "kyc.confirm_approval", userId);
  revalidatePath("/admin01/documents");
  revalidatePath("/admin01/dashboard");
  return { ok: true as const };
}

/* ============ BLOQUEAR / DESBLOQUEAR USUÁRIO ============ */

export async function adminBlockUser(input: { userId: string; reason: string }) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!input.userId) return { ok: false as const, error: "User inválido" };
  await prisma.user.update({
    where: { id: input.userId },
    data: {
      blocked: true,
      blockReason: (input.reason || "Bloqueado pelo administrador").slice(0, 280),
    },
  });
  // BAN HARD: invalida TODAS as sessoes ativas → desloga na hora. Combinado
  // com o hook session.create.before, o seller nao consegue nem logar de novo.
  await prisma.session
    .deleteMany({ where: { userId: input.userId } })
    .catch(() => {});
  await logAdminAction(r.admin.id, "user.block", input.userId, { reason: input.reason });
  revalidatePath("/admin01/users");
  return { ok: true as const };
}

export async function adminUnblockUser(userId: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  await prisma.user.update({
    where: { id: userId },
    data: { blocked: false, blockReason: null },
  });
  await logAdminAction(r.admin.id, "user.unblock", userId);
  revalidatePath("/admin01/users");
  return { ok: true as const };
}

/**
 * BLOQUEIO/DESBLOQUEIO EM MASSA (hard ban). NUNCA toca contas admin. Ban hard:
 * derruba as sessões dos bloqueados na hora. Auditado. Máx 500 por vez.
 */
export async function adminBulkBlockUsers(input: {
  userIds: string[];
  reason: string;
  block: boolean;
}) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (input.block && !input.reason?.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  const ids = Array.from(new Set((input.userIds ?? []).filter(Boolean)));
  if (ids.length === 0) return { ok: false as const, error: "Nenhum usuário selecionado" };
  if (ids.length > 500) return { ok: false as const, error: "Máximo 500 por vez" };
  // Só não-admins.
  const targets = await prisma.user.findMany({
    where: { id: { in: ids }, role: { not: "admin" } },
    select: { id: true },
  });
  const targetIds = targets.map((t) => t.id);
  if (targetIds.length === 0) return { ok: false as const, error: "Nenhum usuário válido" };
  await prisma.user.updateMany({
    where: { id: { in: targetIds } },
    data: input.block
      ? { blocked: true, blockReason: (input.reason || "Bloqueado pelo admin").trim().slice(0, 280) }
      : { blocked: false, blockReason: null },
  });
  if (input.block) {
    await prisma.session.deleteMany({ where: { userId: { in: targetIds } } }).catch(() => {});
  }
  await logAdminAction(
    r.admin.id,
    input.block ? "user.bulk_block" : "user.bulk_unblock",
    undefined,
    { count: targetIds.length, requested: ids.length, reason: input.reason },
  );
  revalidatePath("/admin01/users");
  return { ok: true as const, count: targetIds.length };
}

/**
 * Bloqueia/libera a GERAÇÃO DE PIX numa conta (seller para de vender — nenhum
 * PIX é gerado). NÃO é ban: o login continua. Enforced nas rotas de cobrança.
 */
export async function adminSetPixBlocked(userId: string, blocked: boolean) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  await prisma.user.update({
    where: { id: userId },
    data: { pixIntegrationBlocked: blocked },
  });
  await logAdminAction(r.admin.id, blocked ? "user.pix_block" : "user.pix_unblock", userId);
  revalidatePath(`/admin01/users/${userId}`);
  return { ok: true as const };
}

/** Esconde/mostra a "rede de tráfego" (best tracker) pro seller. */
export async function adminSetHideTrafficNetwork(userId: string, hide: boolean) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  await prisma.user.update({
    where: { id: userId },
    data: { hideTrafficNetwork: hide },
  });
  await logAdminAction(r.admin.id, "user.hide_traffic", userId, { hide });
  revalidatePath(`/admin01/users/${userId}`);
  return { ok: true as const };
}

/**
 * Gera uma senha aleatória forte e legível (sem caracteres ambíguos
 * 0/O/1/l/I) pra ser fácil de ditar/copiar pro seller. 14 chars do
 * alfabeto = ~83 bits de entropia, mais que suficiente.
 */
function generateRandomPassword(length = 14): string {
  const alphabet =
    "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/**
 * RESET DE SENHA (admin) — gera uma senha ALEATÓRIA nova pro seller e
 * devolve o texto-plano UMA ÚNICA VEZ (pro admin repassar). O hash usa o
 * MESMO scrypt do Better Auth (`better-auth/crypto`), então o login por
 * email/senha valida normal. A credencial fica no Account
 * providerId="credential" (accountId = user.id). Se o seller só tinha login
 * social (Google) e não tinha credencial, ela é criada — assim ele passa a
 * conseguir entrar por email/senha também.
 *
 * Invalida as sessões ativas (best-effort) pra forçar re-login com a senha
 * nova. A senha em claro NÃO é persistida em lugar nenhum — só retornada.
 */
export async function adminResetUserPassword(userId: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return { ok: false as const, error: "Usuário não encontrado" };

  const newPassword = generateRandomPassword();
  const { hashPassword } = await import("better-auth/crypto");
  const passwordHash = await hashPassword(newPassword);

  const credential = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { id: true },
  });
  if (credential) {
    await prisma.account.update({
      where: { id: credential.id },
      data: { password: passwordHash },
    });
  } else {
    await prisma.account.create({
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: passwordHash,
      },
    });
  }

  // Derruba sessões ativas — força entrar de novo com a senha nova. Best-effort:
  // um hiccup aqui não pode invalidar o reset (a senha já foi trocada).
  try {
    await prisma.session.deleteMany({ where: { userId: user.id } });
  } catch (e) {
    console.error("[adminResetUserPassword] falha ao limpar sessões", e);
  }

  await logAdminAction(r.admin.id, "user.reset_password", user.id, {
    email: user.email,
    createdCredential: !credential,
  });
  revalidatePath(`/admin01/users/${user.id}`);
  return { ok: true as const, password: newPassword, email: user.email };
}

/**
 * Remove o 2FA (TOTP) de um seller — zera twoFactorEnabled + twoFactorSecret.
 * Idempotente: se já estava desligado, não faz mal. Usado quando o seller
 * perde o app autenticador e fica trancado fora da conta.
 */
export async function adminDisableUserTwoFactor(userId: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, twoFactorEnabled: true },
  });
  if (!user) return { ok: false as const, error: "Usuário não encontrado" };

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });

  await logAdminAction(r.admin.id, "user.disable_2fa", user.id, {
    email: user.email,
    wasEnabled: user.twoFactorEnabled,
  });
  revalidatePath(`/admin01/users/${user.id}`);
  return { ok: true as const, wasEnabled: user.twoFactorEnabled };
}

/**
 * AVISO EM MASSA — cria um SellerWarning ativo pra cada seller selecionado.
 * Aparece na DASHBOARD principal deles. Auditado. Máx 500.
 */
export async function adminBulkAddWarning(input: {
  userIds: string[];
  message: string;
}) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const msg = (input.message ?? "").trim().slice(0, 500);
  if (!msg) return { ok: false as const, error: "Mensagem do aviso obrigatória" };
  const ids = Array.from(new Set((input.userIds ?? []).filter(Boolean)));
  if (ids.length === 0) return { ok: false as const, error: "Nenhum usuário selecionado" };
  if (ids.length > 500) return { ok: false as const, error: "Máximo 500 por vez" };
  await prisma.sellerWarning.createMany({
    data: ids.map((userId) => ({ userId, message: msg, createdBy: r.admin.email })),
  });
  await logAdminAction(r.admin.id, "seller.bulk_warning", undefined, {
    count: ids.length,
    message: msg,
  });
  revalidatePath("/admin01/users");
  return { ok: true as const, count: ids.length };
}

/** Limpa (desativa) TODOS os avisos ativos de um seller. */
export async function adminClearSellerWarnings(userId: string) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const res = await prisma.sellerWarning.updateMany({
    where: { userId, active: true },
    data: { active: false },
  });
  await logAdminAction(r.admin.id, "seller.clear_warnings", userId, { count: res.count });
  revalidatePath(`/admin01/users/${userId}`);
  return { ok: true as const, count: res.count };
}

/* ============ Trocar senha do admin ============ */

export async function changeAdminPassword(oldPwd: string, newPwd: string) {
  const r = await getCurrentAdminSession();
  if (!r) return { ok: false as const, error: "Não autenticado" };
  const { verifyPassword, hashPassword } = await import("@/lib/security/password");
  const ok = await verifyPassword(oldPwd, r.admin.passwordHash);
  if (!ok) return { ok: false as const, error: "Senha atual incorreta" };
  // Política de senha: 12+ chars, ao menos uma maiúscula, minúscula e dígito
  if (newPwd.length < 12) {
    return { ok: false as const, error: "Nova senha precisa ter ao menos 12 caracteres" };
  }
  if (!/[A-Z]/.test(newPwd) || !/[a-z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
    return {
      ok: false as const,
      error: "Senha precisa ter maiúscula, minúscula e dígito",
    };
  }
  if (newPwd === oldPwd) {
    return { ok: false as const, error: "Nova senha não pode ser igual à atual" };
  }
  const hash = await hashPassword(newPwd);
  await prisma.adminAccount.update({
    where: { id: r.admin.id },
    data: { passwordHash: hash },
  });
  await logAdminAction(r.admin.id, "admin.password_changed");
  return { ok: true as const };
}

/* ============ FRIEND ACCOUNT (acesso total grátis) ============ */

/**
 * Liga/desliga a flag "conta amigo" — quando ON, o user pula TODAS as
 * paywalls do gateway (themes, mass campaign, etc) e pode ter taxas
 * customizadas. Útil pra parceiros, equipe, family-and-friends.
 *
 * Opcionalmente aceita `setFees` pra aplicar taxas customizadas no
 * mesmo ato.
 */
const FriendAccountInput = z.object({
  userId: z.string().min(1),
  isFriendAccount: z.boolean(),
  // Taxas opcionais pra setar junto
  fees: z
    .object({
      feePercent: z.number().min(0).max(100).optional(),
      feeFixedCents: z.number().int().min(0).max(100000).optional(),
      cardFeePercent: z.number().min(0).max(100).optional(),
      cardFeeFixedCents: z.number().int().min(0).max(100000).optional(),
    })
    .optional(),
  // Ativa subscription de massa por 100 anos (efetivamente vitalício)
  enableMassCampaignSubscription: z.boolean().optional(),
});

export async function adminSetFriendAccount(
  input: z.infer<typeof FriendAccountInput>,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const parsed = FriendAccountInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Dados inválidos" };
  }

  const data: Record<string, unknown> = {
    isFriendAccount: parsed.data.isFriendAccount,
  };

  if (parsed.data.fees) {
    const f = parsed.data.fees;
    if (f.feePercent !== undefined) data.feePercent = f.feePercent;
    if (f.feeFixedCents !== undefined) data.feeFixedCents = f.feeFixedCents;
    if (f.cardFeePercent !== undefined) data.cardFeePercent = f.cardFeePercent;
    if (f.cardFeeFixedCents !== undefined)
      data.cardFeeFixedCents = f.cardFeeFixedCents;
  }

  // Subscription "vitalícia" — 100 anos
  if (parsed.data.isFriendAccount && parsed.data.enableMassCampaignSubscription) {
    const until = new Date();
    until.setFullYear(until.getFullYear() + 100);
    data.massCampaignSubscriptionUntil = until;
  }

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data,
  });

  await logAdminAction(
    r.admin.id,
    parsed.data.isFriendAccount
      ? "friend_account.enabled"
      : "friend_account.disabled",
    parsed.data.userId,
    data,
  );
  revalidatePath("/admin01/users");
  revalidatePath(`/admin01/users/${parsed.data.userId}`);
  revalidatePath("/admin01/documents");
  return { ok: true as const };
}

/* ============ PLAYER DIVULGADOR (conta pra gravacoes) ============ */

/**
 * Liga/desliga modo "Player Divulgador" — conta editavel pra gravacoes/
 * divulgacoes. Quando ON, o user pode editar todas as metricas visuais
 * em /dashboard/player-mode SEM afetar dados reais.
 *
 * QUANDO DESLIGA, os overrides sao LIMPOS automaticamente — a conta
 * volta ao normal (mostra dados reais).
 */
const PlayerDivulgadorInput = z.object({
  userId: z.string().min(1),
  isPlayerDivulgador: z.boolean(),
});

export async function adminSetPlayerDivulgador(
  input: z.infer<typeof PlayerDivulgadorInput>,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const parsed = PlayerDivulgadorInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };

  // Quando desativa o flag, apaga TODAS as sub-contas divulgador do user
  // (cascade via FK ja garante isso quando o User eh deletado, mas aqui
  // o User continua existindo — apenas o flag muda). Por isso deleteMany
  // explicito + audit.
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: parsed.data.userId },
      data: { isPlayerDivulgador: parsed.data.isPlayerDivulgador },
    });
    if (!parsed.data.isPlayerDivulgador) {
      await tx.divulgadorAccount.deleteMany({
        where: { ownerUserId: parsed.data.userId },
      });
    }
  });

  await logAdminAction(
    r.admin.id,
    parsed.data.isPlayerDivulgador
      ? "player_divulgador.enabled"
      : "player_divulgador.disabled",
    parsed.data.userId,
    { isPlayerDivulgador: parsed.data.isPlayerDivulgador },
  );
  revalidatePath("/admin01/users");
  revalidatePath(`/admin01/users/${parsed.data.userId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/divulgador");
  return { ok: true as const };
}

/* 08/08/2026 (davi): as actions do quadro de melhorias (Sugestões) saíram
 * junto com a tela — a aba inteira foi apagada do admin, então não sobrou
 * ninguém pra chamá-las. */

// ===== SAQUE AUTOMÁTICO — controles globais (kill-switch + circuit breaker) =====

/**
 * Liga/desliga o KILL-SWITCH GLOBAL do saque automático (botão de emergência).
 * Quando ligado, NENHUM saque auto sai — tudo cai pro manual.
 */
export async function adminSetAutoWithdrawKill(on: boolean) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const { setAutoWithdrawKill } = await import("@/lib/system-flags");
  await setAutoWithdrawKill(on, r.admin.id);
  await logAdminAction(r.admin.id, "auto_withdraw.kill_switch", on ? "on" : "off");
  revalidatePath("/admin01/withdrawals");
  return { ok: true as const, killed: on };
}

/**
 * Reseta o CIRCUIT BREAKER do saque automático (zera falhas + fecha). Usado
 * depois que o admin confirma que a SafePix voltou ao normal.
 */
export async function adminResetAutoWithdrawBreaker() {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const { resetAutoWithdrawBreaker } = await import("@/lib/system-flags");
  await resetAutoWithdrawBreaker();
  await logAdminAction(r.admin.id, "auto_withdraw.breaker_reset");
  revalidatePath("/admin01/withdrawals");
  return { ok: true as const };
}

/**
 * Limpa a lista de IPs bloqueados pela SafePix (depois que o admin já adicionou
 * os IPs na allowlist da SafePix). Some o alerta.
 */
export async function adminClearAutoWithdrawBlockedIps() {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const { clearAutoWithdrawBlockedIps } = await import("@/lib/system-flags");
  await clearAutoWithdrawBlockedIps();
  await logAdminAction(r.admin.id, "auto_withdraw.blocked_ips_cleared");
  revalidatePath("/admin01/withdrawals");
  return { ok: true as const };
}

/**
 * Marca como resolvidos os alertas de AUDITORIA DE SALDO SafePix (depois que o
 * admin investigou a queda de saldo). Some o alerta da barra.
 */
export async function adminResolveSafepixDrift() {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  await prisma.adminNotification.updateMany({
    where: { type: "safepix_balance_drift", resolved: false },
    data: { resolved: true, resolution: "reviewed", resolvedAt: new Date() },
  });
  await logAdminAction(r.admin.id, "safepix_balance_drift.resolved");
  revalidatePath("/admin01/withdrawals");
  return { ok: true as const };
}

/**
 * Resolve UM alerta de drift de saldo SafePix por id, exigindo um MOTIVO do
 * admin (ex: "saque manual via app", "transferência interna", "investigado").
 * Tira o aviso da barra PERMANENTEMENTE (não volta no próximo poll). O motivo
 * fica salvo em `resolution` pra auditoria.
 */
export async function adminResolveSafepixDriftOne(
  notificationId: string,
  reason: string,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const motivo = reason.trim();
  if (!motivo) return { ok: false as const, error: "Motivo obrigatório" };
  const res = await prisma.adminNotification.updateMany({
    where: {
      id: notificationId,
      type: "safepix_balance_drift",
      resolved: false,
    },
    data: {
      resolved: true,
      resolution: motivo.slice(0, 500),
      resolvedAt: new Date(),
    },
  });
  if (res.count === 0) {
    return { ok: false as const, error: "Alerta não encontrado ou já resolvido" };
  }
  await logAdminAction(
    r.admin.id,
    "safepix_balance_drift.resolved_one",
    notificationId,
    { reason: motivo },
  );
  revalidatePath("/admin01/withdrawals");
  return { ok: true as const };
}

/**
 * 🚨 SAQUE DE EMERGÊNCIA — varre 100% (ou 50%) do saldo de TODAS as contas
 * SafePix pra chave PIX FIXA (EMERGENCY_PIX_KEY, hardcoded — não muda nunca).
 * Operação de tesouraria, admin-only, com log de auditoria detalhado.
 */
export async function adminEmergencySweep(percent: 50 | 100) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (percent !== 50 && percent !== 100) {
    return { ok: false as const, error: "Percentual inválido (só 50 ou 100)." };
  }
  const { emergencySweep } = await import("@/lib/emergency-sweep");
  const report = await emergencySweep(percent);
  await logAdminAction(r.admin.id, "admin.emergency_sweep", `${percent}%`, {
    pixKey: report.pixKey,
    totalSentCents: report.totalSentCents,
    accounts: report.accounts.map((a) => ({
      account: a.account,
      balanceCents: a.balanceCents,
      sentCents: a.sentCents,
      status: a.status,
      providerId: a.providerId ?? null,
      error: a.error ?? null,
    })),
  });
  revalidatePath("/admin01/withdrawals");
  return { ok: true as const, report };
}

/**
 * 💰 SAQUE DO LUCRO DO GATEWAY — calcula AO VIVO quanto do saldo nas adquirentes
 * é lucro da plataforma (total − passivo dos sellers − saques em trânsito) e
 * saca exatamente esse valor pra EMERGENCY_PIX_KEY (mesma chave fixa, imutável).
 * Recalcula no servidor no momento do clique pra nunca confiar em número de UI.
 */
export async function adminSweepGatewayProfit() {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };

  const { computeGatewayProfit } = await import("@/lib/gateway-profit");
  const profit = await computeGatewayProfit();
  if (profit.profitCents <= 0) {
    return {
      ok: false as const,
      error: "Sem lucro disponível para sacar agora (saldo todo é dos sellers).",
    };
  }

  const { sweepAmountToEmergencyPix } = await import("@/lib/emergency-sweep");
  const report = await sweepAmountToEmergencyPix(profit.profitCents);

  await logAdminAction(r.admin.id, "admin.profit_sweep", undefined, {
    pixKey: report.pixKey,
    profitCents: profit.profitCents,
    totalAvailCents: profit.totalAvailCents,
    sellerLiabilitiesCents: profit.sellerLiabilitiesCents,
    pendingPayoutsCents: profit.pendingPayoutsCents,
    requestedCents: report.requestedCents,
    totalSentCents: report.totalSentCents,
    accounts: report.accounts.map((a) => ({
      account: a.account,
      balanceCents: a.balanceCents,
      sentCents: a.sentCents,
      status: a.status,
      providerId: a.providerId ?? null,
      error: a.error ?? null,
    })),
  });

  revalidatePath("/admin01/withdrawals");
  return { ok: true as const, report, profit };
}

/**
 * Define as taxas do seller POR MODO de adquirente (black/white/hot) num só
 * lugar — grava em `feesByMode` (JSON) + `withdrawalFeeCents` e aplica já o
 * modo atual do seller nos campos efetivos (feePercent etc.).
 *
 * Diferente do editor do indicador, AQUI o admin define livremente: NÃO há piso
 * "≥ taxa do indicador" (o piso por-transação do PIX em lib/fees.ts protege a
 * plataforma). Black/Hot só PIX; White PIX + cartão.
 */
const AdminModePixFee = z.object({
  pixPct: z.number().min(0).max(100),
  pixFix: z.number().int().min(0).max(100_000),
});
const AdminModeCardFee = AdminModePixFee.extend({
  cardPct: z.number().min(0).max(100),
  cardFix: z.number().int().min(0).max(100_000),
});
const AdminFeesByModeInput = z.object({
  black: AdminModePixFee,
  white: AdminModeCardFee,
  hot: AdminModePixFee,
  // SAG movimenta PIX e cartão, então valida os 4 campos (como o white).
  sag: AdminModeCardFee,
  withdrawalFeeCents: z.number().int().min(0).max(100_000),
});

/**
 * Extrai do payload validado só as chaves de MODO — é isso, e nada mais, que
 * vai pro JSON `feesByMode`. Existe porque o `{ black, white, hot }` escrito à
 * mão aparecia em 3 gravações diferentes; cada cópia era um lugar onde um modo
 * novo sumiria em silêncio (grava o JSON sem a chave, seller cai no default).
 */
function feesByModeJson(
  parsed: z.infer<typeof AdminFeesByModeInput>,
): Record<string, unknown> {
  return Object.fromEntries(OPS_MODES.map((m) => [m, parsed[m]]));
}

export async function adminSetUserFeesByMode(
  userId: string,
  input: z.infer<typeof AdminFeesByModeInput>,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };

  const parsed = AdminFeesByModeInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos." };

  const { withdrawalFeeCents } = parsed.data;

  await prisma.user.update({
    where: { id: userId },
    data: {
      feesByMode: feesByModeJson(parsed.data) as object,
      withdrawalFeeCents,
    },
  });

  // Aplica já o modo ATUAL do seller (precedência feesByMode > link > plataforma)
  // pros campos efetivos (feePercent/feeFixedCents/cardFee*/withdrawalFeeCents).
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { pixOpsMode: true },
  });
  const { applyModeDefaultsToUser } = await import("@/lib/mode-defaults");
  await applyModeDefaultsToUser(userId, u?.pixOpsMode ?? "white");

  await logAdminAction(r.admin.id, "user.fees_by_mode.set", userId, {
    ...feesByModeJson(parsed.data),
    withdrawalFeeCents,
  });
  revalidatePath(`/admin01/users/${userId}`);
  return { ok: true as const };
}

/**
 * EM MASSA — aplica o MESMO conjunto de taxas POR MODO (black/white/hot + saque)
 * a VÁRIOS sellers de uma vez. Mesma lógica do `adminSetUserFeesByMode`, mas
 * num loop sobre todos os selecionados. Admin define livremente (SEM piso "≥
 * taxa do indicador" — o piso por-transação do PIX em lib/fees.ts protege a
 * plataforma). NUNCA toca contas role=admin. Cap 500. Motivo obrigatório
 * (auditado). Aplica já o modo ATUAL de cada seller nos campos efetivos.
 */
export async function adminBulkSetUserFeesByMode(
  userIds: string[],
  input: z.infer<typeof AdminFeesByModeInput>,
  reason: string,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!reason?.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  const parsed = AdminFeesByModeInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos." };

  const ids = Array.from(new Set((userIds ?? []).filter(Boolean)));
  if (ids.length === 0) {
    return { ok: false as const, error: "Nenhum seller selecionado" };
  }
  if (ids.length > 500) {
    return { ok: false as const, error: "Máximo 500 por vez" };
  }

  const { withdrawalFeeCents } = parsed.data;

  // Só sellers (nunca admins) — pega o modo atual de cada um pra reaplicar.
  const targets = await prisma.user.findMany({
    where: { id: { in: ids }, role: { not: "admin" } },
    select: { id: true, pixOpsMode: true },
  });
  if (targets.length === 0) {
    return { ok: false as const, error: "Nenhum seller válido" };
  }

  await prisma.user.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: {
      feesByMode: feesByModeJson(parsed.data) as object,
      withdrawalFeeCents,
    },
  });

  // Aplica já o modo ATUAL de cada seller nos campos efetivos.
  const { applyModeDefaultsToUser } = await import("@/lib/mode-defaults");
  for (const t of targets) {
    await applyModeDefaultsToUser(t.id, t.pixOpsMode ?? "white").catch(() => {});
  }

  await logAdminAction(r.admin.id, "user.bulk_fees_by_mode.set", undefined, {
    count: targets.length,
    requested: ids.length,
    ...feesByModeJson(parsed.data),
    withdrawalFeeCents,
    reason: reason.trim(),
  });
  revalidatePath("/admin01/users");
  return { ok: true as const, count: targets.length };
}

/**
 * EM MASSA POR FILTRO — aplica o MESMO conjunto de taxas POR MODO (black/white/
 * hot + saque) a TODOS os sellers que batem no filtro ATUAL da lista
 * (/admin01/users), não só os 200 visíveis na página. Mesmo WHERE do
 * `adminMoveAllUsersMode` (reconstruído server-side, não confia no client).
 * Grava `feesByMode` + saque num updateMany e reaplica o modo ATUAL de cada
 * seller nos campos efetivos (com piso do indicador, idêntico ao fluxo
 * unitário) em lotes paralelos pra não estourar o tempo com muitos sellers.
 * NUNCA toca contas role=admin. Motivo obrigatório (auditado).
 */
export async function adminSetUserFeesByModeForAllFilter(input: {
  defaults: z.infer<typeof AdminFeesByModeInput>;
  reason: string;
  filter: { q?: string; mode?: string; kyc?: string; blocked?: string };
}) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  if (!input.reason?.trim()) {
    return { ok: false as const, error: "Motivo obrigatório (auditado)" };
  }
  const parsed = AdminFeesByModeInput.safeParse(input.defaults);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos." };
  const { withdrawalFeeCents } = parsed.data;

  // Reconstrói o MESMO WHERE da página/lista (server-side).
  const { q, mode, kyc, blocked } = input.filter ?? {};
  const where: Prisma.UserWhereInput = { role: { not: "admin" } };
  const qt = q?.trim();
  if (qt) {
    where.OR = [
      { email: { contains: qt, mode: "insensitive" } },
      { name: { contains: qt, mode: "insensitive" } },
      { id: qt },
    ];
  }
  if (kyc === "not_started") where.kycStatus = "not_started";
  else if (kyc === "review")
    where.kycStatus = { in: ["under_review", "in_review"] };
  else if (kyc === "approved") where.kycStatus = "approved";
  else if (kyc === "rejected") where.kycStatus = "rejected";
  if (blocked === "1") where.blocked = true;
  else if (blocked === "0") where.blocked = false;
  if (isOpsMode(mode)) {
    where.pixOpsMode = mode;
  }

  // 1) Grava o override por modo + saque pra TODO o filtro de uma vez.
  await prisma.user.updateMany({
    where,
    data: {
      feesByMode: feesByModeJson(parsed.data) as object,
      withdrawalFeeCents,
    },
  });

  // 2) Reaplica o modo ATUAL de cada seller nos campos efetivos (o piso do
  // indicador é respeitado dentro de applyModeDefaultsToUser). Lotes paralelos.
  const targets = await prisma.user.findMany({
    where,
    select: { id: true, pixOpsMode: true },
  });
  const { applyModeDefaultsToUser } = await import("@/lib/mode-defaults");
  const CHUNK = 25;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = targets.slice(i, i + CHUNK);
    await Promise.all(
      batch.map((t) =>
        applyModeDefaultsToUser(t.id, t.pixOpsMode ?? "white").catch(() => {}),
      ),
    );
  }

  await logAdminAction(
    r.admin.id,
    "user.fees_by_mode.set_all_filter",
    undefined,
    {
      count: targets.length,
      filter: input.filter,
      ...feesByModeJson(parsed.data),
      withdrawalFeeCents,
      reason: input.reason.trim(),
    },
  );
  revalidatePath("/admin01/users");
  return { ok: true as const, count: targets.length };
}

/**
 * Define as TAXAS APARENTES (cosméticas — o que o seller VÊ no perfil) POR MODO
 * de adquirente. Grava em `apparentFeesByMode` (JSON) e aplica já o modo atual
 * do seller nos campos flat `apparent*`. Cada campo é NULLABLE: vazio = mostra
 * a taxa REAL pro seller. NÃO afeta cobrança nenhuma (100% fachada).
 */
const ApparentModePix = z.object({
  pixPct: z.number().min(0).max(100).nullable(),
  pixFix: z.number().int().min(0).max(1_000_000).nullable(),
});
const ApparentModeCard = ApparentModePix.extend({
  cardPct: z.number().min(0).max(100).nullable(),
  cardFix: z.number().int().min(0).max(1_000_000).nullable(),
});
const AdminApparentByModeInput = z.object({
  black: ApparentModePix,
  white: ApparentModeCard,
  hot: ApparentModePix,
  // SAG mostra cartão (como o white), então a fachada tem os 4 campos.
  sag: ApparentModeCard,
  withdrawalFeeCents: z.number().int().min(0).max(1_000_000).nullable(),
});

export async function adminSetUserApparentFeesByMode(
  userId: string,
  input: z.infer<typeof AdminApparentByModeInput>,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };

  const parsed = AdminApparentByModeInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos." };

  const { withdrawalFeeCents } = parsed.data;

  await prisma.user.update({
    where: { id: userId },
    data: {
      apparentFeesByMode: {
        ...Object.fromEntries(OPS_MODES.map((m) => [m, parsed.data[m]])),
        withdrawalFeeCents,
      } as object,
    },
  });

  // Aplica já o modo ATUAL do seller nos campos flat apparent* (o perfil lê os
  // flat). Cosmético: não passa por aplicar taxa real.
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { pixOpsMode: true },
  });
  const { applyApparentFeesByMode } = await import("@/lib/mode-defaults");
  await applyApparentFeesByMode(userId, u?.pixOpsMode ?? "white");

  await logAdminAction(r.admin.id, "user.apparent_fees_by_mode.set", userId, {
    ...Object.fromEntries(OPS_MODES.map((m) => [m, parsed.data[m]])),
    withdrawalFeeCents,
  });
  revalidatePath(`/admin01/users/${userId}`);
  return { ok: true as const };
}

/**
 * Define o DESVIO DE WEBHOOK por MODO de adquirente × MÉTODO (interno, dinheiro
 * real — NUNCA exposto ao seller). Grava em `deviationByMode` (JSON). Cada % é
 * NULLABLE: vazio = cai no per-method legado / global. Black/Hot só PIX; White
 * PIX + cartão. Precedência aplicada no engine (lib/transactions.ts):
 * deviationByMode > per-method legado > global.
 */
const DevModePix = z.object({ pix: z.number().min(0).max(100).nullable() });
const DevModeCard = DevModePix.extend({
  card: z.number().min(0).max(100).nullable(),
});
const AdminDeviationByModeInput = z.object({
  black: DevModePix,
  white: DevModeCard,
  hot: DevModePix,
  // SAG movimenta cartão, então tem desvio de cartão próprio.
  sag: DevModeCard,
});

export async function adminSetUserDeviationByMode(
  userId: string,
  input: z.infer<typeof AdminDeviationByModeInput>,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };

  const parsed = AdminDeviationByModeInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos." };

  await prisma.user.update({
    where: { id: userId },
    data: {
      deviationByMode: Object.fromEntries(
        OPS_MODES.map((m) => [m, parsed.data[m]]),
      ) as object,
    },
  });

  await logAdminAction(
    r.admin.id,
    "user.deviation_by_mode.set",
    userId,
    Object.fromEntries(OPS_MODES.map((m) => [m, parsed.data[m]])),
  );
  revalidatePath(`/admin01/users/${userId}`);
  return { ok: true as const };
}

/* ============ OTIMIZACAO AUTOMATICA DE ADQUIRENTES (dedup por nominal) ============ */

/**
 * Liga/desliga a otimizacao automatica de adquirentes por nominal.
 * Quando LIGADA: sempre que uma adquirente tem seu nominal atualizado
 * pelo PSP, o sistema verifica se outra ja usa esse mesmo nominal e
 * esconde dos sellers a de menor conversao no dia + cria uma notificacao
 * pro admin ir la trocar. Detalhes em lib/acquirer-nominal-dedup.ts.
 */
export async function adminSetNominalDedupAutoEnabled(enabled: boolean) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const { setNominalDedupAutoEnabled } = await import(
    "@/lib/acquirer-nominal-dedup"
  );
  const newState = await setNominalDedupAutoEnabled(Boolean(enabled));
  await logAdminAction(r.admin.id, "acquirer.nominal_dedup_auto.set", undefined, {
    enabled: newState,
  });
  revalidatePath("/admin01/acquirers");
  return { ok: true as const, enabled: newState };
}

/**
 * Marca uma notificacao de dedup como resolvida (o admin ja trocou o
 * nominal da adquirente escondida). Nao mexe no hiddenFromSellers — isso
 * fica a cargo do admin decidir quando reabrir a acquirer.
 */
export async function adminResolveNominalDedupNotification(
  notificationId: string,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const upd = await prisma.adminNotification.updateMany({
    where: {
      id: notificationId,
      type: "acquirer_nominal_dedup",
      resolved: false,
    },
    data: {
      resolved: true,
      resolution: "handled",
      resolvedAt: new Date(),
    },
  });
  if (upd.count === 0) {
    return { ok: false as const, error: "Notificação já resolvida ou não encontrada" };
  }
  await logAdminAction(
    r.admin.id,
    "acquirer.nominal_dedup_notification.resolve",
    notificationId,
    {},
  );
  revalidatePath("/admin01/acquirers");
  return { ok: true as const };
}
