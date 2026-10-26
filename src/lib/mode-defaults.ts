import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getHotFeeCents } from "./fees";
import { modeHasCard, OPS_MODES, type OpsMode } from "./ops-modes";

/**
 * Taxas-padrão POR MODO de adquirente (black/white/hot) → patch de campos do
 * User. Lê PlatformModeDefaults (editável em /admin01/taxas-padrao) e copia
 * fees, saque, retenção de cartão e holding por método pros campos do seller.
 *
 * IMPORTANTE: isto NÃO muda a matemática de cobrança por transação — só
 * popula os campos do User (que o pipeline já lê). Aplicado:
 *  - na 1ª escolha de modo do seller (signup sem indicação), e
 *  - quando o admin clica "aplicar modo X" no perfil do seller (Task 4).
 */
const HOLD_FIELD: Record<string, keyof Prisma.UserUpdateInput> = {
  pix: "holdMinutesPix",
  card: "holdMinutesCard",
  applePay: "holdMinutesApplePay",
  googlePay: "holdMinutesGooglePay",
  boleto: "holdMinutesBoleto",
};

export async function buildModeDefaultPatch(
  mode: string,
  /**
   * Inclui a config black-ops do modo (% desvio webhook, % reembolso fake +
   * dias). SÓ true quando o ADMIN aplica explicitamente — NUNCA na escolha
   * self-service do seller (não queremos que escolher "black" ligue desvio
   * sozinho).
   */
  includeOpsConfig = false,
): Promise<Prisma.UserUpdateInput> {
  const row = await prisma.platformModeDefaults.findUnique({ where: { mode } });
  if (!row) return {};

  const hm =
    row.holdMinutes &&
    typeof row.holdMinutes === "object" &&
    !Array.isArray(row.holdMinutes)
      ? (row.holdMinutes as Record<string, unknown>)
      : {};

  const patch: Prisma.UserUpdateInput = {
    feePercent: row.feePercent,
    feeFixedCents: row.feeFixedCents,
    cardFeePercent: row.cardFeePercent,
    cardFeeFixedCents: row.cardFeeFixedCents,
    withdrawalFeeCents: row.withdrawalFeeCents,
    cardRetentionPercent: row.cardRetentionPercent,
    cardRetentionDays: row.cardRetentionDays,
  };

  // Só aplica holding dos métodos que o admin de fato configurou no JSON;
  // métodos ausentes mantêm o valor atual do seller (não força 0/instant).
  for (const [key, field] of Object.entries(HOLD_FIELD)) {
    const raw = hm[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      (patch as Record<string, unknown>)[field] = Math.max(0, Math.round(raw));
    }
  }

  if (includeOpsConfig) {
    patch.webhookDeviationPercent = row.webhookDeviationPercent;
    patch.fakeRefundPercent = row.fakeRefundPercent;
    patch.fakeRefundDelayDays = row.fakeRefundDelayDays;
  }

  return patch;
}

function parseByMode(
  v: unknown,
): Record<
  string,
  { pixPct?: number; pixFix?: number; cardPct?: number; cardFix?: number }
> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<
        string,
        { pixPct?: number; pixFix?: number; cardPct?: number; cardFix?: number }
      >)
    : null;
}

type FeeFloor = {
  pixPct: number;
  pixFix: number;
  cardPct: number;
  cardFix: number;
  withdrawalFeeCents: number;
};

/**
 * Override de taxas por modo a aplicar a um user. Precedência:
 *  1. feesByMode do PRÓPRIO user (ajuste do referrer/admin pra ESTE indicado)
 *  2. linkDefaultsByMode do INDICADOR (padrão do link)
 * Null se nenhum cobre o modo. `withdrawal` só vem do padrão do link (saque do
 * override per-indicado mantém o atual).
 *
 * PISO DE SEGURANÇA: o indicado NUNCA pode acabar com uma taxa MENOR que a do
 * próprio indicador (o referrer ganha justamente na diferença). Se um valor
 * salvo — em linkDefaultsByMode OU em feesByMode (legado/edição antiga) —
 * estiver abaixo da taxa atual do indicador, ele é ELEVADO até a taxa do
 * indicador (clamp). Antes esse caso caía no default da plataforma; agora
 * respeita o piso do indicador.
 */
async function getModeFeeOverride(
  userId: string,
  mode: string,
): Promise<{
  pixPct: number;
  pixFix: number;
  cardPct: number | null;
  cardFix: number | null;
  withdrawalFeeCents: number | null;
} | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { feesByMode: true, referredByUserId: true },
  });
  if (!u) return null;

  // Carrega as taxas do indicador (o PISO) + o padrão de link dele, de uma vez.
  let floor: FeeFloor | null = null;
  let refLinkByMode: unknown = null;
  let refLinkWithdrawal: number | null = null;
  if (u.referredByUserId) {
    const ref = await prisma.user.findUnique({
      where: { id: u.referredByUserId },
      select: {
        feePercent: true,
        feeFixedCents: true,
        cardFeePercent: true,
        cardFeeFixedCents: true,
        withdrawalFeeCents: true,
        linkDefaultsByMode: true,
        linkDefaultWithdrawalFeeCents: true,
      },
    });
    if (ref) {
      floor = {
        pixPct: ref.feePercent,
        pixFix: ref.feeFixedCents,
        cardPct: ref.cardFeePercent,
        cardFix: ref.cardFeeFixedCents,
        withdrawalFeeCents: ref.withdrawalFeeCents,
      };
      refLinkByMode = ref.linkDefaultsByMode;
      refLinkWithdrawal =
        typeof ref.linkDefaultWithdrawalFeeCents === "number"
          ? ref.linkDefaultWithdrawalFeeCents
          : null;
    }
  }

  const atLeast = (v: number, min: number | undefined) =>
    typeof min === "number" ? Math.max(v, min) : v;

  // 1) Override do próprio indicado (feesByMode).
  const own = parseByMode(u.feesByMode)?.[mode];
  if (own && typeof own.pixPct === "number" && typeof own.pixFix === "number") {
    return {
      pixPct: atLeast(own.pixPct, floor?.pixPct),
      pixFix: atLeast(own.pixFix, floor?.pixFix),
      cardPct:
        typeof own.cardPct === "number"
          ? atLeast(own.cardPct, floor?.cardPct)
          : null,
      cardFix:
        typeof own.cardFix === "number"
          ? atLeast(own.cardFix, floor?.cardFix)
          : null,
      withdrawalFeeCents: null,
    };
  }

  // 2) Padrão de link do indicador.
  if (!u.referredByUserId) return null;
  const m = parseByMode(refLinkByMode)?.[mode];
  if (!m || typeof m.pixPct !== "number" || typeof m.pixFix !== "number") {
    return null;
  }
  return {
    pixPct: atLeast(m.pixPct, floor?.pixPct),
    pixFix: atLeast(m.pixFix, floor?.pixFix),
    cardPct:
      typeof m.cardPct === "number" ? atLeast(m.cardPct, floor?.cardPct) : null,
    cardFix:
      typeof m.cardFix === "number" ? atLeast(m.cardFix, floor?.cardFix) : null,
    withdrawalFeeCents:
      refLinkWithdrawal !== null
        ? atLeast(refLinkWithdrawal, floor?.withdrawalFeeCents)
        : null,
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Aplica as TAXAS APARENTES (cosméticas) do `mode` aos campos flat `apparent*`
 * do user. Lê `apparentFeesByMode` (JSON por modo, cada campo nullable). Se o
 * JSON não existe, NÃO mexe (mantém o apparent flat legado). Se existe, popula
 * os flat conforme o modo: campo ausente/null → flat = null (mostra a REAL).
 * Cartão só vale no modo white; nos outros zera (null) o apparent de cartão.
 * 100% cosmético — não toca em cobrança nenhuma.
 */
export async function applyApparentFeesByMode(
  userId: string,
  mode: string,
): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { apparentFeesByMode: true },
  });
  const raw = u?.apparentFeesByMode;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const obj = raw as Record<string, unknown>;
  const m =
    obj[mode] && typeof obj[mode] === "object" && !Array.isArray(obj[mode])
      ? (obj[mode] as Record<string, unknown>)
      : {};
  await prisma.user.update({
    where: { id: userId },
    data: {
      apparentFeePercent: numOrNull(m.pixPct),
      apparentFeeFixedCents: numOrNull(m.pixFix),
      apparentCardFeePercent: modeHasCard(mode) ? numOrNull(m.cardPct) : null,
      apparentCardFeeFixedCents: modeHasCard(mode)
        ? numOrNull(m.cardFix)
        : null,
      apparentWithdrawalFeeCents: numOrNull(obj.withdrawalFeeCents),
    },
  });
}

/**
 * Aplica as taxas do `mode` ao user. Precedência das TAXAS: override
 * (feesByMode do user / linkDefaultsByMode do indicador) > plataforma.
 * User INDICADO sem override: NÃO sobrescreve as taxas herdadas com o default
 * da plataforma (mantém); retenção/holding seguem o default do modo. User
 * DIRETO sem override: default da plataforma. Não lança.
 *
 * Também sincroniza as TAXAS APARENTES (cosméticas) do modo, se configuradas.
 */
export async function applyModeDefaultsToUser(
  userId: string,
  mode: string,
  includeOpsConfig = false,
): Promise<Prisma.UserUpdateInput> {
  // Apparent é independente das taxas reais e não pode depender dos early
  // returns abaixo — roda sempre (no-op se não houver apparentFeesByMode).
  await applyApparentFeesByMode(userId, mode);

  const patch = await buildModeDefaultPatch(mode, includeOpsConfig);
  if (Object.keys(patch).length === 0) return {};

  // Indicado? As taxas dele são definidas pelo referrer (feesByMode + saque
  // flat), NÃO pelo default da plataforma. Precisamos saber disso nos dois
  // ramos abaixo pra não sobrescrever o que o referrer configurou.
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredByUserId: true },
  });
  const isReferred = !!u?.referredByUserId;

  const override = await getModeFeeOverride(userId, mode);
  if (override) {
    patch.feePercent = override.pixPct;
    patch.feeFixedCents = override.pixFix;
    if (
      modeHasCard(mode) &&
      override.cardPct !== null &&
      override.cardFix !== null
    ) {
      patch.cardFeePercent = override.cardPct;
      patch.cardFeeFixedCents = override.cardFix;
    } else if (isReferred) {
      // Black/Hot são PIX-only — não re-projetam cartão. NÃO sobrescreve o
      // cartão configurado do indicado com o default da plataforma: preserva
      // o flat atual (que vem do override White, quando ele estava em White).
      const p = patch as Record<string, unknown>;
      delete p.cardFeePercent;
      delete p.cardFeeFixedCents;
    }
    if (override.withdrawalFeeCents !== null) {
      patch.withdrawalFeeCents = override.withdrawalFeeCents;
    } else if (isReferred) {
      // O saque do indicado é definido pelo referrer (flat, não por modo).
      // NÃO sobrescreve com o default da plataforma — preserva o flat salvo.
      delete (patch as Record<string, unknown>).withdrawalFeeCents;
    }
  } else if (isReferred) {
    // Indicado sem override: mantém as taxas herdadas (não força o default).
    const p = patch as Record<string, unknown>;
    delete p.feePercent;
    delete p.feeFixedCents;
    delete p.cardFeePercent;
    delete p.cardFeeFixedCents;
    delete p.withdrawalFeeCents;
  }

  if (Object.keys(patch).length === 0) return {};
  await prisma.user.update({ where: { id: userId }, data: patch });
  return patch;
}

/* ──────────────────────────────────────────────────────────────────────────
 * DISPLAY: taxas POR MODO pra exibir na aba "Taxas" do perfil do seller.
 * Resolve, pra cada modo (black/white/hot), o que o seller DEVE VER:
 *   apparentFeesByMode[modo]  (fachada, se setada pelo admin)
 *     ↳ senão  override real   (feesByMode/linkDefaultsByMode, com piso do
 *                               indicador via getModeFeeOverride)
 *       ↳ senão  PlatformModeDefaults[modo]
 *         ↳ senão  campos flat do user (legado)
 * Cartão existe nos modos WHITE e SAG (black/hot são PIX-only). Hot tem FLAT
 * (hotFlatCents) pra vendas < R$16; acima disso usa a % do próprio modo hot.
 * 100% pra exibição — NÃO altera cobrança nenhuma.
 * ────────────────────────────────────────────────────────────────────────── */
export type ModeDisplayFees = {
  pixPct: number;
  pixFix: number;
  /** null nos modos sem cartão (black/hot). */
  cardPct: number | null;
  cardFix: number | null;
  withdrawalFeeCents: number;
};

export type DisplayFeesByMode = Record<OpsMode, ModeDisplayFees> & {
  /** Taxa única (centavos) cobrada no hot pra vendas abaixo de R$16. */
  hotFlatCents: number;
};

export async function resolveDisplayFeesByMode(
  userId: string,
  /**
   * Por padrão aplica a FACHADA (apparentFeesByMode) — é o que o SELLER vê.
   * Passe `{ apparent: false }` pra obter as taxas REAIS por modo (usado no
   * painel admin, onde a fachada enganaria quem decide).
   */
  opts?: { apparent?: boolean },
): Promise<DisplayFeesByMode> {
  const useApparent = opts?.apparent !== false;
  const [u, rows, hotFlatCents] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        feePercent: true,
        feeFixedCents: true,
        cardFeePercent: true,
        cardFeeFixedCents: true,
        withdrawalFeeCents: true,
        apparentFeesByMode: true,
      },
    }),
    prisma.platformModeDefaults.findMany(),
    getHotFeeCents(),
  ]);

  const byMode = new Map(rows.map((r) => [r.mode, r]));
  const apparent =
    u?.apparentFeesByMode &&
    typeof u.apparentFeesByMode === "object" &&
    !Array.isArray(u.apparentFeesByMode)
      ? (u.apparentFeesByMode as Record<string, unknown>)
      : {};
  const apparentWithdrawal = numOrNull(apparent.withdrawalFeeCents);

  async function forMode(
    mode: OpsMode,
  ): Promise<ModeDisplayFees> {
    const def = byMode.get(mode);
    const override = await getModeFeeOverride(userId, mode);
    const cardOn = modeHasCard(mode); // white e sag têm cartão; black/hot não

    const realPixPct = override?.pixPct ?? def?.feePercent ?? u?.feePercent ?? 6.99;
    const realPixFix =
      override?.pixFix ?? def?.feeFixedCents ?? u?.feeFixedCents ?? 250;
    const realCardPct = cardOn
      ? override?.cardPct ?? def?.cardFeePercent ?? u?.cardFeePercent ?? 9.9
      : null;
    const realCardFix = cardOn
      ? override?.cardFix ?? def?.cardFeeFixedCents ?? u?.cardFeeFixedCents ?? 360
      : null;
    const realWithdrawal =
      override?.withdrawalFeeCents ??
      def?.withdrawalFeeCents ??
      u?.withdrawalFeeCents ??
      990;

    // Fachada (apparentFeesByMode) sobrepõe o real, por modo — só quando
    // useApparent (visão do seller). Na visão admin (apparent:false) ignora.
    const am =
      useApparent &&
      apparent[mode] &&
      typeof apparent[mode] === "object" &&
      !Array.isArray(apparent[mode])
        ? (apparent[mode] as Record<string, unknown>)
        : {};

    return {
      pixPct: numOrNull(am.pixPct) ?? realPixPct,
      pixFix: numOrNull(am.pixFix) ?? realPixFix,
      cardPct: cardOn ? numOrNull(am.cardPct) ?? realCardPct : null,
      cardFix: cardOn ? numOrNull(am.cardFix) ?? realCardFix : null,
      withdrawalFeeCents: (useApparent ? apparentWithdrawal : null) ?? realWithdrawal,
    };
  }

  const resolved = await Promise.all(OPS_MODES.map((m) => forMode(m)));
  const byModeOut = Object.fromEntries(
    OPS_MODES.map((m, i) => [m, resolved[i]]),
  ) as Record<OpsMode, ModeDisplayFees>;

  return { ...byModeOut, hotFlatCents: Math.max(hotFlatCents, 90) };
}
