import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PagamentoCliente } from "./client";

/**
 * PÁGINA PÚBLICA DE UMA COBRANÇA (seção 6 do prompt de revamp).
 *
 * A cobrança já entregava QR e copia-e-cola DENTRO do painel. Faltava a URL:
 * sem ela não havia como "abrir" nem "compartilhar", e o seller mandava print
 * do QR pro cliente no WhatsApp.
 *
 * ── O QUE FICA EXPOSTO, E O QUE NÃO ─────────────────────────────────────
 *
 * Isto é uma rota PÚBLICA, sem login. O precedente do projeto pra acesso
 * público a transação é `/api/transactions/[id]/status`, e ele é explícito:
 * cuid como entropia, rate limit por IP, resposta mínima "sem valor, sem
 * email, sem user".
 *
 * Aqui o VALOR aparece, e é desvio consciente: é uma página de pagamento, e
 * quem abre precisa saber quanto vai pagar. O resto da regra vale igual.
 *
 * NÃO exposto, de propósito:
 *  - nome, e-mail, CPF ou telefone do comprador (a cobrança fabrica um
 *    cliente, mas em outros fluxos esses campos são reais);
 *  - quem é o seller, o produto interno, `feeCents`, `netCents`,
 *    `providerId` — nada disso interessa a quem paga, e tudo isso é
 *    informação de negócio;
 *  - qualquer transação que não seja PIX com copia-e-cola. Sem isso, um id
 *    vindo de um webhook abriria uma página de status de venda de cartão que
 *    ninguém deveria consultar.
 */

export const dynamic = "force-dynamic";

export default async function PagamentoPublico({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Mesma validação de formato do endpoint de status. Recusar cedo evita que
  // lixo vire consulta no banco.
  if (typeof id !== "string" || id.length < 10 || id.length > 64 || !/^[a-z0-9]+$/i.test(id)) {
    notFound();
  }

  const tx = await prisma.transaction.findFirst({
    where: {
      id,
      method: "PIX",
      // Só o que foi feito PRA ser pago por alguém. Sem copia-e-cola não há
      // pagamento a fazer, e a página viraria um consultor de status de
      // transação alheia.
      pixCopyPaste: { not: null },
      provider: { not: "test" },
    },
    select: {
      amountCents: true,
      status: true,
      pixCopyPaste: true,
      pixQrCode: true,
      pixExpiresAt: true,
    },
  });

  if (!tx || !tx.pixCopyPaste) notFound();

  const expirado =
    tx.status === "EXPIRED" ||
    (!!tx.pixExpiresAt && tx.pixExpiresAt < new Date() && tx.status === "PENDING");

  return (
    <PagamentoCliente
      id={id}
      amountCents={tx.amountCents}
      // O status vai NORMALIZADO em três estados. Repassar o enum cru daria
      // vocabulário interno ("CHARGEBACK", "PROCESSING") pra quem só quer
      // saber se já pagou.
      estado={tx.status === "PAID" ? "pago" : expirado ? "expirado" : "aberto"}
      copiaECola={tx.pixCopyPaste}
      qrCode={tx.pixQrCode}
      expiraEm={tx.pixExpiresAt?.toISOString() ?? null}
    />
  );
}
