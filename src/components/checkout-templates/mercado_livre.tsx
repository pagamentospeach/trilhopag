"use client";

import { useRef, useState } from "react";
import { Loader2, ShieldCheck, Truck, RotateCcw, Lock } from "lucide-react";
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
import { mergeMercadoLivre } from "./configs";

/**
 * MERCADO LIVRE — réplica do visual do checkout do Mercado Livre, sem logo.
 * Azul ML (#3483fa) + fundo cinza claro. Resumo da compra + dados + pagamento
 * + selo "Compra Garantida". Textos editáveis via mercadoLivreConfig.
 */

const ML_BLUE = "#3483fa";

export function MercadoLivreTemplate(p: TemplateProps) {
  const ml = mergeMercadoLivre(p.mercadoLivreConfig);
  const { pix, loading, error, submit, reset } = usePixFlow(
    p.slug,
    p.utm,
    p.variantId,
    p.isPreview,
  );
  const formatBRL = (cents: number) => formatMoney(cents, p.currency || "BRL");
  const c = themeColors(p);
  const accent = c.primary || ML_BLUE;
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

  const total = p.priceCents + extrasState.extrasTotal;

  const inputCls =
    "w-full rounded border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#3483fa] focus:ring-1 focus:ring-[#3483fa]";

  if (pix) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#ededed] p-4">
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

  return (
    <div className="min-h-screen bg-[#ededed] pb-[max(24px,env(safe-area-inset-bottom))]">
      {/* Barra de topo (sem logo — faixa de cor) */}
      <div className="h-12 w-full" style={{ background: accent }} />

      <div className="mx-auto -mt-6 max-w-lg space-y-3 px-3">
        {/* RESUMO DA COMPRA */}
        <div className="rounded-md bg-white p-4 shadow-sm">
          <p className="mb-3 text-[13px] font-semibold text-zinc-500">{ml.summaryTitle}</p>
          <div className="flex items-center gap-3">
            {p.product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.product.image} alt={p.product.name} className="size-16 rounded object-cover border border-zinc-200" />
            ) : (
              <div className="flex size-16 items-center justify-center rounded bg-zinc-100 text-zinc-400 text-xs font-bold">
                {p.product.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-800">{p.product.name}</p>
              {p.product.description && (
                <p className="truncate text-xs text-zinc-500">{p.product.description}</p>
              )}
              <p className="mt-0.5 text-sm font-semibold text-zinc-900">{formatBRL(p.priceCents)}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm">
            <div className="flex justify-between text-zinc-600">
              <span>Produto</span>
              <span>{formatBRL(p.priceCents)}</span>
            </div>
            {extrasState.extrasTotal > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Adicionais</span>
                <span>{formatBRL(extrasState.extrasTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-600">
              <span>Frete</span>
              <span className="text-emerald-600 font-medium">Grátis</span>
            </div>
            <div className="flex justify-between border-t border-zinc-100 pt-1.5 text-base font-bold text-zinc-900">
              <span>Você vai pagar</span>
              <span>{formatBRL(total)}</span>
            </div>
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
          className="space-y-3"
        >
          <BumpSlot slot="top" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={accent} />

          {/* DADOS */}
          <div className="rounded-md bg-white p-4 shadow-sm space-y-3">
            <h2 className="text-[15px] font-semibold text-zinc-900">Seus dados</h2>
            {showEmail && (
              <div>
                <label className="mb-1 block text-[13px] text-zinc-600">E-mail</label>
                <EmailInput value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="seu@email.com" inputClassName={inputCls} />
              </div>
            )}
            {showName && (
              <div>
                <label className="mb-1 block text-[13px] text-zinc-600">Nome completo</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Seu nome" className={inputCls} />
              </div>
            )}
            {showPhone && (
              <div>
                <label className="mb-1 block text-[13px] text-zinc-600">Telefone / WhatsApp</label>
                <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} inputClassName="flex-1 rounded-r border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#3483fa]" borderColor="#d4d4d8" />
              </div>
            )}
            {showCpf && (
              <div>
                <label className="mb-1 block text-[13px] text-zinc-600">CPF</label>
                <input type="text" inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" maxLength={14} className={inputCls} />
              </div>
            )}

            {isPhysical && (
              <div className="space-y-3 border-t border-zinc-100 pt-3">
                <h3 className="text-[13px] font-semibold text-zinc-900">Endereço de entrega</h3>
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

          <BumpSlot slot="above_payment" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={accent} />

          {/* PAGAMENTO */}
          <div className="rounded-md bg-white p-4 shadow-sm space-y-3">
            <h2 className="text-[15px] font-semibold text-zinc-900">{ml.payTitle}</h2>
            <PaymentMethodTabs paymentMethods={enabledMethods} selected={methodSel.selected} onSelect={methodSel.setSelected} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={accent} />
            {methodSel.selected === "pix" ? (
              <div className="flex items-center gap-3 rounded border border-zinc-200 p-3">
                <PixIcon color={accent} size={22} />
                <div>
                  <p className="text-sm font-medium text-zinc-800">PIX</p>
                  <p className="text-xs text-zinc-500">Aprovação na hora. Você paga e libera na mesma hora.</p>
                </div>
              </div>
            ) : (
              <MethodPaymentPanel ref={stripeRef} method={methodSel.selected} isPreview={p.isPreview === true} slug={p.slug} amountCents={total} currency="BRL" customer={{ name: form.name, email: form.email, phone: form.phone, cpf: form.cpf, cep: form.cep, address: form.address, number: form.number, complement: form.complement, neighborhood: form.neighborhood, city: form.city, state: form.state }} variantId={p.variantId}
                bumpIds={extrasState.selectedBumpIds}
                shippingId={extrasState.selectedShippingId} utm={p.utm} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={accent} onWalletStateChange={setWalletState} onCardCompleteChange={setCardComplete} />
            )}
          </div>

          <BumpSlot slot="below_payment" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={accent} />

          {shippingV2.length > 0 && (
            <ShippingList options={shippingV2} selectedId={extrasState.selectedShippingId} onSelect={extrasState.setSelectedShippingId} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={accent} />
          )}

          {!((methodSel.selected === "apple_pay" || methodSel.selected === "google_pay") && walletState === "available") && (
            <button
              type="submit"
              disabled={loading || methodLoading || (isCardMethod && !cardComplete)}
              className="w-full rounded-md py-3.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-40 active:scale-[0.99] min-h-[52px]"
              style={{ background: accent }}
            >
              {loading || methodLoading ? (
                <Loader2 className="mx-auto size-5 animate-spin" />
              ) : isCardMethod && !cardComplete ? (
                "Preencha os dados do cartão"
              ) : (
                p.ctaLabel || "Pagar"
              )}
            </button>
          )}

          {(error || methodError) && <p className="text-center text-xs text-red-500">{error || methodError}</p>}

          <BumpSlot slot="after_cta" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={accent} />
        </form>

        {/* COMPRA GARANTIDA */}
        <div className="rounded-md bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-600" />
            <p className="text-[14px] font-semibold text-zinc-800">{ml.guaranteeTitle}</p>
          </div>
          <div className="space-y-2 text-[12px] text-zinc-600">
            {ml.guarantees.map((g, i) => {
              const Icon = [Lock, RotateCcw, Truck][i % 3];
              return (
                <p key={i} className="flex items-center gap-2">
                  <Icon className="size-3.5 text-zinc-400" /> {g}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
