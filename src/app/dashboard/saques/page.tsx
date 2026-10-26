import { redirect } from "next/navigation";

/**
 * 06/08/2026 (davi): Saques virou o lado SAÍDAS de /dashboard/financeiro.
 *
 * Mantida como redirect (e não deletada) porque /dashboard/saques é o CTA de
 * 3 emails transacionais (email-templates.ts: saque aprovado/negado/pendente)
 * e do push de saque (withdrawals.ts). Email já enviado não dá pra reescrever.
 *
 * Os componentes (FinanceiroHero, WithdrawForm, AutoWithdrawConfig,
 * ReleaseCalendar, HistoryList) e as server actions continuam nesta pasta —
 * quem monta agora é /dashboard/financeiro.
 */
export default function SaquesRedirect() {
  redirect("/dashboard/financeiro?tab=saidas");
}
