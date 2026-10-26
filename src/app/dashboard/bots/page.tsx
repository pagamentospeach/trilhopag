import { redirect } from "next/navigation";

/**
 * A aba "Bots" foi FUNDIDA na aba Produtos (jun/2026): "Produtos / Bots".
 * A lista + criação de bots agora vivem em /dashboard/produtos. Esta rota
 * antiga redireciona pra lá (o editor de bot continua em /dashboard/bots/[id]).
 */
export default function BotsPageRedirect() {
  redirect("/dashboard/produtos");
}
