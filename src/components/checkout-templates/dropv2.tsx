"use client";

/**
 * Template DROPV2 — checkout em 3 steps clean (estilo dropshipping nacional).
 *
 * Inspirado no padrão "Identifique-se → Entrega → Pagamento":
 * - Card "Seu carrinho" sempre visível no topo (mini-product + qty +/-)
 * - Step 1 (azul):  Nome, Email, Telefone, CPF → "IR PARA A ENTREGA"
 * - Step 2 (verde): CEP → preenche endereço via ViaCEP → "IR PARA O PAGAMENTO"
 * - Step 3:         Gera PIX automaticamente, QR + Copia & Cola, polling rápido
 *
 * Performance:
 * - PIX é PRÉ-AQUECIDO (POST em background) assim que CPF é digitado completo
 * - Polling com Web Visibility API (pausa quando tab oculta)
 * - Polling adaptativo: 1.2s nos primeiros 30s, 3s depois
 * - Redirect imediato na detecção de PAID (sem confirmação intermediária)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  User2,
  Truck,
  CreditCard,
  Loader2,
  Check,
  Minus,
  Plus,
  ShieldCheck,
  Copy,
  CheckCircle2,
  AlertCircle,
  QrCode,
} from "lucide-react";
import { formatMoney } from "@/lib/utils";
import type { TemplateProps } from "./types";
import { usePixFlow } from "./use-pix-flow";
import { ReceiptUpload } from "./receipt-upload";
import {
  EmailInput as SmartEmailInput,
  PhoneInput as SmartPhoneInput,
} from "./smart-inputs";

type StepKey = "identify" | "shipping" | "payment";

export function DropV2Template(p: TemplateProps) {
  const { pix, loading, error, submit, reset } = usePixFlow(
    p.slug,
    p.utm,
    p.variantId,
    p.isPreview,
  );

  // Formata respeitando moeda do checkout (BRL/USD/EUR).
  const formatBRL = (cents: number) => formatMoney(cents, p.currency || "BRL");

  // Respeita toggles do builder (defaults compatíveis com legado)
  const showName = p.fields?.name ?? true;
  const showEmail = p.fields?.email ?? true;
  const showPhone = p.fields?.phone ?? false;
  const showCpf = p.fields?.cpf ?? false;
  // ⚠️ DropV2 SEMPRE força endereço (produto físico) — ignora toggle do builder.
  // Mesmo se theme.isPhysical for false, dropv2 mostra step de entrega.
  const showCep = true;
  const showShippingStep = true;
  const showQuantity = p.showQuantity === true;

  // Step state
  const [step, setStep] = useState<StepKey>("identify");

  // Cart qty (visual; price não muda). Se !showQuantity, fixo em 1.
  const [qty, setQty] = useState(1);

  // Form: identificação
  const [name, setName] = useState(p.prefillName ?? "");
  const [email, setEmail] = useState(p.prefillEmail ?? "");
  const [phone, setPhone] = useState(p.prefillPhone ?? "");
  const [cpf, setCpf] = useState(p.prefillCpf ?? "");

  // Form: entrega
  const [cep, setCep] = useState("");
  const [address, setAddress] = useState("");
  const [number, setNumber] = useState("");
  const [noNumber, setNoNumber] = useState(false);
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country] = useState("Brasil");

  const [cepLookingUp, setCepLookingUp] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  // Pre-warm: dispara PIX em background quando identificação está completa
  // (assim quando user clicar em "IR PARA O PAGAMENTO" o PIX já tá pronto)
  const prewarmFired = useRef(false);
  const tryPrewarm = useCallback(() => {
    if (prewarmFired.current) return;
    // Pre-warm exige somente os campos visíveis (CPF/email se ativos).
    if (showName && !name.trim()) return;
    if (showEmail && !email.includes("@")) return;
    if (showCpf && cpf.replace(/\D/g, "").length < 11) return;
    prewarmFired.current = true;
    // sem await — fire and forget. Se falhar, o submit() final cuida.
    submit({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      cpf: cpf.trim(),
    }).catch(() => {
      prewarmFired.current = false; // permite retry
    });
  }, [name, email, phone, cpf, submit, showName, showEmail, showCpf]);

  // Step 1 → 2 (ou direto pra payment se shipping desabilitado)
  async function goToShipping() {
    if (!validateIdentify()) return;
    tryPrewarm();
    // Se não precisa coletar CEP nem é físico, vai DIRETO pro pagamento
    if (!showShippingStep) {
      if (!pix) {
        await submit({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          cpf: cpf.trim(),
        });
      }
      setStep("payment");
      return;
    }
    setStep("shipping");
  }

  // Step 2 → 3
  async function goToPayment() {
    if (!validateShipping()) return;
    // Se o pre-warm já gerou PIX, só pula. Senão, gera agora.
    if (!pix) {
      await submit({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        cpf: cpf.trim(),
      });
    }
    setStep("payment");
  }

  function validateIdentify(): boolean {
    if (showName && (!name.trim() || name.trim().length < 3)) {
      alert("Digite seu nome completo.");
      return false;
    }
    if (showEmail && (!email.includes("@") || !email.includes("."))) {
      alert("E-mail inválido.");
      return false;
    }
    if (showCpf) {
      const cpfDigits = cpf.replace(/\D/g, "");
      if (cpfDigits.length !== 11) {
        alert("CPF inválido.");
        return false;
      }
    }
    if (showPhone) {
      const phoneDigits = phone.replace(/\D/g, "");
      if (phoneDigits.length < 10) {
        alert("Telefone inválido.");
        return false;
      }
    }
    return true;
  }

  function validateShipping(): boolean {
    if (!showCep) return true;
    if (cep.replace(/\D/g, "").length !== 8) {
      alert("CEP inválido.");
      return false;
    }
    if (!address.trim()) {
      alert("Endereço incompleto.");
      return false;
    }
    if (!noNumber && !number.trim()) {
      alert("Informe o número (ou marque S/N).");
      return false;
    }
    return true;
  }

  // ViaCEP lookup
  async function lookupCep(rawCep: string) {
    const cleaned = rawCep.replace(/\D/g, "");
    if (cleaned.length !== 8) return;
    setCepLookingUp(true);
    setCepError(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepError("CEP não encontrado.");
        return;
      }
      setAddress(data.logradouro ?? "");
      setNeighborhood(data.bairro ?? "");
      setCity(data.localidade ?? "");
      setState(data.uf ?? "");
    } catch {
      setCepError("Erro ao consultar CEP.");
    } finally {
      setCepLookingUp(false);
    }
  }

  // Bg / cores tema
  const styles = useMemo(() => {
    return {
      page: { backgroundColor: p.bgColor || "#f4f6f8" },
      card: { backgroundColor: p.cardColor || "#ffffff" },
      primary: p.primaryColor || "#1d6cd6",
      accent: p.accentColor || "#22c55e",
    };
  }, [p.bgColor, p.cardColor, p.primaryColor, p.accentColor]);

  return (
    <main
      className="min-h-screen px-3 py-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:py-6"
      style={styles.page}
    >
      <div className="mx-auto max-w-md space-y-4 sm:max-w-lg">
        {/* === CART CARD === */}
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5" style={styles.card}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-zinc-900">Seu carrinho</p>
            <span
              className="flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: styles.primary }}
            >
              {qty}
            </span>
          </div>

          <div className="flex items-start gap-3 border-b border-zinc-100 pb-3">
            {p.product.image ? (
              // FIX 17/07/2026 (davi: "Imagem nao esta carregando"): usava
              // Next/Image que exige `remotePatterns` no next.config pros
              // hosts das imagens dos sellers (Vercel Blob, Cloudinary,
              // imgur, servidor próprio). Trocado por <img> nativo — mesmo
              // padrão dos outros 9 templates que já funcionavam.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.product.image}
                alt={p.product.name}
                width={56}
                height={56}
                loading="eager"
                className="size-14 shrink-0 rounded-lg border border-zinc-200 object-cover"
              />
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
                <QrCode className="size-6 text-zinc-300" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-zinc-900">
                {p.product.name}
              </p>
              {p.product.description && (
                <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">
                  {p.product.description}
                </p>
              )}
              <p className="mt-1 text-base font-bold text-emerald-600">
                {formatBRL(p.priceCents)}
              </p>
              {showQuantity && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-full">
                  <button
                    type="button"
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    className="flex size-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    aria-label="Diminuir"
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="min-w-[1.5rem] text-center text-sm font-semibold text-zinc-900 tabular-nums">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty(qty + 1)}
                    className="flex size-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    aria-label="Aumentar"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Subtotal ({qty}x)</span>
              <span className="font-medium text-zinc-700">
                {formatBRL(p.priceCents * qty)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 pt-2 text-base font-bold">
              <span className="text-zinc-900">Total:</span>
              <span className="text-zinc-900 tabular-nums">
                {formatBRL(p.priceCents * qty)}
              </span>
            </div>
          </div>
        </div>

        {/* === STEP 1: IDENTIFIQUE-SE === */}
        {step === "identify" && (
          <section className="rounded-2xl bg-white p-5 shadow-sm" style={styles.card}>
            <header className="mb-5 flex items-center gap-2.5">
              <span
                className="flex size-9 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: styles.primary }}
              >
                <User2 className="size-5" />
              </span>
              <h2 className="text-lg font-bold text-zinc-900">Identifique-se</h2>
            </header>

            <div className="space-y-4">
              {showName && (
                <Field label="Nome e sobrenome">
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="name"
                    placeholder="Nome e sobrenome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
              )}

              {showEmail && (
                <Field label="E-mail">
                  <SmartEmailInput
                    value={email}
                    onChange={setEmail}
                    placeholder="E-mail"
                    inputClassName="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
              )}

              {showPhone && (
                <Field label="Telefone/WhatsApp">
                  <SmartPhoneInput
                    value={phone}
                    onChange={setPhone}
                    inputClassName="flex-1 border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 rounded-r-lg"
                    inputStyle={{ borderLeft: "none" }}
                    borderColor="#e4e4e7"
                  />
                </Field>
              )}

              {showCpf && (
                <Field label="CPF">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(maskCpf(e.target.value))}
                    onBlur={tryPrewarm}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
              )}
            </div>

            <button
              type="button"
              onClick={goToShipping}
              disabled={loading}
              className="mt-6 w-full rounded-lg px-6 py-4 text-sm font-bold uppercase tracking-wide text-white shadow-sm transition hover:opacity-95 active:scale-[0.98] min-h-[56px] disabled:opacity-60"
              style={{ backgroundColor: styles.primary }}
            >
              {loading && !showShippingStep ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Gerando PIX…
                </span>
              ) : showShippingStep ? (
                "IR PARA A ENTREGA"
              ) : (
                "IR PARA O PAGAMENTO"
              )}
            </button>
          </section>
        )}

        {/* === STEP 2: ENTREGA === */}
        {step === "shipping" && (
          <section className="rounded-2xl bg-white p-5 shadow-sm" style={styles.card}>
            <header className="mb-5 flex items-center gap-2.5">
              <span
                className="flex size-9 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: styles.primary }}
              >
                <Truck className="size-5" />
              </span>
              <h2 className="text-lg font-bold text-zinc-900">Entrega</h2>
            </header>

            <div className="space-y-4">
              <Field label="CEP">
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="12345-000"
                    value={cep}
                    onChange={(e) => {
                      const v = maskCep(e.target.value);
                      setCep(v);
                      if (v.replace(/\D/g, "").length === 8) lookupCep(v);
                    }}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  {cepLookingUp && (
                    <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-zinc-400" />
                  )}
                </div>
                {cepError && (
                  <p className="mt-1 text-xs text-red-500">{cepError}</p>
                )}
              </Field>

              {address && (
                <>
                  <Field label="Endereço">
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </Field>

                  <Field label="Número">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="3213"
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        disabled={noNumber}
                        className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                      />
                      <label className="flex shrink-0 items-center gap-2 text-xs text-zinc-700">
                        <input
                          type="checkbox"
                          checked={noNumber}
                          onChange={(e) => setNoNumber(e.target.checked)}
                          className="size-4 accent-blue-600"
                        />
                        S/N
                      </label>
                    </div>
                  </Field>

                  <Field label="Complemento" optional>
                    <input
                      type="text"
                      placeholder="Apartamento, unidade, prédio, andar, etc."
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </Field>

                  <Field label="Bairro">
                    <input
                      type="text"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </Field>

                  <Field label="Cidade">
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Estado">
                      <select
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">—</option>
                        {BR_STATES.map((s) => (
                          <option key={s.uf} value={s.uf}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="País">
                      <select
                        value={country}
                        disabled
                        className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 opacity-80"
                      >
                        <option>Brasil</option>
                      </select>
                    </Field>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setStep("identify")}
              className="mt-5 w-full text-center text-sm font-medium text-zinc-500 hover:text-zinc-700"
            >
              Voltar
            </button>

            <button
              type="button"
              onClick={goToPayment}
              disabled={loading}
              className="mt-3 w-full rounded-lg px-6 py-4 text-sm font-bold uppercase tracking-wide text-white shadow-sm transition hover:opacity-95 active:scale-[0.98] min-h-[56px] disabled:opacity-60"
              style={{ backgroundColor: styles.accent }}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Gerando PIX…
                </span>
              ) : (
                "IR PARA O PAGAMENTO"
              )}
            </button>
          </section>
        )}

        {/* === STEP 3: PAGAMENTO PIX === */}
        {step === "payment" && (
          <section className="rounded-2xl bg-white p-5 shadow-sm" style={styles.card}>
            <header className="mb-5 flex items-center gap-2.5">
              <span
                className="flex size-9 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: styles.primary }}
              >
                <CreditCard className="size-5" />
              </span>
              <h2 className="text-lg font-bold text-zinc-900">Pagamento via PIX</h2>
            </header>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            )}

            {pix ? (
              <PixDisplay
                pix={pix}
                slug={p.slug}
                priceCents={p.priceCents * qty}
                onPaid={() => {
                  // O hook redireciona automaticamente via window.location se thankYouUrl
                }}
                currency={p.currency || "BRL"}
                receiptUpload={p.receiptUpload}
                primaryColor={p.primaryColor || "#16a34a"}
              />
            ) : (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-8 animate-spin text-zinc-300" />
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                // Reseta PIX → próximo "IR PARA O PAGAMENTO" gera um NOVO,
                // não reusa o antigo. Também limpa o prewarm pra permitir
                // novo fire-and-forget.
                reset();
                prewarmFired.current = false;
                setStep(showShippingStep ? "shipping" : "identify");
              }}
              className="mt-5 w-full text-center text-sm font-medium text-zinc-500 hover:text-zinc-700"
            >
              Voltar
            </button>
          </section>
        )}

        {/* Selo de segurança */}
        <p className="flex items-center justify-center gap-1.5 py-2 text-center text-xs text-zinc-500">
          <ShieldCheck className="size-3.5 text-zinc-400" /> Compra 100% segura.
        </p>
      </div>
    </main>
  );
}

/* ============== SUBCOMPONENTES ============== */

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-zinc-800">
        {label}
        {optional && (
          <span className="ml-1 font-normal text-zinc-400">(opcional)</span>
        )}
      </span>
      {children}
    </label>
  );
}

/**
 * Exibe o QR + Copia&Cola + faz polling adaptativo. Redireciona quando PAID.
 */
function PixDisplay({
  pix,
  slug,
  priceCents,
  onPaid,
  currency = "BRL",
  receiptUpload = false,
  primaryColor = "#16a34a",
}: {
  pix: { qrCode: string; pixCode: string; transactionId: string; expiresAt?: string | null };
  slug: string;
  priceCents: number;
  onPaid: () => void;
  currency?: string;
  receiptUpload?: boolean;
  primaryColor?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  // Destino pós-pagamento (upsell). Em state pra renderizar botão garantido.
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const formatBRL = (cents: number) => formatMoney(cents, currency);
  const pollRef = useRef<number | null>(null);
  const startTimeRef = useRef(Date.now());

  // Polling adaptativo: 1.2s primeiros 30s, depois 3s.
  // Pausa quando tab tá em background pra economizar bateria/requests.
  useEffect(() => {
    if (paid || !pix.transactionId || pix.transactionId === "preview-tx") return;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(`/api/transactions/${pix.transactionId}/status`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (data?.status === "PAID") {
          onPaid();
          const upsell =
            data.thankYouUrl || `/c/${slug}/obrigado?tx=${pix.transactionId}`;
          // DIRETO: vai pro destino NA HORA, ANTES de qualquer setState — sem
          // tela de "pagamento confirmado" no meio.
          window.location.href = upsell;
          return;
        }
      } catch {
        // ignore tx errors — próximo tick tenta de novo
      }
    };

    function scheduleNext() {
      const elapsed = Date.now() - startTimeRef.current;
      const delay = elapsed < 30_000 ? 1200 : 3000;
      pollRef.current = window.setTimeout(async () => {
        await poll();
        if (!paid) scheduleNext();
      }, delay);
    }
    scheduleNext();

    // Cliente VOLTOU pro checkout (pagou no app do banco) → poll na hora.
    // Além de visibilitychange, escutamos focus e pageshow: o Safari/iOS
    // restaura via bfcache SEM disparar visibilitychange — sem o pageshow o
    // iPhone ficava preso no QR mesmo já pago ("upsell não funcionava").
    function wake() {
      if (typeof document !== "undefined" && document.hidden) return;
      poll();
    }
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);

    return () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
    };
  }, [pix.transactionId, paid, slug, onPaid]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pix.pixCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: prompt
      window.prompt("Copie o código PIX:", pix.pixCode);
    }
    // Marca server-side que o cliente copiou (métrica de conversão)
    if (pix.transactionId) {
      fetch(`/api/transactions/${pix.transactionId}/copy`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    }
  }, [pix.pixCode, pix.transactionId]);

  if (paid) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="size-16 text-emerald-500" />
        <p className="text-lg font-bold text-zinc-900">Pagamento confirmado!</p>
        {redirectUrl ? (
          <>
            <a
              href={redirectUrl}
              className="mt-1 inline-flex w-full items-center justify-center rounded-lg py-4 text-base font-bold uppercase tracking-wider text-white transition hover:opacity-90 active:scale-[0.98] min-h-[52px]"
              style={{ background: primaryColor || "#16a34a" }}
            >
              Continuar →
            </a>
            <p className="text-xs text-zinc-400">
              Redirecionando automaticamente…
            </p>
          </>
        ) : (
          <p className="text-sm text-zinc-500">Redirecionando…</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pix.qrCode && pix.qrCode !== "PREVIEW" && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pix.qrCode}
            alt="QR Code PIX"
            className="size-56 rounded-lg border border-zinc-200 bg-white p-3"
          />
        </div>
      )}

      <div className="text-center text-xs text-zinc-500">
        Total a pagar: <span className="font-bold text-zinc-900">{formatBRL(priceCents)}</span>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-700">
          Ou copie o código PIX:
        </label>
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={pix.pixCode}
            readOnly
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-[10px] text-zinc-700"
          />
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-500"
          >
            {copied ? (
              <span className="inline-flex items-center gap-1">
                <Check className="size-3.5" /> Copiado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Copy className="size-3.5" /> Copiar
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
        <p className="font-bold">Como pagar:</p>
        <ol className="mt-1 list-inside list-decimal space-y-0.5 text-blue-800">
          <li>Abra o app do seu banco</li>
          <li>Escolha pagar via PIX → Copia &amp; Cola</li>
          <li>Cole o código e confirme</li>
          <li className="font-semibold">
            Volte para esta tela — você será redirecionado automaticamente
          </li>
        </ol>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-zinc-500">
        <Loader2 className="size-3 animate-spin" /> Aguardando confirmação do pagamento…
      </p>

      <ReceiptUpload
        enabled={receiptUpload}
        txId={pix.transactionId}
        preview={pix.transactionId === "preview-tx"}
        primaryColor={primaryColor}
      />
    </div>
  );
}

/* ============== MÁSCARAS / CONSTANTES ============== */

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function maskCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function maskCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

const BR_STATES = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
];
