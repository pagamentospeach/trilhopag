"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  Sparkles,
  Check,
  Zap,
  CreditCard,
  FileText,
  Barcode,
} from "lucide-react";
import type { ActionResult } from "@/app/dashboard/checkouts/actions";

type Product = { id: string; name: string; slug: string; priceCents?: number };

type CheckoutDefaults = {
  id?: string;
  productId?: string;
  slug?: string;
  active?: boolean;
  paymentMethods?: string[];
  upsellUrl?: string | null;
  backRedirectUrl?: string | null;
  visibleName?: string | null;
  internalName?: string | null;
  template?: string | null;
  priceCentsOverride?: number | null;
  /** Moeda do checkout (BRL/USD/EUR). Default BRL. Modifica o simbolo
   *  e formatacao em TODOS os templates. */
  currency?: string | null;
};

const CURRENCIES: Array<{
  key: string;
  label: string;
  symbol: string;
  flag: string;
}> = [
  // 11/08/2026 (davi): "Tira isso de dol / euro e etc, somente BRL". O
  // seletor saiu da tela; a lista fica com uma entrada so porque o resto do
  // formulario ainda le simbolo e formatacao daqui. Toda adquirente ligada
  // liquida em real — oferecer dolar era prometer algo que a cobranca nao
  // fazia (o PIX sairia em BRL do mesmo jeito, com o preco escrito em $).
  { key: "BRL", label: "Real (R$)", symbol: "R$", flag: "🇧🇷" },
];

/** 7 templates — definem o estilo + as configs disponíveis no builder. */
type Tpl = { key: string; name: string; desc: string; badge?: string };
const TEMPLATES: Tpl[] = [
  {
    key: "auto",
    name: "Automático",
    desc: "PIX direto sem clique. Ideal pra tráfego pago indo direto pro QR Code.",
  },
  {
    key: "extra",
    name: "Padrão Renda Extra",
    desc: "Cards compactos: produto + identificação + pagamento.",
  },
  {
    key: "simple",
    name: "Simples",
    desc: "Minimalista: pedido + dados + PIX. Direto ao ponto.",
  },
  {
    key: "drop",
    name: "Drop",
    desc: "Carrinho + stepper (Identificação → Entrega → Pagamento).",
  },
  {
    key: "fast",
    name: "Fast",
    desc: "Ultra-rápido: produto + nome + email + botão. 1 só tela.",
  },
  {
    key: "gringa",
    name: "Gringa (EN)",
    desc: "Checkout internacional em inglês: Card + Apple Pay + Google Pay (sem PIX). Layout 2 colunas com order summary.",
    badge: "INTL",
  },
  {
    key: "gringa-drop-v1",
    name: "Gringa Drop v1 (EN)",
    desc: "Internacional pra produto físico: Card + Apple Pay + Google Pay + endereço completo + shipping options. Stepper 3 etapas (Contact → Shipping → Payment).",
    badge: "INTL",
  },
];

const METHODS: Array<{
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = [
  { key: "pix", label: "PIX", Icon: Zap, color: "text-cyan-300" },
  { key: "card", label: "Cartão de crédito", Icon: CreditCard, color: "text-blue-300" },
  { key: "boleto", label: "Boleto bancário", Icon: Barcode, color: "text-amber-300" },
  // 11/08/2026 (davi): "applepay e googlepay desativa por enquanto entao".
  // Nenhuma adquirente ligada hoje processa carteira — a Asaas nao expoe API
  // pra elas e a Stripe nao esta em uso. Oferecer na tela um metodo que a
  // cobranca recusa e o padrao que ja custou caro aqui: o cliente escolhia e
  // levava erro no fim do checkout. Voltam quando existir adquirente que faca.
  //
  // As CHAVES continuam validas no resto do sistema: oferta antiga salva com
  // applepay/googlepay nao quebra, so nao da mais pra marcar.
];

export function CheckoutForm({
  defaults,
  products,
  action,
  submitLabel,
}: {
  defaults?: CheckoutDefaults;
  products: Product[];
  action: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Pra criação simples (já com produto fixo), não precisamos do selector
  const isCreatingNew = !defaults?.id;
  const productId = defaults?.productId ?? products[0]?.id ?? "";

  const [internalName, setInternalName] = useState(
    defaults?.internalName ?? "",
  );
  const [visibleName, setVisibleName] = useState(
    defaults?.visibleName ?? products[0]?.name ?? "",
  );
  const [slug, setSlug] = useState(defaults?.slug ?? "");
  const [methods, setMethods] = useState<string[]>(
    defaults?.paymentMethods ?? ["pix"],
  );
  const [upsellUrl, setUpsellUrl] = useState(defaults?.upsellUrl ?? "");
  const [backRedirectUrl, setBackRedirectUrl] = useState(
    defaults?.backRedirectUrl ?? "",
  );
  const [template, setTemplate] = useState(defaults?.template ?? "auto");
  // Sem setter: nao ha mais seletor. Oferta antiga salva em USD/EUR e lida
  // como veio (nao reescrevo dado do seller sem ele pedir), mas oferta nova
  // nasce em BRL e nao ha como mudar.
  const currency = (defaults?.currency || "BRL").toUpperCase();
  const currencyMeta =
    CURRENCIES.find((c) => c.key === currency) ?? CURRENCIES[0];
  // Preco da oferta — substitui o preco base do produto. String pra UX.
  const productBasePriceCents = products[0]?.priceCents ?? 0;
  const initialOfferPrice =
    defaults?.priceCentsOverride && defaults.priceCentsOverride > 0
      ? (defaults.priceCentsOverride / 100).toFixed(2).replace(".", ",")
      : "";
  const [offerPrice, setOfferPrice] = useState(initialOfferPrice);

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.05] p-6 text-center">
        <p className="text-sm text-yellow-200">
          Você precisa criar pelo menos um produto antes de configurar um checkout.
        </p>
        <Link
          href="/dashboard/produtos/novo"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-black hover:bg-cyan-300 transition"
        >
          Criar produto
        </Link>
      </div>
    );
  }

  function toggleMethod(key: string) {
    setMethods((arr) =>
      arr.includes(key) ? arr.filter((m) => m !== key) : [...arr, key],
    );
  }

  function submit() {
    setError(null);
    if (!internalName.trim()) {
      setError("Coloque um nome interno pra essa oferta.");
      return;
    }
    if (methods.length === 0) {
      setError("Selecione pelo menos um método de pagamento.");
      return;
    }
    const fd = new FormData();
    fd.set("productId", productId);
    if (slug.trim()) fd.set("slug", slug.trim());
    fd.set("active", "on");
    fd.set("internalName", internalName.trim());
    fd.set("visibleName", visibleName.trim());
    fd.set("template", template);
    if (methods.includes("pix")) fd.set("method_pix", "on");
    if (methods.includes("card")) fd.set("method_card", "on");
    if (methods.includes("applepay")) fd.set("method_applepay", "on");
    if (methods.includes("googlepay")) fd.set("method_googlepay", "on");
    if (upsellUrl.trim()) fd.set("upsellUrl", upsellUrl.trim());
    if (backRedirectUrl.trim()) fd.set("backRedirectUrl", backRedirectUrl.trim());
    fd.set("currency", currency);

    // Preco da oferta — substitui o preco base do produto SE preenchido.
    const trimmedPrice = offerPrice.trim();
    if (trimmedPrice.length > 0) {
      // Aceita "10,50" ou "10.50" ou "1050"
      const normalized = trimmedPrice.replace(/[^\d,.]/g, "").replace(",", ".");
      const num = Number(normalized);
      if (Number.isFinite(num) && num > 0) {
        // Converte pra cents
        fd.set("priceCentsOverride", String(Math.round(num * 100)));
      }
    }

    startTransition(async () => {
      const r = await action(fd);
      if (!r.ok) {
        setError(r.error || "Erro ao salvar.");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Nome interno */}
      <Field
        label="Nome interno"
        help="Como você vê essa oferta no painel. O cliente não vê."
        value={internalName}
        onChange={setInternalName}
        placeholder="Ex: Black Friday Q4 — fb"
        autoFocus
      />

      {/* Nome visível */}
      <Field
        label="Nome visível (na página do checkout)"
        help="É o título que o cliente vê. Geralmente o nome do produto."
        value={visibleName}
        onChange={setVisibleName}
        placeholder={products[0]?.name ?? "Nome do produto"}
      />

      {/* Slug */}
      <Field
        label="Slug (opcional)"
        help="URL da página: trilhopag.com/c/SLUG. Deixe vazio pra gerarmos."
        value={slug}
        onChange={setSlug}
        placeholder="black-friday-q4"
        mono
      />

      {/* Preço da oferta */}
      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Preço desta oferta
        </label>
        <p className="text-xs text-zinc-500 mb-2">
          O preço é DA OFERTA, não do produto. Diferentes ofertas do mesmo
          produto podem ter preços diferentes (campanha, desconto, etc).
          {productBasePriceCents > 0 && currency === "BRL" && (
            <>
              {" "}
              Preço base do produto:{" "}
              <code className="text-zinc-300">
                R$ {(productBasePriceCents / 100).toFixed(2).replace(".", ",")}
              </code>
              .
            </>
          )}
        </p>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500 font-medium">
            {currencyMeta.symbol}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={offerPrice}
            onChange={(e) => setOfferPrice(e.target.value)}
            placeholder={
              productBasePriceCents > 0 && currency === "BRL"
                ? (productBasePriceCents / 100).toFixed(2).replace(".", ",")
                : currency === "BRL"
                  ? "10,00"
                  : "10.00"
            }
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] pl-12 pr-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/[0.20]"
          />
        </div>
        <p className="text-[10px] text-zinc-500 mt-1">
          {currency === "BRL"
            ? "Deixe vazio pra usar o preço base do produto."
            : "Em moeda estrangeira você deve preencher o preço (não cai pro produto base)."}
        </p>
      </div>

      {/* Métodos de pagamento */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">
          Métodos de pagamento
        </label>
        <p className="text-xs text-zinc-500 mb-3">
          PIX vem ativado por padrão. Ative outros se quiser oferecer.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {METHODS.map((m) => {
            const active = methods.includes(m.key);
            const Icon = m.Icon;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleMethod(m.key)}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition ${
                  active
                    ? "border-cyan-400 bg-cyan-400/[0.08] text-white"
                    : "border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:border-white/[0.16]"
                }`}
              >
                <span
                  className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] ${active ? m.color : "text-zinc-400"}`}
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex-1 font-medium">{m.label}</span>
                {active && (
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-cyan-400 text-black">
                    <Check className="size-2.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Upsell */}
      <Field
        label="Link de Upsell (opcional)"
        help="Pra onde o cliente vai depois de pagar. Cole qualquer URL."
        value={upsellUrl}
        onChange={setUpsellUrl}
        placeholder="https://seudominio.com/oferta-extra"
        type="url"
      />

      {/* Back redirect */}
      <Field
        label="Link de Back Redirect (opcional)"
        help="Quando o cliente clica em 'voltar' no navegador, mandamos pra cá (ex: downsell)."
        value={backRedirectUrl}
        onChange={setBackRedirectUrl}
        placeholder="https://seudominio.com/downsell"
        type="url"
      />

      {/* Template */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">
          Template do checkout
        </label>
        <p className="text-xs text-zinc-500 mb-3">
          Define o estilo visual da página. Você pode mudar depois no Builder.
        </p>
        <div className="space-y-2">
          {TEMPLATES.map((t) => {
            const active = template === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTemplate(t.key)}
                className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                  active
                    ? "border-cyan-400 bg-cyan-400/[0.08]"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]"
                }`}
              >
                <span
                  className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    active
                      ? "border-cyan-400 bg-cyan-400 text-black"
                      : "border-white/[0.12]"
                  }`}
                >
                  {active && <Check className="size-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-sm font-semibold ${
                        active ? "text-cyan-300" : "text-white"
                      }`}
                    >
                      {t.name}
                    </p>
                    {t.badge && (
                      <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-5 py-2 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : isCreatingNew ? (
            <Sparkles className="size-3" />
          ) : null}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  value,
  onChange,
  placeholder,
  type,
  mono,
  autoFocus,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-1">{label}</label>
      {help && <p className="text-[11px] text-zinc-500 mb-2">{help}</p>}
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 ${
          mono ? "font-mono" : ""
        }`}
      />
    </div>
  );
}
