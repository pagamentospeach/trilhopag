"use client";

import { useState } from "react";
import {
  Loader2,
  ShieldCheck,
  Check,
  Minus,
  Plus,
  ArrowLeft,
} from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { PixResultDisplay } from "./pix-result-modal";
import { usePixFlow } from "./use-pix-flow";
import { mergeDrop } from "./configs";
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
import { useRef } from "react";
import {
  EmailInput,
  PhoneInput,
  maskCpf,
  maskCep,
  useCepLookup,
} from "./smart-inputs";

/**
 * Drop: checkout em ETAPAS REAIS (1=identificação, 2=entrega, 3=pagamento).
 *
 * REGRA IMPORTANTE: drop SEMPRE força isPhysical=true. É um template de
 * produto físico/dropshipping — endereço é obrigatório. O toggle no builder
 * pode ficar visível mas não tem efeito aqui.
 *
 * Bug anterior: o template tinha um stepper visual mas o form era único e
 * submetia tudo de uma vez → PIX era gerado antes do endereço ser pedido.
 * Agora cada step só renderiza seus próprios campos e o submit final
 * (que gera PIX) só acontece quando o user clica no botão do step 3.
 */
export function DropTemplate(p: TemplateProps) {
  const { pix, loading, error, submit, reset } = usePixFlow(
    p.slug,
    p.utm,
    p.variantId,
    p.isPreview,
  );
  const cfg = mergeDrop(p.dropConfig);
  const c = themeColors(p);
  // Formata respeitando moeda do checkout (BRL/USD/EUR).
  const formatBRL = (cents: number) => formatMoney(cents, p.currency || "BRL");
  const [qty, setQty] = useState(1);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [noEmail, setNoEmail] = useState(false);
  const [bumpSelected, setBumpSelected] = useState(false);
  const bumpsV2 = p.orderBumps ?? [];
  const shippingV2 = p.shippingOptions ?? [];
  const extrasState = useBumpsShippingState({
    bumps: bumpsV2,
    shipping: shippingV2,
  });
  const enabledMethods = p.paymentMethods ?? ["pix"];
  const methodSel = usePaymentMethodSelection(enabledMethods);
  const stripeRef = useRef<StripeCardFormHandle>(null);
  const [methodLoading, setMethodLoading] = useState(false);
  // Respeita toggles do builder pros dados do comprador, MAS força isPhysical.
  const showName = p.fields?.name ?? true;
  const showEmail = p.fields?.email ?? true;
  const showPhone = p.fields?.phone ?? false;
  const showCpf = p.fields?.cpf ?? false;
  const showQuantity = p.showQuantity === true;
  // ⚠️ Drop sempre exige endereço — ignora o toggle isPhysical do builder.
  const ENDERECO_OBRIGATORIO = true;

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

  // CEP lookup automático via ViaCEP. Quando o CEP fica válido (8 dígitos),
  // dispara fetch e preenche os outros campos. Se falhar, user preenche à mão.
  const { lookingUp: cepLookingUp, error: cepError } = useCepLookup(
    form.cep,
    (addr) => {
      setForm((f) => ({
        ...f,
        // Só sobrescreve se o user ainda não digitou nada (não atrapalha quem
        // já preencheu antes da resposta do ViaCEP)
        address: f.address || addr.logradouro,
        neighborhood: f.neighborhood || addr.bairro,
        city: f.city || addr.localidade,
        state: f.state || addr.uf,
        complement: f.complement || addr.complemento,
      }));
    },
  );

  // ⚠️ TODOS os useState/hooks ANTES do early return `if (pix)` abaixo!
  // Antes esse `useState` estava lá embaixo, depois do early return — quando
  // pix ficava truthy o componente renderizava menos hooks que antes e
  // detonava React error #300 ("Rendered fewer hooks than expected"), o que
  // fazia o boundary capturar e mostrar "Erro ao gerar pagamento" mesmo
  // com PIX gerado com sucesso no servidor.
  const [stepError, setStepError] = useState<string | null>(null);

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
          onBack={() => {
            reset();
            setStep(3); // volta pra revisão de pagamento
          }}
        />
      </div>
    );
  }

  // Validação por step (server preenche faltantes — aqui só impedimos avançar
  // sem dados visíveis pra UX clara).
  function validateStep1(): string | null {
    if (showEmail && !noEmail) {
      if (!form.email.includes("@") || !form.email.includes(".")) {
        return "Informe um e-mail válido.";
      }
    }
    if (showName && form.name.trim().length < 3) {
      return "Informe seu nome completo.";
    }
    if (showCpf) {
      const cpfDigits = form.cpf.replace(/\D/g, "");
      if (cpfDigits.length !== 11) return "Informe um CPF válido (11 dígitos).";
    }
    if (showPhone) {
      const phoneDigits = form.phone.replace(/\D/g, "");
      if (phoneDigits.length < 10)
        return "Informe um telefone válido (com DDD).";
    }
    return null;
  }

  function validateStep2(): string | null {
    if (form.cep.replace(/\D/g, "").length !== 8)
      return "CEP inválido (8 dígitos).";
    if (form.address.trim().length < 3) return "Informe a rua.";
    if (form.number.trim().length === 0) return "Informe o número.";
    if (form.neighborhood.trim().length < 2) return "Informe o bairro.";
    if (form.city.trim().length < 2) return "Informe a cidade.";
    if (form.state.trim().length !== 2) return "UF deve ter 2 letras.";
    return null;
  }

  function goToStep2() {
    const err = validateStep1();
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setStep(2);
  }

  function goToStep3() {
    const err = validateStep2();
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setStep(3);
  }

  async function generatePix() {
    // Submit final — agora ramifica entre PIX e cartão/wallets via Stripe
    setStepError(null);

    if (methodSel.selected !== "pix") {
      // Não é PIX — Stripe confirm via ref
      setMethodLoading(true);
      try {
        const res = await stripeRef.current?.confirm();
        if (!res?.ok) {
          setStepError(res?.error ?? "Erro ao confirmar pagamento");
        }
      } finally {
        setMethodLoading(false);
      }
      return;
    }

    try {
      // Passa EXPLICITAMENTE só os campos que o hook/API esperam.
      console.log("[drop] generatePix start", { name: form.name, email: form.email });
      const result = await submit({
        name: form.name.trim(),
        email: noEmail ? "" : form.email.trim(),
        phone: form.phone.trim() || undefined,
        cpf: form.cpf.trim() || undefined,
      });
      console.log("[drop] generatePix done", { ok: !!result });
      if (!result) {
        return;
      }
    } catch (e) {
      console.error("[drop] generatePix exception:", e);
      setStepError(
        e instanceof Error
          ? `Erro ao gerar PIX: ${e.message}`
          : "Erro inesperado ao gerar PIX.",
      );
    }
  }

  return (
    <div
      className="min-h-screen pb-[max(0px,env(safe-area-inset-bottom))]"
      style={{ background: c.bg, color: c.text }}
    >
      {/* Top safety bar */}
      <div
        className="px-4 py-3 flex items-center justify-end gap-1.5 text-xs font-bold"
        style={{
          background: c.card,
          color: cfg.safetyHeaderColor,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <ShieldCheck className="size-4" />
        {cfg.safetyHeaderText}
      </div>

      <div className="mx-auto max-w-md px-4 py-5 space-y-4">
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

        {/* Carrinho */}
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: c.card }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold" style={{ color: c.text }}>
              {cfg.cartTitle}
            </h2>
            <span
              className="inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: cfg.cartBadgeColor }}
            >
              {qty}
            </span>
          </div>
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
              <p className="text-sm font-semibold truncate" style={{ color: c.text }}>
                {p.product.name}
              </p>
              {p.product.description && (
                <p className="text-xs truncate" style={{ color: c.subtle }}>
                  {p.product.description}
                </p>
              )}
              {showQuantity && step === 1 && (
                <div
                  className="mt-1.5 inline-flex items-center gap-2 rounded-full px-1.5 py-0.5 text-xs"
                  style={{ background: withOpacity(c.text, 0.06) }}
                >
                  <button
                    type="button"
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    className="hover:opacity-80"
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
                    className="hover:opacity-80"
                    style={{ color: c.subtle }}
                    aria-label="Aumentar quantidade"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div
            className="mt-4 space-y-1 pt-3 text-xs"
            style={{ borderTop: `1px solid ${c.border}` }}
          >
            <div className="flex justify-between" style={{ color: c.subtle }}>
              <span>Subtotal ({qty}x)</span>
              <span>{formatBRL(p.priceCents * qty)}</span>
            </div>
            {bumpPrice > 0 && (
              <div className="flex justify-between" style={{ color: c.subtle }}>
                <span>Order bump</span>
                <span>{formatBRL(bumpPrice)}</span>
              </div>
            )}
            <div className="flex justify-between" style={{ color: c.subtle }}>
              <span>Frete</span>
              <span>—</span>
            </div>
            <div
              className="flex justify-between font-bold pt-1 text-base"
              style={{ color: c.text }}
            >
              <span>Total</span>
              <span>{formatBRL(total)}</span>
            </div>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between text-xs">
          {[cfg.step1Label, cfg.step2Label, cfg.step3Label].map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const active = step >= n;
            const completed = step > n;
            return (
              <div key={n} className="flex items-center gap-1.5 flex-1">
                <button
                  type="button"
                  // Permite voltar pra steps anteriores; bloqueia pular pra frente
                  onClick={() => {
                    if (completed) setStep(n);
                  }}
                  disabled={!completed}
                  className={completed ? "cursor-pointer" : "cursor-default"}
                >
                  <span
                    className="inline-flex size-6 items-center justify-center rounded-full text-[10px] font-bold"
                    style={
                      active
                        ? { background: cfg.stepperActiveColor, color: "#fff" }
                        : { background: withOpacity(c.text, 0.1), color: c.subtle }
                    }
                  >
                    {completed ? <Check className="size-3" /> : n}
                  </span>
                </button>
                <span
                  className="whitespace-nowrap"
                  style={{
                    color: active ? c.text : c.subtle,
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {label}
                </span>
                {i < 2 && (
                  <span
                    className="flex-1 mx-1"
                    style={{ borderTop: `1px dashed ${c.border}` }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* ============ STEP 1 — IDENTIFICAÇÃO ============ */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              className="rounded-2xl p-5 shadow-sm space-y-4"
              style={{ background: c.card }}
            >
              <h2 className="text-base font-bold" style={{ color: c.text }}>
                {cfg.identTitle}
              </h2>
              {showEmail && (
                <div>
                  <label className="text-sm mb-1.5 block" style={{ color: c.text }}>
                    E-mail
                  </label>
                  <EmailInput
                    value={form.email}
                    onChange={(v) => setForm({ ...form, email: v })}
                    placeholder="email@email.com"
                    inputClassName="w-full rounded-lg px-3 py-3 text-sm focus:outline-none disabled:opacity-60"
                    inputStyle={{
                      background: c.card,
                      color: c.text,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: c.border,
                    }}
                  />
                  <label
                    className="mt-2 flex items-center gap-2 text-xs cursor-pointer"
                    style={{ color: c.subtle }}
                  >
                    <input
                      type="checkbox"
                      checked={noEmail}
                      onChange={(e) => setNoEmail(e.target.checked)}
                      className="size-3.5"
                    />
                    {cfg.noEmailLabel}
                  </label>
                </div>
              )}
              {showName && (
                <div>
                  <label className="text-sm mb-1.5 block" style={{ color: c.text }}>
                    Nome completo
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nome e Sobrenome"
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
                  <label className="text-sm mb-1.5 block" style={{ color: c.text }}>
                    Telefone / WhatsApp
                  </label>
                  <PhoneInput
                    value={form.phone}
                    onChange={(v) => setForm({ ...form, phone: v })}
                    inputClassName="flex-1 px-3 py-3 text-sm focus:outline-none rounded-r-lg"
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
                  <label className="text-sm mb-1.5 block" style={{ color: c.text }}>
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
            </div>

            {stepError && (
              <p className="text-center text-xs px-2" style={{ color: "#ef4444" }}>
                {stepError}
              </p>
            )}

            <button
              type="button"
              onClick={goToStep2}
              className="w-full rounded-full py-4 text-sm font-bold uppercase tracking-wider transition hover:opacity-90 shadow-lg active:scale-[0.98] min-h-[56px]"
              style={{ background: c.ctaBg, color: c.ctaColor }}
            >
              Continuar para entrega →
            </button>
          </div>
        )}

        {/* ============ STEP 2 — ENDEREÇO DE ENTREGA (OBRIGATÓRIO) ============ */}
        {step === 2 && ENDERECO_OBRIGATORIO && (
          <div className="space-y-4">
            <div
              className="rounded-2xl p-5 shadow-sm space-y-3"
              style={{ background: c.card }}
            >
              <h2 className="text-base font-bold" style={{ color: c.text }}>
                Endereço de entrega
              </h2>
              <p className="text-xs" style={{ color: c.subtle }}>
                Pra onde devemos enviar seu pedido?
              </p>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.cep}
                    onChange={(e) =>
                      setForm({ ...form, cep: maskCep(e.target.value) })
                    }
                    placeholder="CEP"
                    maxLength={9}
                    className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none"
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
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Rua / Logradouro"
                  className="col-span-2 rounded-lg px-3 py-3 text-sm focus:outline-none"
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
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  placeholder="Nº"
                  className="col-span-1 rounded-lg px-3 py-3 text-sm focus:outline-none"
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
                  placeholder="Complemento (opcional)"
                  className="col-span-2 rounded-lg px-3 py-3 text-sm focus:outline-none"
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
                value={form.neighborhood}
                onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                placeholder="Bairro"
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
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Cidade"
                  className="col-span-2 rounded-lg px-3 py-3 text-sm focus:outline-none"
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
                  maxLength={2}
                  value={form.state}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      state: e.target.value.toUpperCase().slice(0, 2),
                    })
                  }
                  placeholder="UF"
                  className="col-span-1 rounded-lg px-3 py-3 text-sm focus:outline-none uppercase"
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

            {stepError && (
              <p className="text-center text-xs px-2" style={{ color: "#ef4444" }}>
                {stepError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setStepError(null);
                }}
                className="flex-1 rounded-full py-4 text-xs font-medium uppercase tracking-wider inline-flex items-center justify-center gap-1"
                style={{
                  background: withOpacity(c.text, 0.06),
                  color: c.subtle,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: c.border,
                }}
              >
                <ArrowLeft className="size-3" /> Voltar
              </button>
              <button
                type="button"
                onClick={goToStep3}
                className="flex-[2] rounded-full py-4 text-sm font-bold uppercase tracking-wider transition hover:opacity-90 shadow-lg"
                style={{ background: c.ctaBg, color: c.ctaColor }}
              >
                Continuar para pagamento →
              </button>
            </div>
          </div>
        )}

        {/* ============ STEP 3 — PAGAMENTO (GERAÇÃO DO PIX) ============ */}
        {step === 3 && (
          <div className="space-y-4">
            <div
              className="rounded-2xl p-5 shadow-sm space-y-3"
              style={{ background: c.card }}
            >
              <h2 className="text-base font-bold" style={{ color: c.text }}>
                Confirmar e pagar
              </h2>

              {/* Seletor de método de pagamento (só aparece com >1 método) */}
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

              {methodSel.selected !== "pix" && (
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
                />
              )}

              {/* Resumo dos dados anteriores */}
              <div
                className="rounded-lg p-3 text-xs space-y-1"
                style={{
                  background: withOpacity(c.text, 0.04),
                  color: c.text,
                }}
              >
                {showName && (
                  <p>
                    <span style={{ color: c.subtle }}>Nome:</span>{" "}
                    <strong>{form.name}</strong>
                  </p>
                )}
                {showEmail && !noEmail && (
                  <p>
                    <span style={{ color: c.subtle }}>E-mail:</span>{" "}
                    <strong>{form.email}</strong>
                  </p>
                )}
                <p className="pt-1 mt-1" style={{ borderTop: `1px solid ${c.border}` }}>
                  <span style={{ color: c.subtle }}>Entrega:</span>
                </p>
                <p className="text-[11px]" style={{ color: c.subtle }}>
                  {form.address}, {form.number}
                  {form.complement && ` (${form.complement})`}
                  <br />
                  {form.neighborhood} — {form.city}/{form.state} — CEP{" "}
                  {form.cep}
                </p>
              </div>

              {/* Garantias */}
              <div
                className="rounded-lg p-3 text-xs"
                style={{
                  background: withOpacity(c.text, 0.04),
                  color: c.text,
                  borderWidth: 2,
                  borderStyle: "dashed",
                  borderColor: c.border,
                }}
              >
                <p className="font-semibold mb-2" style={{ color: c.text }}>
                  {cfg.warrantyTitle}
                </p>
                <div className="space-y-1.5">
                  {cfg.warrantyItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Check
                        className="size-3.5"
                        style={{ color: cfg.stepperActiveColor }}
                      />
                      <span style={{ color: c.text }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* OrderBump legado (single) */}
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

            {(error || stepError) && (
              <p className="text-center text-xs px-2" style={{ color: "#ef4444" }}>
                {error || stepError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={loading}
                className="flex-1 rounded-full py-4 text-xs font-medium uppercase tracking-wider inline-flex items-center justify-center gap-1 disabled:opacity-50"
                style={{
                  background: withOpacity(c.text, 0.06),
                  color: c.subtle,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: c.border,
                }}
              >
                <ArrowLeft className="size-3" /> Voltar
              </button>
              {!(
                methodSel.selected === "apple_pay" ||
                methodSel.selected === "google_pay"
              ) && (
                <button
                  type="button"
                  onClick={generatePix}
                  disabled={loading || methodLoading}
                  className="flex-[2] rounded-full py-4 text-sm font-bold uppercase tracking-wider transition hover:opacity-90 disabled:opacity-50 shadow-lg"
                  style={{ background: c.ctaBg, color: c.ctaColor }}
                >
                  {loading || methodLoading ? (
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  ) : (
                    `${cfg.ctaLabelPrefix}${formatBRL(total)}`
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
