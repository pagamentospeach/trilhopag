import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiLog } from "@/lib/api-log";
import { prisma } from "@/lib/prisma";
import { authenticate, errorResponse, requireScope } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { withIdempotency } from "@/lib/security/idempotency";
import {
  requestWithdrawal,
  WithdrawalError,
  type WithdrawalMethod,
} from "@/lib/withdrawals";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Serializa um Withdrawal pro shape público da API. */
function serialize(w: {
  id: string;
  amountCents: number;
  feeCents: number;
  method: string;
  pixKey: string;
  pixKeyType: string;
  walletAddress: string | null;
  status: string;
  failReason: string | null;
  providerId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: w.id,
    object: "withdrawal",
    status: w.status, // PENDING | PROCESSING | PAID | FAILED | REJECTED
    method: w.method, // "pix" | "usdt_solana"
    amount_cents: w.amountCents,
    fee_cents: w.feeCents,
    // Valor líquido que cai na conta de destino (amount - fee).
    net_cents: Math.max(0, w.amountCents - w.feeCents),
    pix_key: w.method === "pix" ? w.pixKey : null,
    pix_key_type: w.method === "pix" ? w.pixKeyType : null,
    wallet_address: w.method === "usdt_solana" ? w.walletAddress : null,
    fail_reason: w.failReason,
    // provider_id REMOVIDO 18/07/2026 (davi): identifica PSP de saída
    // (SafePix/etc). Seller nunca precisa saber por qual PSP saímos.
    paid_at: w.paidAt?.toISOString() ?? null,
    created_at: w.createdAt.toISOString(),
    updated_at: w.updatedAt.toISOString(),
  };
}

/* ============================================================
 * GET /api/v1/withdrawals — lista os saques da conta.
 * Filtros: ?status=PENDING|PROCESSING|PAID|FAILED|REJECTED, ?limit, ?cursor
 * ============================================================ */
async function GET_handler(request: Request) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  const rows = await prisma.withdrawal.findMany({
    where: {
      userId: record.userId,
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, -1) : rows;

  return NextResponse.json({
    data: data.map(serialize),
    has_more: hasMore,
    next_cursor: hasMore ? data[data.length - 1]?.id : null,
  });
}

/* ============================================================
 * POST /api/v1/withdrawals — solicita um saque.
 *
 * SEGURANÇA: o débito é feito de forma ATÔMICA e condicional
 * (UPDATE ... WHERE balanceCents >= amount), então NUNCA é possível sacar
 * mais do que o saldo disponível. Além disso só pode haver UM saque aberto
 * por conta (índice único no banco) e cada solicitação passa por uma
 * auditoria automática antes de ser aceita.
 *
 * Body (PIX):
 *   {
 *     "amount_cents": 5000,          // valor BRUTO do saque (a taxa sai disso)
 *     "method": "pix",               // default "pix"
 *     "pix_key": "sua-chave",
 *     "pix_key_type": "evp"          // cpf|cnpj|evp|phone|email
 *   }
 *
 * Body (USDT/Solana):
 *   {
 *     "amount_cents": 250000,
 *     "method": "usdt_solana",
 *     "wallet_address": "..."        // endereço Solana
 *   }
 * ============================================================ */
const CreateWithdrawalBody = z
  .object({
    amount_cents: z
      .number()
      .int()
      .min(1)
      .max(50_000_000, "amount_cents max R$500.000,00"),
    method: z.enum(["pix", "usdt_solana"]).default("pix"),
    pix_key: z.string().trim().max(200).optional().nullable(),
    pix_key_type: z
      .enum(["cpf", "cnpj", "evp", "phone", "email"])
      .optional()
      .nullable(),
    wallet_address: z.string().trim().max(120).optional().nullable(),
  })
  .refine(
    (d) =>
      d.method === "usdt_solana" ? !!d.wallet_address : !!d.pix_key && !!d.pix_key_type,
    {
      message:
        "PIX exige pix_key + pix_key_type; USDT exige wallet_address",
      path: ["pix_key"],
    },
  );

async function POST_handler(request: Request) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de scope (permissivo p/ chaves sem scopes — ver requireScope).
  const scopeDenied = requireScope(record, "withdrawals");
  if (scopeDenied) return scopeDenied;

  // Rate-limit EXTRA e mais apertado pra saques (10/min por chave) — defesa a
  // mais além do limite global de escrita.
  const rl = rateLimit(`api-withdraw:${record.id}`, 10, 60_000);
  if (!rl.ok) {
    return errorResponse(429, "rate_limited", "Too many withdrawal requests.");
  }

  // IDEMPOTÊNCIA: retry com mesmo Idempotency-Key não dispara 2 saques.
  return withIdempotency(
    request,
    "v1.withdrawals.create",
    record.userId,
    () => handleCreateWithdrawal(request, record),
  );
}

async function handleCreateWithdrawal(
  request: Request,
  record: NonNullable<Awaited<ReturnType<typeof authenticate>>["record"]>,
): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body is not valid JSON");
  }
  const parsed = CreateWithdrawalBody.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      422,
      "validation_error",
      "One or more fields are invalid",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;
  const method = data.method as WithdrawalMethod;

  try {
    const { withdrawal } = await requestWithdrawal({
      userId: record.userId,
      amountCents: data.amount_cents,
      method,
      pixKey: data.pix_key ?? undefined,
      pixKeyType: data.pix_key_type ?? undefined,
      walletAddress: data.wallet_address ?? undefined,
    });
    return NextResponse.json(serialize(withdrawal), { status: 201 });
  } catch (e) {
    if (e instanceof WithdrawalError) {
      // Mapeia os códigos de domínio pra HTTP.
      const status =
        e.code === "blocked"
          ? 403
          : e.code === "not_found"
            ? 404
            : e.code === "withdrawal_in_progress"
              ? 409
              : 422;
      return errorResponse(status, e.code, e.message);
    }
    console.error("[v1/withdrawals] unexpected error:", e);
    return errorResponse(500, "internal_error", "Erro ao processar o saque.");
  }
}

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const GET = withApiLog(GET_handler);

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const POST = withApiLog(POST_handler);
