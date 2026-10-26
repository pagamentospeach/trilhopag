"use client";

import { useRef, useState } from "react";
import { Loader2, Lock, Truck, ShieldCheck, MapPin, CreditCard } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { PixResultDisplay } from "./pix-result-modal";
import { usePixFlow } from "./use-pix-flow";
import type { TemplateProps } from "./types";
import { themeColors } from "./theme-utils";
import { PixIcon } from "./pix-icon";
import { BumpSlot } from "./bump-slot";
import { ShippingList, useBumpsShippingState } from "./bumps-list";
import {
  PaymentMethodTabs,
  MethodPaymentPanel,
  usePaymentMethodSelection,
  type StripeCardFormHandle,
} from "./payment-method-tabs";
import { EmailInput, PhoneInput, maskCpf, maskCep, useCepLookup } from "./smart-inputs";
import { mergeAmazon } from "./configs";

/**
 * AMAZON CHECKOUT — réplica do visual do checkout da Amazon (sem logo/marca),
 * 100% customizável. Layout 2 colunas no desktop (passos à esquerda, resumo do
 * pedido sticky à direita) e 1 coluna no mobile. Paleta clássica: amarelo no
 * CTA, preço em vermelho, links/azul-petróleo, cinza claro de fundo.
 *
 * Textos editáveis via amazonConfig. Cores via theme (bg/card/text/primary).
 */

// Paleta-assinatura Amazon (fallbacks).
const AMZ_PRICE = "#B12704";
const AMZ_LINK = "#007185";
const AMZ_CTA = "#FFD814";
const AMZ_CTA_BORDER = "#FCD200";

export function AmazonTemplate(p: TemplateProps) {
  const cfg = mergeAmazon(p.amazonConfig);
  const { pix, loading, error, submit, reset } = usePixFlow(
    p.slug,
    p.utm,
    p.variantId,
    p.isPreview,
  );
  const formatBRL = (cents: number) => formatMoney(cents, p.currency || "BRL");
  const c = themeColors(p);
  const showName = p.fields?.name ?? true;
  const showEmail = p.fields?.email ?? true;
  const showPhone = p.fields?.phone ?? false;
  const showCpf = p.fields?.cpf ?? false;
  const isPhysical = p.isPhysical === true;

  const bumpsV2 = p.orderBumps ?? [];
  const shippingV2 = p.shippingOptions ?? [];
  const extrasState = useBumpsShippingState({ bumps: bumpsV2, shipping: shippingV2 });
  const enabledMethods = p.paymentMethods ?? ["pix"];
  const methodSel = usePaymentMethodSelection(enabledMethods);
  const stripeRef = useRef<StripeCardFormHandle>(null);
  const [methodError, setMethodError] = useState<string | null>(null);
  const [methodLoading, setMethodLoading] = useState(false);
  const [walletState, setWalletState] = useState<"loading" | "available" | "unavailable">("loading");
  const [cardComplete, setCardComplete] = useState(false);
  const isCardMethod =
    methodSel.selected === "card" ||
    // 11/08/2026: boleto usa o MESMO caminho do cartao hospedado (a
    // adquirente devolve uma URL e o cliente termina fora do nosso dominio),
    // entao entra em todo lugar onde "nao e pix" ja valia.
    methodSel.selected === "boleto" ||
    methodSel.selected === "apple_pay" ||
    methodSel.selected === "google_pay";

  const [form, setForm] = useState({
    email: p.prefillEmail ?? "",
    name: p.prefillName ?? "",
    phone: p.prefillPhone ?? "",
    cpf: p.prefillCpf ?? "",
    cep: "",
    address: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
  });

  const { lookingUp: cepLookingUp, error: cepError } = useCepLookup(
    form.cep,
    (addr) =>
      setForm((f) => ({
        ...f,
        address: f.address || addr.logradouro,
        neighborhood: f.neighborhood || addr.bairro,
        city: f.city || addr.localidade,
        state: f.state || addr.uf,
        complement: f.complement || addr.complemento,
      })),
    isPhysical,
  );

  const itemsCount = 1;
  const total = p.priceCents + extrasState.extrasTotal;
  const accent = c.primary || AMZ_LINK;

  if (pix) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EAEDED] p-4">
        <PixResultDisplay
          pix={pix}
          priceCents={total}
          productName={p.product.name}
          productImage={p.product.image}
          productDescription={p.product.description}
          primaryColor={accent}
          pixResultConfig={p.pixResultConfig}
          receiptUpload={p.receiptUpload}
          onBack={reset}
        />
      </div>
    );
  }

  const inputCls =
    "w-full rounded border border-zinc-400 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-inner focus:border-[#e77600] focus:outline-none focus:ring-2 focus:ring-[#e77600]/30";

  const SummaryBox = (
    <div className="rounded-lg border border-zinc-300 bg-white p-4">
      <h2 className="text-[17px] font-bold text-zinc-900">{cfg.summaryTitle}</h2>
      <div className="mt-3 space-y-1.5 text-[13px] text-zinc-700">
        <div className="flex justify-between">
          <span>Itens ({itemsCount}):</span>
          <span>{formatBRL(p.priceCents)}</span>
        </div>
        {extrasState.extrasTotal > 0 && (
          <div className="flex justify-between">
            <span>Adicionais:</span>
            <span>{formatBRL(extrasState.extrasTotal)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Frete:</span>
          <span className="font-semibold text-[#007600]">GRÁTIS</span>
        </div>
      </div>
      <div className="my-3 border-t border-zinc-200" />
      <div className="flex items-end justify-between">
        <span className="text-[18px] font-bold text-[#B12704]">Total</span>
        <span className="text-[20px] font-bold text-[#B12704]">{formatBRL(total)}</span>
      </div>

      {!((methodSel.selected === "apple_pay" || methodSel.selected === "google_pay") && walletState === "available") && (
        <button
          type="submit"
          form="amazon-form"
          disabled={loading || methodLoading || (isCardMethod && !cardComplete)}
          className="mt-4 w-full rounded-full py-2.5 text-[14px] font-medium text-[#0F1111] shadow-sm transition hover:brightness-95 disabled:opacity-50 min-h-[44px]"
          style={{ background: AMZ_CTA, border: `1px solid ${AMZ_CTA_BORDER}` }}
        >
          {loading || methodLoading ? (
            <Loader2 className="mx-auto size-5 animate-spin" />
          ) : isCardMethod && !cardComplete ? (
            "Preencha os dados do cartão"
          ) : (
            cfg.ctaText || p.ctaLabel || "Fechar pedido"
          )}
        </button>
      )}
      <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-zinc-500">
        <Lock className="size-3" /> {cfg.securityText}
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#EAEDED] pb-[max(24px,env(safe-area-inset-bottom))]" style={{ background: c.bg || "#EAEDED" }}>
      {/* Header */}
      <div className="border-b border-zinc-300 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-[19px] font-bold text-zinc-900">{cfg.headerTitle}</h1>
          <span className="inline-flex items-center gap-1 text-[12px] text-zinc-500">
            <Lock className="size-3.5" /> Seguro
          </span>
        </div>
      </div>

      <form
        id="amazon-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setMethodError(null);
          if (methodSel.selected === "pix") {
            submit(form, extrasState.selectedBumpIds, extrasState.selectedShippingId);
          } else {
            setMethodLoading(true);
            const res = await stripeRef.current?.confirm();
            setMethodLoading(false);
            if (!res?.ok) setMethodError(res?.error ?? "Erro ao confirmar pagamento");
          }
        }}
        className="mx-auto max-w-5xl px-4 py-5"
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
          {/* COLUNA PRINCIPAL — passos */}
          <div className="space-y-4">
            <BumpSlot slot="top" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#0F1111" subtleColor="#565959" borderColor="#D5D9D9" cardColor="#ffffff" accentColor={accent} />

            {/* 1 — Endereço / contato */}
            <section className="rounded-lg border border-zinc-300 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: accent }}>1</span>
                <h2 className="text-[16px] font-bold text-zinc-900">{cfg.addressTitle}</h2>
                <MapPin className="ml-auto size-4 text-zinc-400" />
              </div>
              <div className="space-y-3">
                {showName && (
                  <div>
                    <label className="mb-1 block text-[13px] font-bold text-zinc-700">Nome completo</label>
                    <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome e sobrenome" className={inputCls} />
                  </div>
                )}
                {showEmail && (
                  <div>
                    <label className="mb-1 block text-[13px] font-bold text-zinc-700">E-mail</label>
                    <EmailInput value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="seu@email.com" inputClassName={inputCls} />
                  </div>
                )}
                {showPhone && (
                  <div>
                    <label className="mb-1 block text-[13px] font-bold text-zinc-700">Telefone</label>
                    <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} inputClassName={`flex-1 rounded-r border border-zinc-400 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none`} borderColor="#a1a1aa" />
                  </div>
                )}
                {showCpf && (
                  <div>
                    <label className="mb-1 block text-[13px] font-bold text-zinc-700">CPF</label>
                    <input type="text" inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" maxLength={14} className={inputCls} />
                  </div>
                )}
                {isPhysical && (
                  <div className="space-y-3 border-t border-zinc-200 pt-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="relative col-span-1">
                        <input type="text" inputMode="numeric" value={form.cep} onChange={(e) => setForm({ ...form, cep: maskCep(e.target.value) })} placeholder="CEP" maxLength={9} required className={inputCls} />
                        {cepLookingUp && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-zinc-400" />}
                      </div>
                      <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Endereço" required className={`col-span-2 ${inputCls}`} />
                    </div>
                    {cepError && <p className="text-[10px] text-zinc-500">{cepError}</p>}
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="Número" required className={`col-span-1 ${inputCls}`} />
                      <input type="text" value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} placeholder="Complemento (opcional)" className={`col-span-2 ${inputCls}`} />
                    </div>
                    <input type="text" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} placeholder="Bairro" required className={inputCls} />
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Cidade" required className={`col-span-2 ${inputCls}`} />
                      <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="UF" required maxLength={2} className={`col-span-1 uppercase ${inputCls}`} />
                    </div>
                  </div>
                )}
              </div>
            </section>

            <BumpSlot slot="above_payment" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#0F1111" subtleColor="#565959" borderColor="#D5D9D9" cardColor="#ffffff" accentColor={accent} />

            {/* 2 — Pagamento */}
            <section className="rounded-lg border border-zinc-300 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: accent }}>2</span>
                <h2 className="text-[16px] font-bold text-zinc-900">{cfg.paymentTitle}</h2>
                <CreditCard className="ml-auto size-4 text-zinc-400" />
              </div>
              <PaymentMethodTabs paymentMethods={enabledMethods} selected={methodSel.selected} onSelect={methodSel.setSelected} textColor="#0F1111" subtleColor="#565959" borderColor="#D5D9D9" cardColor="#ffffff" accentColor={accent} />
              <div className="mt-3">
                {methodSel.selected === "pix" ? (
                  <div className="flex items-center gap-2 rounded border-2 p-3" style={{ borderColor: accent }}>
                    <PixIcon color={accent} size={18} />
                    <span className="text-sm font-semibold text-zinc-800">Pague com PIX e aprove na hora</span>
                  </div>
                ) : (
                  <MethodPaymentPanel ref={stripeRef} method={methodSel.selected} isPreview={p.isPreview === true} slug={p.slug} amountCents={total} currency="BRL" customer={{ name: form.name, email: form.email, phone: form.phone, cpf: form.cpf, cep: form.cep, address: form.address, number: form.number, complement: form.complement, neighborhood: form.neighborhood, city: form.city, state: form.state }} variantId={p.variantId}
                bumpIds={extrasState.selectedBumpIds}
                shippingId={extrasState.selectedShippingId} utm={p.utm} textColor="#0F1111" subtleColor="#565959" borderColor="#D5D9D9" cardColor="#ffffff" accentColor={accent} onWalletStateChange={setWalletState} onCardCompleteChange={setCardComplete} />
                )}
              </div>
            </section>

            <BumpSlot slot="below_payment" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#0F1111" subtleColor="#565959" borderColor="#D5D9D9" cardColor="#ffffff" accentColor={accent} />

            {/* 3 — Revisão dos itens */}
            <section className="rounded-lg border border-zinc-300 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: accent }}>3</span>
                <h2 className="text-[16px] font-bold text-zinc-900">{cfg.reviewTitle}</h2>
              </div>
              <div className="flex gap-3">
                <div className="size-20 shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-50">
                  {p.product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.product.image} alt={p.product.name} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-zinc-300 text-lg font-bold">{p.product.name.slice(0, 2).toUpperCase()}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium leading-snug text-zinc-900">{p.product.name}</p>
                  <p className="mt-0.5 text-[15px] font-bold" style={{ color: AMZ_PRICE }}>{formatBRL(p.priceCents)}</p>
                  <p className="mt-1 inline-flex items-center gap-1 rounded bg-[#F0FAF0] px-1.5 py-0.5 text-[12px] font-semibold text-[#007600]">
                    <Truck className="size-3.5" /> {cfg.deliveryBadge}
                  </p>
                  <p className="mt-1 text-[12px] text-zinc-500">{cfg.deliveryNote}</p>
                </div>
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 text-[12px]" style={{ color: AMZ_LINK }}>
                <ShieldCheck className="size-3.5" /> {cfg.freeShippingText}
              </p>
            </section>

            {shippingV2.length > 0 && (
              <ShippingList options={shippingV2} selectedId={extrasState.selectedShippingId} onSelect={extrasState.setSelectedShippingId} textColor="#0F1111" subtleColor="#565959" borderColor="#D5D9D9" cardColor="#ffffff" accentColor={accent} />
            )}

            <BumpSlot slot="after_cta" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#0F1111" subtleColor="#565959" borderColor="#D5D9D9" cardColor="#ffffff" accentColor={accent} />

            {(error || methodError) && <p className="text-center text-xs text-red-600">{error || methodError}</p>}
          </div>

          {/* COLUNA RESUMO (sticky no desktop) */}
          <aside className="lg:sticky lg:top-4 lg:self-start">{SummaryBox}</aside>
        </div>
      </form>
    </div>
  );
}
