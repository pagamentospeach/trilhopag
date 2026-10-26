import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* ============================================================
 * GET /api/v1/openapi.json — especificação OpenAPI 3.1 da API pública.
 *
 * Machine-readable: importe no Postman/Insomnia/Swagger UI ou gere um SDK
 * (openapi-generator). Público (sem auth) — só descreve o contrato.
 * ============================================================ */
const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Trilho API",
    version: "1.0.0",
    description:
      "API pública do Trilho. Cobranças PIX/cartão, assinaturas recorrentes, saldo, saques, split e webhooks. Todos os valores em centavos (BRL).",
    contact: { name: "Trilho", url: "https://trilhopag.com/docs" },
  },
  servers: [{ url: "https://trilhopag.com/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Chave de API no header Authorization: Bearer tp_live_<sua-chave>. Gere em /dashboard/api-keys.",
      },
    },
    parameters: {
      Limit: {
        name: "limit",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      Cursor: {
        name: "cursor",
        in: "query",
        schema: { type: "string" },
        description: "ID do último item da página anterior (paginação estável).",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {},
            },
          },
        },
      },
      Customer: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          name: { type: "string" },
          cpf: { type: "string" },
          phone: { type: "string" },
        },
      },
      Split: {
        type: "object",
        description:
          "Revenue-share: divide o líquido com outra conta Trilho. Use amount_cents OU percent.",
        properties: {
          recipient: {
            type: "string",
            description: "Email ou user id da conta recebedora.",
          },
          amount_cents: { type: "integer" },
          percent: { type: "number" },
        },
        required: ["recipient"],
      },
      CreateTransaction: {
        type: "object",
        required: ["amount_cents"],
        properties: {
          amount_cents: { type: "integer", minimum: 500, maximum: 50000000 },
          method: { type: "string", enum: ["pix", "card"], default: "pix" },
          customer: { $ref: "#/components/schemas/Customer" },
          product_id: { type: "string" },
          description: { type: "string", maxLength: 300 },
          external_reference: { type: "string", maxLength: 120 },
          metadata: {
            type: "object",
            additionalProperties: true,
            description:
              "Chave→valor livre (máx 20). Volta em todos os webhooks e no GET /transactions.",
          },
          expires_in: { type: "integer", minimum: 60, maximum: 86400 },
          utm: { type: "object", additionalProperties: { type: "string" } },
          split: { $ref: "#/components/schemas/Split" },
          subscription: {
            type: "object",
            properties: {
              interval: {
                type: "string",
                enum: ["weekly", "monthly", "quarterly", "yearly"],
              },
              trial_days: { type: "integer" },
              max_billings: { type: "integer" },
            },
          },
        },
      },
      Transaction: {
        type: "object",
        properties: {
          id: { type: "string" },
          object: { type: "string", example: "transaction" },
          status: {
            type: "string",
            enum: ["PENDING", "PAID", "EXPIRED", "REFUNDED", "CHARGEBACK"],
          },
          method: { type: "string" },
          amount_cents: { type: "integer" },
          fee_cents: { type: "integer" },
          net_cents: { type: "integer" },
          currency: { type: "string", example: "BRL" },
          external_reference: { type: "string", nullable: true },
          metadata: { type: "object", nullable: true, additionalProperties: true },
          pix: {
            type: "object",
            nullable: true,
            properties: {
              copy_paste: { type: "string" },
              qr_code: { type: "string" },
              expires_at: { type: "string", format: "date-time" },
            },
          },
          paid_at: { type: "string", format: "date-time", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Balance: {
        type: "object",
        properties: {
          object: { type: "string", example: "balance" },
          currency: { type: "string", example: "BRL" },
          available_cents: { type: "integer" },
          pending_pix_cents: { type: "integer" },
          pending_card_cents: { type: "integer" },
          retained_card_cents: { type: "integer" },
          in_withdrawal_cents: { type: "integer" },
        },
      },
      CreateWithdrawal: {
        type: "object",
        required: ["amount_cents"],
        properties: {
          amount_cents: { type: "integer", description: "Valor BRUTO. PIX mín 3000, USDT mín 200000." },
          method: { type: "string", enum: ["pix", "usdt_solana"], default: "pix" },
          pix_key: { type: "string" },
          pix_key_type: {
            type: "string",
            enum: ["cpf", "cnpj", "evp", "phone", "email"],
          },
          wallet_address: { type: "string" },
        },
      },
      Withdrawal: {
        type: "object",
        properties: {
          id: { type: "string" },
          object: { type: "string", example: "withdrawal" },
          status: {
            type: "string",
            enum: ["PENDING", "PROCESSING", "PAID", "FAILED", "REJECTED"],
          },
          method: { type: "string" },
          amount_cents: { type: "integer" },
          fee_cents: { type: "integer" },
          net_cents: { type: "integer" },
          created_at: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/transactions": {
      post: {
        summary: "Cria uma cobrança (PIX ou cartão)",
        description:
          "Suporta header Idempotency-Key (retry seguro, TTL 24h).",
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateTransaction" },
            },
          },
        },
        responses: {
          "200": {
            description: "Cobrança criada",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Transaction" },
              },
            },
          },
          "422": {
            description: "Erro de validação",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
      get: {
        summary: "Lista transações",
        description:
          "Ordenação created_at DESC (desempate por id). Cursor estável.",
        parameters: [
          { $ref: "#/components/parameters/Limit" },
          { $ref: "#/components/parameters/Cursor" },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "method", in: "query", schema: { type: "string" } },
          {
            name: "external_reference",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "created_at_from",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "created_at_to",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
        ],
        responses: { "200": { description: "Lista paginada" } },
      },
    },
    "/transactions/{id}": {
      get: {
        summary: "Consulta uma transação",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Transação",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Transaction" },
              },
            },
          },
          "404": { description: "Não encontrada" },
        },
      },
    },
    "/balance": {
      get: {
        summary: "Saldo da conta",
        responses: {
          "200": {
            description: "Saldo",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Balance" },
              },
            },
          },
        },
      },
    },
    "/withdrawals": {
      post: {
        summary: "Solicita um saque",
        description:
          "Débito atômico: nunca saca mais que available_cents. 1 saque aberto por vez. Suporta Idempotency-Key.",
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWithdrawal" },
            },
          },
        },
        responses: {
          "201": {
            description: "Saque solicitado",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Withdrawal" },
              },
            },
          },
          "409": { description: "Já existe um saque em aberto" },
          "422": { description: "Saldo insuficiente / validação" },
        },
      },
      get: {
        summary: "Lista saques",
        parameters: [
          { $ref: "#/components/parameters/Limit" },
          { $ref: "#/components/parameters/Cursor" },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Lista paginada" } },
      },
    },
    "/withdrawals/{id}": {
      get: {
        summary: "Status de um saque",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Saque",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Withdrawal" },
              },
            },
          },
        },
      },
    },
    "/subscriptions": {
      post: { summary: "Cria um PIX recorrente (assinatura)" },
      get: { summary: "Lista assinaturas" },
    },
    "/subscriptions/{id}": {
      get: { summary: "Consulta uma assinatura" },
    },
    "/subscriptions/{id}/cancel": {
      post: { summary: "Cancela uma assinatura" },
    },
    "/products": {
      get: { summary: "Lista produtos" },
      post: { summary: "Cria produto" },
    },
    "/checkouts": {
      get: { summary: "Lista checkouts" },
      post: { summary: "Cria checkout" },
    },
    "/me": {
      get: { summary: "Conta dona da API key" },
    },
  },
} as const;

export async function GET() {
  return NextResponse.json(SPEC, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
