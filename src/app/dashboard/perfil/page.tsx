import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getUserSettings } from "@/lib/user-settings";
import { resolveDisplayFeesByMode } from "@/lib/mode-defaults";
import { ProfileTabs } from "./tabs";
import { DEFAULT_CARD_OPS_MODE, toOpsMode } from "@/lib/ops-modes";

/**
 * 06/08/2026 (davi): "da aba de meu pergil apaga a aba de aparencias e Minhas
 * conquistas" + "Tira isso das taxas".
 *
 * As abas Aparência e Conquistas eram só um ATALHO — montavam aqui dentro o
 * mesmo componente das rotas /dashboard/aparencia e /dashboard/conquistas.
 * As duas rotas continuam de pé e acessíveis; o que saiu foi a duplicata.
 *
 * Com elas caíram as consultas que só as alimentavam: getOwnedThemes (temas
 * comprados), o balanceCents (compra de tema) e o count de vendas do mês do
 * Best Tracker, que servia aos cards de "funções pagas" da aba Taxas.
 */
export default async function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const userId = await requireUserId();
  const session = await auth.api.getSession({ headers: await headers() });

  const [user, settings, address, docs, modeFees] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          name: true,
          cpfCnpj: true,
          phone: true,
          // Modo de adquirente atual + modos proibidos (controlam a aba Taxas).
          pixOpsMode: true,
          cardOpsMode: true,
          forbiddenOpsModes: true,
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
          // Taxas APARENTES — quando setadas, é o que o seller vê (fachada).
          apparentFeePercent: true,
          apparentFeeFixedCents: true,
          apparentCardFeePercent: true,
          apparentCardFeeFixedCents: true,
          apparentBoletoFeePercent: true,
          apparentBoletoFeeFixedCents: true,
          apparentApplePayFeePercent: true,
          apparentApplePayFeeFixedCents: true,
          apparentGooglePayFeePercent: true,
          apparentGooglePayFeeFixedCents: true,
          apparentWithdrawalFeeCents: true,
          twoFactorEnabled: true,
          kycStatus: true,
          kycRejectionReason: true,
          personType: true,
        },
      }),
      getUserSettings(userId),
      prisma.address.findUnique({ where: { userId } }),
      prisma.kycDocument.findMany({
        where: { userId },
        select: { type: true, url: true, status: true, rejectionReason: true, updatedAt: true },
      }),
      // Taxas resolvidas POR MODO (black/white/hot) pra exibir na aba Taxas.
      resolveDisplayFeesByMode(userId),
    ]);

  // Modo de adquirente do seller — definido só pelo admin. A aba Taxas usa
  // isso pra saber quais métodos/valores mostrar, sem deixar trocar.
  const pixOpsMode = toOpsMode(user?.pixOpsMode);
  const cardOpsMode = toOpsMode(user?.cardOpsMode, DEFAULT_CARD_OPS_MODE);

  // É CNPJ se: o tipo foi explicitamente PJ, OU o documento tem 14 dígitos.
  const cpfCnpjDigits = (user?.cpfCnpj || "").replace(/\D/g, "");
  const personType = (user?.personType ?? (cpfCnpjDigits.length === 14 ? "PJ" : "PF")) as
    | "PF"
    | "PJ";
  const isCnpj = personType === "PJ";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-400">
          Conta
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {settings.displayName ?? user?.name ?? "Meu perfil"}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Seus dados, comprovantes e taxas.
        </p>
      </header>

      <ProfileTabs
        abaInicial={tab}
        tabs={[
          { key: "perfil", label: "Perfil", icon: "user" },
          // Comprovantes some quando o KYC já foi aprovado pelo admin.
          ...((user?.kycStatus ?? "not_started") === "approved"
            ? []
            : [{ key: "comprovantes", label: "Comprovantes", icon: "receipt" }]),
          { key: "notificacoes", label: "Notificações", icon: "bell" },
          { key: "taxas", label: "Taxas", icon: "percent" },
        ]}
        user={{
          email: user?.email ?? "",
          emailVerified: session?.user.emailVerified ?? false,
          name: user?.name ?? "",
          cpfCnpj: user?.cpfCnpj ?? "",
          phone: user?.phone ?? "",
          displayName: settings.displayName ?? "",
          avatarUrl: settings.avatarUrl ?? "",
          // Taxa exibida = APARENTE (se setada pelo admin) senão a REAL.
          // O seller não tem como saber qual é qual — vê só o valor resolvido.
          feePercent: user?.apparentFeePercent ?? user?.feePercent ?? 6.99,
          feeFixedCents: user?.apparentFeeFixedCents ?? user?.feeFixedCents ?? 250,
          cardFeePercent:
            user?.apparentCardFeePercent ?? user?.cardFeePercent ?? 9.90,
          cardFeeFixedCents:
            user?.apparentCardFeeFixedCents ?? user?.cardFeeFixedCents ?? 360,
          boletoFeePercent:
            user?.apparentBoletoFeePercent ?? user?.boletoFeePercent ?? 4.99,
          boletoFeeFixedCents:
            user?.apparentBoletoFeeFixedCents ?? user?.boletoFeeFixedCents ?? 360,
          applePayFeePercent:
            user?.apparentApplePayFeePercent ?? user?.applePayFeePercent ?? 8.99,
          applePayFeeFixedCents:
            user?.apparentApplePayFeeFixedCents ??
            user?.applePayFeeFixedCents ??
            360,
          googlePayFeePercent:
            user?.apparentGooglePayFeePercent ?? user?.googlePayFeePercent ?? 8.99,
          googlePayFeeFixedCents:
            user?.apparentGooglePayFeeFixedCents ??
            user?.googlePayFeeFixedCents ??
            360,
          withdrawalFeeCents:
            user?.apparentWithdrawalFeeCents ?? user?.withdrawalFeeCents ?? 200,
          // Modo de adquirente + taxas por modo (aba Taxas mode-aware).
          pixOpsMode,
          cardOpsMode,
          modeFees,
          twoFactorEnabled: user?.twoFactorEnabled ?? false,
          kycStatus: user?.kycStatus ?? "not_started",
          kycRejectionReason: user?.kycRejectionReason ?? null,
          isCnpj,
          personType,
        }}
        address={
          address
            ? {
                zipcode: address.zipcode,
                street: address.street,
                number: address.number,
                complement: address.complement ?? "",
                neighborhood: address.neighborhood,
                city: address.city,
                state: address.state,
                country: address.country,
              }
            : null
        }
        documents={docs.map((d) => ({
          type: d.type,
          url: d.url,
          status: d.status,
          rejectionReason: d.rejectionReason,
          updatedAt: d.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
