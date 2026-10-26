import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { DivulgadorEditorClient } from "./editor-client";

export const dynamic = "force-dynamic";

/**
 * Editor de uma sub-conta divulgador. Path `[id]` aceita:
 *   - "novo"  → form vazio (criação)
 *   - <cuid>  → carrega valores reais (edição)
 */
export default async function DivulgadorEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlayerDivulgador: true },
  });
  if (!u || !u.isPlayerDivulgador) {
    redirect("/dashboard");
  }

  if (id === "novo") {
    return <DivulgadorEditorClient initial={null} />;
  }

  const account = await prisma.divulgadorAccount.findFirst({
    where: { id, ownerUserId: userId },
  });
  if (!account) notFound();

  return (
    <DivulgadorEditorClient
      initial={{
        id: account.id,
        name: account.name,
        email: account.email,
        avatarUrl: account.avatarUrl ?? "",
        theme: account.theme,
        accentColor: account.accentColor ?? "",
        balanceCents: account.balanceCents,
        pendingBalanceCents: account.pendingBalanceCents,
        todayRevenueCents: account.todayRevenueCents,
        todaySalesCount: account.todaySalesCount,
        last30dRevenueCents: account.last30dRevenueCents,
        last30dSalesCount: account.last30dSalesCount,
        lifetimeRevenueCents: account.lifetimeRevenueCents,
        lifetimeNetCents: account.lifetimeNetCents,
        monthlyGoalCents: account.monthlyGoalCents,
        metricsJson: account.metricsJson as Record<
          string,
          { value: string; sub?: string }
        >,
        seriesJson: Array.isArray(account.seriesJson)
          ? (account.seriesJson as number[])
          : [],
        feedJson: Array.isArray(account.feedJson)
          ? (account.feedJson as Array<{
              id: string;
              amount_cents: number;
              net_cents: number;
              product: string;
              customer_name: string | null;
              method: string;
              paid_at: string;
            }>)
          : [],
        withdrawalsJson: Array.isArray(account.withdrawalsJson)
          ? (account.withdrawalsJson as Array<{
              id: string;
              amount_cents: number;
              method: string;
              status: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
              paid_at: string;
              pix_key?: string | null;
            }>)
          : [],
        notificationsJson: Array.isArray(account.notificationsJson)
          ? (account.notificationsJson as Array<{
              id: string;
              kind: "paid" | "pending" | "withdrawal";
              title: string;
              body: string;
              amount_cents: number;
              at: string;
            }>)
          : [],
      }}
    />
  );
}
