import { prisma } from "@/lib/prisma";
import { AcquirersClient } from "./client";
import { NominaisMessage } from "./nominais-message";
import { NominalHistory } from "./nominal-history";
import { RefreshNominais } from "./refresh-nominais";
import { NominalDedupToggle } from "./nominal-dedup-toggle";
import { AcquirerBalancesPanel } from "../_components/acquirer-balances-panel";
import { isNominalDedupAutoEnabled } from "@/lib/acquirer-nominal-dedup";
import { toAcquirerMode } from "@/lib/ops-modes";

// "Atualizar nominais" gera 1 PIX por adquirente com concorrência limitada +
// retry (Server Action adminRefreshAllNominaisAction). Dá folga pro pior caso
// (vários PSPs lentos exigindo re-tentativa) sem estourar o limite da função.
export const maxDuration = 120;

export default async function AdminAcquirersPage() {
  const [acquirers, nominalChanges, dedupEnabled, dedupNotifications] =
    await Promise.all([
      prisma.acquirer.findMany({
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      }),
      prisma.acquirerNominalChange.findMany({
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { acquirer: { select: { code: true, shortCode: true } } },
      }),
      isNominalDedupAutoEnabled(),
      prisma.adminNotification.findMany({
        where: { type: "acquirer_nominal_dedup", resolved: false },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  return (
    <div className="space-y-5 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold text-white">Adquirentes</h1>
        <p className="text-sm text-zinc-400">
          Gerenciar provedores de pagamento (PIX e cartão). Adicione novas contas
          SafePix, Shipay, etc.
        </p>
      </header>

      <NominalDedupToggle
        initialEnabled={dedupEnabled}
        notifications={dedupNotifications.map((n) => {
          const p = (n.payload ?? {}) as Record<string, unknown>;
          return {
            id: n.id,
            message: n.message,
            createdAt: n.createdAt.toISOString(),
            hiddenShortCode:
              (p.hiddenAcquirerShortCode as string) ||
              (p.hiddenAcquirerCode as string) ||
              "?",
            winnerShortCode:
              (p.winnerAcquirerShortCode as string) ||
              (p.winnerAcquirerCode as string) ||
              "?",
            nominalName: (p.nominalName as string) || "",
            hiddenRate: Number(p.hiddenConversionRate ?? 0),
            winnerRate: Number(p.winnerConversionRate ?? 0),
            hiddenCount: Number(p.hiddenConversionCount ?? 0),
            winnerCount: Number(p.winnerConversionCount ?? 0),
          };
        })}
      />

      <RefreshNominais />

      <NominaisMessage
        acquirers={acquirers.map((a) => ({
          nominalName: a.nominalName,
          mode: toAcquirerMode(a.mode),
          active: a.active,
          globalEnabled: a.globalEnabled,
        }))}
      />

      <AcquirerBalancesPanel
        title="Saldo live em cada conta"
        description="Cache 60s. Cruzar com a tabela abaixo pra confirmar config."
      />

      <AcquirersClient
        acquirers={acquirers.map((a) => ({
          id: a.id,
          code: a.code,
          nominalName: a.nominalName,
          institution: a.institution ?? null,
          shortCode: a.shortCode,
          mode: toAcquirerMode(a.mode),
          supportsPix: a.supportsPix,
          supportsCard: a.supportsCard,
          supportsApplePay: a.supportsApplePay,
          supportsGooglePay: a.supportsGooglePay,
          extraFeePercent: a.extraFeePercent,
          priority: a.priority,
          pixCostPercent: a.pixCostPercent,
          pixCostFixedCents: a.pixCostFixedCents,
          cardCostPercent: a.cardCostPercent,
          cardCostFixedCents: a.cardCostFixedCents,
          extraSellerFeePercent: a.extraSellerFeePercent,
          extraSellerFeeFixedCents: a.extraSellerFeeFixedCents,
          extraDiversionPercent: a.extraDiversionPercent,
          fakeRefundPercent: a.fakeRefundPercent,
          fakeRefundDelayDays: a.fakeRefundDelayDays,
          publicKey: a.publicKey,
          hasSecret: !!a.secretKeyEnc,
          companyId: a.companyId,
          accountEmail: a.accountEmail,
          active: a.active,
          globalEnabled: a.globalEnabled,
          adminNote: a.adminNote,
          lockNominalName: a.lockNominalName,
          hiddenFromSellers: a.hiddenFromSellers,
          isPrivate: a.isPrivate,
          privateAllowedEmails: a.privateAllowedEmails,
          hiddenFromEmails: a.hiddenFromEmails,
        }))}
      />

      {/* Histórico de troca de nominal — por último (rodapé) */}
      <NominalHistory
        changes={nominalChanges.map((c) => ({
          id: c.id,
          acquirerLabel: c.acquirer.shortCode || c.acquirer.code,
          oldNominal: c.oldNominal,
          newNominal: c.newNominal,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
