"use client";

import { useState } from "react";
import { Loader2, User, CreditCard, Check, Minus, Plus } from "lucide-react";
// Loader2 já importado acima — usado no spinner do CEP lookup.
import { formatMoney } from "@/lib/utils";
import { PixResultDisplay } from "./pix-result-modal";
import { usePixFlow } from "./use-pix-flow";
import { mergeExtra } from "./configs";
import type { TemplateProps } from "./types";
import { themeColors, withOpacity } from "./theme-utils";
import { PixIcon } from "./pix-icon";
import { BumpBlock } from "./bump-block";
import {
  ShippingList,
  useBumpsShippingState,
} from "./bumps-list";
import { BumpSlot } from "./bump-slot";
import {
  PaymentMethodTabs,
  MethodPaymentPanel,
  usePaymentMethodSelection,
  type StripeCardFormHandle,
} from "./payment-method-tabs";
import { useRef } from "react";
import {
  EmailInput,
  PhoneInput,
  maskCpf,
  maskCep,
  useCepLookup,
} from "./smart-inputs";

/**
 * Extra: cards compactos. Produto (com qty 1x) + Identificação +
 * Pagamento PIX selecionado. Botão GERAR PIX.
 *
 * Respeita todas as cores do builder via inline style.
 */
export function ExtraTemplate(p: TemplateProps) {
  const { pix, loading, error, submit, reset } = usePixFlow(
    p.slug,
    p.utm,
    p.variantId,
    p.isPreview,
  );
  const cfg = mergeExtra(p.extraConfig);
  const c = themeColors(p);
  // Helper de formatacao respeitando moeda do checkout (BRL/USD/EUR).
  const formatBRL = (cents: number) => formatMoney(cents, p.currency || "BRL");
  // Respeita toggles do builder (defaults compatíveis com legado)
  const showName = p.fields?.name ?? true;
  const showEmail = p.fields?.email ?? true;
  const showPhone = p.fields?.phone ?? false;
  const showCpf = p.fields?.cpf ?? false;
  const showQuantity = p.showQuantity === true;
  const isPhysical = p.isPhysical === true;
  const [qty, setQty] = useState(1);
  const [bumpSelected, setBumpSelected] = useState(false);
  const bumpsV2 = p.orderBumps ?? [];
  const shippingV2 = p.shippingOptions ?? [];
  const extrasState = useBumpsShippingState({
    bumps: bumpsV2,
    shipping: shippingV2,
  });
  const enabledMethods = p.paymentMethods ?? ["pix"];
  const methodSel = usePaymentMethodSelection(enabledMethods);
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
  const stripeRef = useRef<StripeCardFormHandle>(null);
  const [methodError, setMethodError] = useState<string | null>(null);
  const [methodLoading, setMethodLoading] = useState(false);
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
  // CEP lookup automático via ViaCEP — preenche endereço sem o user
  // precisar digitar tudo. Se falhar, user pode digitar à mão.
  const { lookingUp: cepLookingUp, error: cepError } = useCepLookup(
    form.cep,
    (addr) => {
      setForm((f) => ({
        ...f,
        address: f.address || addr.logradouro,
        neighborhood: f.neighborhood || addr.bairro,
        city: f.city || addr.localidade,
        state: f.state || addr.uf,
        complement: f.complement || addr.complemento,
      }));
    },
    isPhysical, // só ativa quando o template pede endereço
  );

  const bumpPrice = p.bump && bumpSelected ? p.bump.priceCents : 0;
  const total = p.priceCents * qty + bumpPrice + extrasState.extrasTotal;

  if (pix) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: c.bg, color: c.text }}
      >
        <PixResultDisplay
          pix={pix}
          priceCents={total}
          productName={p.product.name}
          productImage={p.product.image}
          productDescription={p.product.description}
          primaryColor={c.primary}
          pixResultConfig={p.pixResultConfig}
          receiptUpload={p.receiptUpload}
          onBack={reset}
          currency={p.currency || "BRL"}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen px-4 py-6 pb-[max(24px,env(safe-area-inset-bottom))]"
      style={{ background: c.bg, color: c.text }}
    >
      <div className="mx-auto max-w-md space-y-3">
        {/* Bump slot: TOP */}
        <BumpSlot
          slot="top"
          position={p.bumpPosition}
          bumps={bumpsV2}
          selectedIds={extrasState.selectedBumpIds}
          onToggle={extrasState.toggleBump}
          textColor={c.text}
          subtleColor={c.subtle}
          borderColor={c.border}
          cardColor={c.card}
          accentColor={c.primary}
        />

        {/* Produto */}
        <div
          className="rounded-2xl p-4 shadow-sm"
          style={{ background: c.card }}
        >
          <div className="flex items-center gap-3">
            {p.product.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.product.image}
                alt={p.product.name}
                className="size-12 rounded-full object-cover"
                style={{ borderWidth: 1, borderStyle: "solid", borderColor: c.border }}
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate" style={{ color: c.text }}>
                {p.product.name}
              </p>
              {p.product.description && (
                <p className="text-xs truncate" style={{ color: c.subtle }}>
                  {p.product.description}
                </p>
              )}
            </div>
            {showQuantity ? (
              <div
                className="inline-flex items-center gap-2 rounded-full px-1.5 py-0.5 text-xs"
                style={{ background: withOpacity(c.text, 0.06) }}
              >
                <button
                  type="button"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  style={{ color: c.subtle }}
                  aria-label="Diminuir quantidade"
                >
                  <Minus className="size-3" />
                </button>
                <span className="font-semibold" style={{ color: c.text }}>
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(qty + 1)}
                  style={{ color: c.subtle }}
                  aria-label="Aumentar quantidade"
                >
                  <Plus className="size-3" />
                </button>
              </div>
            ) : (
              <span className="text-xs" style={{ color: c.subtle }}>1x</span>
            )}
          </div>
          <div
            className="mt-3 flex items-center justify-between pt-3 text-sm"
            style={{ borderTop: `1px solid ${c.border}` }}
          >
            <span style={{ color: c.subtle }}>Total</span>
            <span className="text-base font-bold" style={{ color: c.text }}>
              {formatBRL(total)}
            </span>
          </div>
        </div>

        {/* Identificação */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setMethodError(null);
            if (methodSel.selected === "pix") {
              submit(form, extrasState.selectedBumpIds, extrasState.selectedShippingId);
            } else {
              // Cartão/wallets/etc — chama Stripe via ref
              setMethodLoading(true);
              const res = await stripeRef.current?.confirm();
              setMethodLoading(false);
              if (!res?.ok) {
                setMethodError(res?.error ?? "Erro ao confirmar pagamento");
              }
            }
          }}
          className="space-y-3"
        >
          <div
            className="rounded-2xl p-4 shadow-sm"
            style={{ background: c.card }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className="inline-flex size-7 items-center justify-center rounded-full"
                style={{ background: cfg.iconBg, color: cfg.iconColor }}
              >
                <User className="size-3.5" />
              </span>
              <h2 className="text-base font-semibold" style={{ color: c.text }}>
                {cfg.identTitle}
              </h2>
            </div>
            <div className="space-y-3">
              {showEmail && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: c.subtle }}>
                    {cfg.emailLabel}
                  </label>
                  <EmailInput
                    value={form.email}
                    onChange={(v) => setForm({ ...form, email: v })}
                    placeholder={cfg.emailPlaceholder}
                    inputClassName="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                    inputStyle={{
                      background: c.card,
                      color: c.text,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: c.border,
                    }}
                  />
                </div>
              )}
              {showName && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: c.subtle }}>
                    {cfg.nameLabel}
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={cfg.namePlaceholder}
                    className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                    style={{
                      background: c.card,
                      color: c.text,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: c.border,
                    }}
                  />
                </div>
              )}
              {showPhone && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: c.subtle }}>
                    Telefone / WhatsApp
                  </label>
                  <PhoneInput
                    value={form.phone}
                    onChange={(v) => setForm({ ...form, phone: v })}
                    inputClassName="flex-1 px-3 py-2.5 text-sm focus:outline-none rounded-r-lg"
                    inputStyle={{
                      background: c.card,
                      color: c.text,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: c.border,
                    }}
                    borderColor={c.border}
                  />
                </div>
              )}
              {showCpf && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: c.subtle }}>
                    CPF
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.cpf}
                    onChange={(e) =>
                      setForm({ ...form, cpf: maskCpf(e.target.value) })
                    }
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                    style={{
                      background: c.card,
                      color: c.text,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: c.border,
                    }}
                  />
                </div>
              )}

              {/* Endereço de entrega — só aparece quando "Produto físico" está ligado */}
              {isPhysical && (
                <div className="pt-3 space-y-3" style={{ borderTop: `1px solid ${c.border}` }}>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: c.subtle }}>
                    Endereço de entrega
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1 relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        value={form.cep}
                        onChange={(e) =>
                          setForm({ ...form, cep: maskCep(e.target.value) })
                        }
                        placeholder="CEP"
                        maxLength={9}
                        className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                        style={{
                          background: c.card,
                          color: c.text,
                          borderWidth: 1,
                          borderStyle: "solid",
                          borderColor: c.border,
                        }}
                      />
                      {cepLookingUp && (
                        <Loader2
                          className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 animate-spin"
                          style={{ color: c.subtle }}
                        />
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Rua / Logradouro"
                      className="col-span-2 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                      style={{
                        background: c.card,
                        color: c.text,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: c.border,
                      }}
                    />
                  </div>
                  {cepError && (
                    <p className="text-[10px]" style={{ color: c.subtle }}>
                      {cepError}
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      required
                      value={form.number}
                      onChange={(e) => setForm({ ...form, number: e.target.value })}
                      placeholder="Nº"
                      className="col-span-1 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                      style={{
                        background: c.card,
                        color: c.text,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: c.border,
                      }}
                    />
                    <input
                      type="text"
                      value={form.complement}
                      onChange={(e) => setForm({ ...form, complement: e.target.value })}
                      placeholder="Compl. (opcional)"
                      className="col-span-2 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                      style={{
                        background: c.card,
                        color: c.text,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: c.border,
                      }}
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={form.neighborhood}
                    onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                    placeholder="Bairro"
                    className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                    style={{
                      background: c.card,
                      color: c.text,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: c.border,
                    }}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      required
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder="Cidade"
                      className="col-span-2 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                      style={{
                        background: c.card,
                        color: c.text,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: c.border,
                      }}
                    />
                    <input
                      type="text"
                      required
                      maxLength={2}
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })}
                      placeholder="UF"
                      className="col-span-1 rounded-lg px-3 py-2.5 text-sm focus:outline-none uppercase"
                      style={{
                        background: c.card,
                        color: c.text,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: c.border,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bump slot: ABOVE_PAYMENT */}
          <BumpSlot
            slot="above_payment"
            position={p.bumpPosition}
            bumps={bumpsV2}
            selectedIds={extrasState.selectedBumpIds}
            onToggle={extrasState.toggleBump}
            textColor={c.text}
            subtleColor={c.subtle}
            borderColor={c.border}
            cardColor={c.card}
            accentColor={c.primary}
          />

          {/* Pagamento */}
          <div
            className="rounded-2xl p-4 shadow-sm space-y-3"
            style={{ background: c.card }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-flex size-7 items-center justify-center rounded-full"
                style={{ background: cfg.iconBg, color: cfg.iconColor }}
              >
                <CreditCard className="size-3.5" />
              </span>
              <h2 className="text-base font-semibold" style={{ color: c.text }}>
                {cfg.paymentTitle}
              </h2>
            </div>

            {/* Seletor de métodos — só aparece com >1 método ativo */}
            <PaymentMethodTabs
              paymentMethods={enabledMethods}
              selected={methodSel.selected}
              onSelect={methodSel.setSelected}
              textColor={c.text}
              subtleColor={c.subtle}
              borderColor={c.border}
              cardColor={c.card}
              accentColor={c.primary}
            />

            {/* UI específica do método selecionado */}
            {methodSel.selected === "pix" ? (
              <div
                className="flex items-center gap-3 rounded-lg p-3"
                style={{ borderWidth: 1, borderStyle: "solid", borderColor: c.border }}
              >
                <PixIcon color={c.subtle} size={20} />
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: c.text }}>
                    {cfg.pixOptionTitle}
                  </p>
                  <p className="text-xs" style={{ color: c.subtle }}>
                    {cfg.pixOptionSubtitle}
                  </p>
                </div>
                <span
                  className="inline-flex size-6 items-center justify-center rounded-full"
                  style={{ background: cfg.pixOptionCheckBg, color: "#fff" }}
                >
                  <Check className="size-3.5" />
                </span>
              </div>
            ) : (
              <MethodPaymentPanel
                ref={stripeRef}
                method={methodSel.selected}
                isPreview={p.isPreview === true}
                slug={p.slug}
                amountCents={total}
                currency="BRL"
                customer={{
                  name: form.name,
                  email: form.email,
                  phone: form.phone,
                  cpf: form.cpf,
                  cep: form.cep,
                  address: form.address,
                  number: form.number,
                  complement: form.complement,
                  neighborhood: form.neighborhood,
                  city: form.city,
                  state: form.state,
                }}
                variantId={p.variantId}
                bumpIds={extrasState.selectedBumpIds}
                shippingId={extrasState.selectedShippingId}
                utm={p.utm}
                textColor={c.text}
                subtleColor={c.subtle}
                borderColor={c.border}
                cardColor={c.card}
                accentColor={c.primary}
                onWalletStateChange={setWalletState}
                onCardCompleteChange={setCardComplete}
              />
            )}
          </div>

          {/* OrderBump legado (single) — acima do CTA */}
          {p.bump && (
            <BumpBlock
              bump={p.bump}
              selected={bumpSelected}
              onToggle={setBumpSelected}
              textColor={c.text}
              subtleColor={c.subtle}
              borderColor={c.border}
              cardColor={c.card}
            />
          )}

          {/* Bump slot: BELOW_PAYMENT (default) */}
          <BumpSlot
            slot="below_payment"
            position={p.bumpPosition}
            bumps={bumpsV2}
            selectedIds={extrasState.selectedBumpIds}
            onToggle={extrasState.toggleBump}
            textColor={c.text}
            subtleColor={c.subtle}
            borderColor={c.border}
            cardColor={c.card}
            accentColor={c.primary}
          />

          {/* Opções de Frete (v2) */}
          {shippingV2.length > 0 && (
            <ShippingList
              options={shippingV2}
              selectedId={extrasState.selectedShippingId}
              onSelect={extrasState.setSelectedShippingId}
              textColor={c.text}
              subtleColor={c.subtle}
              borderColor={c.border}
              cardColor={c.card}
              accentColor={c.primary}
            />
          )}

          {/* Esconde o CTA padrao SO quando o wallet nativo (PaymentRequestButton)
              esta disponivel. Quando wallet nao disponivel, mostramos card form
              como fallback — entao precisamos do CTA pra confirmar. */}
          {!(
            (methodSel.selected === "apple_pay" ||
              methodSel.selected === "google_pay") &&
            walletState === "available"
          ) && (
            <button
              type="submit"
              disabled={
                loading ||
                methodLoading ||
                (isCardMethod && !cardComplete)
              }
              className="w-full rounded-full py-4 text-sm font-bold uppercase tracking-wider transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg active:scale-[0.98] min-h-[56px]"
              style={{ background: c.ctaBg, color: c.ctaColor }}
              title={isCardMethod && !cardComplete ? "Preencha os dados do cartao primeiro" : undefined}
            >
              {loading || methodLoading ? (
                <Loader2 className="mx-auto size-5 animate-spin" />
              ) : isCardMethod && !cardComplete ? (
                "Preencha os dados do cartao"
              ) : (
                cfg.ctaLabel
              )}
            </button>
          )}

          {(error || methodError) && (
            <p className="text-center text-xs" style={{ color: "#ef4444" }}>
              {error || methodError}
            </p>
          )}

          {/* Bump slot: AFTER_CTA */}
          <BumpSlot
            slot="after_cta"
            position={p.bumpPosition}
            bumps={bumpsV2}
            selectedIds={extrasState.selectedBumpIds}
            onToggle={extrasState.toggleBump}
            textColor={c.text}
            subtleColor={c.subtle}
            borderColor={c.border}
            cardColor={c.card}
            accentColor={c.primary}
          />

          <p className="text-center text-[11px] px-4" style={{ color: c.subtle }}>
            {cfg.termsText}
          </p>
        </form>
      </div>
    </div>
  );
}
