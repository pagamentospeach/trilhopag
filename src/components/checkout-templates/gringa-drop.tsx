"use client";

import { useRef, useState } from "react";
import {
  Loader2,
  Lock,
  ShieldCheck,
  CreditCard,
  Mail,
  MapPin,
  CheckCircle2,
  Truck,
} from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { mergeGringaDrop } from "./configs";
import type { TemplateProps } from "./types";
import { themeColors, withOpacity } from "./theme-utils";
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
import { EmailInput } from "./smart-inputs";

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "IE", name: "Ireland" },
  { code: "NZ", name: "New Zealand" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
];

/**
 * GRINGA DROP v1: checkout internacional para PRODUTO FÍSICO (dropshipping
 * internacional). Variação do Gringa com:
 *  - Endereço de entrega completo (Country, Address, Apt, City, State, Zip)
 *  - Shipping options (mostra preço de frete e adiciona ao total)
 *  - Order summary com subtotal + shipping + total
 *  - 3 steps visuais (Contact → Shipping → Payment)
 *
 * Métodos: Card + Apple Pay + Google Pay (nenhum PIX). Address obrigatório.
 * Default country: US.
 */
export function GringaDropTemplate(p: TemplateProps) {
  const cfg = mergeGringaDrop(p.gringaDropConfig);
  const c = themeColors(p);
  const currency = (p.currency as string | undefined) ?? "USD";
  const formatPrice = (cents: number) => formatMoney(cents, currency);

  // CPF NUNCA aparece em Gringa — eh checkout internacional.
  const showName = p.fields?.name ?? true;
  const showEmail = p.fields?.email ?? true;
  const showPhone = p.fields?.phone ?? true; // recomendado pra delivery

  // Apenas card/apple_pay/google_pay
  const requestedMethods = p.paymentMethods ?? ["card", "apple_pay", "google_pay"];
  const enabledMethods = requestedMethods.filter((m) =>
    ["card", "apple_pay", "google_pay"].includes(m),
  );
  const finalMethods = enabledMethods.length > 0 ? enabledMethods : ["card"];

  const methodSel = usePaymentMethodSelection(finalMethods);
  const stripeRef = useRef<StripeCardFormHandle>(null);
  const [walletState, setWalletState] = useState<
    "loading" | "available" | "unavailable"
  >("loading");
  const [cardComplete, setCardComplete] = useState(false);
  const [methodError, setMethodError] = useState<string | null>(null);
  const [methodLoading, setMethodLoading] = useState(false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({
    name: p.prefillName ?? "",
    email: p.prefillEmail ?? "",
    phone: p.prefillPhone ?? "",
    country: "US",
    address: "",
    apt: "",
    city: "",
    state: "",
    zip: "",
  });

  const [bumpSelected, setBumpSelected] = useState(false);
  const bumpsV2 = p.orderBumps ?? [];
  const shippingV2 = p.shippingOptions ?? [];
  const extrasState = useBumpsShippingState({
    bumps: bumpsV2,
    shipping: shippingV2,
  });

  const bumpPrice = p.bump && bumpSelected ? p.bump.priceCents : 0;
  const total = p.priceCents + bumpPrice + extrasState.extrasTotal;
  const shippingCents = extrasState.shippingTotal;
  const subtotal = total - shippingCents;

  const isCardMethod =
    methodSel.selected === "card" ||
    // 11/08/2026: boleto usa o MESMO caminho do cartao hospedado (a
    // adquirente devolve uma URL e o cliente termina fora do nosso dominio),
    // entao entra em todo lugar onde "nao e pix" ja valia.
    methodSel.selected === "boleto" ||
    methodSel.selected === "apple_pay" ||
    methodSel.selected === "google_pay";

  // Step 1 (contact) válido?
  const step1Valid =
    (!showName || form.name.trim().length >= 2) &&
    (!showEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) &&
    (!showPhone || form.phone.trim().length >= 6);

  // Step 2 (shipping) válido?
  const step2Valid =
    form.country.length === 2 &&
    form.address.trim().length >= 3 &&
    form.city.trim().length >= 2 &&
    form.state.trim().length >= 1 &&
    form.zip.trim().length >= 3 &&
    // Se shipping options foram configuradas, exige seleção
    (shippingV2.length === 0 || extrasState.selectedShippingId !== null);

  const showCtaButton = !(
    (methodSel.selected === "apple_pay" ||
      methodSel.selected === "google_pay") &&
    walletState === "available"
  );

  const ctaText = (cfg.ctaLabel || "Pay {AMOUNT}").replace(
    "{AMOUNT}",
    formatPrice(total),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMethodError(null);
    if (!step1Valid || !step2Valid) {
      setMethodError("Please complete all required fields.");
      return;
    }
    setMethodLoading(true);
    const res = await stripeRef.current?.confirm();
    setMethodLoading(false);
    if (!res?.ok) {
      setMethodError(res?.error ?? "Payment failed. Please try again.");
    }
  }

  return (
    <div
      className="min-h-screen pb-[max(0px,env(safe-area-inset-bottom))]"
      style={{ background: c.bg, color: c.text }}
    >
      {/* Top bar */}
      <div
        className="border-b py-3 px-4"
        style={{ borderColor: c.border, background: c.card }}
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="size-3.5" style={{ color: cfg.lockColor }} />
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: c.text }}
            >
              {cfg.headerTitle}
            </span>
          </div>
          <div
            className="flex items-center gap-1.5 text-[10px]"
            style={{ color: c.subtle }}
          >
            <ShieldCheck className="size-3" />
            <span>256-bit SSL · Stripe verified</span>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div
        className="border-b py-3 px-4"
        style={{ borderColor: c.border, background: c.bg }}
      >
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-center gap-2 text-xs">
            <Step
              n={1}
              active={step >= 1}
              label="Contact"
              c={c}
              primary={c.primary}
              onClick={() => step > 1 && setStep(1)}
            />
            <Divider c={c} />
            <Step
              n={2}
              active={step >= 2}
              label="Shipping"
              c={c}
              primary={c.primary}
              onClick={() => step > 2 && step1Valid && setStep(2)}
            />
            <Divider c={c} />
            <Step
              n={3}
              active={step >= 3}
              label="Payment"
              c={c}
              primary={c.primary}
              onClick={() => {}}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-10">
          {/* Form column */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-3 space-y-5 order-2 lg:order-1"
          >
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

            {/* STEP 1: Contact */}
            {step === 1 && (
              <div
                className="rounded-xl p-5 shadow-sm space-y-4"
                style={{ background: c.card }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: withOpacity(c.primary, 0.12),
                      color: c.primary,
                    }}
                  >
                    1
                  </span>
                  <h2 className="text-base font-bold" style={{ color: c.text }}>
                    {cfg.contactTitle}
                  </h2>
                </div>

                {showEmail && (
                  <div>
                    <label
                      className="text-xs mb-1.5 block font-medium"
                      style={{ color: c.subtle }}
                    >
                      {cfg.emailLabel}
                    </label>
                    <div className="relative">
                      <Mail
                        className="absolute left-3 top-1/2 -translate-y-1/2 size-4 pointer-events-none"
                        style={{ color: c.subtle }}
                      />
                      <EmailInput
                        value={form.email}
                        onChange={(v) => setForm({ ...form, email: v })}
                        placeholder={cfg.emailPlaceholder}
                        inputClassName="w-full rounded-lg pl-10 pr-3 py-3 text-sm focus:outline-none"
                        inputStyle={{
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
                {showName && (
                  <div>
                    <label
                      className="text-xs mb-1.5 block font-medium"
                      style={{ color: c.subtle }}
                    >
                      {cfg.nameLabel}
                    </label>
                    <input
                      type="text"
                      autoComplete="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder={cfg.namePlaceholder}
                      className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none"
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
                    <label
                      className="text-xs mb-1.5 block font-medium"
                      style={{ color: c.subtle }}
                    >
                      {cfg.phoneLabel}
                    </label>
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      placeholder={cfg.phonePlaceholder}
                      className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none"
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

                <button
                  type="button"
                  onClick={() => step1Valid && setStep(2)}
                  disabled={!step1Valid}
                  className="w-full rounded-lg py-3.5 text-sm font-bold uppercase tracking-wider transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                  style={{ background: c.ctaBg, color: c.ctaColor }}
                >
                  Continue to shipping
                </button>
              </div>
            )}

            {/* STEP 2: Shipping */}
            {step === 2 && (
              <div
                className="rounded-xl p-5 shadow-sm space-y-4"
                style={{ background: c.card }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: withOpacity(c.primary, 0.12),
                      color: c.primary,
                    }}
                  >
                    2
                  </span>
                  <h2 className="text-base font-bold inline-flex items-center gap-2" style={{ color: c.text }}>
                    <MapPin className="size-4" />
                    {cfg.shippingTitle}
                  </h2>
                </div>

                <div>
                  <label
                    className="text-xs mb-1.5 block font-medium"
                    style={{ color: c.subtle }}
                  >
                    {cfg.countryLabel}
                  </label>
                  <select
                    value={form.country}
                    onChange={(e) =>
                      setForm({ ...form, country: e.target.value })
                    }
                    className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none"
                    style={{
                      background: c.card,
                      color: c.text,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: c.border,
                    }}
                  >
                    {COUNTRIES.map((co) => (
                      <option key={co.code} value={co.code}>
                        {co.name}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  type="text"
                  autoComplete="address-line1"
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                  placeholder={cfg.addressPlaceholder}
                  className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none"
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
                  autoComplete="address-line2"
                  value={form.apt}
                  onChange={(e) => setForm({ ...form, apt: e.target.value })}
                  placeholder={cfg.apartmentPlaceholder}
                  className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none"
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
                    autoComplete="address-level2"
                    value={form.city}
                    onChange={(e) =>
                      setForm({ ...form, city: e.target.value })
                    }
                    placeholder={cfg.cityPlaceholder}
                    className="col-span-3 sm:col-span-1 rounded-lg px-3 py-3 text-sm focus:outline-none"
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
                    autoComplete="address-level1"
                    value={form.state}
                    onChange={(e) =>
                      setForm({ ...form, state: e.target.value })
                    }
                    placeholder={cfg.statePlaceholder}
                    className="col-span-2 sm:col-span-1 rounded-lg px-3 py-3 text-sm focus:outline-none"
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
                    autoComplete="postal-code"
                    value={form.zip}
                    onChange={(e) => setForm({ ...form, zip: e.target.value })}
                    placeholder={cfg.cepPlaceholder}
                    className="col-span-1 rounded-lg px-3 py-3 text-sm focus:outline-none"
                    style={{
                      background: c.card,
                      color: c.text,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: c.border,
                    }}
                  />
                </div>

                {/* Shipping options */}
                {shippingV2.length > 0 && (
                  <div className="pt-2">
                    <p
                      className="text-xs font-medium mb-2 inline-flex items-center gap-1.5"
                      style={{ color: c.subtle }}
                    >
                      <Truck className="size-3.5" />
                      Choose shipping
                    </p>
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
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-lg px-4 py-3.5 text-sm font-bold uppercase tracking-wider transition hover:opacity-90"
                    style={{
                      background: withOpacity(c.text, 0.06),
                      color: c.text,
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => step2Valid && setStep(3)}
                    disabled={!step2Valid}
                    className="flex-1 rounded-lg py-3.5 text-sm font-bold uppercase tracking-wider transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                    style={{ background: c.ctaBg, color: c.ctaColor }}
                  >
                    Continue to payment
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Payment */}
            {step === 3 && (
              <>
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

                <div
                  className="rounded-xl p-5 shadow-sm space-y-4"
                  style={{ background: c.card }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        background: withOpacity(c.primary, 0.12),
                        color: c.primary,
                      }}
                    >
                      3
                    </span>
                    <h2 className="text-base font-bold" style={{ color: c.text }}>
                      {cfg.paymentTitle}
                    </h2>
                    <CreditCard
                      className="ml-auto size-4"
                      style={{ color: c.subtle }}
                    />
                  </div>

                  <PaymentMethodTabs
                    paymentMethods={finalMethods}
                    selected={methodSel.selected}
                    onSelect={methodSel.setSelected}
                    textColor={c.text}
                    subtleColor={c.subtle}
                    borderColor={c.border}
                    cardColor={c.card}
                    accentColor={c.primary}
                  />

                  <MethodPaymentPanel
                    ref={stripeRef}
                    method={methodSel.selected}
                    isPreview={p.isPreview === true}
                    slug={p.slug}
                    amountCents={total}
                    currency={currency}
                    customer={{
                      name: form.name,
                      email: form.email,
                      phone: form.phone,
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

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="rounded-lg px-4 py-3.5 text-sm font-bold uppercase tracking-wider transition hover:opacity-90"
                      style={{
                        background: withOpacity(c.text, 0.06),
                        color: c.text,
                      }}
                    >
                      Back
                    </button>
                    {showCtaButton && (
                      <button
                        type="submit"
                        disabled={
                          methodLoading ||
                          (isCardMethod && !cardComplete)
                        }
                        className="flex-1 rounded-lg py-3.5 text-sm font-bold uppercase tracking-wider transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-md active:scale-[0.98] min-h-[52px] inline-flex items-center justify-center gap-2"
                        style={{ background: c.ctaBg, color: c.ctaColor }}
                      >
                        {methodLoading ? (
                          <Loader2 className="size-5 animate-spin" />
                        ) : isCardMethod && !cardComplete ? (
                          <>
                            <CreditCard className="size-4" /> Fill in your card
                          </>
                        ) : (
                          <>
                            <Lock className="size-4" /> {ctaText}
                          </>
                        )}
                      </button>
                    )}
                  </div>

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
                </div>

                {methodError && (
                  <p
                    className="text-center text-xs rounded-lg py-2.5 px-3"
                    style={{
                      color: "#dc2626",
                      background: withOpacity("#dc2626", 0.08),
                    }}
                  >
                    {methodError}
                  </p>
                )}
              </>
            )}

            {/* Safety footer */}
            <div className="space-y-2 text-center">
              <div
                className="inline-flex items-center gap-2 text-xs"
                style={{ color: c.subtle }}
              >
                <ShieldCheck className="size-3.5" />
                <span>{cfg.safetyText}</span>
              </div>
              <p className="text-[10px]" style={{ color: c.subtle }}>
                {cfg.poweredByText}
              </p>
            </div>
          </form>

          {/* Order summary */}
          <aside className="lg:col-span-2 order-1 lg:order-2">
            <div
              className="rounded-xl p-5 shadow-sm lg:sticky lg:top-6"
              style={{ background: c.card }}
            >
              <h3
                className="text-xs font-bold uppercase tracking-wider mb-4 inline-flex items-center gap-2"
                style={{ color: c.subtle }}
              >
                <CheckCircle2 className="size-3.5" />
                {cfg.orderSummaryTitle}
              </h3>

              <div
                className="flex items-start gap-3 pb-4 border-b"
                style={{ borderColor: c.border }}
              >
                {p.product.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.product.image}
                    alt={p.product.name}
                    className="size-16 rounded-lg object-cover flex-shrink-0"
                    style={{
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: c.border,
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: c.text }}>
                    {p.product.name}
                  </p>
                  {p.product.description && (
                    <p
                      className="text-xs mt-0.5 line-clamp-2"
                      style={{ color: c.subtle }}
                    >
                      {p.product.description}
                    </p>
                  )}
                </div>
                <p
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: c.text }}
                >
                  {formatPrice(p.priceCents)}
                </p>
              </div>

              {p.bump && bumpSelected && (
                <div
                  className="flex items-center justify-between py-3 border-b text-sm"
                  style={{ borderColor: c.border, color: c.text }}
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2
                      className="size-3.5"
                      style={{ color: c.primary }}
                    />
                    {p.bump.name}
                  </span>
                  <span className="tabular-nums">
                    {formatPrice(p.bump.priceCents)}
                  </span>
                </div>
              )}
              {extrasState.selectedBumps.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between py-3 border-b text-sm"
                  style={{ borderColor: c.border, color: c.text }}
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2
                      className="size-3.5"
                      style={{ color: c.primary }}
                    />
                    {b.title}
                  </span>
                  <span className="tabular-nums">{formatPrice(b.priceCents)}</span>
                </div>
              ))}

              <div className="pt-4 space-y-2 text-sm" style={{ color: c.text }}>
                <div className="flex items-center justify-between">
                  <span style={{ color: c.subtle }}>{cfg.subtotalLabel}</span>
                  <span className="tabular-nums">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: c.subtle }}>{cfg.shippingLabel}</span>
                  <span className="tabular-nums">
                    {shippingCents === 0
                      ? extrasState.selectedShipping
                        ? cfg.freeShippingLabel
                        : "—"
                      : formatPrice(shippingCents)}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between pt-3 border-t"
                  style={{ borderColor: c.border }}
                >
                  <span className="font-bold">{cfg.totalLabel}</span>
                  <span
                    className="font-bold text-lg tabular-nums"
                    style={{ color: c.primary }}
                  >
                    {formatPrice(total)}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  active,
  label,
  c,
  primary,
  onClick,
}: {
  n: number;
  active: boolean;
  label: string;
  c: ReturnType<typeof themeColors>;
  primary: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 transition hover:opacity-80"
      style={{ color: active ? primary : c.subtle }}
    >
      <span
        className="inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold"
        style={{
          background: active ? primary : withOpacity(c.text, 0.06),
          color: active ? c.ctaColor : c.subtle,
        }}
      >
        {n}
      </span>
      <span className="font-semibold uppercase tracking-wider text-[10px]">
        {label}
      </span>
    </button>
  );
}

function Divider({ c }: { c: ReturnType<typeof themeColors> }) {
  return (
    <span
      className="hidden sm:inline-block w-12 h-px"
      style={{ background: c.border }}
    />
  );
}
