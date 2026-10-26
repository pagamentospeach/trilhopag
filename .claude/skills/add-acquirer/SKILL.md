---
name: add-acquirer
description: Integra um novo adquirente/provedor de pagamento ao Trilho a partir da documentação (link, PDF ou cole do texto) + chaves de API. Cria adapter, registra no `src/lib/acquirers/`, webhook handler, validação de assinatura, testes básicos e UI de configuração. Use sempre que o utilizador pedir "adicionar adquirente X", "integrar Y", "ligar processador Z". O utilizador deve fornecer: nome do provedor, link/conteúdo da doc, e as credenciais (client_id, secret, ou api_key).
---

# Adicionar Novo Adquirente / Provedor de Pagamento

## Inputs esperados do utilizador
1. **Nome do provedor** (ex: "Pagar.me", "Asaas", "MercadoPago", "Pix Genesis")
2. **Documentação** — link, PDF ou texto colado. Mínimo: endpoint de criar cobrança PIX, endpoint de criar pagamento cartão, formato do webhook
3. **Credenciais** — chave de API, client_id+secret, ou bearer token
4. **Ambiente** — sandbox e/ou produção (URL base difere)

Se faltar algo, peça antes de começar.

## Estrutura do Trilho

```
src/lib/acquirers/
├── types.ts             # Interface Acquirer (todos implementam)
├── registry.ts          # Mapeia nome → adapter
├── pagarme.ts           # Exemplo existente
├── asaas.ts
└── <nome-novo>.ts       # Você criará aqui

src/app/api/webhooks/<provider>/route.ts   # Webhook
prisma/schema.prisma                        # UserAcquirer.config (Json)
```

## Passos OBRIGATÓRIOS

### 1. Ler a doc
- Pegar endpoints: criar PIX, criar cartão, criar boleto (se suportar), buscar status
- Pegar formato do webhook + como validar assinatura (HMAC-SHA256 com header X-Signature na maioria dos casos)
- Pegar URL base sandbox vs produção
- Pegar formato de erros (códigos, mensagens)

### 2. Criar `src/lib/acquirers/<nome>.ts`

Template:
```ts
import { Acquirer, AcquirerConfig, CreatePixInput, CreatePixResult } from "./types";
import { z } from "zod";

const ConfigSchema = z.object({
  apiKey: z.string().min(8),
  webhookSecret: z.string().min(8).optional(),
  environment: z.enum(["sandbox", "production"]),
});

export class <Nome>Acquirer implements Acquirer {
  readonly key = "<nome-minusculo>";
  readonly label = "<Nome Display>";
  readonly supports = ["pix", "card", "boleto"] as const;

  private baseUrl: string;
  private headers: HeadersInit;

  constructor(config: AcquirerConfig) {
    const parsed = ConfigSchema.parse(config);
    this.baseUrl = parsed.environment === "production"
      ? "https://api.<provider>.com/v1"
      : "https://sandbox.<provider>.com/v1";
    this.headers = {
      "Authorization": `Bearer ${parsed.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async createPix(input: CreatePixInput): Promise<CreatePixResult> {
    const res = await fetch(`${this.baseUrl}/payments`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        amount: input.amountCents,
        // ... mapear pro formato do provider
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`<Nome> createPix failed: ${res.status} ${err}`);
    }
    const data = await res.json();
    return {
      externalId: data.id,
      qrCode: data.qrCode,
      qrCodeImage: data.qrCodeBase64,
      copyPaste: data.brCode,
      expiresAt: new Date(data.expiresAt),
    };
  }

  // ... createCard, createBoleto, getStatus
}
```

### 3. Webhook handler

`src/app/api/webhooks/<nome>/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { markTransactionPaid, markTransactionFailed } from "@/lib/transactions";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-<provider>-signature") ?? "";
  const secret = process.env.<NOME>_WEBHOOK_SECRET ?? "";

  // 1. Validar assinatura
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // 2. Idempotência
  const event = JSON.parse(body);
  const externalId = event.payment_id;
  const txn = await prisma.transaction.findFirst({
    where: { externalId, provider: "<nome>" },
  });
  if (!txn) return NextResponse.json({ ok: true }); // ignore unknown

  // 3. Atualizar estado
  if (event.status === "paid") {
    await markTransactionPaid(txn.id);
  } else if (event.status === "failed" || event.status === "expired") {
    await markTransactionFailed(txn.id, event.reason);
  }

  return NextResponse.json({ ok: true });
}
```

### 4. Registry

`src/lib/acquirers/registry.ts`:
```ts
import { <Nome>Acquirer } from "./<nome>";
// ...

export const ACQUIRERS = {
  // ... outros
  "<nome>": (config: AcquirerConfig) => new <Nome>Acquirer(config),
};
```

### 5. UI de configuração

Em `src/app/dashboard/adquirentes/<nome>/page.tsx`:
- Form com campos da doc: API key, webhook secret, environment
- Botão "Salvar e testar conexão" (chama um endpoint que faz um GET trivial)
- Indicador de status (verde/vermelho/cinza)
- Link pra doc oficial do provider

### 6. Variáveis de ambiente

Adicionar em `.env.example`:
```
<NOME>_API_KEY=
<NOME>_WEBHOOK_SECRET=
<NOME>_ENVIRONMENT=sandbox
```

E pedir pro utilizador rodar `vercel env add` pra cada uma.

### 7. Testes (opcional mas recomendado)

`src/lib/acquirers/<nome>.test.ts`:
- mockar fetch
- testar createPix com input válido → mapeamento correto
- testar webhook validation com signature inválida → 401
- testar idempotência (mesma transaction não vira `paid` 2x)

## Output ao utilizador

```
✓ Adquirente <Nome> integrado.

ARQUIVOS:
- src/lib/acquirers/<nome>.ts
- src/app/api/webhooks/<nome>/route.ts
- src/app/dashboard/adquirentes/<nome>/page.tsx
- prisma/schema.prisma (model UserAcquirer já comporta — só adicionei <nome> no enum/dropdown)

CONFIGURAR ANTES DE USAR:
- vercel env add <NOME>_API_KEY production
- vercel env add <NOME>_WEBHOOK_SECRET production
- registrar URL do webhook no painel do <Nome>: https://trilhopag.com/api/webhooks/<nome>

CHECKLIST:
- [x] Validação HMAC do webhook
- [x] Timeout de 15s nas chamadas
- [x] Idempotência via externalId
- [x] Mapeamento de status (paid/failed/expired)
- [ ] Testar criação de PIX em sandbox (você precisa fazer)
- [ ] Configurar webhook URL no painel
```

## Safety
- **NUNCA** comitar chaves de API
- **NUNCA** logar `apiKey`, `webhookSecret` (use logs com mask)
- Validar TODOS os inputs com Zod
- Webhook DEVE validar assinatura ANTES de processar
- Timeout em todas as chamadas externas
- Errors devem ter mensagens user-friendly (não dump de stack)
