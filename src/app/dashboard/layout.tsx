// As 125 skins vivem aqui e nao no globals.css: todo seletor delas comeca em
// [data-theme], que so existe no wrapper logo abaixo. Importadas na folha
// global, iam junto pra landing, login, cadastro e checkout — ~40kb brotli de
// CSS que aquelas telas nao tem como usar.
import "@/styles/themes.css";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { WithdrawNudge } from "@/components/dashboard/withdraw-nudge";
import { EmailVerifyBanner } from "@/components/dashboard/email-verify-banner";
import { SwRegister } from "@/components/dashboard/sw-register";
import { CursorGlow } from "@/components/dashboard/cursor-glow";
import { DashboardOverlays } from "@/components/dashboard/overlays";
import { SalesToastFeed } from "@/components/dashboard/sales-toast-feed";
import { SupportFab } from "@/components/dashboard/support-fab";
import { MobileTabBar } from "@/components/dashboard/mobile-tabbar";
import { ToastHost } from "@/components/ui/toast";
import { PrivacyModeProvider } from "@/components/dashboard/privacy-mode";
import { FallingDots } from "@/components/falling-dots";
import { PageTransition } from "./page-transition";
import { getUserSettings } from "@/lib/user-settings";
import { getPushPublicKey } from "@/lib/push";
import { listarNotificacoes } from "@/lib/notifications";
import { FIRST_BOOT_COOKIE } from "@/lib/first-boot";
// Import estático de propósito: esta tela tem que sair pronta do servidor.
import { SystemBoot } from "@/components/dashboard/system-boot";
import { prisma } from "@/lib/prisma";
import {
  getEffectiveUserId,
  listSwitchableAccounts,
} from "@/lib/effective-user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getEffectiveUserId();
  if (!userId) redirect("/login");
  const settings = await getUserSettings(userId);

  // Modo impersonation (admin vendo como seller) — banner no topo.
  const impersonating = (await cookies()).get("tp_impersonating")?.value ?? null;

  // 08/08/2026 (davi): "depois de registrar tudo, faz uma animacao (...) como se
  // tivesse iniciado um sistema da NASA". O cookie é escrito no último passo do
  // cadastro e queimado no primeiro paint da animação, então essa leitura só dá
  // true na primeira abertura do painel logo depois de registrar.
  const firstBoot =
    (await cookies()).get(FIRST_BOOT_COOKIE)?.value === "1";

  const [user, accounts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        balanceCents: true,
        email: true,
        name: true,
        emailVerified: true,
        role: true,
        blocked: true,
        kycStatus: true,
        kycRejectionReason: true,
        updatedAt: true,
        isPlayerDivulgador: true,
        isFriendAccount: true,
        pixOpsMode: true,
        // 27/07/2026: pra o gate de email verification pular sub-contas
        // (herdam verificacao do pai — nao devem ser pedidas a verificar).
        isSubAccount: true,
      },
    }),
    listSwitchableAccounts(),
  ]);

  // Detecta se a aprovação aconteceu há pouco (< 60s) — dispara animação
  // de boas-vindas no client.
  const recentlyApproved =
    user?.kycStatus === "approved" &&
    user?.updatedAt &&
    Date.now() - new Date(user.updatedAt).getTime() < 60_000;

  // Bloqueio total se conta banida
  if (user?.blocked) {
    redirect("/conta-bloqueada");
  }

  // EMAIL VERIFICATION GATE (16/07/2026, atualizado 17/07/2026):
  // Signup obrigatoriamente passa por confirmação de código de 6 dígitos.
  // Fica atrás de env `EMAIL_VERIFICATION_REQUIRED=1`.
  //
  // NOVO (17/07): seller pode escolher "verificar depois" — nesse caso setamos
  // cookie tp_verify_skip=1 na página /verify-email e o gate deixa passar,
  // mostrando apenas um banner persistente no topo do dashboard até verificar.
  // Isso reduz atrito no primeiro acesso mas mantém pressão pra verificar.
  const emailGateOn = process.env.EMAIL_VERIFICATION_REQUIRED === "1";
  const verifySkip = (await cookies()).get("tp_verify_skip")?.value === "1";
  // 27/07/2026: sub-conta herda verificacao do pai — nao passa pelo gate.
  // Antes redirecionava pra /verify-email?email=sub-XXXX@subaccount.trilhopag.
  // local ('email nada a ver'). Defesa em profundidade + fix retroativo em
  // sub-contas antigas que foram criadas sem emailVerified=true.
  const needsEmailVerification =
    emailGateOn &&
    !!user &&
    !user.emailVerified &&
    !user.isSubAccount &&
    user.role !== "admin";
  if (needsEmailVerification && !verifySkip) {
    redirect(`/verify-email?email=${encodeURIComponent(user.email)}`);
  }

  // 08/08/2026 (davi): o cadastro por email já coleta endereço e documentos,
  // então quem passa pelo /signup chega aqui com kycStatus=approved e NUNCA
  // vê esta tela. O gate sobrou pros dois casos que pulam o formulário: conta
  // criada por Google/GitHub e KYC rejeitado pelo compliance.
  if (user?.kycStatus === "not_started" && user?.role !== "admin") {
    redirect("/onboarding/documentos");
  }

  const balanceCents = user?.balanceCents ?? 0;

  // 06/08/2026 (davi): "Reembolsos" saiu da sidebar junto com as outras abas
  // não citadas, então o gate showRefunds (só WHITE/HOT tem MED) deixou de ser
  // necessário aqui. A rota /dashboard/reembolsos continua no ar.

  const email = user?.email ?? "";
  const displayName =
    settings.displayName ?? user?.name ?? email.split("@")[0];

  const accentStyle = settings.accentColor
    ? ({ "--tp-accent": settings.accentColor } as React.CSSProperties)
    : undefined;

  const pushPublicKey = getPushPublicKey();

  // Central do sino (09/08/2026, secao 19). Duas consultas leves e indexadas
  // (@@index([userId, createdAt]) e [userId, readAt]); entram no layout porque
  // o sino esta em TODA pagina do painel.
  const { itens, naoLidas } = await listarNotificacoes(userId);
  const notificacoes = itens.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    href: n.href,
    lida: !!n.readAt,
    // Formatado no SERVIDOR com fuso fixo: o servidor roda em UTC, e sem isso
    // a venda das 21h apareceria como 00h. Fixar tambem faz o texto do
    // servidor bater com o do cliente, sem erro de hidratacao.
    quando: n.createdAt.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  return (
    // 06/08/2026 (davi): "O botao do olho para ocultar as infos estao com um
    // delay bizarro para censurar tudo!". O modo privacidade virou estado de
    // cliente: o valor do banco entra aqui como `initial` (então quem recarrega
    // com o modo ligado já recebe tudo borrado no primeiro paint) e daí pra
    // frente quem manda é o clique. Ver components/dashboard/privacy-mode.tsx.
    <PrivacyModeProvider initial={settings.privacyMode}>
      {/* Primeiro filho do layout de propósito: se o painel demorar e a
          resposta vier em streaming, esta placa está no primeiro pedaço do
          HTML. Ela cobre a tela inteira (z-10000) até a sequência terminar. */}
      {firstBoot && <SystemBoot />}
      <div
        data-theme={settings.theme}
        data-bg-pattern={settings.bgPattern}
        style={accentStyle}
        // 22/07/2026 (davi: "barra lateral tambem"): overflow-x-CLIP em vez de
        // -hidden — hidden cria scroll context e mata o `sticky` da sidebar
        // (que fica scrollando junto com a pagina). `clip` corta overflow SEM
        // criar scroll context, entao sticky top-0 da sidebar continua funcionando.
        className="bp-bg relative flex min-h-screen overflow-x-clip bg-black text-zinc-100"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] grid-bg" />
        {/* 08/08/2026 (davi): "uns pontinho azuis caindo, clean e sutil".
            `fixed` em vez de `absolute` porque o dashboard é alto — preso ao
            container os pontos cairiam num trecho da página e sumiriam do
            resto. Preso à viewport a chuva acompanha o scroll. */}
        <FallingDots fixed />
        <Sidebar
          email={email}
          balanceCents={balanceCents}
          accounts={accounts}
          acquirerMode={user?.pixOpsMode ?? "black"}
          isFriendAccount={user?.isFriendAccount ?? false}
        />
        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          {impersonating && (
            <a
              href="/api/impersonate/end"
              className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-center text-[13px] font-semibold text-white hover:bg-red-500"
            >
              ⚠️ MODO ADMIN — você está vendo como{" "}
              <strong>{decodeURIComponent(impersonating)}</strong> · clique pra
              sair
            </a>
          )}
          {needsEmailVerification && verifySkip && (
            <EmailVerifyBanner email={user.email} />
          )}
          <Topbar
            displayName={displayName}
            avatarUrl={settings.avatarUrl}
            pushPublicKey={pushPublicKey}
            notificacoes={notificacoes}
            naoLidas={naoLidas}
            theme={settings.theme}
          />
          {/* Padding menor no mobile (px-3 vs px-4) pra ganhar ~8px de largura
              util e evitar overflow lateral em telas 320px. min-w-0 essencial
              pra o flex nao deixar filho estourar na horizontal.

              O `pb-28` vale ate `md` e e o respiro da barra de abas fixa (64px
              + safe area): sem ele o ultimo item de toda pagina do painel fica
              embaixo da barra e nao da pra tocar. Por isso o `sm:` so mexe no
              eixo X — um `sm:p-6` chapado zeraria esse respiro justo na faixa
              640-768px, onde a barra ainda existe. Em `md` a barra some e o
              `p-8` pode reescrever tudo. */}
          <main className="min-w-0 flex-1 px-3 pt-4 pb-28 sm:px-6 sm:pt-6 md:p-8 animate-bp-page-enter">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <SwRegister />
        <CursorGlow />
        {/* 08/08/2026 (davi): "versao da trilho para celular estilo app de
            banco". A navegacao do painel no celular sai do hamburger no canto
            de cima e vira barra de abas embaixo, na altura do polegar. Ela so
            existe abaixo de `md` — no desktop quem manda continua sendo a
            sidebar. Ver components/dashboard/mobile-tabbar.tsx. */}
        <MobileTabBar />
        {/* Avisos curtos de acao (copiou, salvou, falhou). Canto inferior
            direito, longe do SalesToastFeed, que ocupa o superior com a
            notificacao de venda — essa tem som e e identidade do produto,
            entao nao pode disputar espaco. Ver components/ui/toast.tsx. */}
        <ToastHost />
        {/* Suporte flutuante com a logo (davi 06/08) — substitui o headset que
            ficava no topbar. Leva pra /dashboard/suporte; não recebe mais
            email/name porque não monta mais mensagem de WhatsApp. */}
        <SupportFab />
        <WithdrawNudge balanceCents={balanceCents} />
        {/* Toast top-right: notifica venda pendente + aprovada com som de
            dinheiro (08/07 david, print da caju). Client-side only. */}
        <SalesToastFeed />
        {/* PERF: TODOS os overlays decorativos/non-LCP centralizados num
         *  Client wrapper com dynamic+ssr:false. Saem do bundle inicial.
         *  Inclui ThemeIcons, IntroAnimation e LockedOverlay (KYC). */}
        <DashboardOverlays
          kycStatus={user?.kycStatus}
          rejectionReason={user?.kycRejectionReason ?? null}
          recentlyApproved={!!recentlyApproved}
          firstBoot={firstBoot}
        />
      </div>
    </PrivacyModeProvider>
  );
}
