import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VerifyEmailClient } from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Confirmar email — Trilho",
};

/**
 * 08/08/2026 (davi): "pagina de verificacao de email, mesmo apos verificar ta
 * voltando a aparecer na minha tela!".
 *
 * Esta tela não tinha NENHUMA checagem de servidor: era client puro, então
 * bastava cair aqui (link antigo, botão voltar do navegador, banner do painel)
 * pra ela pedir um código de novo — mesmo pra quem já tinha confirmado. E como
 * o servidor não manda código pra email já confirmado, a pessoa ficava
 * esperando um email que nunca ia chegar, sem saída.
 *
 * Agora a pergunta é respondida ANTES de renderizar qualquer coisa: quem já
 * confirmou vai direto pro painel e nunca mais vê esta página.
 *
 * O caminho normal do cadastro nem passa por aqui — a confirmação virou o
 * último passo do /signup, na mesma tela. Isto aqui é a porta de trás: link
 * antigo, banner do "confirmar depois" e login sem confirmação.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; fresh?: string }>;
}) {
  const { email: emailParam, fresh } = await searchParams;

  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);

  // Sem sessão a confirmação não leva a lugar nenhum (o código marca a conta,
  // mas o painel continua pedindo login). Manda pro login já.
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, emailVerified: true },
  });

  if (!user) redirect("/login");
  if (user.emailVerified) redirect("/dashboard");

  // O ?email= da URL é só uma dica. Quem manda é o email da sessão — senão
  // dava pra pedir código do email dos outros trocando a query string.
  void emailParam;

  return (
    <VerifyEmailClient email={user.email} alreadySent={fresh === "1"} />
  );
}
