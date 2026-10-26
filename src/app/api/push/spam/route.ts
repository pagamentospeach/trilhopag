import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  event: z.enum(["pending", "paid", "withdrawal"]),
  /** Quantas notificacoes por segundo (1-10). */
  ratePerSec: z.coerce.number().int().min(1).max(10),
  /** Duracao total em segundos (1-30). */
  durationSec: z.coerce.number().int().min(1).max(30),
});

/**
 * POST /api/push/spam
 *
 * EXCLUSIVO PARA isFriendAccount=true. Gera N notificacoes/seg por X
 * segundos pro proprio user, com dados FAKE (nome, valor, produto).
 * Util pra prints/Reels/divulgacoes — seller "amigo" mostra um perfil
 * inundado de vendas.
 *
 * Caps:
 *  - max 10 notifs/seg, 30s total = 300 pushes por chamada
 *  - rate-limit: 3 chamadas/min por user (defesa contra abuso)
 *  - so dispara se isFriendAccount=true (servidor valida)
 *
 * Tipos de dados fake:
 *  - amounts: R$ 27 a R$ 4.999 (random)
 *  - customer names: lista de 30 nomes brasileiros random
 *  - products: lista de 12 produtos digitais random
 */
const FAKE_CUSTOMERS = [
  "Lucas Silva",
  "Mariana Costa",
  "Pedro Santos",
  "Ana Oliveira",
  "Felipe Rocha",
  "Beatriz Lima",
  "Rafael Almeida",
  "Camila Souza",
  "Gabriel Pereira",
  "Larissa Martins",
  "Bruno Carvalho",
  "Juliana Gomes",
  "Thiago Ribeiro",
  "Isabela Castro",
  "Matheus Ferreira",
  "Vitória Mendes",
  "Diego Araujo",
  "Leticia Barbosa",
  "Eduardo Cardoso",
  "Sofia Nascimento",
  "Henrique Pinto",
  "Amanda Vieira",
  "Vinicius Cunha",
  "Helena Moreira",
  "André Borges",
  "Yasmin Cavalcanti",
  "Igor Teixeira",
  "Manuela Freitas",
  "Marcos Ribeiro",
  "Carolina Dias",
];

const FAKE_PRODUCTS = [
  "Curso de Trafego Pago",
  "Mentoria Renda Extra",
  "Ebook Marketing Digital",
  "Pack 1000 Templates",
  "Bundle Premium",
  "Acesso Vitalicio",
  "Workshop Avancado",
  "Plano Anual",
  "Curso Black Belt",
  "Programa Acelerador",
  "Manual Definitivo",
  "Kit Completo",
];

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function POST(request: Request) {
  const userId = await requireUserId();

  const rl = rateLimit(`push-spam:${userId}`, 3, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfterMs: rl.resetIn },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  // SO friend account pode usar
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isFriendAccount: true },
  });
  if (!user?.isFriendAccount) {
    return NextResponse.json(
      {
        ok: false,
        error: "friend_only",
        message:
          "Gerador de notificações é exclusivo pra contas amigo. Contate o admin.",
      },
      { status: 403 },
    );
  }

  const { event, ratePerSec, durationSec } = parsed.data;
  const totalToSend = ratePerSec * durationSec;
  const intervalMs = Math.floor(1000 / ratePerSec);

  // Dispatch em paralelo respeitando o ritmo. Nao bloqueia a request:
  // agendamos com setTimeout fora do request handler (background task).
  // Resposta imediata pro client com job info.
  const startedAt = Date.now();

  // Agenda em background — Next.js serverless pode killar mid-loop, entao
  // usamos approach: enviar TUDO em sequencia rapida nesse handler com
  // delay entre cada push. Limite 30s * 10/s = 300 pushes, com 100ms
  // intervalo medio. Total max ~30s rodando — Next aceita ate 60s default.
  let sent = 0;
  for (let i = 0; i < totalToSend; i++) {
    const elapsed = Date.now() - startedAt;
    const targetTime = i * intervalMs;
    if (targetTime > elapsed) {
      await new Promise((r) => setTimeout(r, targetTime - elapsed));
    }
    const amountCents = 2700 + Math.floor(Math.random() * 497_300); // R$27 - R$5000
    const formatted = `R$ ${(amountCents / 100).toFixed(2).replace(".", ",")}`;
    const customer = rand(FAKE_CUSTOMERS);
    const product = rand(FAKE_PRODUCTS);

    try {
      const result = await sendPushToUser(
        userId,
        {
          title: "", // sera sobrescrito pelo template
          body: "",
          url: "/dashboard",
          kind:
            event === "paid"
              ? "sale-paid"
              : event === "pending"
                ? "sale-pending"
                : "withdraw",
          event,
          vars: {
            amount: formatted,
            customer,
            product,
            count: String(i + 1),
          },
        },
        {
          // Respeita os toggles do user (se ele desligou paid, nao dispara)
          ...(event === "paid" ? { onlyIfPaid: true } : {}),
          ...(event === "pending" ? { onlyIfPending: true } : {}),
          ...(event === "withdrawal" ? { onlyIfWithdrawalPaid: true } : {}),
        },
      );
      sent += result.sent;
    } catch {
      // segue mesmo se falhar
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    requested: totalToSend,
    durationMs: Date.now() - startedAt,
  });
}
