"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";

const FAQS = [
  {
    q: "Como funciona o Trilho Pag?",
    a: "Você cria a conta, cadastra seu produto e recebe um link de checkout pronto. O cliente paga por Pix ou cartão, o Trilho processa a cobrança e o valor entra no seu saldo, já com a taxa descontada.",
  },
  {
    q: "Quanto custa usar?",
    a: "Não há mensalidade nem taxa de setup. Você paga por venda aprovada: 6,99% + R$ 2,00 no Pix e 9,90% + R$ 3,60 no cartão de crédito. Cada saque custa R$ 10,00.",
  },
  {
    q: "Quais formas de pagamento são aceitas?",
    a: "Pix e cartão de crédito, incluindo cobrança recorrente para assinaturas.",
  },
  {
    q: "Quando eu recebo minhas vendas?",
    a: "Vendas no Pix entram liberadas na hora, sem prazo de retenção. Vendas no cartão são liberadas em 30 dias, com uma reserva de 10% mantida por 90 dias para cobrir chargebacks.",
  },
  {
    q: "Como funciona o saque?",
    a: "O saque cai por Pix na sua chave. O valor mínimo é R$ 50,00 e cada saque custa R$ 10,00. O saque automático vem ligado por padrão, então o saldo liberado segue sozinho para sua conta.",
  },
  {
    q: "Tem recorrência e split?",
    a: "Sim. Assinaturas com cobrança semanal, mensal, trimestral ou anual, e split de pagamento por valor fixo ou percentual entre contas Trilho.",
  },
  {
    q: "Consigo integrar ao meu site?",
    a: "Sim. Há uma API REST com chave própria, webhooks assinados em HMAC-SHA256 com reentrega automática, e tracking server-side para Meta, TikTok, Google Ads, GA4 e Kwai. A documentação fica em trilhopag.com/docs.",
  },
  {
    q: "Como funciona o suporte?",
    a: "Pelo painel, depois que sua conta está criada, ou por e-mail em contato@trilhopag.com.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="border-t border-slate-100 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 sm:px-10">
        <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-4xl">
          Perguntas frequentes
        </h2>
        <div className="mt-10 border-t border-slate-100">
          {FAQS.map((f) => (
            <FAQItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-b border-slate-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-6 py-5 text-left"
      >
        <span className="text-[16px] font-medium text-ink sm:text-[17px]">
          {q}
        </span>
        <Plus
          className={`size-4 shrink-0 text-slate-400 transition-transform duration-300 ${
            open ? "rotate-45" : ""
          }`}
        />
      </button>
      {/* Fica sempre montado, abrindo por grid-template-rows 0fr -> 1fr (ver
       *  .tp-collapse no globals.css). Antes era AnimatePresence medindo
       *  altura; o CSS interpola sozinho ate a altura natural do texto, entao
       *  a resposta tambem ja vem no HTML do servidor — o Google le as oito
       *  respostas sem depender de clique nem de JS. */}
      <div id={panelId} className="tp-collapse" data-open={open} aria-hidden={!open}>
        <div>
          <p className="max-w-2xl pb-6 pr-10 text-[15px] leading-relaxed text-slate-500">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}
