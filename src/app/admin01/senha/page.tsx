import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { PasswordPromptClient } from "./client";

export const dynamic = "force-dynamic";

/**
 * 08/08/2026 (davi): "tambem na primeira vez logando, pergunte se o admin
 * quer alterar a senha dele, se sim da a opcao dele criar senha dele".
 *
 * Fica FORA do grupo (authed) de propósito: o layout de lá redireciona pra
 * cá quando `mustPromptPasswordChange` é true, e um dentro do outro daria
 * loop infinito de redirect.
 */
export default async function AdminPasswordPromptPage() {
  const r = await requireAdmin();
  // requireAdmin já exige 2FA passado — a pergunta da senha vem DEPOIS do
  // Google Authenticator, nunca antes.
  if (!r) redirect("/admin01/login");
  if (!r.admin.mustPromptPasswordChange) redirect("/admin01/dashboard");

  return (
    <PasswordPromptClient name={r.admin.name || r.admin.email.split("@")[0]} />
  );
}
