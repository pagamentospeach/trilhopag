import { redirect } from "next/navigation";

// Trigger honeypot log ao chegar em /admin (view_login vai rodar na próxima
// página, mas essa view de /admin também loga via requisição inicial).
// Redirect pra login "de verdade".
export default function AdminRootPage() {
  redirect("/admin/login");
}
