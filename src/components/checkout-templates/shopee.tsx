"use client";

import { useRef, useState } from "react";
import { Loader2, Ticket, ShieldCheck, Truck, MapPin, ChevronRight } from "lucide-react";
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
import { mergeShopee } from "./configs";

/**
 * SHOPEE CHECKOUT — réplica do visual do checkout da Shopee (sem logo/marca),
 * 100% customizável. Mobile-first, paleta laranja (#EE4D2D), card de endereço
 * com a faixa colorida característica, voucher, frete grátis, garantia e
 * resumo com total em laranja + botão fixo "Fazer pedido".
 *
 * Textos editáveis via shopeeConfig. Cores via theme (primary sobrescreve o
 * laranja onde fizer sentido).
 */

const SHOPEE = "#EE4D2D";

export function ShopeeTemplate(p: TemplateProps) {
  const cfg = mergeShopee(p.shopeeConfig);
  const { pix, loading, error, submit, reset } = usePixFlow(
    p.slug,
    p.utm,
    p.variantId,
    p.isPreview,
  );
  const formatBRL = (cents: number) => formatMoney(cents, p.currency || "BRL");
  const c = themeColors(p);
  // Cor da marca vem da config (laranja Shopee por padrão) — NÃO herda o
  // primary genérico do tema, pra não ficar azul/lima sem querer.
  const brand = cfg.brandColor || SHOPEE;
  const preview = p.isPreview === true;
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
  const [voucher, setVoucher] = useState("");
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

  const total = p.priceCents + extrasState.extrasTotal;

  if (pix) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5] p-4">
        <PixResultDisplay
          pix={pix}
          priceCents={total}
          productName={p.product.name}
          productImage={p.product.image}
          productDescription={p.product.description}
          primaryColor={brand}
          pixResultConfig={p.pixResultConfig}
          receiptUpload={p.receiptUpload}
          onBack={reset}
        />
      </div>
    );
  }

  // text-zinc-900 + placeholder visível: sem isso, no preview do builder (UI
  // escura) os inputs herdavam texto claro e ficavam "vazios" — não dava pra
  // ver o que digitar. Cor explícita resolve no preview E no checkout real.
  const inputCls =
    "w-full rounded border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#EE4D2D] focus:outline-none";
  const labelCls = "mb-1 block text-[12px] font-medium text-zinc-600";

  return (
    <div className={`min-h-screen bg-[#F5F5F5] ${preview ? "pb-3" : "pb-[calc(72px+max(8px,env(safe-area-inset-bottom)))]"}`} style={{ background: c.bg || "#F5F5F5" }}>
      {/* Header laranja */}
      <div className="text-white" style={{ background: brand }}>
        <div className="mx-auto max-w-md px-4 py-3">
          <h1 className="text-center text-[17px] font-medium">{cfg.headerTitle}</h1>
        </div>
      </div>

      <form
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
        className="mx-auto max-w-md space-y-2.5 p-2.5"
      >
        {/* Card de endereço com faixa colorida característica */}
        <div className="overflow-hidden rounded bg-white">
          <div className="h-1 w-full" style={{ background: "repeating-linear-gradient(45deg,#EA4E2C,#EA4E2C 12px,#3B82F6 12px,#3B82F6 24px)" }} />
          <div className="p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[14px] font-medium" style={{ color: brand }}>
              <MapPin className="size-4" /> {cfg.addressTitle}
            </div>
            <div className="space-y-2.5">
              {showName && (
                <div>
                  <label className={labelCls}>Nome completo</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Seu nome e sobrenome" className={inputCls} />
                </div>
              )}
              {showEmail && (
                <div>
                  <label className={labelCls}>E-mail</label>
                  <EmailInput value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="seu@email.com" inputClassName={inputCls} />
                </div>
              )}
              {showPhone && (
                <div>
                  <label className={labelCls}>Telefone / WhatsApp</label>
                  <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} inputClassName="flex-1 rounded-r border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none" borderColor="#d4d4d8" />
                </div>
              )}
              {showCpf && (
                <div>
                  <label className={labelCls}>CPF</label>
                  <input type="text" inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" maxLength={14} className={inputCls} />
                </div>
              )}
              {isPhysical && (
                <div className="space-y-2.5 border-t border-zinc-100 pt-2.5">
                  <label className={`${labelCls} !mb-0`}>Endereço de entrega</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="relative col-span-1">
                      <input type="text" inputMode="numeric" value={form.cep} onChange={(e) => setForm({ ...form, cep: maskCep(e.target.value) })} placeholder="CEP" maxLength={9} required className={inputCls} />
                      {cepLookingUp && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-zinc-400" />}
                    </div>
                    <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua" required className={`col-span-2 ${inputCls}`} />
                  </div>
                  {cepError && <p className="text-[10px] text-zinc-500">{cepError}</p>}
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="Nº" required className={`col-span-1 ${inputCls}`} />
                    <input type="text" value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} placeholder="Complemento" className={`col-span-2 ${inputCls}`} />
                  </div>
                  <input type="text" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} placeholder="Bairro" required className={inputCls} />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Cidade" required className={`col-span-2 ${inputCls}`} />
                    <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="UF" required maxLength={2} className={`col-span-1 uppercase ${inputCls}`} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <BumpSlot slot="top" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#212121" subtleColor="#757575" borderColor="#e5e5e5" cardColor="#ffffff" accentColor={brand} />

        {/* Card do produto */}
        <div className="rounded bg-white p-3">
          <div className="flex gap-3">
            <div className="size-16 shrink-0 overflow-hidden rounded border border-zinc-100 bg-zinc-50">
              {p.product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.product.image} alt={p.product.name} className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-zinc-300 text-base font-bold">{p.product.name.slice(0, 2).toUpperCase()}</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] leading-snug text-zinc-800">{p.product.name}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[15px] font-medium" style={{ color: brand }}>{formatBRL(p.priceCents)}</span>
                <span className="text-[12px] text-zinc-400">x1</span>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 border-t border-zinc-100 pt-2 text-[12px] text-[#00BFA5]">
            <Truck className="size-3.5" /> {cfg.shippingFreeText}
          </div>
        </div>

        {/* Voucher Shopee (visual) */}
        <div className="flex items-center gap-2 rounded bg-white p-3">
          <Ticket className="size-4 shrink-0" style={{ color: brand }} />
          <span className="shrink-0 text-[13px] text-zinc-700">{cfg.voucherLabel}</span>
          <input
            type="text"
            value={voucher}
            onChange={(e) => setVoucher(e.target.value)}
            placeholder={cfg.voucherPlaceholder}
            className="min-w-0 flex-1 text-right text-[13px] text-zinc-700 placeholder:text-zinc-400 focus:outline-none"
          />
          <ChevronRight className="size-4 shrink-0 text-zinc-300" />
        </div>

        <BumpSlot slot="above_payment" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#212121" subtleColor="#757575" borderColor="#e5e5e5" cardColor="#ffffff" accentColor={brand} />

        {/* Pagamento */}
        <div className="rounded bg-white p-3">
          <p className="mb-2 text-[14px] font-medium text-zinc-800">{cfg.paymentTitle}</p>
          <PaymentMethodTabs paymentMethods={enabledMethods} selected={methodSel.selected} onSelect={methodSel.setSelected} textColor="#212121" subtleColor="#757575" borderColor="#e5e5e5" cardColor="#ffffff" accentColor={brand} />
          <div className="mt-3">
            {methodSel.selected === "pix" ? (
              <div className="flex items-center gap-2 rounded border-2 p-3" style={{ borderColor: brand }}>
                <PixIcon color={brand} size={18} />
                <span className="text-sm font-semibold text-zinc-800">Pague com PIX e libere na hora</span>
              </div>
            ) : (
              <MethodPaymentPanel ref={stripeRef} method={methodSel.selected} isPreview={p.isPreview === true} slug={p.slug} amountCents={total} currency="BRL" customer={{ name: form.name, email: form.email, phone: form.phone, cpf: form.cpf, cep: form.cep, address: form.address, number: form.number, complement: form.complement, neighborhood: form.neighborhood, city: form.city, state: form.state }} variantId={p.variantId}
                bumpIds={extrasState.selectedBumpIds}
                shippingId={extrasState.selectedShippingId} utm={p.utm} textColor="#212121" subtleColor="#757575" borderColor="#e5e5e5" cardColor="#ffffff" accentColor={brand} onWalletStateChange={setWalletState} onCardCompleteChange={setCardComplete} />
            )}
          </div>
        </div>

        <BumpSlot slot="below_payment" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#212121" subtleColor="#757575" borderColor="#e5e5e5" cardColor="#ffffff" accentColor={brand} />

        {shippingV2.length > 0 && (
          <div className="rounded bg-white p-3">
            <ShippingList options={shippingV2} selectedId={extrasState.selectedShippingId} onSelect={extrasState.setSelectedShippingId} textColor="#212121" subtleColor="#757575" borderColor="#e5e5e5" cardColor="#ffffff" accentColor={brand} />
          </div>
        )}

        {/* Garantia + cashback */}
        <div className="space-y-1.5 rounded bg-white p-3">
          <p className="flex items-center gap-1.5 text-[12px] text-zinc-600">
            <ShieldCheck className="size-3.5" style={{ color: brand }} /> {cfg.guaranteeText}
          </p>
          {cfg.cashbackText && (
            <p className="flex items-center gap-1.5 text-[12px] text-[#F59E0B]">
              <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-[#F59E0B] text-[8px] font-bold text-white">$</span>
              {cfg.cashbackText}
            </p>
          )}
        </div>

        {/* Resumo */}
        <div className="rounded bg-white p-3">
          <div className="space-y-1 text-[13px] text-zinc-600">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatBRL(p.priceCents)}</span></div>
            {extrasState.extrasTotal > 0 && (
              <div className="flex justify-between"><span>Adicionais</span><span>{formatBRL(extrasState.extrasTotal)}</span></div>
            )}
            <div className="flex justify-between"><span>Frete</span><span className="text-[#00BFA5]">GRÁTIS</span></div>
          </div>
          <div className="mt-2 flex items-end justify-between border-t border-zinc-100 pt-2">
            <span className="text-[13px] text-zinc-700">{cfg.summaryTitle}</span>
            <span className="text-[19px] font-semibold" style={{ color: brand }}>{formatBRL(total)}</span>
          </div>
        </div>

        <BumpSlot slot="after_cta" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#212121" subtleColor="#757575" borderColor="#e5e5e5" cardColor="#ffffff" accentColor={brand} />

        {(error || methodError) && <p className="text-center text-xs text-red-600">{error || methodError}</p>}

        {/* Barra inferior — total + botão (estilo Shopee). Fixa na viewport no
            checkout real; no preview do builder vira estática pra não escapar
            do painel. */}
        <div className={`${preview ? "" : "fixed inset-x-0"} bottom-0 z-40 border-t border-zinc-200 bg-white`}>
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-3 py-2.5">
            <div className="leading-tight">
              <p className="text-[11px] text-zinc-500">Total</p>
              <p className="text-[18px] font-semibold" style={{ color: brand }}>{formatBRL(total)}</p>
            </div>
            {!((methodSel.selected === "apple_pay" || methodSel.selected === "google_pay") && walletState === "available") && (
              <button
                type="submit"
                disabled={loading || methodLoading || (isCardMethod && !cardComplete)}
                className="min-h-[44px] flex-1 rounded py-2.5 text-[15px] font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
                style={{ background: brand }}
              >
                {loading || methodLoading ? (
                  <Loader2 className="mx-auto size-5 animate-spin" />
                ) : isCardMethod && !cardComplete ? (
                  "Preencha o cartão"
                ) : (
                  cfg.ctaText || p.ctaLabel || "Fazer pedido"
                )}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
