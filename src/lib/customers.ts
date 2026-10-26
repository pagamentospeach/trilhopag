import { prisma } from "./prisma";

export async function upsertCustomerFromTransaction(tx: {
  userId: string;
  customerEmail: string;
  customerName: string | null;
  customerCpf: string | null;
  customerPhone: string | null;
  amountCents: number;
  status: string;
  provider?: string;
}) {
  if (!tx.customerEmail) return;
  // Pula transações de teste — não devem afetar stats reais de clientes
  if (tx.provider === "test") return;
  const inc = tx.status === "PAID" ? tx.amountCents : 0;
  const incCount = tx.status === "PAID" ? 1 : 0;
  await prisma.customer.upsert({
    where: { userId_email: { userId: tx.userId, email: tx.customerEmail } },
    create: {
      userId: tx.userId,
      email: tx.customerEmail,
      name: tx.customerName,
      cpf: tx.customerCpf,
      phone: tx.customerPhone,
      totalSpentCents: inc,
      purchasesCount: incCount,
      lastSeenAt: new Date(),
    },
    update: {
      name: tx.customerName ?? undefined,
      cpf: tx.customerCpf ?? undefined,
      phone: tx.customerPhone ?? undefined,
      totalSpentCents: { increment: inc },
      purchasesCount: { increment: incCount },
      lastSeenAt: new Date(),
    },
  });
}
