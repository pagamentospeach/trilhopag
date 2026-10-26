import { redirect } from "next/navigation";
import { ensureAdminsExist, getCurrentAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Só é alcançável depois que o `proxy.ts` confirma a porta aberta (as 3
 * batidas no X da tela de erro falsa). Sem o cookie da porta, o request nem
 * chega aqui — vira 404.
 */
export default async function AdminRoot() {
  await ensureAdminsExist();
  const r = await getCurrentAdminSession();
  if (!r) redirect("/admin01/login");
  if (!r.admin.totpSecret) redirect("/admin01/2fa-setup");
  if (!r.session.mfaPassed) redirect("/admin01/2fa");
  if (r.admin.mustPromptPasswordChange) redirect("/admin01/senha");
  redirect("/admin01/dashboard");
}
