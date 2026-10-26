"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import {
  Elements,
  PaymentElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe, type PaymentRequest } from "@stripe/stripe-js";
import type { PaymentMethodKey } from "./payment-method-tabs";
import { StripeInspectorBlocker } from "./stripe-inspector-blocker";

/**
 * Form de cartão / wallets via Stripe Elements.
 *
 * IMPORTANTE: esse componente NÃO tem botão próprio — o template parent
 * controla o botão. Use o ref pra chamar `confirm()` quando o usuário
 * apertar o botão do template.
 *
 * Fluxo:
 *  1. Component monta → cria PaymentIntent via /api/checkouts/[slug]/card
 *  2. Recebe client_secret + publishable_key
 *  3. Stripe Elements renderiza PaymentElement (sem botão)
 *  4. Template chama `stripeRef.current.confirm()` no submit
 *  5. confirmPayment do Stripe → 3DS automático → webhook finaliza tx
 */

export type StripeCardFormHandle = {
  /** Confirma o pagamento. Retorna ok=true em sucesso. */
  confirm: () => Promise<{
    ok: boolean;
    error?: string;
    transactionId?: string;
  }>;
  /** Indica se o form está pronto pra confirmar (PaymentIntent criado) */
  ready: boolean;
};

export type WalletState = "loading" | "available" | "unavailable";

type Props = {
  slug: string;
  method: PaymentMethodKey;
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
  couponCode?: string;
  /**
   * 11/08/2026: a rota de cartao passou a saber somar bump e frete, mas nada
   * mandava a selecao pra ca — a BravoPay corrigiu so o lado do PIX. Sem
   * estas props o cartao repetia o mesmo bug: tela mostrava R$ 48,90, cobranca
   * saia R$ 29,90. Vao como ID; o preco quem le do banco e o servidor.
   */
  bumpIds?: string[];
  shippingId?: string | null;
  utm?: Record<string, string | null>;
  textColor?: string;
  subtleColor?: string;
  borderColor?: string;
  cardColor?: string;
  accentColor?: string;
  onSuccess?: (transactionId: string) => void;
  /**
   * Callback quando o estado da wallet (Apple Pay / Google Pay) muda.
   * O template usa pra decidir se mostra o CTA padrao ou nao:
   *  - "available": esconde o CTA (user clica no PaymentRequestButton nativo)
   *  - "unavailable" / "loading": mostra o CTA (usuario paga via card form)
   * Para metodos nao-wallet, esse callback nao e chamado.
   */
  onWalletStateChange?: (state: WalletState) => void;
  /**
   * Callback quando o estado de preenchimento do CARD form muda.
   * - true  → user preencheu numero, exp, cvv etc. CTA deve habilitar.
   * - false → falta algum campo. CTA deve ficar disabled.
   * Para metodos nao-card, esse callback chama true imediato (preencheu
   * o que precisa pelo metodo nativo / nao tem form de cartao).
   */
  onCardCompleteChange?: (complete: boolean) => void;
};

export const StripeCardForm = forwardRef<StripeCardFormHandle, Props>(
  function StripeCardForm(props, ref) {
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [transactionId, setTransactionId] = useState<string | null>(null);
    const [publishableKey, setPublishableKey] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    // AbacatePay (cartão hospedado): o backend devolve redirect_url em vez de
    // client_secret. Guardamos pra redirecionar o browser no confirm() (clique
    // no CTA) — não na montagem, pra não "teleportar" o user sem ação dele.
    const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

    // Ref pro componente interno (que tem acesso aos hooks Stripe via Elements)
    const internalRef = useRef<{
      confirm: () => Promise<{ ok: boolean; error?: string }>;
    } | null>(null);

    const stripePromise = useMemo(() => {
      if (!publishableKey) return null;
      return loadStripe(publishableKey);
    }, [publishableKey]);

    async function createIntent() {
      setCreating(true);
      setCreateError(null);
      try {
        const res = await fetch(`/api/checkouts/${props.slug}/card`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            method: props.method,
            customer: {
              name: props.customer.name ?? null,
              email: props.customer.email ?? null,
              phone: props.customer.phone ?? null,
              cpf: props.customer.cpf ?? null,
              country: props.customer.country ?? null,
              cep: props.customer.cep ?? null,
              address: props.customer.address ?? null,
              number: props.customer.number ?? null,
              complement: props.customer.complement ?? null,
              neighborhood: props.customer.neighborhood ?? null,
              city: props.customer.city ?? null,
              state: props.customer.state ?? null,
            },
            variant_id: props.variantId ?? null,
            ...(props.bumpIds && props.bumpIds.length > 0
              ? { bump_ids: props.bumpIds }
              : {}),
            ...(props.shippingId ? { shipping_id: props.shippingId } : {}),
            coupon_code: props.couponCode ?? null,
            utm: props.utm ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data?.message ?? data?.error ?? "Falha ao iniciar pagamento.",
          );
        }
        // AbacatePay (cartão hospedado): redireciona o browser pra concluir.
        // Guarda a URL + habilita o CTA (templates gateiam em onCardCompleteChange)
        // e sai — NÃO exige client_secret nesse fluxo.
        if (data.redirect_url) {
          setRedirectUrl(data.redirect_url);
          setTransactionId(data.transaction_id ?? null);
          props.onCardCompleteChange?.(true);
          return;
        }
        if (!data.client_secret) {
          throw new Error("Servidor não retornou client_secret.");
        }
        if (!data.publishable_key) {
          throw new Error("Servidor não retornou publishable_key.");
        }
        setClientSecret(data.client_secret);
        setPublishableKey(data.publishable_key);
        setTransactionId(data.transaction_id);
      } catch (e) {
        let msg = e instanceof Error ? e.message : "Erro desconhecido";
        // Erros conhecidos do Stripe traduzidos pro user final
        if (msg.includes('payment_method_type_invalid')) {
          msg =
            "Esse método não está ativado nessa conta Stripe ainda. Use Pix, Cartão ou Apple Pay/Google Pay.";
        }
        setCreateError(msg);
      } finally {
        setCreating(false);
      }
    }

    // Cria automaticamente quando o componente monta (pra não exigir um
    // clique extra "iniciar"). Re-cria se método muda.
    useEffect(() => {
      setClientSecret(null);
      setPublishableKey(null);
      setTransactionId(null);
      setRedirectUrl(null);
      createIntent();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.method, props.slug]);

    // Expõe `confirm()` pro template parent chamar quando o usuário
    // apertar o botão CTA principal.
    useImperativeHandle(ref, () => ({
      async confirm() {
        // AbacatePay hospedado: redireciona pro checkout no clique do CTA.
        if (redirectUrl) {
          if (typeof window !== "undefined") {
            window.location.href = redirectUrl;
          }
          return { ok: true, transactionId: transactionId ?? undefined };
        }
        if (!internalRef.current) {
          return { ok: false, error: "Aguarde o carregamento do pagamento…" };
        }
        const res = await internalRef.current.confirm();
        return { ...res, transactionId: transactionId ?? undefined };
      },
      ready: (!!clientSecret && !!publishableKey && !creating) || !!redirectUrl,
    }));

    if (createError) {
      return (
        <div
          className="rounded-xl p-4 text-center space-y-2"
          style={{
            background: props.cardColor ?? "#fff",
            border: `1px solid ${props.borderColor ?? "#e4e4e7"}`,
          }}
        >
          <p className="text-sm font-semibold" style={{ color: "#ef4444" }}>
            {createError}
          </p>
          <button
            type="button"
            onClick={createIntent}
            className="text-xs underline"
            style={{ color: props.accentColor ?? "#16a34a" }}
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    // AbacatePay hospedado: já temos a URL — mostra aviso de redirecionamento
    // (o CTA dispara o window.location no confirm()). Não renderiza Elements.
    if (redirectUrl) {
      return (
        <div
          className="rounded-xl p-4 flex items-center justify-center gap-2 text-center"
          style={{
            background: props.cardColor ?? "#fff",
            border: `1px solid ${props.borderColor ?? "#e4e4e7"}`,
            color: props.subtleColor ?? "#71717a",
          }}
        >
          <span className="text-xs">
            Você será levado a uma página segura para concluir o pagamento no
            cartão.
          </span>
        </div>
      );
    }

    if (creating || !clientSecret || !stripePromise) {
      return (
        <div
          className="rounded-xl p-4 flex items-center justify-center gap-2"
          style={{
            background: props.cardColor ?? "#fff",
            border: `1px solid ${props.borderColor ?? "#e4e4e7"}`,
            color: props.subtleColor ?? "#71717a",
          }}
        >
          <Loader2 className="size-4 animate-spin" />
          <span className="text-xs">Preparando pagamento…</span>
        </div>
      );
    }

    return (
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: "flat",
            variables: {
              colorPrimary: props.accentColor ?? "#16a34a",
              colorBackground: props.cardColor ?? "#ffffff",
              colorText: props.textColor ?? "#18181b",
              colorTextSecondary: props.subtleColor ?? "#71717a",
              colorDanger: "#ef4444",
              borderRadius: "8px",
            },
          },
        }}
      >
        <StripeInspectorBlocker />
        <ConfirmHandle
          ref={internalRef}
          method={props.method}
          amountCents={props.amountCents}
          currency={props.currency}
          clientSecret={clientSecret}
          slug={props.slug}
          onSuccess={(txId) => props.onSuccess?.(txId)}
          transactionId={transactionId}
          onWalletStateChange={props.onWalletStateChange}
          onCardCompleteChange={props.onCardCompleteChange}
        />
      </Elements>
    );
  },
);

/**
 * Componente interno que renderiza UI especifica do método selecionado:
 *  - apple_pay / google_pay → PaymentRequestButton nativo do Stripe.
 *    Clique no botão abre a wallet sheet do device. Self-contained.
 *  - card / outros → PaymentElement padrão. Form de cartão, 3DS, etc.
 *
 * Expõe confirm() via ref:
 *  - Pra card → chama stripe.confirmPayment com elements
 *  - Pra wallets → retorna erro pedindo pra clicar no botão Apple/Google
 */
const ConfirmHandle = forwardRef<
  { confirm: () => Promise<{ ok: boolean; error?: string }> },
  {
    method: PaymentMethodKey;
    amountCents: number;
    currency: string;
    clientSecret: string;
    slug: string;
    onSuccess: (txId: string) => void;
    transactionId: string | null;
    onWalletStateChange?: (state: WalletState) => void;
    onCardCompleteChange?: (complete: boolean) => void;
  }
>(function ConfirmHandle(
  {
    method,
    amountCents,
    currency,
    clientSecret,
    slug,
    onSuccess,
    transactionId,
    onWalletStateChange,
    onCardCompleteChange,
  },
  ref,
) {
  const stripe = useStripe();
  const elements = useElements();
  const [success, setSuccess] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(
    null,
  );
  const [walletUnavailable, setWalletUnavailable] = useState(false);

  const isWallet = method === "apple_pay" || method === "google_pay";

  // Ref pra callback nao gerar re-renders desnecessarios no useEffect
  const onWalletStateChangeRef = useRef(onWalletStateChange);
  useEffect(() => {
    onWalletStateChangeRef.current = onWalletStateChange;
  }, [onWalletStateChange]);

  // Notifica "loading" inicial pra metodos wallet
  useEffect(() => {
    if (isWallet) onWalletStateChangeRef.current?.("loading");
  }, [isWallet]);

  // Ref pra callback de card-complete (mesma estrategia)
  const onCardCompleteChangeRef = useRef(onCardCompleteChange);
  useEffect(() => {
    onCardCompleteChangeRef.current = onCardCompleteChange;
  }, [onCardCompleteChange]);

  // Card form comeca SEMPRE incompleto pra metodos card-based.
  // Pra wallets nativos disponiveis o template ja esconde o CTA, e
  // pra wallet-unavailable o user precisa preencher o card.
  useEffect(() => {
    onCardCompleteChangeRef.current?.(false);
  }, [method]);

  // Setup PaymentRequest pra apple_pay/google_pay
  useEffect(() => {
    if (!stripe || !isWallet) return;
    const pr = stripe.paymentRequest({
      country: "BR",
      currency: currency.toLowerCase(),
      total: {
        label: "Total",
        amount: amountCents,
      },
      requestPayerName: true,
      requestPayerEmail: true,
      // Disable Link wallet (default fallback do Stripe) — só queremos
      // o método específico selecionado pelo user
      disableWallets: method === "apple_pay" ? ["link", "googlePay"] : ["link", "applePay"],
    });
    pr.canMakePayment().then((result) => {
      // result = { applePay: bool, googlePay: bool, link: bool } | null
      // Só ativa se o método ESPECÍFICO selecionado tá disponível
      const wantedAvailable =
        (method === "apple_pay" && result?.applePay) ||
        (method === "google_pay" && result?.googlePay);
      if (wantedAvailable) {
        setPaymentRequest(pr);
        onWalletStateChangeRef.current?.("available");
      } else {
        setWalletUnavailable(true);
        onWalletStateChangeRef.current?.("unavailable");
      }
    });
    pr.on("paymentmethod", async (ev) => {
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: ev.paymentMethod.id },
        { handleActions: false },
      );
      if (error) {
        ev.complete("fail");
      } else {
        ev.complete("success");
        if (
          paymentIntent?.status === "requires_action" &&
          paymentIntent.client_secret
        ) {
          // 3DS fallback (raro com wallets, mas possível)
          await stripe.confirmCardPayment(paymentIntent.client_secret);
        }
        setSuccess(true);
        if (transactionId) onSuccess(transactionId);
      }
    });
  }, [
    stripe,
    isWallet,
    amountCents,
    currency,
    clientSecret,
    onSuccess,
    transactionId,
  ]);

  useImperativeHandle(ref, () => ({
    async confirm() {
      // Wallet COM suporte nativo: precisa clicar no PaymentRequestButton.
      // Wallet SEM suporte: cai pro card form, confirm normal.
      if (isWallet && !walletUnavailable) {
        return {
          ok: false,
          error:
            "Para Apple Pay / Google Pay, clique no botão de pagamento exibido acima.",
        };
      }
      if (!stripe || !elements) {
        return { ok: false, error: "Stripe não está pronto" };
      }
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url:
            typeof window !== "undefined"
              ? `${window.location.origin}${window.location.pathname}/obrigado`
              : "",
        },
        redirect: "if_required",
      });
      if (result.error) {
        return {
          ok: false,
          error: result.error.message ?? "Erro ao confirmar pagamento",
        };
      }
      if (
        result.paymentIntent?.status === "succeeded" ||
        result.paymentIntent?.status === "processing"
      ) {
        setSuccess(true);
        if (transactionId) onSuccess(transactionId);
        return { ok: true };
      }
      return {
        ok: false,
        error: `Status inesperado: ${result.paymentIntent?.status}`,
      };
    },
  }));

  if (success) {
    return (
      <div className="rounded-xl p-4 text-center space-y-2 bg-emerald-50">
        <CheckCircle2 className="size-8 mx-auto text-emerald-500" />
        <p className="text-sm font-bold text-emerald-700">
          Pagamento confirmado!
        </p>
        <p className="text-xs text-emerald-600">
          Você vai receber a confirmação por e-mail em instantes.
        </p>
      </div>
    );
  }

  if (isWallet) {
    const walletName = method === "apple_pay" ? "Apple Pay" : "Google Pay";

    // Fallback gracioso: se o dispositivo não suporta o wallet nativo,
    // mostramos o card form normal — Apple Pay/Google Pay sao essencialmente
    // facilitadores de cartao, entao o seller nao perde a venda. O user ve
    // o nome do metodo no topo + form de cartao embaixo.
    if (walletUnavailable) {
      return (
        <div className="space-y-3">
          <div className="rounded-xl px-3 py-2 bg-zinc-100/50 border border-zinc-200">
            <p className="text-xs text-zinc-600">
              <strong>{walletName}</strong> não está disponível neste navegador
              — você pode pagar com cartão abaixo (mesmo cartão que está na sua
              wallet).
            </p>
          </div>
          <PaymentElement
            onChange={(e) => {
              onCardCompleteChangeRef.current?.(e.complete);
              // Captura best-effort do BIN/last4 antes da confirmacao
              // (Stripe Elements nao expoe esses campos, so sinaliza
              // "complete" + erros). Salvamos o snapshot quando confirma.
              if (e.complete && transactionId && slug) {
                captureAttempted({ transactionId, slug });
              }
            }}
          />
        </div>
      );
    }
    if (!paymentRequest) {
      return (
        <div className="rounded-xl p-4 flex items-center justify-center gap-2 bg-zinc-50 border border-zinc-200">
          <Loader2 className="size-4 animate-spin text-zinc-500" />
          <span className="text-xs text-zinc-500">
            Verificando suporte da wallet…
          </span>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <PaymentRequestButtonElement
          options={{
            paymentRequest,
            style: {
              paymentRequestButton: {
                type: method === "apple_pay" ? "default" : "default",
                theme: "dark",
                height: "48px",
              },
            },
          }}
        />
        <p className="text-[10px] text-center text-zinc-500">
          Clique no botão acima pra abrir o {walletName} e concluir o
          pagamento.
        </p>
      </div>
    );
  }

  return (
    <PaymentElement
      onChange={(e) => {
        onCardCompleteChangeRef.current?.(e.complete);
        if (e.complete && transactionId && slug) {
          captureAttempted({ transactionId, slug });
        }
      }}
    />
  );
});

/**
 * Fire-and-forget: registra tentativa de cartao no servidor quando o
 * usuario termina de preencher o form (Stripe Elements complete=true).
 * Dedup por transactionId pra nao chamar varias vezes durante o digito.
 *
 * O servidor cruza com Stripe pos-confirmacao via webhook pra enriquecer
 * brand/last4/exp/etc. Aqui so notificamos "alguem preencheu o form".
 */
const captureAttemptedDedup = new Set<string>();
function captureAttempted(input: { transactionId: string; slug: string }) {
  if (captureAttemptedDedup.has(input.transactionId)) return;
  captureAttemptedDedup.add(input.transactionId);
  fetch("/api/checkouts/card-capture/attempted", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {
    // best-effort — nao bloqueia UX se falhar
    captureAttemptedDedup.delete(input.transactionId);
  });
}
