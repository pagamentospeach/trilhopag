import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatBRL, startOfBrtDay, startOfBrtMonth, acquirerNominalLabel } from "@/lib/utils";
import { getCheckoutUrl, getCloakerUrl } from "@/lib/checkout-url";
import { UserEditor } from "./client";
import { THEMES } from "@/lib/themes";
import { FREE_THEME_KEYS } from "@/lib/theme-access";
import { TxRowEditable } from "./tx-row-edit";
import { ImpersonateButton } from "./impersonate-button";
import { AcquirerLockEditor } from "./acquirer-lock-editor";
import { OwnAcquirerPanelSection } from "./own-acquirer-panel-section";
import { RejectControls } from "./reject-controls";
import { SellerDomainsCard } from "./seller-domains-card";
import { isOpsMode, OPS_MODES, type OpsMode } from "@/lib/ops-modes";
import { type OwnAcquirerPanelMap } from "@/lib/acquirer-visibility";

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tx?: string; period?: string }>;
}) {
  const { id } = await params;
  // Quantas transações mostrar — "Ver mais" incrementa ?tx=N (padrão 20, máx 500).
  const sp = await searchParams;
  const txLimit = Math.min(500, Math.max(20, Math.floor(Number(sp?.tx)) || 20));

  // FILTRO DE PERÍODO das métricas (BRT). null = todo o histórico.
  const period = (sp?.period ?? "30d") as
    | "today"
    | "7d"
    | "30d"
    | "month"
    | "all";
  const PERIODS: { key: typeof period; label: string }[] = [
    { key: "today", label: "Hoje" },
    { key: "7d", label: "7 dias" },
    { key: "30d", label: "30 dias" },
    { key: "month", label: "Este mês" },
    { key: "all", label: "Tudo" },
  ];
  const periodStart: Date | null = (() => {
    if (period === "all") return null;
    if (period === "month") return startOfBrtMonth();
    const day = startOfBrtDay();
    if (period === "today") return day;
    if (period === "7d") return new Date(day.getTime() - 7 * 86400_000);
    return new Date(day.getTime() - 30 * 86400_000); // 30d
  })();
  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          transactions: { where: { status: "PAID", provider: { not: "test" } } },
          products: true,
          checkouts: true,
          withdrawals: true,
          cloakerCampaigns: true,
          bturbVideos: true,
          memberAreas: true,
          saleBots: true,
          apiKeys: { where: { revokedAt: null } },
          referrals: true,
        },
      },
    },
  });
  if (!u) notFound();

  // Resources detalhados — todos os que o user criou
  const [
    products,
    checkouts,
    cloakers,
    bturbVideos,
    memberAreas,
    bots,
    apiKeys,
    webhooks,
    recentTx,
    recentWithdrawals,
    referrals,
    coupons,
    kycDocuments,
  ] = await Promise.all([
    prisma.product.findMany({
      where: { userId: id },
      select: {
        id: true,
        name: true,
        priceCents: true,
        active: true,
        adminRejected: true,
        adminRejectReason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.checkout.findMany({
      where: { userId: id },
      select: {
        id: true,
        slug: true,
        active: true,
        adminRejected: true,
        adminRejectReason: true,
        createdAt: true,
        product: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.cloakerCampaign.findMany({
      where: { userId: id },
      select: {
        id: true,
        name: true,
        slug: true,
        active: true,
        totalRequests: true,
        passedToMoney: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.bturbVideo.findMany({
      where: { userId: id },
      select: {
        id: true,
        title: true,
        durationSeconds: true,
        plays: true,
        views: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.memberArea.findMany({
      where: { userId: id },
      select: {
        id: true,
        name: true,
        slug: true,
        active: true,
        createdAt: true,
        _count: { select: { members: true, courses: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.saleBot.findMany({
      where: { userId: id },
      select: {
        id: true,
        name: true,
        type: true,
        category: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.apiKey.findMany({
      where: { userId: id },
      select: {
        id: true,
        prefix: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.webhook.findMany({
      where: { userId: id },
      select: {
        id: true,
        url: true,
        active: true,
        events: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.transaction.findMany({
      where: { userId: id, provider: { not: "test" } },
      select: {
        id: true,
        amountCents: true,
        feeCents: true,
        netCents: true,
        status: true,
        method: true,
        customerEmail: true,
        createdAt: true,
        paidAt: true,
        providerPayload: true,
        adminNote: true,
        divertedToAcquirer: true,
        divertedToReferrer: true,
        fakeRefundScheduledAt: true,
        fakeRefundApplied: true,
        utmifyScheduledAt: true,
        utmifyDispatchedAt: true,
        sellerNotifyScheduledAt: true,
        sellerNotifiedAt: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmTerm: true,
        utmContent: true,
      },
      orderBy: { createdAt: "desc" },
      take: txLimit,
    }),
    prisma.withdrawal.findMany({
      where: { userId: id },
      select: {
        id: true,
        amountCents: true,
        feeCents: true,
        status: true,
        pixKey: true,
        pixKeyType: true,
        failReason: true,
        createdAt: true,
        paidAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.user.findMany({
      where: { referredByUserId: id },
      select: { id: true, email: true, name: true, createdAt: true, balanceCents: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.coupon.findMany({
      where: { userId: id },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        usedCount: true,
        active: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    // Documentos KYC enviados por este seller (todos — frente/verso/selfie/etc).
    prisma.kycDocument.findMany({
      where: { userId: id },
      select: {
        id: true,
        type: true,
        url: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // REFERRER (quem indicou ESTE user). Carregado separado pq depende
  // do select de `u` ja carregado acima.
  const referrer = u.referredByUserId
    ? await prisma.user.findUnique({
        where: { id: u.referredByUserId },
        select: { id: true, email: true, name: true, createdAt: true },
      })
    : null;

  // ADQUIRENTES elegiveis pra PIX (pro AcquirerLockEditor). Filtra o que
  // o dispatcher realmente aceitaria: active + supportsPix + globalEnabled.
  // NAO filtra por mode aqui — o componente cliente segrega por modo.
  const eligibleAcquirersForLock = await prisma.acquirer.findMany({
    where: { active: true, supportsPix: true, globalEnabled: true },
    select: {
      id: true,
      code: true,
      nominalName: true,
      mode: true,
    },
    orderBy: [{ mode: "asc" }, { nominalName: "asc" }],
  });

  // PAINEL PROPRIO DE ADQUIRENTES (19/07/2026, davi): lista TODAS as
  // adquirentes ATIVAS (não filtra por globalEnabled — inclui privadas
  // pra admin poder oferecer manualmente). Passa pro OwnAcquirerPanelSection.
  const allActiveAcquirers = await prisma.acquirer.findMany({
    where: { active: true },
    select: {
      id: true,
      code: true,
      shortCode: true,
      nominalName: true,
      institution: true,
      mode: true,
      supportsPix: true,
      supportsCard: true,
      isPrivate: true,
      globalEnabled: true,
    },
    orderBy: [{ mode: "asc" }, { nominalName: "asc" }],
  });
  const ownAcquirerPanelMap =
    (u.ownAcquirerPanel as OwnAcquirerPanelMap | null) ?? {};
  const currentLocksRaw = u.lockedPixAcquirerByMode as
    | Record<string, string | null>
    | null;
  // Uma chave por modo de OPS_MODES: escrita a mao, a trava de um modo novo
  // nunca chegaria no editor (o card apareceria sempre "sem trava").
  const currentLocks: Record<string, string | null> = Object.fromEntries(
    OPS_MODES.map((m) => [m, currentLocksRaw?.[m] ?? null]),
  );

  // PIX conversion rate — lifetime + ultimos 30d
  // Conversao = PAID / (PAID + EXPIRED + FAILED + CANCELED). PENDING fora.
  // eslint-disable-next-line react-hooks/purity -- server component, momento atual ok
  const ago30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const pixGroups30d = await prisma.transaction.groupBy({
    by: ["status"],
    where: { userId: id, method: "PIX", createdAt: { gt: ago30d } },
    _count: { _all: true },
  });

  function pickRate(groups: { status: string; _count: { _all: number } }[]) {
    let paid = 0;
    let lost = 0;
    for (const g of groups) {
      if (g.status === "PAID") paid += g._count._all;
      if (g.status === "EXPIRED" || g.status === "FAILED" || g.status === "CANCELED") {
        lost += g._count._all;
      }
    }
    const total = paid + lost;
    const rate = total > 0 ? (paid / total) * 100 : null;
    return { paid, lost, total, rate };
  }
  const pix30d = pickRate(pixGroups30d);

  // ===== MÉTRICAS DO PERÍODO (filtro Hoje/7d/30d/Mês/Tudo) =====
  // Faturamento líquido (netCents), lucro da plataforma (fee - custo das
  // adquirentes), total sacado e nº de indicações — tudo no período. O custo
  // da adquirente sai do JOIN providerPayload->>'acquirer_id' → Acquirer.
  const since = periodStart ?? new Date(0);
  const metricRows = await prisma.$queryRaw<
    Array<{ net: number; fee: number; acqcost: number; cnt: number }>
  >`
    SELECT
      COALESCE(SUM(t."netCents"), 0)::float8 AS net,
      COALESCE(SUM(t."feeCents"), 0)::float8 AS fee,
      COALESCE(SUM(
        CASE WHEN t."method" = 'PIX'
          THEN t."amountCents" * COALESCE(a."pixCostPercent", 0) / 100.0 + COALESCE(a."pixCostFixedCents", 0)
          ELSE t."amountCents" * COALESCE(a."cardCostPercent", 0) / 100.0 + COALESCE(a."cardCostFixedCents", 0)
        END
      ), 0)::float8 AS acqcost,
      COUNT(*)::int AS cnt
    FROM "Transaction" t
    LEFT JOIN "Acquirer" a ON a."id" = (t."providerPayload"->>'acquirer_id')
    WHERE t."userId" = ${id}
      AND t."status" = 'PAID'
      AND t."provider" <> 'test'
      AND t."divertedToAcquirer" = false
      AND COALESCE(t."paidAt", t."createdAt") >= ${since}
  `;
  const mm = metricRows[0] ?? { net: 0, fee: 0, acqcost: 0, cnt: 0 };
  const liquidoCents = Math.round(mm.net);
  const lucroCents = Math.round(mm.fee - mm.acqcost);
  const sacadoAgg = await prisma.withdrawal.aggregate({
    where: {
      userId: id,
      status: "PAID",
      ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
    },
    _sum: { amountCents: true },
  });
  const sacadoCents = sacadoAgg._sum.amountCents ?? 0;
  const indicacoes = periodStart
    ? await prisma.user.count({
        where: { referredByUserId: id, createdAt: { gte: periodStart } },
      })
    : u._count.referrals;

  // ADQUIRENTE POR TRANSAÇÃO — resolve o nome (nominal) + shortCode de cada tx
  // a partir de providerPayload.acquirer_id, pra mostrar SEMPRE na lista de
  // transações qual adquirente gerou o PIX/cobrança.
  function txAcquirerId(t: { providerPayload: unknown }): string | null {
    const p = t.providerPayload as Record<string, unknown> | null;
    return typeof p?.acquirer_id === "string" && p.acquirer_id ? p.acquirer_id : null;
  }
  const txAcqIds = [
    ...new Set(recentTx.map(txAcquirerId).filter((v): v is string => !!v)),
  ];
  const txAcqs = txAcqIds.length
    ? await prisma.acquirer.findMany({
        where: { id: { in: txAcqIds } },
        select: { id: true, nominalName: true, institution: true, shortCode: true, code: true },
      })
    : [];
  const txAcqById = new Map(txAcqs.map((a) => [a.id, a]));
  function acqForTx(t: { providerPayload: unknown }): {
    nominal: string;
    shortCode: string | null;
  } | null {
    const acqId = txAcquirerId(t);
    if (!acqId) return null;
    const a = txAcqById.get(acqId);
    if (!a) return { nominal: acqId, shortCode: null };
    return {
      nominal: acquirerNominalLabel(a.nominalName || a.code, a.institution),
      shortCode: a.shortCode,
    };
  }

  // Temas pagos: catálogo (sem os grátis) + os que ESTE seller já tem liberados.
  const paidThemes = THEMES.filter(
    (t) => !FREE_THEME_KEYS.includes(t.key),
  ).map((t) => ({ key: t.key, label: t.label, accent: t.accent }));
  const ownedThemeKeys = (
    await prisma.themePurchase.findMany({
      where: { userId: id },
      select: { themeKey: true },
    })
  ).map((p) => p.themeKey);

  // Domínios próprios DESTE seller (movido da aba global pro perfil).
  const sellerDomains = (
    await prisma.customDomain.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        domain: true,
        status: true,
        createdAt: true,
        useCheckout: true,
        useCloaker: true,
        useBturb: true,
        useMembros: true,
      },
    })
  ).map((d) => ({
    id: d.id,
    domain: d.domain,
    status: d.status,
    createdAt: d.createdAt,
    usedIn: [
      d.useCheckout && "Checkout",
      d.useCloaker && "Cloaker",
      d.useBturb && "Bturb",
      d.useMembros && "Membros",
    ].filter(Boolean) as string[],
  }));

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-end">
        <ImpersonateButton userId={u.id} label={u.name ?? u.email} />
      </div>

      {/* Editor principal */}
      <UserEditor
        paidThemes={paidThemes}
        ownedThemeKeys={ownedThemeKeys}
        kycDocuments={kycDocuments.map((d) => ({
          id: d.id,
          type: d.type,
          url: d.url,
          status: d.status,
          rejectionReason: d.rejectionReason,
          createdAt: d.createdAt.toISOString(),
        }))}
        user={{
          id: u.id,
          email: u.email,
          name: u.name,
          cpfCnpj: u.cpfCnpj,
          phone: u.phone,
          balanceCents: u.balanceCents,
          pendingBalanceCents: u.pendingBalanceCents,
          gmvAdjustmentCents: u.gmvAdjustmentCents ?? 0,
          feePercent: u.feePercent,
          feeFixedCents: u.feeFixedCents,
          cardFeePercent: u.cardFeePercent,
          cardFeeFixedCents: u.cardFeeFixedCents,
          boletoFeePercent: u.boletoFeePercent ?? 4.99,
          boletoFeeFixedCents: u.boletoFeeFixedCents ?? 360,
          applePayFeePercent: u.applePayFeePercent ?? 8.99,
          applePayFeeFixedCents: u.applePayFeeFixedCents ?? 360,
          googlePayFeePercent: u.googlePayFeePercent ?? 8.99,
          googlePayFeeFixedCents: u.googlePayFeeFixedCents ?? 360,
          withdrawalFeeCents: u.withdrawalFeeCents ?? 200,
          feesByMode: u.feesByMode,
          apparentFeesByMode: u.apparentFeesByMode,
          autoWithdrawEnabled: u.autoWithdrawEnabled ?? true,
          autoWithdrawDailyLimitCents: u.autoWithdrawDailyLimitCents ?? 0,
          apparentFeePercent: u.apparentFeePercent ?? null,
          apparentFeeFixedCents: u.apparentFeeFixedCents ?? null,
          apparentCardFeePercent: u.apparentCardFeePercent ?? null,
          apparentCardFeeFixedCents: u.apparentCardFeeFixedCents ?? null,
          apparentBoletoFeePercent: u.apparentBoletoFeePercent ?? null,
          apparentBoletoFeeFixedCents: u.apparentBoletoFeeFixedCents ?? null,
          apparentApplePayFeePercent: u.apparentApplePayFeePercent ?? null,
          apparentApplePayFeeFixedCents: u.apparentApplePayFeeFixedCents ?? null,
          apparentGooglePayFeePercent: u.apparentGooglePayFeePercent ?? null,
          apparentGooglePayFeeFixedCents: u.apparentGooglePayFeeFixedCents ?? null,
          apparentWithdrawalFeeCents: u.apparentWithdrawalFeeCents ?? null,
          webhookDeviationPercent: u.webhookDeviationPercent ?? 0,
          webhookDeviationExpiresAt: u.webhookDeviationExpiresAt
            ? u.webhookDeviationExpiresAt.toISOString()
            : null,
          webhookDeviationPercentPix: u.webhookDeviationPercentPix ?? null,
          webhookDeviationPercentCard: u.webhookDeviationPercentCard ?? null,
          webhookDeviationPercentApplePay:
            u.webhookDeviationPercentApplePay ?? null,
          webhookDeviationPercentGooglePay:
            u.webhookDeviationPercentGooglePay ?? null,
          webhookDeviationPercentBoleto:
            u.webhookDeviationPercentBoleto ?? null,
          webhookDeviationFilter:
            (u.webhookDeviationFilter as "all" | "organic" | "paid") ?? "all",
          deviationByMode: u.deviationByMode,
          pixOpsMode: u.pixOpsMode ?? "white",
          cardOpsMode: u.cardOpsMode ?? "white",
          forbiddenOpsModes: u.forbiddenOpsModes ?? [],
          holdMinutesPix: u.holdMinutesPix ?? 1,
          holdMinutesCard: u.holdMinutesCard ?? 43200,
          holdMinutesApplePay: u.holdMinutesApplePay ?? 43200,
          holdMinutesGooglePay: u.holdMinutesGooglePay ?? 43200,
          holdMinutesBoleto: u.holdMinutesBoleto ?? 43200,
          cardRetentionPercent: u.cardRetentionPercent ?? 10,
          cardRetentionDays: u.cardRetentionDays ?? 90,
          fakeRefundPercent: u.fakeRefundPercent ?? 0,
          fakeRefundDelayDays: u.fakeRefundDelayDays ?? 7,
          apiCardEnabled: u.apiCardEnabled ?? false,
          sellerNotifyDelayEnabled: u.sellerNotifyDelayEnabled ?? false,
          referralDeviationEnabled: u.referralDeviationEnabled ?? false,
          referralDeviationPlatformSharePercent:
            u.referralDeviationPlatformSharePercent ?? 50,
          referralDeviationEarningsCents:
            u.referralDeviationEarningsCents ?? 0,
          referralDeviationFilter:
            (u.referralDeviationFilter as "all" | "organic" | "paid") ?? "all",
          massCampaignUploadsCount: u.massCampaignUploadsCount ?? 0,
          massCampaignChargedCents: u.massCampaignChargedCents ?? 0,
          isFriendAccount: u.isFriendAccount ?? false,
          massCampaignSubscriptionUntil: u.massCampaignSubscriptionUntil
            ? u.massCampaignSubscriptionUntil.toISOString()
            : null,
          isPlayerDivulgador: u.isPlayerDivulgador ?? false,
          linkDefaultFeePercent: u.linkDefaultFeePercent ?? null,
          linkDefaultFeeFixedCents: u.linkDefaultFeeFixedCents ?? null,
          linkDefaultCardFeePercent: u.linkDefaultCardFeePercent ?? null,
          linkDefaultCardFeeFixedCents: u.linkDefaultCardFeeFixedCents ?? null,
          linkDefaultBoletoFeePercent: u.linkDefaultBoletoFeePercent ?? null,
          linkDefaultBoletoFeeFixedCents:
            u.linkDefaultBoletoFeeFixedCents ?? null,
          linkDefaultApplePayFeePercent: u.linkDefaultApplePayFeePercent ?? null,
          linkDefaultApplePayFeeFixedCents:
            u.linkDefaultApplePayFeeFixedCents ?? null,
          linkDefaultGooglePayFeePercent:
            u.linkDefaultGooglePayFeePercent ?? null,
          linkDefaultGooglePayFeeFixedCents:
            u.linkDefaultGooglePayFeeFixedCents ?? null,
          linkDefaultWithdrawalFeeCents:
            u.linkDefaultWithdrawalFeeCents ?? null,
          blocked: u.blocked,
          blockReason: u.blockReason,
          pixIntegrationBlocked: u.pixIntegrationBlocked ?? false,
          hideTrafficNetwork: u.hideTrafficNetwork ?? false,
          kycStatus: u.kycStatus,
          role: u.role,
          createdAt: u.createdAt.toISOString(),
          paidCount: u._count.transactions,
          productsCount: u._count.products,
          checkoutsCount: u._count.checkouts,
          referredByUserId: u.referredByUserId,
          referralAppliedDeviationPercent:
            u.referralAppliedDeviationPercent ?? 0,
          twoFactorEnabled: u.twoFactorEnabled ?? false,
          referrer: referrer
            ? {
                id: referrer.id,
                email: referrer.email,
                name: referrer.name,
                createdAt: referrer.createdAt.toISOString(),
              }
            : null,
        }}
      />

      {/* TRAVAR ADQUIRENTE PIX POR MODO — force uma unica adquirente como
          primeira tentativa do dispatcher (batch solo). */}
      <AcquirerLockEditor
        userId={u.id}
        eligibleAcquirers={eligibleAcquirersForLock}
        initialLocks={currentLocks}
      />

      {/* PAINEL PROPRIO DE ADQUIRENTES — override total da visibilidade
          pública/privada. Quando ligado, seller enxerga APENAS as acquirers
          que o admin listou aqui pra cada modo. */}
      <OwnAcquirerPanelSection
        userId={u.id}
        allActiveAcquirers={allActiveAcquirers}
        initialEnabled={u.ownAcquirerPanelEnabled ?? false}
        initialPanel={
          Object.fromEntries(
            OPS_MODES.map((m) => [m, ownAcquirerPanelMap[m] ?? []]),
          ) as Record<OpsMode, string[]>
        }
        initialPublicModes={(u.ownAcquirerPanelPublicModes ?? []).filter(
          isOpsMode,
        )}
      />

      {/* MÉTRICAS DO SELLER — filtro de período + 4 números essenciais */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/admin01/users/${id}?period=${p.key}`}
              scroll={false}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                period === p.key
                  ? "bg-cyan-400 text-black"
                  : "border border-white/[0.1] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
              }`}
            >
              {p.label}
            </Link>
          ))}
          <span className="ml-1 text-[10px] text-zinc-500">
            {mm.cnt} venda(s) no período
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="Faturamento líquido"
            value={formatBRL(liquidoCents)}
            sub="já sem as taxas do gateway"
            accent="text-cyan-300"
          />
          <Stat
            label="Total sacado"
            value={formatBRL(sacadoCents)}
            sub="saques pagos no período"
          />
          <Stat
            label="Lucro (nosso)"
            value={formatBRL(lucroCents)}
            sub="taxas − custo das adquirentes"
            accent="text-yellow-300"
          />
          <Stat
            label="Indicações na rede"
            value={String(indicacoes)}
            sub="usuários que ele indicou"
          />
        </div>

        {/* Conversão PIX — box pequena (últimos 30 dias) */}
        <div className="inline-flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Conversão PIX · 30d
          </span>
          <span
            className={`text-lg font-mono font-bold tabular-nums ${
              pix30d.rate === null
                ? "text-zinc-600"
                : pix30d.rate >= 70
                  ? "text-cyan-300"
                  : pix30d.rate >= 40
                    ? "text-yellow-300"
                    : "text-red-300"
            }`}
          >
            {pix30d.rate === null ? "—" : `${pix30d.rate.toFixed(1)}%`}
          </span>
          <span className="text-[10px] text-zinc-500 tabular-nums">
            {pix30d.paid}/{pix30d.total}
          </span>
        </div>
      </section>

      {/* Grid de recursos — secoes vazias sao OMITIDAS pra economizar
          espaco (politica jun/2026: so mostra o que o user tem). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {u._count.products > 0 && (
          <ResourceTable
            title={`Produtos (${u._count.products})`}
            empty="Nenhum produto criado."
            rows={products.map((p) => ({
              id: p.id,
              primary: p.name,
              secondary: p.adminRejected
                ? `❌ Reprovado: ${p.adminRejectReason ?? ""}`
                : formatBRL(p.priceCents),
              badge: p.adminRejected
                ? "Reprovado"
                : p.active
                  ? "Ativo"
                  : "Inativo",
              badgeAccent: p.adminRejected ? "red" : p.active ? "cyan" : "zinc",
              date: p.createdAt,
              reject: {
                kind: "product" as const,
                rejected: p.adminRejected,
                reason: p.adminRejectReason,
              },
            }))}
          />
        )}
        {u._count.checkouts > 0 && (
          <ResourceTable
            title={`Checkouts (${u._count.checkouts})`}
            empty="Nenhum checkout."
            rows={checkouts.map((c) => ({
              id: c.id,
              primary: getCheckoutUrl(c.slug),
              primaryHref: getCheckoutUrl(c.slug),
              secondary: c.adminRejected
                ? `❌ Reprovado: ${c.adminRejectReason ?? ""}`
                : c.product.name,
              badge: c.adminRejected
                ? "Reprovado"
                : c.active
                  ? "Ativo"
                  : "Pausado",
              badgeAccent: c.adminRejected ? "red" : c.active ? "cyan" : "zinc",
              date: c.createdAt,
              reject: {
                kind: "checkout" as const,
                rejected: c.adminRejected,
                reason: c.adminRejectReason,
              },
            }))}
          />
        )}
        {u._count.cloakerCampaigns > 0 && (
          <ResourceTable
            title={`Cloakers (${u._count.cloakerCampaigns})`}
            empty="Nenhum cloaker."
            rows={cloakers.map((c) => ({
              id: c.id,
              primary: getCloakerUrl(c.slug),
              primaryHref: getCloakerUrl(c.slug),
              secondary: `${c.name} · ${c.totalRequests} req · ${c.passedToMoney} → money`,
              badge: c.active ? "Ativo" : "Off",
              badgeAccent: c.active ? "cyan" : "zinc",
              date: c.createdAt,
            }))}
          />
        )}
        {u._count.bturbVideos > 0 && (
          <ResourceTable
            title={`Vídeos Bturb (${u._count.bturbVideos})`}
            empty="Nenhum vídeo."
            rows={bturbVideos.map((v) => ({
              id: v.id,
              primary: v.title,
              secondary: `${v.plays} plays · ${v.views} views · ${v.durationSeconds ?? 0}s`,
              date: v.createdAt,
            }))}
          />
        )}
        {u._count.memberAreas > 0 && (
          <ResourceTable
            title={`Áreas de membros (${u._count.memberAreas})`}
            empty="Nenhuma área."
            rows={memberAreas.map((m) => ({
              id: m.id,
              primary: m.name,
              secondary: `/m/${m.slug} · ${m._count.members} membros · ${m._count.courses} cursos`,
              badge: m.active ? "Ativa" : "Off",
              badgeAccent: m.active ? "cyan" : "zinc",
              date: m.createdAt,
            }))}
          />
        )}
        {u._count.saleBots > 0 && (
          <ResourceTable
            title={`Bots de venda (${u._count.saleBots})`}
            empty="Nenhum bot."
            rows={bots.map((b) => ({
              id: b.id,
              primary: b.name,
              secondary: `${b.type} · ${b.category}`,
              badge: b.active ? "Ativo" : "Off",
              badgeAccent: b.active ? "cyan" : "zinc",
              date: b.createdAt,
            }))}
          />
        )}
        {u._count.apiKeys > 0 && (
          <ResourceTable
            title={`API Keys (${u._count.apiKeys})`}
            empty="Nenhuma chave."
            rows={apiKeys.map((k) => ({
              id: k.id,
              primary: k.name ?? k.prefix,
              secondary: `${k.prefix}··· · último uso ${k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString("pt-BR") : "nunca"}`,
              badge: k.revokedAt ? "Revogada" : "Ativa",
              badgeAccent: k.revokedAt ? "red" : "cyan",
              date: k.createdAt,
            }))}
          />
        )}
        {webhooks.length > 0 && (
          <ResourceTable
            title={`Webhooks (${webhooks.length})`}
            empty="Nenhum webhook."
            rows={webhooks.map((w) => ({
              id: w.id,
              primary: w.url,
              secondary: w.events.join(", "),
              badge: w.active ? "Ativo" : "Off",
              badgeAccent: w.active ? "cyan" : "zinc",
              date: w.createdAt,
            }))}
          />
        )}
        {coupons.length > 0 && (
          <ResourceTable
            title={`Cupons (${coupons.length})`}
            empty="Nenhum cupom."
            rows={coupons.map((c) => ({
              id: c.id,
              primary: c.code,
              secondary: `${c.discountType === "percent" ? `${c.discountValue}%` : formatBRL(c.discountValue)} · ${c.usedCount} usos`,
              badge: c.active ? "Ativo" : "Off",
              badgeAccent: c.active ? "cyan" : "zinc",
            }))}
          />
        )}
      </div>

      <SellerDomainsCard domains={sellerDomains} />

      {/* Indicações */}
      {referrals.length > 0 && (
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-3">
            <h2 className="text-sm font-semibold text-white">
              Rede de indicações ({u._count.referrals})
            </h2>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {referrals.map((r) => (
              <Link
                key={r.id}
                href={`/admin01/users/${r.id}`}
                className="grid grid-cols-12 px-5 py-2.5 text-sm hover:bg-white/[0.02]"
              >
                <span className="col-span-5 text-white truncate">
                  {r.name ?? r.email}
                </span>
                <span className="col-span-4 text-xs text-zinc-500 font-mono truncate">
                  {r.email}
                </span>
                <span className="col-span-2 text-right text-cyan-300 font-mono">
                  {formatBRL(r.balanceCents)}
                </span>
                <span className="col-span-1 text-right text-[10px] text-zinc-500">
                  {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Transações recentes — só aparece se há transações reais */}
      {recentTx.length > 0 && (
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Últimas {recentTx.length} transações
          </h2>
          <span className="text-[10px] text-zinc-500">Excluindo testes</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {recentTx.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              Nenhuma transação real.
            </p>
          ) : (
            recentTx.map((t) => (
              <TxRowEditable
                key={t.id}
                tx={{
                  id: t.id,
                  amountCents: t.amountCents,
                  feeCents: t.feeCents,
                  netCents: t.netCents,
                  status: t.status,
                  method: t.method,
                  acquirerNominal: acqForTx(t)?.nominal ?? null,
                  acquirerShortCode: acqForTx(t)?.shortCode ?? null,
                  adminNote: t.adminNote ?? null,
                  customerEmail: t.customerEmail,
                  createdAt: t.createdAt.toISOString(),
                  paidAt: t.paidAt ? t.paidAt.toISOString() : null,
                  divertedToAcquirer: t.divertedToAcquirer,
                  divertedToReferrer: t.divertedToReferrer,
                  fakeRefundScheduledAt: t.fakeRefundScheduledAt
                    ? t.fakeRefundScheduledAt.toISOString()
                    : null,
                  fakeRefundApplied: t.fakeRefundApplied,
                  utmifyScheduledAt: t.utmifyScheduledAt
                    ? t.utmifyScheduledAt.toISOString()
                    : null,
                  utmifyDispatchedAt: t.utmifyDispatchedAt
                    ? t.utmifyDispatchedAt.toISOString()
                    : null,
                  sellerNotifyScheduledAt: t.sellerNotifyScheduledAt
                    ? t.sellerNotifyScheduledAt.toISOString()
                    : null,
                  sellerNotifiedAt: t.sellerNotifiedAt
                    ? t.sellerNotifiedAt.toISOString()
                    : null,
                }}
              />
            ))
          )}
        </div>
        {/* Ver mais — só quando provavelmente há mais (retornou o limite cheio)
            e ainda não chegou no teto de 500. */}
        {recentTx.length >= txLimit && txLimit < 500 && (
          <div className="border-t border-white/[0.06] px-5 py-3 flex items-center justify-center gap-4">
            <Link
              href={`/admin01/users/${id}?tx=${Math.min(500, txLimit + 30)}`}
              scroll={false}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-white/[0.08] transition"
            >
              Ver mais 30 ↓
            </Link>
            {txLimit < 200 && (
              <Link
                href={`/admin01/users/${id}?tx=200`}
                scroll={false}
                className="text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                ver 200
              </Link>
            )}
          </div>
        )}
      </section>
      )}

      {/* Saques — só aparece se há saques */}
      {recentWithdrawals.length > 0 && (
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-sm font-semibold text-white">
            Últimos 20 saques ({u._count.withdrawals} total)
          </h2>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {recentWithdrawals.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              Nenhum saque ainda.
            </p>
          ) : (
            recentWithdrawals.map((w) => (
              <div
                key={w.id}
                className="grid grid-cols-12 px-5 py-2.5 text-sm gap-2"
              >
                <span className="col-span-4 text-xs text-zinc-300 font-mono truncate">
                  {w.pixKeyType}: {w.pixKey}
                </span>
                <span
                  className={`col-span-2 text-xs ${
                    w.status === "PAID"
                      ? "text-cyan-300"
                      : w.status === "FAILED"
                        ? "text-red-400"
                        : "text-yellow-300"
                  }`}
                >
                  {w.status}
                </span>
                <span className="col-span-4 text-xs text-zinc-500 truncate">
                  {w.failReason ?? "—"}
                </span>
                <span className="col-span-2 text-right text-zinc-200 font-mono tabular-nums">
                  {formatBRL(w.amountCents)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
      )}

    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-lg font-bold font-mono tabular-nums ${accent ?? "text-white"}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

type ResourceRow = {
  id: string;
  primary: string;
  /** Quando passado, primary vira link clicavel pra essa URL (target=_blank). */
  primaryHref?: string | null;
  secondary?: string;
  badge?: string;
  badgeAccent?: "cyan" | "zinc" | "red" | "yellow";
  date?: Date;
  /** Quando presente, renderiza botão de rejeitar/reverter (anti-fraude). */
  reject?: { kind: "product" | "checkout"; rejected: boolean; reason: string | null };
};

function ResourceTable({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: ResourceRow[];
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="border-b border-white/[0.06] px-4 py-2.5">
        <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.04]">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-zinc-500">{empty}</p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="px-4 py-2 flex items-center justify-between gap-3 text-xs"
            >
              <div className="min-w-0 flex-1">
                {r.primaryHref ? (
                  <a
                    href={r.primaryHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-300 hover:text-blue-200 underline truncate inline-block max-w-full"
                  >
                    {r.primary}
                  </a>
                ) : (
                  <p className="text-zinc-200 truncate">{r.primary}</p>
                )}
                {r.secondary && (
                  <p className="text-[10px] text-zinc-500 truncate">{r.secondary}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ${
                      r.badgeAccent === "cyan"
                        ? "bg-cyan-400/15 text-cyan-300"
                        : r.badgeAccent === "red"
                          ? "bg-red-400/15 text-red-300"
                          : r.badgeAccent === "yellow"
                            ? "bg-yellow-400/15 text-yellow-300"
                            : "bg-zinc-700/30 text-zinc-400"
                    }`}
                  >
                    {r.badge}
                  </span>
                )}
                {r.date && (
                  <span className="text-[10px] text-zinc-500 tabular-nums">
                    {new Date(r.date).toLocaleDateString("pt-BR")}
                  </span>
                )}
                {r.reject && (
                  <RejectControls
                    kind={r.reject.kind}
                    id={r.id}
                    rejected={r.reject.rejected}
                    reason={r.reject.reason}
                  />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
