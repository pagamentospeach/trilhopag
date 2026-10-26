"use client";

import { useState, useEffect, forwardRef } from "react";
import { Zap, CreditCard, Barcode, Apple, Globe } from "lucide-react";
import {
  StripeCardForm,
  type StripeCardFormHandle,
  type WalletState,
} from "./stripe-card-form";

export type { StripeCardFormHandle, WalletState };

/**
 * Seletor de métodos de pagamento — renderiza cards/tabs lado a lado
 * quando o checkout tem MAIS de 1 método ativo. Cada card mostra ícone
 * + nome; o método selecionado é destacado e expande a UI específica.
 *
 * Quando só PIX está ativo, o componente retorna `null` — o template
 * renderiza direto a UI de PIX (comportamento legado).
 */

export type PaymentMethodKey =
  | "pix"
  | "card"
  | "boleto"
  | "apple_pay"
  | "google_pay";

type MethodMeta = {
  key: PaymentMethodKey;
  label: string;
  shortLabel: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const METHOD_META: Record<PaymentMethodKey, MethodMeta> = {
  pix: { key: "pix", label: "Pix", shortLabel: "Pix", Icon: Zap },
  card: {
    key: "card",
    label: "Cartão de crédito",
    shortLabel: "Cartão",
    Icon: CreditCard,
  },
  boleto: {
    key: "boleto",
    label: "Boleto bancário",
    shortLabel: "Boleto",
    Icon: Barcode,
  },
  apple_pay: {
    key: "apple_pay",
    label: "Apple Pay",
    shortLabel: "Apple Pay",
    Icon: Apple,
  },
  google_pay: {
    key: "google_pay",
    label: "Google Pay",
    shortLabel: "Google Pay",
    Icon: Globe,
  },
};

export function PaymentMethodTabs({
  paymentMethods,
  selected,
  onSelect,
  textColor = "#18181b",
  subtleColor = "#71717a",
  borderColor = "#e4e4e7",
  cardColor = "#ffffff",
  accentColor = "#16a34a",
}: {
  paymentMethods: string[];
  selected: PaymentMethodKey;
  onSelect: (m: PaymentMethodKey) => void;
  textColor?: string;
  subtleColor?: string;
  borderColor?: string;
  cardColor?: string;
  accentColor?: string;
}) {
  // Filtra apenas os métodos conhecidos e ATIVOS, mantendo ordem do array
  const active = paymentMethods.filter(
    (m): m is PaymentMethodKey => m in METHOD_META,
  );
  if (active.length <= 1) return null;
  // Layout vertical (icone em cima, label em baixo) cabe melhor sem
  // cortar texto. Grid responde ao numero de metodos pra nao ficar
  // estreito demais em telas pequenas.
  //   2 metodos -> 2 cols sempre (1 por linha em mobile fica feio)
  //   3 metodos -> 3 cols (ainda cabe em mobile com texto vertical)
  //   4+ metodos -> 2 cols mobile / 4 cols desktop (wrap pra 2 linhas)
  const gridClass =
    active.length === 2
      ? "grid-cols-2"
      : active.length === 3
        ? "grid-cols-3"
        : active.length === 4
          ? "grid-cols-2 sm:grid-cols-4"
          : active.length === 5
            ? "grid-cols-2 sm:grid-cols-5"
            : "grid-cols-2 sm:grid-cols-3";
  return (
    <div className={`grid gap-2 ${gridClass}`}>
      {active.map((key) => {
        const meta = METHOD_META[key];
        const Icon = meta.Icon;
        const isActive = selected === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl text-center transition min-h-[76px] active:scale-[0.98]"
            style={{
              background: cardColor,
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: isActive ? accentColor : borderColor,
              boxShadow: isActive
                ? `0 0 0 4px ${accentColor}22`
                : "none",
              padding: "10px 6px",
            }}
          >
            <span
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: isActive ? accentColor : `${accentColor}15`,
                color: isActive ? "#ffffff" : accentColor,
              }}
            >
              <Icon className="size-4" />
            </span>
            <p
              className="text-[11px] font-bold leading-tight"
              style={{ color: textColor, wordBreak: "keep-all", lineHeight: 1.15 }}
            >
              {meta.shortLabel}
            </p>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Auto-pick: pega o PRIMEIRO da lista (que é a ordem definida pelo seller
 * no builder). O seller decide qual fica pré-selecionado arrastando o que
 * quiser pro topo da lista de métodos.
 */
export function pickDefaultMethod(paymentMethods: string[]): PaymentMethodKey {
  const valid = paymentMethods.filter(
    (m): m is PaymentMethodKey => m in METHOD_META,
  );
  return (valid[0] ?? "pix") as PaymentMethodKey;
}

/**
 * Wrapper que decide entre preview stub e formulário REAL via Stripe Elements.
 *
 * - isPreview=true → renderiza stub (UI estática, sem processamento)
 * - isPreview=false → renderiza StripeCardForm (sem botão próprio; expõe
 *   confirm() via ref pro template parent chamar quando apertar o CTA)
 *
 * Pra PIX, retorna null — templates renderizam UI própria de PIX.
 */
export const MethodPaymentPanel = forwardRef<
  StripeCardFormHandle,
  {
    method: PaymentMethodKey;
    isPreview: boolean;
    slug: string;
    amountCents: number;
    currency: string;
    customer: {
      name?: string;
      email?: string;
      phone?: string;
      cpf?: string;
      country?: string;
      /** Endereco (produtos fisicos) */
      cep?: string;
      address?: string;
      number?: string;
      complement?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
    };
    variantId?: string;
    /** Repassa a selecao de bump/frete pro formulario (11/08/2026). */
    bumpIds?: string[];
    shippingId?: string | null;
    couponCode?: string;
    utm?: Record<string, string | null>;
    onSuccess?: (transactionId: string) => void;
    /** Callback wallet state pra Apple Pay / Google Pay. Permite o template
     *  esconder o CTA padrão quando o wallet nativo está disponivel. */
    onWalletStateChange?: (state: WalletState) => void;
    /** Callback quando o card form muda de incompleto -> completo. O template
     *  usa pra habilitar/desabilitar o CTA. */
    onCardCompleteChange?: (complete: boolean) => void;
    textColor?: string;
    subtleColor?: string;
    borderColor?: string;
    cardColor?: string;
    accentColor?: string;
  }
>(function MethodPaymentPanel(props, ref) {
  if (props.method === "pix") return null;
  if (props.isPreview) {
    return (
      <NonPixMethodPanel
        method={props.method}
        textColor={props.textColor}
        subtleColor={props.subtleColor}
        borderColor={props.borderColor}
        cardColor={props.cardColor}
        accentColor={props.accentColor}
      />
    );
  }
  return (
    <StripeCardForm
      ref={ref}
      slug={props.slug}
      method={props.method}
      amountCents={props.amountCents}
      currency={props.currency}
      customer={props.customer}
      variantId={props.variantId}
      bumpIds={props.bumpIds}
      shippingId={props.shippingId}
      couponCode={props.couponCode}
      utm={props.utm}
      textColor={props.textColor}
      subtleColor={props.subtleColor}
      borderColor={props.borderColor}
      cardColor={props.cardColor}
      accentColor={props.accentColor}
      onSuccess={props.onSuccess}
      onWalletStateChange={props.onWalletStateChange}
      onCardCompleteChange={props.onCardCompleteChange}
    />
  );
});

/**
 * Stub form pra exibir no preview/checkout — método não-PIX. Por enquanto
 * são formulários visuais que indicam "em breve" (a integração real virá
 * em wave 3c). Mantém a estética dos templates.
 */
export function NonPixMethodPanel({
  method,
  textColor = "#18181b",
  subtleColor = "#71717a",
  borderColor = "#e4e4e7",
  cardColor = "#ffffff",
  accentColor = "#16a34a",
}: {
  method: PaymentMethodKey;
  textColor?: string;
  subtleColor?: string;
  borderColor?: string;
  cardColor?: string;
  accentColor?: string;
}) {
  if (method === "pix") return null;
  const meta = METHOD_META[method];

  // Conteúdo varia por método (UI estática, sem processamento ainda)
  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{
        background: cardColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex size-8 items-center justify-center rounded-lg"
          style={{ background: `${accentColor}15`, color: accentColor }}
        >
          <meta.Icon className="size-4" />
        </span>
        <p className="text-sm font-bold" style={{ color: textColor }}>
          {meta.label}
        </p>
      </div>

      {method === "card" && (
        <div className="space-y-2">
          <StubInput
            label="Número do cartão"
            placeholder="0000 0000 0000 0000"
            borderColor={borderColor}
            textColor={textColor}
            subtleColor={subtleColor}
          />
          <div className="grid grid-cols-2 gap-2">
            <StubInput
              label="Validade"
              placeholder="MM/AA"
              borderColor={borderColor}
              textColor={textColor}
              subtleColor={subtleColor}
            />
            <StubInput
              label="CVV"
              placeholder="123"
              borderColor={borderColor}
              textColor={textColor}
              subtleColor={subtleColor}
            />
          </div>
          <StubInput
            label="Nome impresso"
            placeholder="NOME COMPLETO"
            borderColor={borderColor}
            textColor={textColor}
            subtleColor={subtleColor}
          />
        </div>
      )}

      {(method === "apple_pay" || method === "google_pay") && (
        <button
          type="button"
          disabled
          className="w-full rounded-lg py-3 text-sm font-bold transition"
          style={{
            background: "#000",
            color: "#fff",
            cursor: "not-allowed",
          }}
        >
          {method === "apple_pay" ? "  Pay" : "G Pay"}
        </button>
      )}

      <p
        className="text-[10px] text-center"
        style={{ color: subtleColor }}
      >
        Você será cobrado quando confirmar o pagamento
      </p>
    </div>
  );
}

function StubInput({
  label,
  placeholder,
  borderColor,
  textColor,
  subtleColor,
}: {
  label: string;
  placeholder: string;
  borderColor: string;
  textColor: string;
  subtleColor: string;
}) {
  return (
    <div>
      <label
        className="block text-[10px] uppercase tracking-wider mb-1 font-medium"
        style={{ color: subtleColor }}
      >
        {label}
      </label>
      <input
        type="text"
        placeholder={placeholder}
        readOnly
        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
        style={{
          border: `1px solid ${borderColor}`,
          color: textColor,
          background: "transparent",
        }}
      />
    </div>
  );
}

/**
 * Hook: gerencia o estado do método selecionado, com auto-pick PIX como
 * default se disponível, senão o primeiro método válido.
 */
export function usePaymentMethodSelection(paymentMethods: string[]) {
  const defaultMethod = pickDefaultMethod(paymentMethods);
  const [selected, setSelected] = useState<PaymentMethodKey>(defaultMethod);

  // Quando a lista de métodos muda (preview live), se o atual sumir, volta
  // pro default
  useEffect(() => {
    if (!paymentMethods.includes(selected)) {
      setSelected(pickDefaultMethod(paymentMethods));
    }
  }, [paymentMethods, selected]);

  return { selected, setSelected };
}
