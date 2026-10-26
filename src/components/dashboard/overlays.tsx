"use client";

/**
 * Wrapper client-side dos overlays NAO-CRITICOS do dashboard:
 *  - ThemeIcons (decorativos de fundo)
 *  - SystemBoot (sequencia de abertura, 1x logo depois do cadastro)
 *  - IntroAnimation (toca 1x por sessao)
 *  - LockedOverlay (KYC rejected OU approved-recently)
 *
 * Cada um eh lazy-loaded com ssr: false — saem do bundle inicial do
 * dashboard, economizam ~30kb gzipped e nao bloqueiam o LCP.
 *
 * Esta camada existe porque Server Components nao aceitam ssr:false em
 * next/dynamic — entao centralizamos aqui num Client wrapper.
 */
import dynamic from "next/dynamic";

const ThemeIcons = dynamic(
  () => import("@/components/theme-icons").then((m) => m.ThemeIcons),
  { ssr: false },
);
const IntroAnimation = dynamic(
  () =>
    import("@/components/intro-animation").then((m) => m.IntroAnimation),
  { ssr: false },
);
const LockedOverlay = dynamic(
  () =>
    import("@/components/dashboard/locked-overlay").then((m) => m.LockedOverlay),
  { ssr: false },
);
// SystemBoot NAO mora aqui. Ele precisa estar no HTML do servidor pra cobrir o
// painel no primeiro paint, e tudo neste arquivo é ssr:false por definição —
// eram os ~1s de painel exposto que o davi viu. Vive no layout do painel.
// 29/07/2026 (davi): 'Exclua isso, nunca mais apareça essa tela pra mais
// ninguem!' — removido AntiDevtools do dashboard do seller. O overlay
// 'Inspeção bloqueada' era mais atrito do que utilidade e falso positivo
// aparecia pra sellers usando devtools legit (mobile view, etc).
//
// 08/08/2026 (davi): removidos também o carrossel de boas-vindas ("apaga
// 100% todos esses cards de boas-vindas explicando tudo") e o pop-up de
// escolha de modo de operação — modo agora é decisão exclusiva do admin.

export function DashboardOverlays({
  kycStatus,
  rejectionReason,
  recentlyApproved,
  firstBoot = false,
}: {
  kycStatus: string | null | undefined;
  rejectionReason: string | null;
  recentlyApproved: boolean;
  /** Acabou de sair do cadastro: a sequência de abertura (renderizada pelo
   *  layout) já está no ar, então o intro curto de sessão não entra. Os dois
   *  juntos seriam duas telas pretas seguidas. */
  firstBoot?: boolean;
}) {
  return (
    <>
      <ThemeIcons />
      {firstBoot ? null : <IntroAnimation />}
      {kycStatus === "rejected" && (
        <LockedOverlay
          kycStatus="rejected"
          rejectionReason={rejectionReason}
          recentlyApproved={false}
        />
      )}
      {recentlyApproved && (
        <LockedOverlay
          kycStatus="approved"
          rejectionReason={null}
          recentlyApproved={true}
        />
      )}
      {/* AntiDevtools removido 29/07/2026 (davi) — vide comentario no import. */}
    </>
  );
}
