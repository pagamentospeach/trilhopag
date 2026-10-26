import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
// 29/07/2026 (davi): AntiDevtools removido — overlay 'Inspeção bloqueada'
// nao aparece mais pra ninguem (seller nem admin).
import { AdminShell, type AdminNavItem } from "./_components/admin-shell";
import { AlertsBar } from "./_components/alerts-bar";
import { CommandPalette } from "./_components/command-palette";
import { PresenceGuard } from "./_components/presence-guard";

// Sidebar PLANA (sem grupos). Ordem: Dashboard, Saques, Adquirentes primeiro.
// Removidas: Ranking Top 5, Cartões capturados, Pool Checkout (apagadas).
// (Análise/Domínios/Temas/Preços ficam por ora até suas funções serem movidas.)
const NAV: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin01/dashboard", iconName: "LayoutDashboard" },
  // 12/08/2026 (davi): quadro dos socios, estilo Trello. Fica logo abaixo
  // do Dashboard porque e tela de rotina, nao de consulta pontual.
  { label: "Organizador", href: "/admin01/organizador", iconName: "LayoutGrid" },
  { label: "Saques", href: "/admin01/withdrawals", iconName: "Banknote", badgeKey: "withdrawals_pending" },
  { label: "Adquirentes", href: "/admin01/acquirers", iconName: "Server" },
  { label: "Usuários", href: "/admin01/users", iconName: "Users" },
  { label: "Transações", href: "/admin01/transactions", iconName: "CreditCard" },
  { label: "Contatos capturados", href: "/admin01/contacts", iconName: "Contact" },
  { label: "Documentos KYC", href: "/admin01/documents", iconName: "FileText", badgeKey: "kyc_pending" },
  { label: "Taxas padrão", href: "/admin01/taxas-padrao", iconName: "Percent" },
  { label: "Auditoria", href: "/admin01/audit", iconName: "ScrollText" },
  // 08/08/2026 (davi): "apaga a sidebar e tudo (telas, tudo) desses dois:
  // top ofertas do dia, sugestoes". As duas rotas e seus componentes foram
  // deletados, não só escondidos do menu.
  // Análise→dashboard, Preços→Taxas padrão. Domínios e Temas viraram
  // por-seller (no perfil do usuário) — tabs removidas do menu.
];

export default async function AuthedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const r = await requireAdmin();
  if (!r) redirect("/admin01/login");

  // Primeiro login: pergunta se quer trocar a senha inicial antes de soltar
  // o painel. Responder (trocando ou não) desliga a flag pra sempre.
  if (r.admin.mustPromptPasswordChange) redirect("/admin01/senha");

  const [kycPendingCount, withdrawalsPending] = await Promise.all([
    prisma.adminNotification.count({
      where: { type: "kyc_pending_audit", resolved: false },
    }),
    prisma.withdrawal.count({
      where: { status: { in: ["PENDING", "PROCESSING"] } },
    }),
  ]);
  const badges: Record<string, number> = {
    kyc_pending: kycPendingCount,
    withdrawals_pending: withdrawalsPending,
  };

  // href → rótulo, pra barra de presença mostrar "Lucas · Saques" em vez de
  // cuspir a URL crua.
  const navLabels: Record<string, string> = Object.fromEntries(
    NAV.map((n) => [n.href, n.label]),
  );

  return (
    <>
      <AdminShell
        navItems={NAV}
        badges={badges}
        adminEmail={r.admin.email}
      >
        <PresenceGuard labels={navLabels}>
          <AlertsBar />
          {children}
        </PresenceGuard>
      </AdminShell>
      <CommandPalette />
    </>
  );
}
