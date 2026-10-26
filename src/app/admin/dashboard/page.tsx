import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logHoneypotHit } from "@/lib/honeypot";
import { DashboardClient } from "./client";

export default async function FakeDashboardPage() {
  const c = await cookies();
  if (!c.get("_hp_session")) {
    redirect("/admin/login");
  }

  const h = await headers();
  const fakeReq = new Request("http://internal/admin/dashboard", {
    headers: h as unknown as HeadersInit,
  });
  await logHoneypotHit({ action: "view_dashboard", request: fakeReq });

  // Zero dados úteis. Painel VAZIO com aparência de "erro ao carregar" pra
  // atacante gastar tempo clicando (cada clique = hit → auto-ban em 5 hits/h)
  // e sair sem nenhuma informação real ou fake convincente.
  return <DashboardClient />;
}
