"use client";

import { useRef, useState } from "react";
import {
  Loader2,
  Lock,
  ShieldCheck,
  CreditCard,
  Mail,
  CheckCircle2,
} from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { mergeGringa } from "./configs";
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
import { EmailInput, PhoneInput } from "./smart-inputs";

/**
 * GRINGA: checkout internacional moderno (en-US) inspirado em PerfectPay/
 * CenterPag/Shopify. Aceita SOMENTE Card + Apple Pay + Google Pay — sem PIX.
 *
 * Características:
 *  - Layout duas colunas em desktop (form esquerda, order summary direita);
 *    1 coluna em mobile com summary colapsável no topo.
 *  - Express checkout (Apple/Google Pay) renderiza no TOPO automaticamente
 *    via Stripe Payment Request quando o device tem wallet disponível.
 *  - Inputs Stripe Elements modernos (focused border, validation inline).
 *  - Lock icon + "Powered by Stripe" no footer pra confiança.
 *  - Suporte a moeda configurável (USD/EUR/GBP) — default USD.
 *  - Mensagens em inglês por padrão (configurável via gringaConfig).
 *
 * Não exibe nenhum elemento brasileiro (PIX, CPF, CEP). Pra produto físico
 * existe o template gringaDrop com address fields.
 */
export function GringaTemplate(p: TemplateProps) {
  const cfg = mergeGringa(p.gringaConfig);
  const c = themeColors(p);
  // Currency default USD pra Gringa
  const currency = (p.currency as string | undefined) ?? "USD";
  const formatPrice = (cents: number) => formatMoney(cents, currency);

  // Toggles do builder (mesma API do builder pt-BR, mas defaults amigáveis
  // pro mercado internacional: nome+email obrigatórios, phone opcional).
  // CPF/CEP NUNCA aparecem em Gringa — força false aqui mesmo se builder
  // tiver setado true (defesa em profundidade — eh um checkout intl).
  const showName = p.fields?.name ?? true;
  const showEmail = p.fields?.email ?? true;
  const showPhone = p.fields?.phone ?? false;

  // Métodos: força APENAS card/apple_pay/google_pay (zero PIX)
  const requestedMethods = p.paymentMethods ?? ["card", "apple_pay", "google_pay"];
  const enabledMethods = requestedMethods.filter((m) =>
    ["card", "apple_pay", "google_pay"].includes(m),
  );
  // Se vier sem nenhum válido, força card
  const finalMethods = enabledMethods.length > 0 ? enabledMethods : ["card"];

  const methodSel = usePaymentMethodSelection(finalMethods);
  const stripeRef = useRef<StripeCardFormHandle>(null);
  const [walletState, setWalletState] = useState<
    "loading" | "available" | "unavailable"
  >("loading");
  const [cardComplete, setCardComplete] = useState(false);
  const [methodError, setMethodError] = useState<string | null>(null);
  const [methodLoading, setMethodLoading] = useState(false);

  const [form, setForm] = useState({
    name: p.prefillName ?? "",
    email: p.prefillEmail ?? "",
    phone: p.prefillPhone ?? "",
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

  const isCardMethod =
    methodSel.selected === "card" ||
    // 11/08/2026: boleto usa o MESMO caminho do cartao hospedado (a
    // adquirente devolve uma URL e o cliente termina fora do nosso dominio),
    // entao entra em todo lugar onde "nao e pix" ja valia.
    methodSel.selected === "boleto" ||
    methodSel.selected === "apple_pay" ||
    methodSel.selected === "google_pay";
  // Wallets express checkout (Apple/Google Pay) renderiza o próprio botão —
  // não precisa do CTA tradicional
  const showCtaButton = !(
    (methodSel.selected === "apple_pay" || methodSel.selected === "google_pay") &&
    walletState === "available"
  );

  // CTA label substitui {AMOUNT} pelo total formatado
  const ctaText = (cfg.ctaLabel || "Pay {AMOUNT}").replace(
    "{AMOUNT}",
    formatPrice(total),
  );

  // Form validation pra habilitar CTA
  const formValid =
    (!showName || form.name.trim().length >= 2) &&
    (!showEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMethodError(null);
    if (!formValid) {
      setMethodError("Please fill in your contact details.");
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
      {/* Top bar com lock icon + "Secure checkout" */}
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
            <span>256-bit SSL</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-10">
          {/* Coluna esquerda: form */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-3 space-y-5 order-2 lg:order-1"
          >
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

            {/* Express checkout / Wallets */}
            {(finalMethods.includes("apple_pay") ||
              finalMethods.includes("google_pay")) &&
              walletState === "available" && (
                <div
                  className="rounded-xl p-5 shadow-sm"
                  style={{ background: c.card }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold" style={{ color: c.text }}>
                        {cfg.walletOptionTitle}
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: c.subtle }}
                      >
                        {cfg.walletOptionSubtitle}
                      </p>
                    </div>
                  </div>
                  <MethodPaymentPanel
                    ref={stripeRef}
                    method={
                      methodSel.selected === "apple_pay"
                        ? "apple_pay"
                        : "google_pay"
                    }
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
                  <div
                    className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-wider"
                    style={{ color: c.subtle }}
                  >
                    <span className="h-px flex-1" style={{ background: c.border }} />
                    <span>or pay with card</span>
                    <span className="h-px flex-1" style={{ background: c.border }} />
                  </div>
                </div>
              )}

            {/* Contact */}
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
                      inputClassName="w-full rounded-lg pl-10 pr-3 py-3 text-sm focus:outline-none transition focus:ring-2"
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
                    className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2"
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
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder={cfg.phonePlaceholder}
                    className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2"
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
            </div>

            {/* Order bumps */}
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

            {/* Payment */}
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

              {showCtaButton && (
                <button
                  type="submit"
                  disabled={
                    methodLoading ||
                    !formValid ||
                    (isCardMethod && !cardComplete)
                  }
                  className="w-full rounded-lg py-4 text-sm font-bold uppercase tracking-wider transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-md active:scale-[0.98] min-h-[52px] inline-flex items-center justify-center gap-2"
                  style={{ background: c.ctaBg, color: c.ctaColor }}
                >
                  {methodLoading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : isCardMethod && !cardComplete ? (
                    <>
                      <CreditCard className="size-4" /> Fill in your card details
                    </>
                  ) : (
                    <>
                      <Lock className="size-4" /> {ctaText}
                    </>
                  )}
                </button>
              )}

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

            {/* Safety + footer */}
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
          </form>

          {/* Coluna direita: order summary (sticky em desktop) */}
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
                Order
              </h3>

              {/* Produto */}
              <div className="flex items-start gap-3 pb-4 border-b" style={{ borderColor: c.border }}>
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

              {/* Selected extras */}
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

              {/* Totals */}
              <div
                className="pt-4 space-y-2 text-sm"
                style={{ color: c.text }}
              >
                <div className="flex items-center justify-between">
                  <span style={{ color: c.subtle }}>Subtotal</span>
                  <span className="tabular-nums">{formatPrice(total)}</span>
                </div>
                <div
                  className="flex items-center justify-between pt-3 border-t"
                  style={{ borderColor: c.border }}
                >
                  <span className="font-bold">Total</span>
                  <span className="font-bold text-lg tabular-nums" style={{ color: c.primary }}>
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
