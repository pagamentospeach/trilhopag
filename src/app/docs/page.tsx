import Link from "next/link";
import { Code } from "@/components/docs-code";

export const metadata = {
  title: "API Docs — Trilho",
  description:
    "Documentação completa da API REST do Trilho. Otimizada para integração por IA: payloads, exemplos cURL prontos e descrições exatas.",
};

const BASE = "https://trilhopag.com/api/v1";

/**
 * Documentação OTIMIZADA para LLMs (Claude, GPT, etc).
 *
 * Estratégia: payloads completos, sem ambiguidade, todos os campos
 * explicados em uma linha. Exemplos prontos pra colar. Sem "etc",
 * sem prosa floreada. Cada endpoint é auto-contido.
 *
 * 06/08/2026 (davi): "A documentacao da trilho ta MUITO feia, deixa mais
 * bonitnho". O <article> perdeu a classe `prose-docs` — ela era referenciada
 * aqui mas NUNCA foi definida em CSS nenhum do projeto, não estilizava nada.
 */
export default function DocsPage() {
  return (
    <article className="max-w-4xl space-y-12">
      {/* ============ HERO ============
          A página inteira não tinha <h1>. Abria direto num banner ciano, então
          nem o leitor nem o Google sabiam o que era o documento. */}
      <header className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-400">
          Referência da API
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          API Trilho
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-zinc-400">
          REST sobre HTTPS, JSON em UTF-8. Crie cobranças PIX e cartão, consulte
          saldo, dispare saques e receba webhooks assinados. Cada endpoint aqui
          traz request e response completos, prontos pra colar.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-zinc-300">
            <span className="size-1.5 rounded-full bg-cyan-400" />
            {BASE}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400">
            v1
          </span>
          <a
            href="/api/v1/openapi.json"
            className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-white"
          >
            OpenAPI JSON
          </a>
        </div>
      </header>

      {/* ============ AI HINT BANNER ============ */}
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.03] p-5">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-400">
          Pra agentes de IA
        </p>
        <p className="text-sm leading-relaxed text-zinc-300">
          Esta documentação é otimizada para LLMs. Cada endpoint tem
          request/response COMPLETOS, sem omissões. Use os exemplos cURL
          como ponto de partida para geração de SDK em qualquer linguagem.
          O servidor responde JSON (UTF-8). Não há paginação por offset;
          use <Mono>cursor</Mono> nos endpoints de listagem.
        </p>
      </div>

      {/* ============ QUICK SUMMARY ============ */}
      <Section id="summary" title="Resumo rápido">
        <Table
          rows={[
            ["Base URL", <Mono key="b">{BASE}</Mono>],
            ["Auth", <Mono key="a">Authorization: Bearer tp_live_...</Mono>],
            ["Content-Type", <Mono key="c">application/json</Mono>],
            ["Encoding", "UTF-8"],
            ["Rate limit", "60 req/min por chave (+10/min nos saques)"],
            ["Idempotência", <span key="i">Header <Mono>Idempotency-Key</Mono> em POST /transactions e /withdrawals (TTL 24h)</span>],
            ["Webhook", <span key="w">HMAC-SHA256 <Mono>t=&lt;ts&gt;,v1=&lt;sig&gt;</Mono> nos headers <Mono>Trilho-Signature</Mono> e <Mono>X-Trilho-Signature</Mono></span>],
            ["OpenAPI", <a key="o" href="/api/v1/openapi.json" className="text-cyan-400 hover:text-cyan-300">/api/v1/openapi.json</a>],
          ]}
        />
      </Section>

      {/* ============ AUTH ============ */}
      <Section id="auth" title="Autenticação">
        <p>
          Toda chamada requer uma chave de API no header <Mono>Authorization</Mono>{" "}
          com esquema <Mono>Bearer</Mono>.
        </p>
        <p>
          Gere a chave em{" "}
          <a href="/dashboard/api-keys" className="text-cyan-400 hover:text-cyan-300">
            Dashboard → API Keys
          </a>
          . A chave começa com <Mono>tp_live_</Mono> e aparece UMA VEZ — copie e guarde.
        </p>
        <Code language="bash">{`curl ${BASE}/me \\
  -H "Authorization: Bearer tp_live_seu_token"`}</Code>
        <p className="text-xs text-zinc-400 mt-2">
          Resposta 401 quando o token é inválido. Resposta 429 com header{" "}
          <Mono>Retry-After</Mono> quando excede o rate limit.
        </p>
      </Section>

      {/* ============ ERROS ============ */}
      <Section id="errors" title="Formato de erro">
        <p>
          Erros sempre vêm com este formato. Use o campo{" "}
          <Mono>error.code</Mono> pra branching no código (estável); o{" "}
          <Mono>error.message</Mono> é pra humanos.
        </p>
        <Code language="json">{`{
  "error": {
    "code": "validation_error",
    "message": "One or more fields are invalid",
    "details": { "amount_cents": ["amount_cents min R$5,00 (500 cents)"] }
  }
}`}</Code>
        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Códigos comuns
        </h4>
        <Table
          rows={[
            ["unauthorized", "401 · Token ausente, inválido ou expirado"],
            ["forbidden", "403 · Token válido mas sem permissão pro recurso"],
            ["validation_error", "422 · Campo com formato/valor inválido (veja details)"],
            ["product_not_found", "404 · product_id não pertence à conta"],
            ["product_inactive", "422 · Produto existe mas está desativado"],
            ["rate_limited", "429 · Excedeu 60 req/min (veja header Retry-After)"],
            ["acquirer_error", "502 · O adquirente (Stripe/SafePix/MP) falhou; veja details.attempts"],
            ["internal_error", "500 · Bug servidor; reportar ao suporte"],
          ]}
        />
      </Section>

      {/* ============ CRIAR PAGAMENTO ============ */}
      <Section
        id="create-payment"
        title="POST /transactions — Criar cobrança"
      >
        <p>
          Endpoint principal. Cria uma cobrança (PIX ou cartão) sem precisar
          de produto/checkout pré-cadastrado. A maioria dos casos cabe aqui.
        </p>

        <Callout variant="info">
          <strong>Sem product_id:</strong> tanto PIX quanto cartão funcionam pra
          TODA conta. O servidor cria um <em>ghost product</em> automaticamente
          pra acoplar a tx.
        </Callout>

        <Callout variant="warning">
          <strong>⚠️ OBRIGATÓRIO pra rastreamento (UTMify / Pixel / atribuição):</strong>{" "}
          diferente do checkout hospedado — que captura os UTMs da URL sozinho — na
          API <strong>VOCÊ precisa enviar os UTMs no campo <code>utm</code></strong> de
          cada cobrança. Capture <code>utm_source</code>, <code>utm_medium</code>,{" "}
          <code>utm_campaign</code>, <code>utm_content</code>, <code>utm_term</code>{" "}
          (+ <code>fbclid</code>/<code>ttclid</code>/<code>gclid</code>) da URL da SUA
          página de checkout e repasse no body.{" "}
          <strong>Sem isso a venda aparece na UTMify SEM origem</strong> e não é
          atribuída ao anúncio/campanha — o tracking não funciona. Basta configurar o
          token na aba <em>Integrações</em> + mandar os UTMs aqui; o envio à UTMify
          (waiting_payment + paid) é automático.
        </Callout>

        <Callout variant="warning">
          <strong>🪤 Usa UTMify? Passe um <code>product_id</code> REAL (não dependa do ghost).</strong>{" "}
          Sem <code>product_id</code> a cobrança é acoplada a um produto interno
          (&ldquo;ghost&rdquo;). Isso causa 2 problemas na UTMify: (1) se você ativou{" "}
          <strong>filtro por produto</strong> na config da UTMify, a venda do ghost é{" "}
          <strong>excluída do envio</strong> (não aparece lá); (2) o nome do produto na
          UTMify fica como &ldquo;API Charge&rdquo; em vez do nome real. Então, pra
          UTMify funcionar 100%, <strong>crie um produto e envie o <code>product_id</code></strong>.
          <br />
          <strong>Onde pegar o ID:</strong> em{" "}
          <Link href="/dashboard/produtos" className="text-cyan-300 underline">/dashboard/produtos</Link>{" "}
          cada produto tem um <strong>badge com o ID — clique nele pra copiar</strong>. Ou
          liste via <code>GET /api/v1/products</code> (campo <code>id</code> de cada item).
        </Callout>

        <EndpointRow method="POST" path="/transactions" desc="Cria PIX ou cobrança de cartão. Retorna copy-paste do PIX ou URL hospedada do cartão." />

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Request body (JSON)
        </h4>
        <FieldTable
          fields={[
            ["amount_cents", "integer (req)", "Valor em centavos. Mínimo 500 (R$ 5,00)."],
            ["method", "\"pix\" | \"card\"", "Default \"pix\". Ambos permitidos sem product_id."],
            ["customer.email", "string", "Email do cliente. Default gerado automaticamente."],
            ["customer.name", "string", "Nome do cliente."],
            ["customer.cpf", "string", "CPF/CNPJ (com ou sem máscara)."],
            ["customer.phone", "string", "Telefone (E.164 ou formato BR)."],
            ["product_id", "string ⚠️", "Opcional pra cobrar, mas OBRIGATÓRIO se você usa UTMify (senão a venda do ghost pode ser filtrada e mostra \"API Charge\"). Pegue em /dashboard/produtos (badge clica-copia) ou GET /api/v1/products."],
            ["description", "string", "Texto livre que aparece no extrato/recibo. Max 300 chars."],
            ["external_reference", "string", "Seu ID interno pra correlacionar. Max 120 chars. Volta em todos os webhooks + GET."],
            ["metadata", "object", "Chave→valor livre (ex: {\"attendant_code\":\"A123\"}). Máx 20 chaves. Volta INTACTA nos webhooks e no GET /transactions."],
            ["expires_in", "integer", "Segundos até expirar (PIX). 60-86400. Default 3600."],
            ["split.recipient", "string", "Email OU user id de OUTRA conta Trilho que recebe parte da venda. Pra split/revenue-share (ex: bot de Telegram repassando pro parceiro)."],
            ["split.amount_cents", "integer", "Valor FIXO do split em centavos. Use isto OU split.percent (não os dois)."],
            ["split.percent", "number", "Percentual (0.01–100) sobre o LÍQUIDO da venda (após taxas). Use isto OU split.amount_cents."],
            ["utm.source", "string ⚠️", "OBRIGATÓRIO p/ UTMify/atribuição. Capture da URL da sua página (ex: \"fb\")."],
            ["utm.medium", "string ⚠️", "OBRIGATÓRIO p/ UTMify. Capture da URL (ex: \"video\")."],
            ["utm.campaign", "string ⚠️", "OBRIGATÓRIO p/ UTMify. ID/nome da campanha, da URL."],
            ["utm.content", "string", "Recomendado. ID do criativo/anúncio, da URL."],
            ["utm.term", "string", "Recomendado. Placement/termo, da URL."],
            ["utm.fbclid", "string", "Facebook click ID (da URL). Melhora a atribuição Meta."],
            ["utm.gclid", "string", "Google click ID (da URL)."],
            ["utm.ttclid", "string", "TikTok click ID (da URL)."],
          ]}
        />

        <h4 className="text-sm font-semibold text-white mt-6 mb-2">
          Exemplo cURL — PIX simples
        </h4>
        <Code language="bash">{`curl -X POST ${BASE}/transactions \\
  -H "Authorization: Bearer tp_live_seu_token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount_cents": 1990,
    "method": "pix",
    "product_id": "prd_SEU_ID_AQUI",
    "customer": {
      "email": "joao@example.com",
      "name": "João Silva",
      "cpf": "11144477735"
    },
    "description": "Mensalidade Plano Pro",
    "external_reference": "order_42",
    "utm": {
      "source": "fb",
      "medium": "video",
      "campaign": "camp-black-friday",
      "content": "criativo-A",
      "term": "feed",
      "fbclid": "IwAR123...",
      "ttclid": "",
      "gclid": ""
    }
  }'`}</Code>
        <p className="text-[11px] text-amber-300/80 mt-1">
          ⚠️ <strong>product_id:</strong> troque <code>prd_SEU_ID_AQUI</code> pelo ID
          do seu produto (pegue em <code>/dashboard/produtos</code> — badge clica-copia
          — ou via <code>GET /api/v1/products</code>). Use-o quando usar UTMify.{" "}
          <strong>utm:</strong> pegue os valores dos parâmetros da URL da sua página
          (ex: <code>?utm_source=fb&utm_campaign=...</code>) — sem eles a UTMify não
          atribui a venda.
        </p>

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Resposta sucesso (PIX) · HTTP 200
        </h4>
        <Code language="json">{`{
  "id": "tx_clxabc123",
  "object": "transaction",
  "status": "PENDING",
  "method": "PIX",
  "amount_cents": 1990,
  "fee_cents": 449,
  "net_cents": 1541,
  "currency": "BRL",
  "pix": {
    "copy_paste": "00020126580014BR.GOV.BCB.PIX...",
    "expires_at": "2026-06-01T16:30:00.000Z"
  },
  "split": null,
  "created_at": "2026-06-01T15:30:00.000Z"
}`}</Code>

        <h4 className="text-sm font-semibold text-white mt-6 mb-2">
          Exemplo cURL — PIX com split (revenue share / bot Telegram)
        </h4>
        <Code language="bash">{`curl -X POST ${BASE}/transactions \\
  -H "Authorization: Bearer tp_live_seu_token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount_cents": 5000,
    "method": "pix",
    "customer": { "email": "cliente@example.com" },
    "description": "Acesso VIP",
    "split": {
      "recipient": "parceiro@example.com",
      "percent": 30
    }
  }'`}</Code>
        <p className="text-[11px] text-zinc-400 mt-1">
          Quando esse PIX for <strong>pago</strong>, 30% do líquido cai
          automaticamente no saldo da conta <code>parceiro@example.com</code> e
          o restante no seu. Use <code>amount_cents</code> em vez de{" "}
          <code>percent</code> pra um valor fixo. O recebedor precisa ser uma
          conta Trilho (identifique por email ou user id). Funciona igual em{" "}
          <code>POST /subscriptions</code> (split aplicado em toda renovação).
        </p>

        <h4 className="text-sm font-semibold text-white mt-6 mb-2">
          Exemplo cURL — Cartão
        </h4>
        <Code language="bash">{`curl -X POST ${BASE}/transactions \\
  -H "Authorization: Bearer tp_live_seu_token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount_cents": 9990,
    "method": "card",
    "customer": {
      "email": "maria@example.com",
      "name": "Maria Souza",
      "cpf": "52998224725"
    },
    "description": "Curso Premium"
  }'`}</Code>

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Resposta sucesso (CARD) · HTTP 200
        </h4>
        <Code language="json">{`{
  "id": "tx_clxdef456",
  "object": "transaction",
  "status": "PENDING",
  "method": "CARD",
  "amount_cents": 9990,
  "fee_cents": 1349,
  "net_cents": 8641,
  "currency": "BRL",
  "card": {
    "hosted_url": "https://trilhopag.com/api/v1/transactions/tx_clxdef456/card-redirect",
    "message": "Redirect customer to hosted_url to enter card details (Stripe Elements, PCI-compliant)."
  },
  "created_at": "2026-06-01T15:30:00.000Z"
}`}</Code>
      </Section>

      {/* ============ LISTAR TRANSAÇÕES ============ */}
      <Section id="list-transactions" title="GET /transactions — Listar">
        <EndpointRow method="GET" path="/transactions" desc="Lista transações. Ordenação created_at DESC (desempate por id) — cursor 100% estável." />
        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Query params
        </h4>
        <FieldTable
          fields={[
            ["limit", "integer", "Máx 100. Default 20."],
            ["cursor", "string", "ID da última transação da página anterior (next_cursor)."],
            ["status", "PENDING|PAID|EXPIRED|REFUNDED|CHARGEBACK", "Filtra por status."],
            ["method", "PIX|CARD|APPLE_PAY|GOOGLE_PAY", "Filtra por método."],
            ["external_reference", "string", "Filtra pelo seu external_reference exato."],
            ["created_at_from", "ISO 8601", "Só txs criadas A PARTIR desta data (gte)."],
            ["created_at_to", "ISO 8601", "Só txs criadas ATÉ esta data (lte)."],
          ]}
        />
        <p className="text-[11px] text-zinc-400 mt-1">
          Cada item traz <code>external_reference</code>, <code>metadata</code>,{" "}
          <code>fee_cents</code>, <code>net_cents</code>, <code>status</code> e{" "}
          <code>tracking</code> (UTMs). Reconciliação por janela:{" "}
          <code>?created_at_from=2026-06-01T00:00:00Z&amp;created_at_to=2026-06-02T00:00:00Z</code>.
        </p>
        <Code language="bash">{`curl ${BASE}/transactions?status=PAID&limit=50 \\
  -H "Authorization: Bearer tp_live_seu_token"`}</Code>
        <Code language="json">{`{
  "data": [
    {
      "id": "tx_clxabc123",
      "object": "transaction",
      "product_id": "prd_xxx",
      "checkout_id": "ck_xxx",
      "customer": { "email": "...", "name": "...", "cpf": "...", "phone": "..." },
      "amount_cents": 1990,
      "fee_cents": 449,
      "net_cents": 1541,
      "currency": "BRL",
      "method": "PIX",
      "status": "PAID",
      "provider": "safepix",
      "provider_id": "tx_safepix_xxx",
      "pix": { "qr_code": "...", "copy_paste": "...", "expires_at": "..." },
      "card": null,
      "tracking": { "utm_source": "...", "utm_medium": "...", "fbclid": "..." },
      "split": { "recipient": "parceiro@example.com", "amount_cents": 450 },
      "paid_at": "2026-06-01T15:32:00.000Z",
      "created_at": "2026-06-01T15:30:00.000Z",
      "updated_at": "2026-06-01T15:32:00.000Z"
    }
  ],
  "has_more": true,
  "next_cursor": "tx_clxabc123"
}`}</Code>
      </Section>

      {/* ============ ME ============ */}
      <Section id="me" title="GET /me — Conta atual">
        <EndpointRow method="GET" path="/me" desc="Retorna info da conta dona da API key." />
        <Code language="bash">{`curl ${BASE}/me -H "Authorization: Bearer tp_live_seu_token"`}</Code>
        <Code language="json">{`{
  "id": "usr_xxx",
  "email": "voce@example.com",
  "name": "Você",
  "balance_cents": 12345,
  "api_card_enabled": false
}`}</Code>
      </Section>

      {/* ============ BALANCE ============ */}
      <Section id="balance" title="GET /balance — Saldo">
        <EndpointRow method="GET" path="/balance" desc="Saldo detalhado da conta: disponível (sacável), pendente em holding, retenção de cartão e saques em aberto." />
        <Code language="bash">{`curl ${BASE}/balance -H "Authorization: Bearer tp_live_seu_token"`}</Code>
        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Resposta · HTTP 200
        </h4>
        <Code language="json">{`{
  "object": "balance",
  "currency": "BRL",
  "available_cents": 50000,        // SACÁVEL agora (já liberado)
  "pending_pix_cents": 12000,      // PIX pago, ainda em holding
  "pending_card_cents": 0,         // Cartão pago, ainda em holding (D+X)
  "retained_card_cents": 0,        // Retenção de cartão (libera no fim do período)
  "in_withdrawal_cents": 0,        // Saques abertos já debitados
  "upcoming_releases": [
    { "transaction_id": "tx_xxx", "date": "2026-06-02T10:00:00.000Z", "cents": 12000, "kind": "pix_release", "method": "PIX" }
  ]
}`}</Code>
        <p className="text-[11px] text-zinc-400 mt-1">
          O valor que você pode sacar via API é sempre{" "}
          <code>available_cents</code>. Os demais campos são informativos
          (calendário de liberação).
        </p>
      </Section>

      {/* ============ WITHDRAWALS ============ */}
      <Section id="withdrawals" title="Saques (Withdrawals)">
        <EndpointRow method="POST" path="/withdrawals" desc="Solicita um saque PIX ou USDT. Débito atômico: NUNCA saca mais que o saldo disponível." />
        <EndpointRow method="GET" path="/withdrawals" desc="Lista os saques da conta (cursor)." />
        <EndpointRow method="GET" path="/withdrawals/{id}" desc="Status de um saque específico." />

        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.05] p-3 my-3">
          <p className="text-xs text-amber-200 leading-relaxed">
            <strong>Segurança.</strong> O débito do saldo é feito de forma
            atômica e condicional no banco (<code>WHERE saldo &gt;= valor</code>)
            — é impossível sacar mais do que você tem. Só pode haver{" "}
            <strong>1 saque em aberto</strong> por conta de cada vez, e toda
            solicitação passa por uma auditoria automática antes de ser aceita.
            A taxa de saque sai do valor solicitado (você recebe{" "}
            <code>amount_cents − fee_cents</code>).
          </p>
        </div>

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          POST /withdrawals · body
        </h4>
        <FieldTable
          fields={[
            ["amount_cents", "integer (req)", "Valor BRUTO do saque em centavos. PIX mín R$ 30,00 (3000). USDT mín R$ 2.000,00 (200000)."],
            ["method", "\"pix\" | \"usdt_solana\"", "Default \"pix\"."],
            ["pix_key", "string", "Obrigatório p/ PIX. Sua chave Pix."],
            ["pix_key_type", "cpf|cnpj|evp|phone|email", "Obrigatório p/ PIX. Tipo da chave."],
            ["wallet_address", "string", "Obrigatório p/ USDT. Endereço da carteira Solana."],
          ]}
        />

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Exemplo cURL — saque PIX
        </h4>
        <Code language="bash">{`curl -X POST ${BASE}/withdrawals \\
  -H "Authorization: Bearer tp_live_seu_token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount_cents": 5000,
    "method": "pix",
    "pix_key": "voce@example.com",
    "pix_key_type": "email"
  }'`}</Code>

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Resposta · HTTP 201
        </h4>
        <Code language="json">{`{
  "id": "wd_clxabc123",
  "object": "withdrawal",
  "status": "PENDING",
  "method": "pix",
  "amount_cents": 5000,
  "fee_cents": 990,
  "net_cents": 4010,
  "pix_key": "voce@example.com",
  "pix_key_type": "email",
  "wallet_address": null,
  "fail_reason": null,
  "provider_id": null,
  "paid_at": null,
  "created_at": "2026-06-01T15:30:00.000Z",
  "updated_at": "2026-06-01T15:30:00.000Z"
}`}</Code>

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Erros possíveis
        </h4>
        <FieldTable
          fields={[
            ["insufficient_balance", "422", "Saldo disponível menor que o valor pedido."],
            ["amount_below_minimum", "422", "Abaixo do mínimo (PIX R$ 30 / USDT R$ 2.000)."],
            ["withdrawal_in_progress", "409", "Já existe um saque em aberto. Aguarde finalizar."],
            ["audit_blocked", "422", "Auditoria automática bloqueou (drift de saldo, refund rate, etc)."],
            ["blocked", "403", "Conta bloqueada para saques."],
            ["insufficient_scope", "403", "A API key não tem o escopo \"withdrawals\"."],
          ]}
        />

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          GET /withdrawals — lista
        </h4>
        <Code language="bash">{`curl "${BASE}/withdrawals?status=PAID&limit=50" \\
  -H "Authorization: Bearer tp_live_seu_token"`}</Code>
        <p className="text-[11px] text-zinc-400 mt-1">
          Status possíveis: <code>PENDING</code>, <code>PROCESSING</code>,{" "}
          <code>PAID</code>, <code>FAILED</code>, <code>REJECTED</code>.
        </p>
      </Section>

      {/* ============ PRODUCTS ============ */}
      <Section id="products" title="Produtos">
        <EndpointRow method="GET" path="/products" desc="Lista produtos da conta." />
        <EndpointRow method="POST" path="/products" desc="Cria produto. Preço mínimo R$ 5,00 (500 cents)." />
        <EndpointRow method="GET" path="/products/{id}" desc="Detalha produto por ID." />
        <EndpointRow method="PATCH" path="/products/{id}" desc="Atualiza campos do produto." />
        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          POST /products · body
        </h4>
        <FieldTable
          fields={[
            ["name", "string (req)", "Nome do produto. Max 200."],
            ["price_cents", "integer (req)", "Preço em centavos. Min 500 = R$ 5,00."],
            ["description", "string", "Descrição. Max 2000."],
            ["image", "string (url)", "URL HTTPS de imagem (jpg/png/webp)."],
            ["type", "\"DIGITAL\" | \"PHYSICAL\" | \"SUBSCRIPTION\"", "Default DIGITAL."],
            ["interval_days", "integer", "Só se type=SUBSCRIPTION. Default 30."],
            ["active", "boolean", "Default true."],
          ]}
        />
        <Code language="bash">{`curl -X POST ${BASE}/products \\
  -H "Authorization: Bearer tp_live_seu_token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Plano Pro Mensal",
    "price_cents": 1990,
    "description": "Acesso completo por 30 dias",
    "type": "SUBSCRIPTION",
    "interval_days": 30
  }'`}</Code>
      </Section>

      {/* ============ CHECKOUTS ============ */}
      <Section id="checkouts" title="Checkouts">
        <p>
          Um Checkout é uma página de venda pública hospedada em{" "}
          <Mono>trilhopag.com/c/{`{slug}`}</Mono>. Cada produto pode ter
          vários checkouts (ofertas diferentes).
        </p>
        <EndpointRow method="GET" path="/checkouts" desc="Lista checkouts da conta." />
        <EndpointRow method="POST" path="/checkouts" desc="Cria checkout. Requer product_id existente." />
        <EndpointRow method="GET" path="/checkouts/{id}" desc="Detalha checkout." />
        <EndpointRow method="PATCH" path="/checkouts/{id}" desc="Atualiza checkout." />
        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          POST /checkouts · body
        </h4>
        <FieldTable
          fields={[
            ["product_id", "string (req)", "ID do produto."],
            ["slug", "string", "Slug da URL. Auto-gerado se omitido."],
            ["payment_methods", "array", "[\"pix\", \"card\", \"apple_pay\", \"google_pay\"]"],
            ["price_cents_override", "integer", "Sobrescreve o preço do produto pra esse checkout."],
            ["thank_you_url", "string (url)", "Pra onde redirecionar após pagar."],
            ["back_redirect_url", "string (url)", "Back-redirect quando user sai sem pagar."],
            ["video_url", "string (url)", "VSL no topo do checkout."],
            ["facebook_pixel_id", "string", "Override do pixel global."],
            ["tiktok_pixel_id", "string", "Override do pixel global."],
          ]}
        />
      </Section>

      {/* ============ WEBHOOKS ============ */}
      <Section id="webhooks" title="Webhooks (eventos)">
        <p>
          Eventos são enviados via <Mono>POST</Mono> pra URL configurada em{" "}
          <a href="/dashboard/integracoes" className="text-cyan-400 hover:text-cyan-300">
            Dashboard → Integrações
          </a>
          . Cada webhook tem um <strong>secret próprio</strong> (
          <Mono>whsec_...</Mono>), mostrado quando você cadastra a URL. É com ele
          que você valida a assinatura HMAC.
        </p>

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Eventos disponíveis
        </h4>
        <Table
          rows={[
            ["transaction.created", "Tx criada (PIX gerado ou cartão iniciado)"],
            ["transaction.paid", "Pagamento confirmado"],
            ["transaction.refunded", "Reembolsada"],
            ["transaction.chargeback", "Chargeback (cartão)"],
            ["transaction.expired", "PIX expirou"],
            // 08/08/2026: `transaction.failed` saiu da doc. Estava anunciado
            // publicamente aqui e nenhum `dispatchEvent` o emite — quem
            // integrava escrevia o handler e esperava pra sempre.
            ["transaction.receipt_uploaded", "Lead subiu comprovante"],
            ["withdrawal.paid", "Saque pago"],
            ["withdrawal.failed", "Saque recusado/falhou (saldo estornado)"],
          ]}
        />

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Envelope do evento
        </h4>
        <Code language="json">{`{
  "id": "evt_<deliveryId>",          // ESTÁVEL entre retentativas — dedupe por ele
  "type": "transaction.paid",
  "created": 1730476320,             // unix timestamp (segundos)
  "data": { /* objeto do evento (ver abaixo) */ }
}`}</Code>

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          data — transaction.* (created / paid / refunded / chargeback / expired)
        </h4>
        <Code language="json">{`{
  "id": "tx_clxabc123",
  "product_id": "prd_xxx",
  "checkout_id": null,
  "amount_cents": 1990,
  "fee_cents": 449,
  "net_cents": 1541,
  "currency": "BRL",
  "method": "PIX",
  "status": "PAID",
  "provider": "safepix",
  "provider_id": "...",
  "external_reference": "order_42",
  "metadata": { "attendant_code": "A123" },
  "customer": { "email": "...", "name": "...", "cpf": "...", "phone": "..." },
  "tracking": { "utm_source": "fb", "utm_medium": "video", "utm_campaign": "...",
                "utm_content": "...", "utm_term": "...", "fbclid": "...",
                "ttclid": "...", "gclid": "..." },
  "receipt_url": null,
  "paid_at": "2026-06-01T15:32:00.000Z",
  "created_at": "2026-06-01T15:30:00.000Z"
}`}</Code>
        <p className="text-[11px] text-zinc-400 mt-1">
          <code>external_reference</code>, <code>metadata</code> e{" "}
          <code>tracking</code> (UTMs) voltam em <strong>TODOS</strong> os eventos
          de transação — inclusive <code>refunded</code> e{" "}
          <code>chargeback</code>.
        </p>

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          data — withdrawal.paid / withdrawal.failed
        </h4>
        <Code language="json">{`{
  "id": "wd_xxx",
  "object": "withdrawal",
  "status": "PAID",
  "method": "pix",
  "amount_cents": 5000,
  "fee_cents": 990,
  "net_cents": 4010,
  "pix_key": "voce@example.com",
  "wallet_address": null,
  "fail_reason": null,
  "paid_at": "2026-06-01T16:00:00.000Z"
}`}</Code>

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Assinatura (HMAC-SHA256) — header e formato exato
        </h4>
        <p className="text-sm text-zinc-300">
          A assinatura vem em <strong>dois</strong> headers com o MESMO valor:{" "}
          <Mono>Trilho-Signature</Mono> (canônico) e{" "}
          <Mono>X-Trilho-Signature</Mono> (alias). Formato:
        </p>
        <Code language="text">{`Trilho-Signature: t=1730476320,v1=9f86d081884c7d659...`}</Code>
        <ul className="text-sm text-zinc-300 list-disc pl-5 space-y-1 mt-2">
          <li><Mono>t</Mono> = unix timestamp usado na assinatura.</li>
          <li>
            <Mono>v1</Mono> = HMAC-SHA256 (hex) do payload assinado{" "}
            <Mono>{`\${t}.\${rawBody}`}</Mono> — ou seja, o timestamp + ponto +
            o <strong>corpo CRU</strong> do request (a string JSON exata, não
            re-serializada).
          </li>
          <li>
            Anti-replay: rejeite se <Mono>t</Mono> estiver fora de uma janela
            (ex: ±5 min) do horário atual.
          </li>
          <li>Algoritmo: <Mono>HMAC-SHA256</Mono>. Secret: o <Mono>whsec_</Mono> do webhook.</li>
        </ul>

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Verificação de assinatura (Node.js) — correta
        </h4>
        <Code language="javascript">{`import crypto from "node:crypto";

// rawBody = corpo CRU (string), NÃO o objeto re-serializado.
function verifyWebhook(rawBody, headerValue, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(
    headerValue.split(",").map((kv) => kv.split("="))
  ); // { t, v1 }
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false; // replay
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(parts.v1)
  );
}`}</Code>

        <h4 className="text-sm font-semibold text-white mt-4 mb-2">
          Retentativas (retry)
        </h4>
        <Table
          rows={[
            ["Sucesso", "Qualquer 2xx (usamos res.ok). Responda 200 rápido (<5s)."],
            ["Tentativas", "Até 8 no total."],
            ["Backoff", "30s, 2min, 10min, 30min, 1h, 3h, 6h, 24h"],
            ["evt id", "MESMO id em todas as retentativas (dedupe seguro). Só muda t/assinatura."],
            ["IPs de origem", "Sem IPs fixos (infra serverless). Valide por HMAC, não por IP."],
          ]}
        />

        <Callout variant="warning">
          Responda <strong>200 OK</strong> rápido (&lt;5s) pra não causar retry.
          Processe em fila se a lógica for pesada. Como o <code>evt id</code> é
          estável entre retentativas, use-o pra deduplicar (idempotência no
          recebedor).
        </Callout>
      </Section>

      {/* ============ FEES ============ */}
      <Section id="fees" title="Taxas (referência)">
        <p>
          As taxas variam por conta. Consulte <Mono>GET /me</Mono> pra ver os
          números atuais da sua conta, ou <a href="/dashboard/perfil" className="text-cyan-400 hover:text-cyan-300">Dashboard → Perfil</a>.
        </p>
        <Table
          rows={[
            ["PIX (padrão)", "6,99% + R$ 2,00 (varia por conta — veja GET /me)"],
            ["Cartão (white)", "9,90% + R$ 3,60 · retenção 10% × 90 dias"],
            ["Cartão (black)", "35% + R$ 10,00 · retenção 20% × 90 dias"],
            ["Liberação (hold)", "PIX: imediato · Cartão: D+30 (depois a retenção libera em D+90)"],
            ["Saque PIX", "R$ 9,90 (fixo) · mínimo R$ 30,00"],
            ["Saque USDT/Solana", "1% · mínimo R$ 2.000,00"],
          ]}
        />
      </Section>

      {/* ============ INTEGRAÇÃO EXEMPLO ============ */}
      <Section id="quickstart" title="Quickstart (Node.js)">
        <Code language="javascript">{`// 1. Cria PIX (sem produto, funciona pra qualquer conta)
const res = await fetch("${BASE}/transactions", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.TRILHO_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    amount_cents: 1990,
    method: "pix",
    customer: {
      email: "cliente@example.com",
      name: "Cliente Exemplo",
      cpf: "11144477735",
    },
    description: "Pedido #42",
    external_reference: "order_42",
  }),
});

const tx = await res.json();
if (!res.ok) throw new Error(tx.error.message);

// 2. Mostra QR pro cliente
console.log("Copia-cola PIX:", tx.pix.copy_paste);
console.log("Expira em:", tx.pix.expires_at);

// 3. Espera webhook 'transaction.paid' chegar no seu endpoint
//    OU pollie GET /transactions/{id} periodicamente
//    OU melhor: configure o webhook em Dashboard → Integrações`}</Code>
      </Section>
    </article>
  );
}

/* ============================================================
 * Componentes de apresentação
 * ============================================================ */

/**
 * Cada seção agora abre com um filete separando da anterior e o título ganha
 * um link-âncora (o "#" que aparece no hover) — dá pra copiar o link direto
 * pra um endpoint específico em vez de mandar "procura lá na doc".
 *
 * `scroll-mt-24` (96px) existe por causa do header sticky de 64px: sem isso o
 * título fica escondido atrás dele ao pular por âncora.
 */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/[0.06] pt-10">
      <h2 className="group flex items-center gap-2 text-2xl font-semibold tracking-tight text-white">
        <a href={`#${id}`} className="hover:text-cyan-300">
          {title}
        </a>
        <a
          href={`#${id}`}
          aria-label={`Link para ${title}`}
          className="text-cyan-400/50 opacity-0 transition group-hover:opacity-100 hover:text-cyan-300"
        >
          #
        </a>
      </h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-zinc-300">
        {children}
      </div>
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-white/[0.06] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-cyan-300">
      {children}
    </code>
  );
}

const methodColors: Record<string, string> = {
  GET: "border-blue-400/30 bg-blue-400/10 text-blue-300",
  POST: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  PATCH: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  DELETE: "border-red-400/30 bg-red-400/10 text-red-300",
};

function EndpointRow({
  method,
  path,
  desc,
}: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 transition hover:border-white/[0.14]">
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${methodColors[method]}`}
        >
          {method}
        </span>
        <code className="font-mono text-sm font-medium text-white">{path}</code>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{desc}</p>
    </div>
  );
}

function Table({
  rows,
}: {
  rows: (string | React.ReactNode)[][];
}) {
  return (
    // overflow-x-auto: as tabelas têm células com URL/assinatura HMAC que não
    // quebram. Sem isso elas empurravam a página inteira no celular.
    <div className="overflow-hidden rounded-xl border border-white/[0.08]">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-white/[0.05] last:border-b-0"
              >
                <td className="w-[38%] whitespace-nowrap bg-white/[0.02] px-3.5 py-2.5 align-top font-medium text-zinc-400">
                  {row[0]}
                </td>
                <td className="px-3.5 py-2.5 leading-relaxed text-zinc-200">
                  {row[1]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FieldTable({
  fields,
}: {
  fields: [string, string, string][];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08]">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-white/[0.08] bg-white/[0.03]">
            <tr className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              <th className="px-3.5 py-2.5 text-left font-semibold">Campo</th>
              <th className="px-3.5 py-2.5 text-left font-semibold">Tipo</th>
              <th className="px-3.5 py-2.5 text-left font-semibold">
                Descrição
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map(([name, type, desc], i) => (
              <tr
                key={i}
                className="border-b border-white/[0.05] transition last:border-b-0 hover:bg-white/[0.02]"
              >
                <td className="whitespace-nowrap px-3.5 py-2.5 align-top">
                  <code className="font-mono text-xs text-cyan-300">
                    {name}
                  </code>
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 align-top font-mono text-[11px] text-zinc-500">
                  {type}
                </td>
                <td className="px-3.5 py-2.5 leading-relaxed text-zinc-300">
                  {desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Callout com barra lateral colorida em vez de borda inteira + fundo lavado.
 * Aqui a cor FICA de propósito (diferente do que fizemos na aba Taxas): num
 * doc de API ela é semântica — separa "informação" de "cuidado, isso quebra
 * seu tracking", e os avisos de UTM/UTMify são justamente o que o seller mais
 * ignora e depois abre chamado.
 */
function Callout({
  variant,
  children,
}: {
  variant: "info" | "warning";
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-blue-400/25 bg-blue-400/[0.04] before:bg-blue-400/60",
    warning: "border-amber-400/25 bg-amber-400/[0.04] before:bg-amber-400/60",
  };
  return (
    <div
      className={`relative overflow-hidden rounded-xl border py-3 pl-4 pr-3.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] ${styles[variant]}`}
    >
      <div className="text-xs leading-relaxed text-zinc-200">{children}</div>
    </div>
  );
}
