"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Save,
  Loader2,
  Lock,
  Unlock,
  Heart,
  Clapperboard,
  Zap,
  X,
  ExternalLink,
  FileText,
} from "lucide-react";
import { formatBRL } from "@/lib/utils";
import {
  adminUpdateUser,
  adminCreditUser,
  adminSetBalanceAndGmv,
  adminSetFriendAccount,
  adminSetPlayerDivulgador,
  adminRemoveFromReferralNetwork,
  adminTransferToReferralNetwork,
  adminSetPixBlocked,
  adminSetHideTrafficNetwork,
  adminGrantTheme,
  adminRevokeTheme,
} from "../../../actions";
import { KycResendButton } from "./kyc-resend";
import { AdminSecurityControls } from "./reset-password-button";
import { LinkModeDefaultsEditor } from "@/app/admin01/(authed)/users/_shared/link-mode-defaults-editor";
import { type LinkModeDefaults } from "@/lib/link-mode-defaults";
import {
  ApparentFeesByModeEditor,
  type ApparentFeesByMode,
  type RealFeesByMode,
} from "./apparent-fees-by-mode-editor";
import {
  DeviationByModeEditor,
  type DeviationByMode,
} from "./deviation-by-mode-editor";
import { ModeControlEditor } from "./mode-control-editor";

const DOC_LABELS: Record<string, string> = {
  doc_front: "Documento (frente)",
  doc_back: "Documento (verso)",
  selfie: "Selfie com documento",
  contract_social: "Contrato social",
  proof_of_address: "Comprovante de endereço",
};

type User = {
  id: string;
  email: string;
  name: string | null;
  cpfCnpj: string | null;
  phone: string | null;
  twoFactorEnabled: boolean;
  balanceCents: number;
  pendingBalanceCents: number;
  /** Ajuste manual sobre o GMV exibido (admin pode inflar/deflar). */
  gmvAdjustmentCents: number;
  feePercent: number;
  feeFixedCents: number;
  cardFeePercent: number;
  cardFeeFixedCents: number;
  boletoFeePercent: number;
  boletoFeeFixedCents: number;
  applePayFeePercent: number;
  applePayFeeFixedCents: number;
  googlePayFeePercent: number;
  googlePayFeeFixedCents: number;
  withdrawalFeeCents: number;
  /** Taxas por modo (black/white/hot) — JSON do Prisma. */
  feesByMode: unknown;
  /** Taxas APARENTES por modo (cosmético) — JSON do Prisma. */
  apparentFeesByMode: unknown;
  autoWithdrawEnabled: boolean;
  autoWithdrawDailyLimitCents: number;
  // TAXAS APARENTES (null = mostra a real pro seller)
  apparentFeePercent: number | null;
  apparentFeeFixedCents: number | null;
  apparentCardFeePercent: number | null;
  apparentCardFeeFixedCents: number | null;
  apparentBoletoFeePercent: number | null;
  apparentBoletoFeeFixedCents: number | null;
  apparentApplePayFeePercent: number | null;
  apparentApplePayFeeFixedCents: number | null;
  apparentGooglePayFeePercent: number | null;
  apparentGooglePayFeeFixedCents: number | null;
  apparentWithdrawalFeeCents: number | null;
  webhookDeviationPercent: number;
  webhookDeviationExpiresAt: string | null;
  // Per-method webhook deviation (override do global; null = fall back)
  webhookDeviationPercentPix: number | null;
  webhookDeviationPercentCard: number | null;
  webhookDeviationPercentApplePay: number | null;
  webhookDeviationPercentGooglePay: number | null;
  webhookDeviationPercentBoleto: number | null;
  /** Filtro de tráfego pro desvio. "all" | "organic" | "paid" */
  webhookDeviationFilter: "all" | "organic" | "paid";
  /** Desvio por modo de adquirente × método (JSON do Prisma). */
  deviationByMode: unknown;
  /** Modo de adquirente atual do seller (pra badge "ativo" no desvio). */
  pixOpsMode: string;
  cardOpsMode: string;
  /** Modos de adquirente proibidos pra este seller (subset black/white/hot). */
  forbiddenOpsModes: string[];
  // Holding/release per method (minutes)
  holdMinutesPix: number;
  holdMinutesCard: number;
  holdMinutesApplePay: number;
  holdMinutesGooglePay: number;
  holdMinutesBoleto: number;
  // Retenção (cartão e wallets)
  cardRetentionPercent: number;
  cardRetentionDays: number;
  // Reembolso fake (conta)
  fakeRefundPercent: number;
  fakeRefundDelayDays: number;
  // API publica
  apiCardEnabled: boolean;
  // Janela 60s pre-notificacao do seller (opt-in)
  sellerNotifyDelayEnabled: boolean;
  // Desvio de rede (referral)
  referralDeviationEnabled: boolean;
  referralDeviationPlatformSharePercent: number;
  referralDeviationEarningsCents: number;
  referralDeviationFilter: "all" | "organic" | "paid";
  // Massa campaign tax
  massCampaignUploadsCount: number;
  massCampaignChargedCents: number;
  // Conta amigo (full-paid: temas, mass-campaign, etc)
  isFriendAccount: boolean;
  massCampaignSubscriptionUntil: string | null;
  // Player Divulgador (modo edição visual de métricas)
  isPlayerDivulgador: boolean;
  // Link defaults
  linkDefaultFeePercent: number | null;
  linkDefaultFeeFixedCents: number | null;
  linkDefaultCardFeePercent: number | null;
  linkDefaultCardFeeFixedCents: number | null;
  linkDefaultBoletoFeePercent: number | null;
  linkDefaultBoletoFeeFixedCents: number | null;
  linkDefaultApplePayFeePercent: number | null;
  linkDefaultApplePayFeeFixedCents: number | null;
  linkDefaultGooglePayFeePercent: number | null;
  linkDefaultGooglePayFeeFixedCents: number | null;
  linkDefaultWithdrawalFeeCents: number | null;
  blocked: boolean;
  blockReason: string | null;
  pixIntegrationBlocked: boolean;
  hideTrafficNetwork: boolean;
  kycStatus: string;
  role: string;
  // (helper component SellingControls definido após o tipo)
  createdAt: string;
  paidCount: number;
  productsCount: number;
  checkoutsCount: number;
  referredByUserId: string | null;
  referrer: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  } | null;
  /** % das vendas DESTE user que viram desvio pro referrer. Default 0. */
  referralAppliedDeviationPercent: number;
};

const KYC_LABEL: Record<string, string> = {
  not_started: "não iniciado",
  in_review: "em análise",
  under_review: "em análise",
  approved: "aprovado",
  rejected: "rejeitado",
};
const KYC_BADGE: Record<string, string> = {
  approved: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  rejected: "border-red-500/40 bg-red-500/15 text-red-200",
  in_review: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  under_review: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  not_started: "border-zinc-700/40 bg-zinc-700/10 text-zinc-400",
};

/**
 * Controles rápidos de venda (toggle instantâneo): bloquear a geração de PIX
 * (seller para de vender, login continua) e esconder a rede de tráfego.
 */
function SellingControls({ u }: { u: User }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pixBlocked, setPixBlocked] = useState(u.pixIntegrationBlocked);
  const [hideTraffic, setHideTraffic] = useState(u.hideTrafficNetwork);
  function togglePix() {
    const next = !pixBlocked;
    setPixBlocked(next);
    startTransition(async () => {
      const r = await adminSetPixBlocked(u.id, next);
      if (!r.ok) {
        setPixBlocked(!next);
        alert(r.error);
      } else router.refresh();
    });
  }
  function toggleTraffic() {
    const next = !hideTraffic;
    setHideTraffic(next);
    startTransition(async () => {
      const r = await adminSetHideTrafficNetwork(u.id, next);
      if (!r.ok) {
        setHideTraffic(!next);
        alert(r.error);
      } else router.refresh();
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <button
        type="button"
        onClick={togglePix}
        disabled={pending}
        title="Bloqueia a GERAÇÃO de PIX nesta conta (seller para de vender). O login continua funcionando."
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
          pixBlocked
            ? "border border-red-500/50 bg-red-500/20 text-red-200"
            : "border border-white/[0.1] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
        }`}
      >
        {pixBlocked ? "🚫 PIX BLOQUEADO (não vende)" : "PIX liberado · clique pra bloquear vendas"}
      </button>
      <button
        type="button"
        onClick={toggleTraffic}
        disabled={pending}
        title="Esconde a rede de tráfego (best tracker) pro seller."
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
          hideTraffic
            ? "border border-amber-400/40 bg-amber-400/15 text-amber-200"
            : "border border-white/[0.1] bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]"
        }`}
      >
        {hideTraffic ? "Rede de tráfego: ESCONDIDA" : "Rede de tráfego: visível"}
      </button>
    </div>
  );
}

type PaidTheme = { key: string; label: string; accent: string };

/** Gerenciador de temas pagos por seller (conceder/revogar, instantâneo). */
function ThemesManager({
  userId,
  themes,
  ownedKeys,
}: {
  userId: string;
  themes: PaidTheme[];
  ownedKeys: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [owned, setOwned] = useState<Set<string>>(new Set(ownedKeys));
  function toggle(key: string) {
    const has = owned.has(key);
    const prev = owned;
    const next = new Set(owned);
    if (has) next.delete(key);
    else next.add(key);
    setOwned(next);
    startTransition(async () => {
      const r = has
        ? await adminRevokeTheme({ userId, themeKey: key })
        : await adminGrantTheme({ userId, themeKey: key });
      if (!r.ok) {
        setOwned(new Set(prev));
        alert(r.error);
      } else {
        router.refresh();
      }
    });
  }
  const ownedCount = themes.filter((t) => owned.has(t.key)).length;
  return (
    <details className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <summary className="cursor-pointer select-none text-xs font-medium text-zinc-300">
        Temas pagos · {ownedCount}/{themes.length} liberados
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">
        {themes.map((t) => {
          const has = owned.has(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => toggle(t.key)}
              disabled={pending}
              title={has ? "Clique pra revogar" : "Clique pra conceder"}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                has
                  ? "border border-cyan-400/40 bg-cyan-400/15 text-cyan-200"
                  : "border border-white/[0.1] bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]"
              }`}
            >
              <span
                className="size-2.5 rounded-full"
                style={{ background: t.accent }}
              />
              {t.label}
              {has ? " ✓" : ""}
            </button>
          );
        })}
        {themes.length === 0 && (
          <p className="text-xs text-zinc-500">Nenhum tema pago no catálogo.</p>
        )}
      </div>
    </details>
  );
}

/**
 * Monta o `initial` do editor de taxas por modo a partir do `feesByMode` do
 * seller (JSON do Prisma). Cada campo cai pro valor efetivo atual do seller
 * (feePercent, feeFixedCents, cardFee*, withdrawalFeeCents) quando ausente no
 * JSON.
 */
function buildSellerFeesInitial(u: User): LinkModeDefaults {
  const m =
    u.feesByMode && typeof u.feesByMode === "object" && !Array.isArray(u.feesByMode)
      ? (u.feesByMode as Record<string, Record<string, unknown>>)
      : {};
  const num = (v: unknown, fb: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fb;
  const black = m.black ?? {};
  const white = m.white ?? {};
  const hot = m.hot ?? {};
  const sag = m.sag ?? {};
  return {
    black: {
      pixPct: num(black.pixPct, u.feePercent),
      pixFix: num(black.pixFix, u.feeFixedCents),
    },
    white: {
      pixPct: num(white.pixPct, u.feePercent),
      pixFix: num(white.pixFix, u.feeFixedCents),
      cardPct: num(white.cardPct, u.cardFeePercent),
      cardFix: num(white.cardFix, u.cardFeeFixedCents),
    },
    hot: {
      pixPct: num(hot.pixPct, u.feePercent),
      pixFix: num(hot.pixFix, u.feeFixedCents),
    },
    sag: {
      pixPct: num(sag.pixPct, u.feePercent),
      pixFix: num(sag.pixFix, u.feeFixedCents),
      cardPct: num(sag.cardPct, u.cardFeePercent),
      cardFix: num(sag.cardFix, u.cardFeeFixedCents),
    },
    withdrawalFeeCents: u.withdrawalFeeCents,
  };
}

/**
 * Monta o estado inicial do editor de TAXAS APARENTES por modo. Se já existe o
 * JSON `apparentFeesByMode`, lê dele (cada campo nullable). Senão, "promove" os
 * campos flat apparent* legados pra todos os modos (preserva o comportamento
 * atual — antes apparent era mode-agnostic). null = mostra a taxa real.
 */
function buildApparentInitial(u: User): ApparentFeesByMode {
  const numN = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const root =
    u.apparentFeesByMode &&
    typeof u.apparentFeesByMode === "object" &&
    !Array.isArray(u.apparentFeesByMode)
      ? (u.apparentFeesByMode as Record<string, unknown>)
      : null;
  if (root) {
    const obj = (k: string): Record<string, unknown> =>
      root[k] && typeof root[k] === "object" && !Array.isArray(root[k])
        ? (root[k] as Record<string, unknown>)
        : {};
    const b = obj("black");
    const w = obj("white");
    const h = obj("hot");
    const s = obj("sag");
    return {
      black: { pixPct: numN(b.pixPct), pixFix: numN(b.pixFix) },
      white: {
        pixPct: numN(w.pixPct),
        pixFix: numN(w.pixFix),
        cardPct: numN(w.cardPct),
        cardFix: numN(w.cardFix),
      },
      hot: { pixPct: numN(h.pixPct), pixFix: numN(h.pixFix) },
      sag: {
        pixPct: numN(s.pixPct),
        pixFix: numN(s.pixFix),
        cardPct: numN(s.cardPct),
        cardFix: numN(s.cardFix),
      },
      withdrawalFeeCents: numN(root.withdrawalFeeCents),
    };
  }
  const pix = numN(u.apparentFeePercent);
  const pixFix = numN(u.apparentFeeFixedCents);
  const cardPct = numN(u.apparentCardFeePercent);
  const cardFix = numN(u.apparentCardFeeFixedCents);
  return {
    black: { pixPct: pix, pixFix },
    white: { pixPct: pix, pixFix, cardPct, cardFix },
    hot: { pixPct: pix, pixFix },
    sag: { pixPct: pix, pixFix, cardPct, cardFix },
    withdrawalFeeCents: numN(u.apparentWithdrawalFeeCents),
  };
}

/**
 * Monta o estado inicial do editor de DESVIO por modo. Lê do JSON
 * `deviationByMode` (cada % nullable). Sem JSON → tudo null (usa global/legado).
 */
function buildDeviationInitial(u: User): DeviationByMode {
  const numN = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const root =
    u.deviationByMode &&
    typeof u.deviationByMode === "object" &&
    !Array.isArray(u.deviationByMode)
      ? (u.deviationByMode as Record<string, unknown>)
      : null;
  const obj = (k: string): Record<string, unknown> =>
    root && root[k] && typeof root[k] === "object" && !Array.isArray(root[k])
      ? (root[k] as Record<string, unknown>)
      : {};
  const b = obj("black");
  const w = obj("white");
  const h = obj("hot");
  const s = obj("sag");
  return {
    black: { pix: numN(b.pix) },
    white: { pix: numN(w.pix), card: numN(w.card) },
    hot: { pix: numN(h.pix) },
    sag: { pix: numN(s.pix), card: numN(s.card) },
  };
}

export function UserEditor({
  user: initial,
  paidThemes,
  ownedThemeKeys,
  kycDocuments,
}: {
  user: User;
  paidThemes: PaidTheme[];
  ownedThemeKeys: string[];
  kycDocuments: {
    id: string;
    type: string;
    url: string;
    status: string;
    rejectionReason: string | null;
    createdAt: string;
  }[];
}) {
  const router = useRouter();
  const [u, setU] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [adjustCents, setAdjustCents] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  // SET direto: input absoluto (R$ exato)
  const [setBalanceInput, setSetBalanceInput] = useState(
    (u.balanceCents / 100).toFixed(2).replace(".", ","),
  );
  const [setGmvAdjInput, setSetGmvAdjInput] = useState(
    (u.gmvAdjustmentCents / 100).toFixed(2).replace(".", ","),
  );
  const [setReason, setSetReason] = useState("");

  function update<K extends keyof User>(k: K, v: User[K]) {
    setU((s) => ({ ...s, [k]: v }));
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await adminUpdateUser({
        id: u.id,
        name: u.name,
        email: u.email,
        feePercent: u.feePercent,
        feeFixedCents: u.feeFixedCents,
        cardFeePercent: u.cardFeePercent,
        cardFeeFixedCents: u.cardFeeFixedCents,
        boletoFeePercent: u.boletoFeePercent,
        boletoFeeFixedCents: u.boletoFeeFixedCents,
        applePayFeePercent: u.applePayFeePercent,
        applePayFeeFixedCents: u.applePayFeeFixedCents,
        googlePayFeePercent: u.googlePayFeePercent,
        googlePayFeeFixedCents: u.googlePayFeeFixedCents,
        withdrawalFeeCents: u.withdrawalFeeCents,
        autoWithdrawEnabled: u.autoWithdrawEnabled,
        autoWithdrawDailyLimitCents: u.autoWithdrawDailyLimitCents,
        apparentFeePercent: u.apparentFeePercent,
        apparentFeeFixedCents: u.apparentFeeFixedCents,
        apparentCardFeePercent: u.apparentCardFeePercent,
        apparentCardFeeFixedCents: u.apparentCardFeeFixedCents,
        apparentBoletoFeePercent: u.apparentBoletoFeePercent,
        apparentBoletoFeeFixedCents: u.apparentBoletoFeeFixedCents,
        apparentApplePayFeePercent: u.apparentApplePayFeePercent,
        apparentApplePayFeeFixedCents: u.apparentApplePayFeeFixedCents,
        apparentGooglePayFeePercent: u.apparentGooglePayFeePercent,
        apparentGooglePayFeeFixedCents: u.apparentGooglePayFeeFixedCents,
        apparentWithdrawalFeeCents: u.apparentWithdrawalFeeCents,
        webhookDeviationPercent: u.webhookDeviationPercent,
        webhookDeviationExpiresAt: u.webhookDeviationExpiresAt,
        webhookDeviationPercentPix: u.webhookDeviationPercentPix,
        webhookDeviationPercentCard: u.webhookDeviationPercentCard,
        webhookDeviationPercentApplePay: u.webhookDeviationPercentApplePay,
        webhookDeviationPercentGooglePay: u.webhookDeviationPercentGooglePay,
        webhookDeviationPercentBoleto: u.webhookDeviationPercentBoleto,
        webhookDeviationFilter: u.webhookDeviationFilter,
        holdMinutesPix: u.holdMinutesPix,
        holdMinutesCard: u.holdMinutesCard,
        holdMinutesApplePay: u.holdMinutesApplePay,
        holdMinutesGooglePay: u.holdMinutesGooglePay,
        holdMinutesBoleto: u.holdMinutesBoleto,
        cardRetentionPercent: u.cardRetentionPercent,
        cardRetentionDays: u.cardRetentionDays,
        fakeRefundPercent: u.fakeRefundPercent,
        fakeRefundDelayDays: u.fakeRefundDelayDays,
        apiCardEnabled: u.apiCardEnabled,
        sellerNotifyDelayEnabled: u.sellerNotifyDelayEnabled,
        referralDeviationEnabled: u.referralDeviationEnabled,
        referralDeviationPlatformSharePercent:
          u.referralDeviationPlatformSharePercent,
        referralAppliedDeviationPercent: u.referralAppliedDeviationPercent,
        referralDeviationFilter: u.referralDeviationFilter,
        linkDefaultFeePercent: u.linkDefaultFeePercent,
        linkDefaultFeeFixedCents: u.linkDefaultFeeFixedCents,
        linkDefaultCardFeePercent: u.linkDefaultCardFeePercent,
        linkDefaultCardFeeFixedCents: u.linkDefaultCardFeeFixedCents,
        linkDefaultBoletoFeePercent: u.linkDefaultBoletoFeePercent,
        linkDefaultBoletoFeeFixedCents: u.linkDefaultBoletoFeeFixedCents,
        linkDefaultApplePayFeePercent: u.linkDefaultApplePayFeePercent,
        linkDefaultApplePayFeeFixedCents: u.linkDefaultApplePayFeeFixedCents,
        linkDefaultGooglePayFeePercent: u.linkDefaultGooglePayFeePercent,
        linkDefaultGooglePayFeeFixedCents: u.linkDefaultGooglePayFeeFixedCents,
        linkDefaultWithdrawalFeeCents: u.linkDefaultWithdrawalFeeCents,
        blocked: u.blocked,
        blockReason: u.blockReason,
        // role removida do schema admin por segurança (não pode escalar via update)
        kycStatus: u.kycStatus as
          | "not_started"
          | "under_review"
          | "in_review"
          | "approved"
          | "rejected"
          | undefined,
      });
      if (r.ok) {
        setMsg("Salvo!");
        setTimeout(() => setMsg(null), 2000);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  function adjustBalance() {
    const cents = Math.round(Number(adjustCents.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents === 0) {
      setMsg("Valor inválido");
      return;
    }
    if (!adjustReason.trim()) {
      setMsg("Motivo obrigatório");
      return;
    }
    if (!confirm(`Ajustar saldo em ${cents > 0 ? "+" : ""}${formatBRL(cents)}?`))
      return;
    startTransition(async () => {
      const r = await adminCreditUser(u.id, cents, adjustReason.trim());
      if (r.ok) {
        setMsg(`Saldo ajustado em ${formatBRL(cents)}`);
        setAdjustCents("");
        setAdjustReason("");
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <Link
        href="/admin01/users"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
      >
        <ChevronLeft className="size-3" /> Voltar pros usuários
      </Link>

      <SellingControls u={u} />

      <ThemesManager
        userId={u.id}
        themes={paidThemes}
        ownedKeys={ownedThemeKeys}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white break-words">
            {u.name ?? u.email}
          </h1>
          <p className="text-xs text-zinc-500 font-mono break-all">
            {u.email} · {u.id}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            {u.paidCount} venda(s) paga(s) · {u.productsCount} produto(s) ·{" "}
            {u.checkoutsCount} checkout(s) · desde{" "}
            {new Date(u.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
          {msg ?? "Salvar"}
        </button>
      </div>

      {/* IDENTIDADE & STATUS — topo: dados pessoais, status da conta e indicador */}
      <Section title="🪪 Identidade & status" accent="blue">
        <div className="space-y-4">
          {/* Badges de status + indicador */}
          <div className="flex flex-wrap items-center gap-2">
            {u.blocked ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-[11px] font-bold text-red-200">
                <Lock className="size-3" /> BANIDO
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold text-cyan-300">
                <Unlock className="size-3" /> Conta ativa
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                KYC_BADGE[u.kycStatus] ??
                "border-zinc-700/40 bg-zinc-700/10 text-zinc-300"
              }`}
            >
              KYC: {KYC_LABEL[u.kycStatus] ?? u.kycStatus}
            </span>
            <ReferrerBadge
              userId={u.id}
              referrer={u.referrer}
              onChange={(newRef) => {
                setU((s) => ({
                  ...s,
                  referrer: newRef,
                  referredByUserId: newRef?.id ?? null,
                }));
                router.refresh();
              }}
            />
          </div>

          {/* Dados pessoais */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Nome"
              value={u.name ?? ""}
              onChange={(v) => update("name", v || null)}
            />
            <Field
              label="Email"
              value={u.email}
              onChange={(v) => update("email", v)}
            />
          </div>

          {/* Status / segurança da conta */}
          <div className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <ToggleRow
              label={
                u.blocked ? (
                  <span className="inline-flex items-center gap-1 text-red-300">
                    <Lock className="size-3" /> BANIDO — site não carrega
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-cyan-300">
                    <Unlock className="size-3" /> Conta ativa
                  </span>
                )
              }
              checked={u.blocked}
              onChange={(c) => update("blocked", c)}
            />
            <p className="-mt-1 text-[11px] text-zinc-500">
              Banir = ao salvar, o seller é{" "}
              <strong>deslogado na hora</strong> e{" "}
              <strong>não consegue mais logar</strong> nem abrir o dashboard (o
              site não carrega pra ele — cai na tela de conta bloqueada).
            </p>
            {u.blocked && (
              <Field
                label="Motivo do bloqueio (mostrado pro seller)"
                value={u.blockReason ?? ""}
                onChange={(v) => update("blockReason", v || null)}
              />
            )}
            <div>
              <label className="mb-2 block text-xs text-zinc-400">
                KYC Status
              </label>
              <select
                value={u.kycStatus}
                onChange={(e) => update("kycStatus", e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white"
              >
                <option value="not_started">Não iniciado</option>
                <option value="in_review">Em análise</option>
                <option value="approved">Aprovado</option>
                <option value="rejected">Rejeitado</option>
              </select>
            </div>
          </div>

          {/* Segurança — reset de senha + remover 2FA (admin) */}
          <AdminSecurityControls
            userId={u.id}
            email={u.email}
            twoFactorEnabled={u.twoFactorEnabled}
          />

          {/* % de desvio pro referrer — só faz sentido quando indicado */}
          {u.referrer && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                % de desvio aplicada às vendas deste user
              </p>
              <p className="mb-2 text-[11px] text-zinc-400">
                Quantos % das vendas dele vão pro referrer{" "}
                <strong>{u.referrer.name ?? u.referrer.email}</strong>.
                Normalmente setado pelo referrer no painel dele — aqui é
                override. Cada venda PAID com UTM completa (source+medium+
                campaign) faz sorteio Math.random &lt; pct.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={String(u.referralAppliedDeviationPercent)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    update(
                      "referralAppliedDeviationPercent",
                      Math.max(0, Math.min(100, n)),
                    );
                  }}
                  className="w-20 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white tabular-nums"
                />
                <span className="text-xs text-zinc-400">% das vendas</span>
              </div>
            </div>
          )}
        </div>

        {/* Documentos KYC — dentro de Identidade & status */}
        <div className="border-t border-white/[0.06] pt-4 mt-2">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="size-4 text-amber-300" />
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Documentos (KYC) — {kycDocuments.length}
            </p>
            {kycDocuments.length > 0 && (
              <div className="ml-auto">
                <KycResendButton userId={u.id} all />
              </div>
            )}
          </div>
          {kycDocuments.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">
              Este seller não enviou nenhum documento ainda.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {kycDocuments.map((d) => {
                const statusCls =
                  d.status === "approved"
                    ? "bg-cyan-400/15 text-cyan-300"
                    : d.status === "rejected"
                      ? "bg-red-500/15 text-red-300"
                      : "bg-yellow-400/15 text-yellow-300";
                return (
                  <div
                    key={d.id}
                    className="rounded-xl border border-white/[0.08] bg-black/30 p-3"
                  >
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block hover:opacity-90"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-white truncate">
                          {DOC_LABELS[d.type] ?? d.type}
                        </span>
                        <ExternalLink className="size-3 shrink-0 text-zinc-500 group-hover:text-amber-400" />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ${statusCls}`}
                        >
                          {d.status}
                        </span>
                        <span className="text-[10px] text-zinc-500 tabular-nums">
                          {new Date(d.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      {d.rejectionReason && (
                        <p className="mt-1.5 text-[10px] text-red-300/80 line-clamp-2">
                          {d.rejectionReason}
                        </p>
                      )}
                    </a>
                    <div className="mt-2 flex justify-end border-t border-white/[0.05] pt-2">
                      <KycResendButton
                        userId={u.id}
                        type={d.type}
                        label={DOC_LABELS[d.type] ?? d.type}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Section>

      {/* Saldo */}
      <Section title="💰 Saldo & Vendas" accent="cyan" defaultOpen>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KV label="Disponível">
            <span className="font-mono text-2xl text-cyan-300 tabular-nums">
              {formatBRL(u.balanceCents)}
            </span>
          </KV>
          <KV label="Pendente">
            <span className="font-mono text-2xl text-yellow-300 tabular-nums">
              {formatBRL(u.pendingBalanceCents)}
            </span>
          </KV>
          <KV label="Ajuste GMV (visual)">
            <span
              className={`font-mono text-2xl tabular-nums ${u.gmvAdjustmentCents >= 0 ? "text-blue-300" : "text-red-300"}`}
            >
              {u.gmvAdjustmentCents >= 0 ? "+" : ""}
              {formatBRL(u.gmvAdjustmentCents)}
            </span>
          </KV>
        </div>

        {/* SET DIRETO — Saldo absoluto + Ajuste GMV */}
        <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-3">
          <p className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold mb-2">
            Definir valores absolutos
          </p>
          <p className="text-[11px] text-zinc-400 mb-3">
            Saldo disponível e ajuste de GMV podem ser editados diretamente.
            O GMV exibido nas estatísticas vira{" "}
            <code className="text-zinc-300">vendas reais + ajuste</code>. Útil pra
            inflar/deflar a vitrine de "vendas pagas".
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                Saldo disponível (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={setBalanceInput}
                onChange={(e) => setSetBalanceInput(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                Ajuste de GMV (R$, pode ser negativo)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={setGmvAdjInput}
                onChange={(e) => setSetGmvAdjInput(e.target.value)}
                placeholder="0,00 ou -100,00"
                className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-white font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-[2fr_auto] gap-2">
            <input
              type="text"
              value={setReason}
              onChange={(e) => setSetReason(e.target.value)}
              placeholder="Motivo (auditado)"
              className="rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => {
                if (!setReason.trim()) {
                  setMsg("Informe o motivo da alteração");
                  return;
                }
                const balNum = Number(
                  setBalanceInput.replace(/[^\d,.-]/g, "").replace(",", "."),
                );
                const gmvNum = Number(
                  setGmvAdjInput.replace(/[^\d,.-]/g, "").replace(",", "."),
                );
                if (!Number.isFinite(balNum) || !Number.isFinite(gmvNum)) {
                  setMsg("Valores inválidos");
                  return;
                }
                startTransition(async () => {
                  const r = await adminSetBalanceAndGmv(u.id, {
                    balanceCents: Math.round(balNum * 100),
                    gmvAdjustmentCents: Math.round(gmvNum * 100),
                    reason: setReason.trim(),
                  });
                  if (r.ok) {
                    setMsg("✓ Valores atualizados");
                    update("balanceCents", Math.round(balNum * 100));
                    update("gmvAdjustmentCents", Math.round(gmvNum * 100));
                    setSetReason("");
                    router.refresh();
                  } else {
                    setMsg(r.error);
                  }
                });
              }}
              disabled={isPending}
              className="rounded-full bg-cyan-400 px-5 py-2 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="size-3 animate-spin" /> : "Salvar"}
            </button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <p className="text-[10px] uppercase text-zinc-500 mb-2">
            Ou incrementar saldo (delta)
          </p>
          <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={adjustCents}
              onChange={(e) => setAdjustCents(e.target.value)}
              placeholder="R$ +100,00 ou -50,00"
              className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="Motivo (auditado)"
              className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={adjustBalance}
              disabled={isPending}
              className="rounded-full bg-yellow-500 px-4 py-2 text-xs font-semibold text-black hover:bg-yellow-400 disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
        </div>
      </Section>

      {/* CONTA AMIGO — full-paid */}
      {/* CONTA AMIGO (+ Player Divulgador fundido) — full-paid / modo gravação */}
      <Section
        title="💖 Conta Amigo · tudo grátis"
        accent="pink"
        action={
          <button
            type="button"
            disabled={isPending}
            title="Aplica o preset de taxas friend e liga a conta amigo"
            onClick={() => {
              if (
                !confirm(
                  "Aplicar preset: taxas friend (4.9% + R$1,50 PIX, 4.9% + R$3,60 card) + conta amigo ON?",
                )
              )
                return;
              startTransition(async () => {
                update("feePercent", 4.9);
                update("feeFixedCents", 150);
                update("cardFeePercent", 4.9);
                update("cardFeeFixedCents", 360);
                update("isFriendAccount", true);
                const r = await adminSetFriendAccount({
                  userId: u.id,
                  isFriendAccount: true,
                  fees: {
                    feePercent: 4.9,
                    feeFixedCents: 150,
                    cardFeePercent: 4.9,
                    cardFeeFixedCents: 360,
                  },
                  enableMassCampaignSubscription: true,
                });
                if (r.ok) {
                  setMsg("Preset friend aplicado!");
                  setTimeout(() => setMsg(null), 3000);
                  router.refresh();
                } else setMsg(r.error);
              });
            }}
            className="inline-flex items-center gap-1 rounded-full border border-pink-400/40 bg-pink-400/10 px-3 py-1.5 text-[11px] font-semibold text-pink-200 hover:bg-pink-400/20 disabled:opacity-50"
          >
            <Heart className="size-3" /> Taxas friend
          </button>
        }
      >
        {/* Checkbox conta amigo */}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/[0.08] bg-black/30 p-3">
          <input
            type="checkbox"
            checked={u.isFriendAccount}
            onChange={(e) => {
              const next = e.target.checked;
              update("isFriendAccount", next);
              startTransition(async () => {
                const r = await adminSetFriendAccount({
                  userId: u.id,
                  isFriendAccount: next,
                  enableMassCampaignSubscription: next,
                });
                if (r.ok) {
                  setMsg(
                    next
                      ? "Conta amigo ativada (massa vitalícia)"
                      : "Conta amigo desativada",
                  );
                  setTimeout(() => setMsg(null), 3000);
                  router.refresh();
                } else {
                  setMsg(r.error);
                  update("isFriendAccount", !next);
                }
              });
            }}
            disabled={isPending}
            className="mt-0.5 size-4 rounded accent-pink-400"
          />
          <div className="flex-1">
            <p className="inline-flex items-center gap-1 text-sm font-semibold text-white">
              <Heart className="size-3 text-pink-400" /> Conta amigo · pula todas
              as paywalls
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Temas pagos liberados, mass-campaign vitalícia e qualquer feature
              paga futura sem cobrança. O seller vê um selo discreto na sidebar
              dele:{" "}
              <span className="text-pink-300">
                Conta Especial para meus grandes amigos ❤️
              </span>
              . Estado:{" "}
              {u.isFriendAccount ? (
                <span className="font-semibold text-pink-300">ATIVO</span>
              ) : (
                <span className="text-zinc-500">inativo (cobranças normais)</span>
              )}
              {u.massCampaignSubscriptionUntil && (
                <>
                  {" "}
                  · massa até{" "}
                  <span className="font-mono text-zinc-300">
                    {new Date(
                      u.massCampaignSubscriptionUntil,
                    ).toLocaleDateString("pt-BR")}
                  </span>
                </>
              )}
            </p>
          </div>
        </label>

        {/* Checkbox Player Divulgador (fundido na Conta Amigo) */}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/[0.08] bg-black/30 p-3">
          <input
            type="checkbox"
            checked={u.isPlayerDivulgador}
            onChange={(e) => {
              const next = e.target.checked;
              const confirmMsg = next
                ? "Ativar modo Player Divulgador? O user vai poder editar todas as métricas do dashboard."
                : "Desativar modo Player Divulgador? TODOS os overrides serão APAGADOS e a conta volta ao normal.";
              if (!confirm(confirmMsg)) return;
              update("isPlayerDivulgador", next);
              startTransition(async () => {
                const r = await adminSetPlayerDivulgador({
                  userId: u.id,
                  isPlayerDivulgador: next,
                });
                if (r.ok) {
                  setMsg(
                    next
                      ? "Player Divulgador ativado"
                      : "Desativado — overrides limpos",
                  );
                  setTimeout(() => setMsg(null), 3000);
                  router.refresh();
                } else {
                  setMsg(r.error);
                  update("isPlayerDivulgador", !next);
                }
              });
            }}
            disabled={isPending}
            className="mt-0.5 size-4 rounded accent-purple-400"
          />
          <div className="flex-1">
            <p className="inline-flex items-center gap-1 text-sm font-semibold text-white">
              <Clapperboard className="size-3 text-purple-400" /> Player
              Divulgador · dashboard editável (modo gravação)
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Modo SOMENTE-VISUAL: edita TODAS as métricas em{" "}
              <code>/dashboard/player-mode</code> (saldo, faturamento, ROAS,
              meta, feed fake…). Nada é real; saldo/saques reais ficam
              bloqueados. Ao desativar, os overrides são limpos. Estado:{" "}
              {u.isPlayerDivulgador ? (
                <span className="font-semibold text-purple-300">ATIVO</span>
              ) : (
                <span className="text-zinc-500">inativo</span>
              )}
            </p>
          </div>
        </label>

        {/* Desvio de rede (referral) — movido pra dentro de Conta Amigo */}
        <div className="border-t border-white/[0.06] pt-4 mt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-3">
            🕸️ Desvio de rede (referral)
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-yellow-400/20 bg-yellow-400/[0.04] p-3">
              <input
                type="checkbox"
                checked={u.referralDeviationEnabled}
                onChange={(e) =>
                  update("referralDeviationEnabled", e.target.checked)
                }
                className="mt-0.5 size-4 rounded accent-yellow-400"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">
                  Habilitar UI de desvio em Minha Rede
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Quando ativo, o seller pode setar % de desvio individual por
                  indicado. Vendas desviadas vão pro saldo dele (split abaixo).
                </p>
              </div>
            </div>

            {/* Detalhes so aparecem QUANDO habilitado — economiza espaco. */}
            {u.referralDeviationEnabled && (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  % plataforma do amount
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={String(u.referralDeviationPlatformSharePercent)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      update(
                        "referralDeviationPlatformSharePercent",
                        Math.max(0, Math.min(100, n)),
                      );
                    }}
                    className="w-20 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white tabular-nums"
                  />
                  <span className="text-xs text-zinc-400">
                    → {(100 - u.referralDeviationPlatformSharePercent).toFixed(0)}%
                    fica com o seller
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">
                  Default 50/50. Aplica em todas as vendas de indicados que esse
                  user desviar.
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Lucro desviado lifetime
                </p>
                <p className="text-base font-bold text-yellow-300 tabular-nums">
                  R${" "}
                  {(u.referralDeviationEarningsCents / 100).toFixed(2)}
                </p>
                <p className="mt-1 text-[10px] text-zinc-500">
                  Total creditado pra esse user via desvios.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-3">
              <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">
                Politica de desvio
              </p>
              <p className="text-[11px] text-zinc-300 mt-1">
                Sistema desvia <strong>apenas vendas com UTM completo</strong>
                (source + medium + campaign). Vendas organicas (sem UTM ou
                UTMs incompletas) <strong>nunca</strong> entram no sorteio,
                independente do %.
              </p>
              <p className="text-[10px] text-zinc-500 mt-1.5">
                Para aumentar o desvio em adquirentes especificas, use
                <code className="text-zinc-300 mx-1">extraDiversionPercent</code>
                na pagina de Adquirentes.
              </p>
            </div>
            </>
            )}
          </div>
        </div>
      </Section>

      {/* Taxas */}
      <Section title="📊 Taxas customizadas" accent="yellow">
        {/* Taxas do seller POR MODO (black/white/hot) — grava em feesByMode e
            aplica já o modo atual do seller. Black/Hot só PIX; White PIX +
            cartão. Substitui os antigos campos por método. */}
        <LinkModeDefaultsEditor
          adminUserId={u.id}
          initial={buildSellerFeesInitial(u)}
          title="Taxas do seller por modo"
          description="Defina as taxas deste seller por modo de adquirente (Black, White e Hot). Salvar grava em feesByMode e aplica imediatamente o modo atual do seller. Black e Hot só têm PIX; White tem PIX e cartão. Saque em R$ é único."
        />

        {/* Controle do MODO de adquirente: mover o seller pra outro modo +
            proibir/liberar modos (modo proibido some da aba Adquirentes dele
            e o dispatch recusa gerar cobrança nele). */}
        <div className="mt-5">
          <ModeControlEditor
            userId={u.id}
            currentMode={u.pixOpsMode}
            initialForbidden={u.forbiddenOpsModes}
          />
        </div>

        {/* Sub-blocos de taxa centralizados aqui dentro de "Taxas
            customizadas": taxas aparentes (fachada, off por padrão) e desvio
            de webhook por método (que carrega retenção + reembolso fake). */}

      {/* 🎭 TAXAS APARENTES — o que o SELLER vê (fachada, não cobra nada) */}
      <Section title="🎭 Taxas aparentes · o que o seller vê" accent="purple">
        <ApparentFeesByModeEditor
          userId={u.id}
          initial={buildApparentInitial(u)}
          real={buildSellerFeesInitial(u) as RealFeesByMode}
        />
      </Section>

      {/* ⚠️ Desvio de webhook (operações black — NUNCA expor pro seller) */}
      <Section title="🔒 Desvio de webhook · interno" accent="red">
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3 text-[11px] text-red-200/80 mb-3">
          ⚠️ <strong>Confidencial.</strong> Quando &gt; 0, X% das vendas APROVADAS
          são desviadas — não chegam na dashboard do seller, vão direto pra
          adquirente sem cobrar taxa do gateway. Use apenas em operações
          combinadas. Seller NUNCA vê isso. Audit log mantém só "user.update".
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_3fr] gap-4">
          <Field
            label="Desvio % (0 = desligado)"
            type="number"
            step="0.1"
            value={String(u.webhookDeviationPercent)}
            onChange={(v) => {
              const n = Number(v) || 0;
              update("webhookDeviationPercent", Math.max(0, Math.min(100, n)));
            }}
          />
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Expira em (vazio = permanente)
            </label>
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={
                  u.webhookDeviationExpiresAt
                    ? new Date(u.webhookDeviationExpiresAt)
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  update(
                    "webhookDeviationExpiresAt",
                    e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  )
                }
                className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white"
              />
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setHours(d.getHours() + 1);
                  update("webhookDeviationExpiresAt", d.toISOString());
                }}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 text-[10px] text-zinc-400 hover:text-white"
                title="Setar pra daqui a 1 hora"
              >
                +1h
              </button>
              <button
                type="button"
                onClick={() => update("webhookDeviationExpiresAt", null)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 text-[10px] text-zinc-400 hover:text-white"
                title="Sem expiração"
              >
                ∞
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3 text-[10px] text-zinc-500">
          Atual:{" "}
          {u.webhookDeviationPercent > 0 ? (
            <span className="text-red-300 font-mono">
              {u.webhookDeviationPercent}% ativo
              {u.webhookDeviationExpiresAt
                ? ` até ${new Date(u.webhookDeviationExpiresAt).toLocaleString("pt-BR")}`
                : " (permanente)"}
            </span>
          ) : (
            <span className="text-zinc-400">Comportamento normal (0% desvio)</span>
          )}
        </div>

        {/* Desvio por MODO de adquirente × MÉTODO (substitui o override por
            método antigo). Precedência no engine: modo×método > método legado
            > global. Expiração/filtro abaixo valem pra todos. */}
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 font-bold">
            Desvio por modo de adquirente × método
          </p>
          <DeviationByModeEditor
            userId={u.id}
            initial={buildDeviationInitial(u)}
            globalPercent={u.webhookDeviationPercent}
            pixMode={u.pixOpsMode}
            cardMode={u.cardOpsMode}
          />
        </div>

        {/* Filtro de tráfego pro desvio */}
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 font-bold">
            Filtro de tráfego (desvio aplica em qual tipo de venda)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                {
                  key: "all",
                  title: "Tudo",
                  desc: "Qualquer venda (com OU sem UTM). Mais permissivo.",
                  color:
                    "border-zinc-300/40 bg-zinc-300/[0.05] text-zinc-200",
                },
                {
                  key: "paid",
                  title: "Só tráfego pago",
                  desc: "EXIGE utm_source=facebook/tiktok/google/etc OU utm_medium=cpc/paid. Vendas sem essas UTMs NÃO sao desviadas.",
                  color:
                    "border-orange-400/40 bg-orange-400/[0.06] text-orange-200",
                },
                // Opcao "organic" REMOVIDA (jun/2026) — politica nao permite
                // desvio de trafego organico (vendas SEM UTM nunca entram).
              ] as const
            ).map((opt) => {
              const active = u.webhookDeviationFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => update("webhookDeviationFilter", opt.key)}
                  className={`text-left rounded-lg border-2 p-2.5 transition ${
                    active
                      ? opt.color
                      : "border-white/[0.06] bg-black/30 text-zinc-300 hover:border-white/[0.12]"
                  }`}
                >
                  <p className="text-xs font-bold">{opt.title}</p>
                  <p className="text-[10px] mt-0.5 opacity-80">{opt.desc}</p>
                </button>
              );
            })}
          </div>
          {u.webhookDeviationFilter === "paid" && (
            <div className="mt-2 rounded-lg border border-orange-500/30 bg-orange-500/[0.05] p-2.5 text-[10px] text-orange-200">
              ⚠️ Filtro <strong>&quot;Só tráfego pago&quot;</strong>: se as
              vendas chegam SEM utm_source de Meta/TikTok/Google etc, o desvio
              NÃO dispara — mesmo com 100%. Se nao tem certeza que as UTMs estao
              chegando corretas, use <strong>&quot;Tudo&quot;</strong>.
            </div>
          )}
          <p className="mt-2 text-[10px] text-zinc-500">
            Vendas que não passam pelo filtro são processadas normalmente
            (sem desvio). Filtro NÃO afeta o sorteio do %. Txs com{" "}
            <code>provider=&quot;test&quot;</code> nunca entram no sorteio.
          </p>
        </div>

        {/* Retenção + reembolso fake (engine-driving) — realocados pra cá da
            antiga seção "Tempo de recebimento (holding)", que foi removida. */}
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 font-bold">
            Retenção (cartão/wallets)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
            <div>
              <p className="text-[10px] text-zinc-500 mb-1">% retido</p>
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={String(u.cardRetentionPercent)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n))
                    update("cardRetentionPercent", Math.max(0, Math.min(100, n)));
                }}
                className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1.5 text-sm text-white tabular-nums"
              />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 mb-1">Dias de retenção</p>
              <input
                type="number"
                step="1"
                min={0}
                max={365}
                value={String(u.cardRetentionDays)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isInteger(n))
                    update("cardRetentionDays", Math.max(0, Math.min(365, n)));
                }}
                className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1.5 text-sm text-white tabular-nums"
              />
            </div>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
            Aplicado em cartão/Apple Pay/Google Pay.
            Default: 10% por 90 dias. Setar 0% desliga retenção.
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <p className="text-[10px] uppercase tracking-wider text-red-400/80 mb-2 font-bold">
            Reembolso fake (conta)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
            <div>
              <p className="text-[10px] text-zinc-500 mb-1">% das vendas</p>
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={String(u.fakeRefundPercent)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n))
                    update("fakeRefundPercent", Math.max(0, Math.min(100, n)));
                }}
                className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1.5 text-sm text-white tabular-nums"
              />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 mb-1">Dias até cair</p>
              <input
                type="number"
                step="1"
                min={0}
                max={365}
                value={String(u.fakeRefundDelayDays)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isInteger(n))
                    update("fakeRefundDelayDays", Math.max(0, Math.min(365, n)));
                }}
                className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1.5 text-sm text-white tabular-nums"
              />
            </div>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
            % das vendas PAGAS dessa conta que viram REFUNDED automaticamente,
            após N dias. NÃO chama o PSP — reverte o saldo do seller e dispara
            o webhook de reembolso. 0% = desligado. (Também dá pra reembolsar
            transações individuais na lista de vendas abaixo.)
          </p>
        </div>
      </Section>
      </Section>

      {/* ⚡ SAQUE AUTOMÁTICO — envia o PIX na hora via API SafePix */}
      <Section title="⚡ Saque automático · PIX via SafePix" accent="orange">
        <div className="rounded-lg border border-orange-400/20 bg-orange-400/[0.05] p-3 mb-1 text-[11px] text-orange-100/80 leading-relaxed">
          <strong className="text-orange-200">Desligado por padrão.</strong>{" "}
          Quando LIGADO, ao seller pedir saque PIX o sistema tenta enviar{" "}
          <strong>na hora</strong> via API da SafePix — desde que UMA conta
          tenha saldo suficiente pro valor. Se o saldo estiver disperso entre as
          contas (nenhuma sozinha cobre), ou acima do teto diário, o saque cai
          pro fluxo <strong>manual</strong> normal (você envia e aprova). Só
          vale pra PIX — USDT continua sempre manual.
        </div>
        <ToggleRow
          label={
            u.autoWithdrawEnabled ? (
              <span className="inline-flex items-center gap-1 text-cyan-300">
                <Zap className="size-3" /> Saque automático LIGADO
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-zinc-400">
                <Zap className="size-3" /> Saque automático desligado (manual)
              </span>
            )
          }
          checked={u.autoWithdrawEnabled}
          onChange={(c) => update("autoWithdrawEnabled", c)}
        />
        <Field
          label={`Teto diário automático (R$) — 0 = SEM LIMITE (padrão). Só >0 reimpõe teto (acima vira manual) · atual: ${u.autoWithdrawDailyLimitCents > 0 ? `R$ ${(u.autoWithdrawDailyLimitCents / 100).toFixed(2)}` : "sem limite"}`}
          type="number"
          step="0.01"
          value={(u.autoWithdrawDailyLimitCents / 100).toFixed(2)}
          onChange={(v) =>
            update(
              "autoWithdrawDailyLimitCents",
              Math.max(0, Math.round((Number(v) || 0) * 100)),
            )
          }
        />
      </Section>

      {/* (Secao "API Pública" removida — politica jun/2026: cartao via
          API sem product_id eh permitido pra TODOS os sellers, sem gate.) */}

    </div>
  );
}

function ReferrerBadge({
  userId,
  referrer,
  onChange,
}: {
  userId: string;
  referrer: User["referrer"];
  onChange: (newRef: User["referrer"]) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [showAssign, setShowAssign] = useState(false);
  const [target, setTarget] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function remove() {
    if (
      !confirm(
        `Remover ${referrer?.name ?? referrer?.email ?? "o indicador"} como indicador? O seller passa a constar como "entrou direto" e indicações futuras não geram mais comissão pro referrer atual.`,
      )
    )
      return;
    startTransition(async () => {
      setMsg(null);
      const r = await adminRemoveFromReferralNetwork(
        userId,
        "Removido pelo admin (perfil)",
      );
      if (r.ok) onChange(null);
      else setMsg(r.error);
    });
  }

  function assign() {
    if (!target.trim()) {
      setMsg("Informe ID ou email do referrer");
      return;
    }
    startTransition(async () => {
      setMsg(null);
      const r = await adminTransferToReferralNetwork(
        userId,
        target.trim(),
        "Atribuído pelo admin (perfil)",
      );
      if (r.ok) {
        setShowAssign(false);
        setTarget("");
        onChange(null);
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <div className="inline-flex flex-col gap-1">
      {referrer ? (
        <div className="group inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 py-1 pl-3 pr-1">
          <Link
            href={`/admin01/users/${referrer.id}`}
            className="text-[11px] text-blue-200 hover:text-white"
            title="Ver perfil do indicador"
          >
            indicado por{" "}
            <span className="font-semibold text-white">
              {referrer.name ?? referrer.email}
            </span>
          </Link>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            title="Remover indicador (vira conta direta)"
            className="ml-0.5 grid size-5 place-items-center rounded-full text-transparent transition group-hover:bg-red-500/20 group-hover:text-red-300 hover:!text-red-100 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <X className="size-3" />
            )}
          </button>
        </div>
      ) : (
        <div className="inline-flex items-center gap-2">
          <span className="rounded-full border border-zinc-700/40 bg-zinc-700/10 px-3 py-1 text-[11px] text-zinc-400">
            entrou direto
          </span>
          <button
            type="button"
            onClick={() => {
              setShowAssign((v) => !v);
              setMsg(null);
            }}
            className="text-[11px] text-blue-300 underline hover:text-blue-200"
          >
            atribuir indicador
          </button>
        </div>
      )}
      {showAssign && !referrer && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="ID ou email do referrer"
            className="rounded-lg border border-white/[0.08] bg-black/40 px-3 py-1.5 font-mono text-xs text-white"
          />
          <button
            type="button"
            onClick={assign}
            disabled={pending}
            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-400 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="inline size-3 animate-spin" />
            ) : (
              "Atribuir"
            )}
          </button>
        </div>
      )}
      {msg && <p className="text-[11px] text-red-300">{msg}</p>}
    </div>
  );
}

function Section({
  title,
  children,
  accent,
  defaultOpen,
  action,
}: {
  title: string;
  children: React.ReactNode;
  /** Cor de destaque pra borda esquerda. Default = sem destaque. */
  accent?: "cyan" | "yellow" | "blue" | "red" | "purple" | "pink" | "orange";
  /** Se passa true, secao comeca aberta. Default = false (recolhida). */
  defaultOpen?: boolean;
  /** Ação no canto superior direito do header (ex: botão). Não abre/fecha. */
  action?: React.ReactNode;
}) {
  const accentMap: Record<NonNullable<typeof accent>, string> = {
    cyan: "border-l-4 border-l-cyan-400/40",
    yellow: "border-l-4 border-l-yellow-400/40",
    blue: "border-l-4 border-l-blue-400/40",
    red: "border-l-4 border-l-red-400/40",
    purple: "border-l-4 border-l-purple-400/40",
    pink: "border-l-4 border-l-pink-400/40",
    orange: "border-l-4 border-l-orange-400/40",
  };
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <section
      className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden ${accent ? accentMap[accent] : ""}`}
    >
      <div className="flex items-stretch border-b border-white/[0.04] bg-black/20">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center justify-between px-5 py-3 text-left transition-colors hover:bg-black/30"
          aria-expanded={open}
        >
          <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-300">
            {title}
          </h2>
          <span
            className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {action && (
          <div className="flex shrink-0 items-center px-3">{action}</div>
        )}
      </div>
      {open && <div className="p-5 space-y-3">{children}</div>}
    </section>
  );
}

function NullableNumField({
  label,
  value,
  onChange,
  placeholder,
  step,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
        {label}
      </p>
      <input
        type="number"
        step={step ?? "1"}
        value={value == null ? "" : String(value)}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === "") onChange(null);
          else {
            const n = Number(v);
            if (Number.isFinite(n)) onChange(n);
          }
        }}
        className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1.5 text-sm text-white tabular-nums"
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1.5">{label}</label>
      <input
        type={type ?? "text"}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-600"
      />
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-zinc-500 mb-1">{label}</p>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: React.ReactNode;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <div className="text-sm text-zinc-200">{label}</div>
      <span className="relative inline-flex">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="block h-5 w-9 rounded-full bg-zinc-700 transition peer-checked:bg-red-500" />
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
