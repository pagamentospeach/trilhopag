"use client";

import { useState } from "react";
import { Bot, Copy, Check, Sparkles } from "lucide-react";

const AI_PROMPT = `Você é um desenvolvedor especialista em integração de gateways de pagamento.

Preciso que você integre o gateway Trilho no meu checkout personalizado.

DOCUMENTAÇÃO DA API:

Base URL: https://trilhopag.com/api/v1

Autenticação: Bearer Token no header (NÃO precisa criar produto nem nada —
só a API key já cria a cobrança):
  Authorization: Bearer tp_live_xxxxx

ENDPOINTS PRINCIPAIS:

1) Criar transação PIX
POST /api/v1/transactions
Headers:
  Content-Type: application/json
  Authorization: Bearer <sua_api_key>
Body (só amount_cents é obrigatório. product_id é opcional pra cobrar, MAS
se o seller usa UTMify ele DEVE mandar um product_id real — senão a venda
cai num produto interno "ghost" que pode ser filtrado/mostrar nome errado
na UTMify. O ID fica em https://trilhopag.com/dashboard/produtos):
{
  "amount_cents": 9990,
  "method": "pix",
  "customer": {
    "name": "Nome Cliente",
    "email": "cliente@email.com",
    "phone": "5511999999999",
    "cpf": "12345678900"
  },
  "external_reference": "pedido_123",
  "split": {
    "recipient": "parceiro@email.com",
    "percent": 30
  },
  "utm": {
    "source": "fb",
    "medium": "video",
    "campaign": "campanha-id",
    "content": "anuncio-id",
    "term": "placement",
    "fbclid": "...",
    "ttclid": "...",
    "gclid": "..."
  }
}
// SPLIT (opcional, p/ revenue-share — ex: bot de Telegram que repassa parte
// pro parceiro/afiliado): divide o LÍQUIDO da venda com OUTRA conta Trilho.
// "recipient" = email ou user id do recebedor. Use "percent" (% do líquido)
// OU "amount_cents" (valor fixo) — nunca os dois. Quando a venda for PAGA, o
// valor do split é creditado automaticamente no saldo do recebedor. Mesmo
// campo funciona em POST /api/v1/subscriptions (split em toda renovação).
Response (gere o QR no front a partir de pix.copy_paste com qualquer lib de QR):
{
  "id": "tx_xxx",
  "object": "transaction",
  "status": "PENDING",
  "method": "PIX",
  "amount_cents": 9990,
  "currency": "BRL",
  "pix": {
    "copy_paste": "00020126...",
    "expires_at": "2026-05-24T..."
  },
  "created_at": "2026-05-24T..."
}

2) Consultar status
GET /api/v1/transactions/{id}
Headers:
  Authorization: Bearer <sua_api_key>
Response: mesmo objeto da criação, com "status" atualizado.

Status possíveis: PENDING, PAID, EXPIRED, REFUNDED, FAILED, CANCELED

3) Consultar saldo
GET /api/v1/balance
Headers:
  Authorization: Bearer <sua_api_key>
Response:
{
  "object": "balance",
  "currency": "BRL",
  "available_cents": 50000,     // SACÁVEL agora
  "pending_pix_cents": 12000,   // pago, ainda em holding
  "pending_card_cents": 0,
  "retained_card_cents": 0,
  "in_withdrawal_cents": 0
}

4) Solicitar saque (PIX ou USDT)
POST /api/v1/withdrawals
Headers:
  Authorization: Bearer <sua_api_key>
  Content-Type: application/json
Body (PIX):
{
  "amount_cents": 5000,          // valor BRUTO (a taxa sai disso). PIX mín R$30
  "method": "pix",
  "pix_key": "voce@email.com",
  "pix_key_type": "email"        // cpf|cnpj|evp|phone|email
}
Response 201:
{ "id": "wd_xxx", "status": "PENDING", "amount_cents": 5000, "fee_cents": 990, "net_cents": 4010, ... }
// SEGURANÇA: o saque NUNCA pode exceder o available_cents (débito atômico no
// banco). Só 1 saque em aberto por vez. Status do saque:
//   GET /api/v1/withdrawals/{id}  →  PENDING|PROCESSING|PAID|FAILED|REJECTED
//   GET /api/v1/withdrawals       →  lista (cursor)

5) Webhook de notificação (recomendado)
Cadastre uma URL em /dashboard/integracoes/webhooks pra receber:
- transaction.created
- transaction.paid
- transaction.refunded
- transaction.chargeback

Payload exemplo (transaction.paid):
{
  "event": "transaction.paid",
  "transaction": { "id": "tx_xxx", "amount_cents": 9990, "paid_at": "...", ... }
}

TAREFA:
1. Crie um checkout no meu site (HTML + JS + backend em [NODE.JS / PYTHON / PHP — me diga qual stack você quer]) que:
   - Pede nome, email, telefone, CPF
   - Chama POST /api/v1/transactions com method "pix" (product_id é opcional; se eu uso UTMify, inclua o product_id real — peço pra você deixar um lugar fácil pra eu colar esse ID)
   - Gera o QR code a partir de pix.copy_paste (use uma lib de QR) e mostra também o código copia-e-cola
   - Faz polling em GET /api/v1/transactions/{id} a cada 3s pra verificar status
   - Quando status = "PAID", redireciona pro /obrigado
2. OBRIGATÓRIO (rastreamento/UTMify): leia os parâmetros da URL da página
   (utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid,
   ttclid, gclid), guarde-os (ex: cookie/localStorage no 1º acesso) e SEMPRE
   envie no campo "utm" do POST /api/v1/transactions. Isso é o que faz a
   UTMify atribuir a venda ao anúncio — sem os UTMs a venda aparece SEM
   origem. (O envio à UTMify em si é automático: o seller só configura o
   token na aba Integrações do Trilho; nós cuidamos do resto.)
3. Em ambiente de produção, cadastre o webhook pra confirmar venda no backend (não confie só no polling do cliente)

API KEY: [COLE SUA API KEY AQUI — copie de https://trilhopag.com/dashboard/api-keys]

Me dê o código completo, comentado em português, pronto pra copiar e colar.`;

export function AiIntegrationPrompt() {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(AI_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <section className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.05] to-cyan-500/[0.03] p-6">
      <div className="flex items-start gap-3">
        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300 shrink-0">
          <Sparkles className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-white">
            Integração via IA (ChatGPT, Claude, Gemini)
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">
            Copie o prompt abaixo e cole numa IA. Substitua{" "}
            <code className="text-violet-300">[COLE SUA API KEY AQUI]</code> pela
            sua chave real. <strong className="text-zinc-300">Não precisa criar
            produto</strong> — só a API key já gera a cobrança PIX. A IA vai gerar
            o código completo pra integrar o Trilho no seu checkout em poucos
            minutos.
          </p>

          <div className="mt-4 relative">
            <pre className="rounded-xl border border-white/[0.08] bg-black/40 p-4 text-[11px] text-zinc-300 font-mono max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {AI_PROMPT}
            </pre>
            <button
              type="button"
              onClick={copy}
              className={`absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                copied
                  ? "bg-cyan-400 text-black"
                  : "bg-violet-500 text-white hover:bg-violet-400"
              }`}
            >
              {copied ? (
                <>
                  <Check className="size-3.5" /> Copiado!
                </>
              ) : (
                <>
                  <Copy className="size-3.5" /> Copiar prompt
                </>
              )}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <a
              href="https://chatgpt.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05]"
            >
              <Bot className="size-3" /> Abrir ChatGPT
            </a>
            <a
              href="https://claude.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05]"
            >
              <Bot className="size-3" /> Abrir Claude
            </a>
            <a
              href="https://gemini.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05]"
            >
              <Bot className="size-3" /> Abrir Gemini
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
