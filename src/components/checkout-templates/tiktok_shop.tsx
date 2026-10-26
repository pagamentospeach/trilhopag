"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Star, ShieldCheck, Truck, BadgeCheck, Clock, ChevronLeft, ChevronRight } from "lucide-react";
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
import { mergeTiktokShop } from "./configs";
import { SocialProofToasts, LiveViewers } from "./social-proof";

/**
 * TIKTOK SHOP — réplica do visual do checkout do TikTok Shop, customizável.
 * Hero do produto (galeria + badge de desconto + countdown) → bloco de
 * "Proteção do cliente" → formulário (PIX/cartão) → avaliações com nota.
 *
 * Tudo editável no builder via tiktokShopConfig: galeria, reviews (com foto),
 * proteção, countdown, % desconto, nota/vendidos, variantes visuais.
 */

export function TiktokShopTemplate(p: TemplateProps) {
  const cfg = mergeTiktokShop(p.tiktokShopConfig);
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

  const [imgIdx, setImgIdx] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(0);

  // Variante selecionada pode ajustar o preço (delta em centavos). O valor
  // exibido aqui bate com o que o servidor cobra (pix/card routes leem o mesmo
  // delta do theme, de forma autoritativa, via cookie ttkv_<slug>).
  const variantDelta = cfg.variants[selectedVariant]?.priceDeltaCents ?? 0;
  const sellingCents = Math.max(100, p.priceCents + variantDelta);
  const total = sellingCents + extrasState.extrasTotal;
  // Preço "de" calculado a partir do % de desconto configurado.
  const discountPct = cfg.discountPercent;
  const originalCents =
    discountPct > 0 ? Math.round(sellingCents / (1 - discountPct / 100)) : 0;

  // Countdown de escassez (minutos configuráveis).
  const [secs, setSecs] = useState(Math.max(1, cfg.countdownMinutes) * 60);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  // Persiste a variante escolhida num cookie por slug pra o servidor cobrar
  // o delta certo (pix/card leem ttkv_<slug>). Só quando há variantes e fora
  // do preview. Seta no mount e a cada troca — evita índice "stale".
  useEffect(() => {
    if (p.isPreview || cfg.variants.length === 0) return;
    document.cookie = `ttkv_${p.slug}=${selectedVariant}; path=/; max-age=1800; SameSite=Lax`;
  }, [selectedVariant, p.slug, p.isPreview, cfg.variants.length]);

  // Galeria: imagens configuradas (fallback pra imagem do produto).
  const baseImages =
    cfg.gallery.length > 0
      ? cfg.gallery
      : p.product.image
        ? [p.product.image]
        : [];
  // Variante selecionada com imagem própria vira a imagem principal.
  const selVar = cfg.variants[selectedVariant];
  const images = selVar?.image
    ? [selVar.image, ...baseImages.filter((img) => img !== selVar.image)]
    : baseImages;
  // Slides do carrossel: vídeo opcional como 1º slide, depois as imagens.
  const slides: Array<{ type: "video" | "image"; src: string }> = [
    ...(cfg.galleryVideo ? [{ type: "video" as const, src: cfg.galleryVideo }] : []),
    ...images.map((src) => ({ type: "image" as const, src })),
  ];
  // Offset do 1º slide de imagem (após o vídeo, se houver) — usado pra
  // pular o carrossel pra imagem da variante quando o cliente seleciona.
  const firstImageSlide = cfg.galleryVideo ? 1 : 0;
  const safeIdx = Math.min(imgIdx, Math.max(0, slides.length - 1));

  if (pix) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 p-4">
        <PixResultDisplay
          pix={pix}
          priceCents={total}
          productName={p.product.name}
          productImage={p.product.image}
          productDescription={p.product.description}
          primaryColor={c.primary || "#f43f5e"}
          pixResultConfig={p.pixResultConfig}
          receiptUpload={p.receiptUpload}
          onBack={reset}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 pb-[max(24px,env(safe-area-inset-bottom))]">
      <SocialProofToasts
        enabled={cfg.socialProofEnabled}
        names={cfg.socialProofNames}
        primaryColor={c.primary || "#f43f5e"}
        preview={p.isPreview === true}
      />
      <div className="relative mx-auto max-w-md bg-white">
        {/* GALERIA (vídeo opcional + imagens; variante troca a principal) */}
        <div className="relative w-full aspect-square bg-zinc-100">
          {slides.length > 0 ? (
            slides[safeIdx]?.type === "video" ? (
              <video
                src={slides[safeIdx].src}
                className="w-full h-full object-cover"
                muted
                loop
                autoPlay
                playsInline
                controls={false}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slides[safeIdx]?.src} alt={p.product.name} className="w-full h-full object-cover" />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-300 text-5xl font-bold">
              {p.product.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          {slides.length > 1 && (
            <>
              <button type="button" onClick={() => setImgIdx((i) => (i - 1 + slides.length) % slides.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" onClick={() => setImgIdx((i) => (i + 1) % slides.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white">
                <ChevronRight className="size-4" />
              </button>
            </>
          )}
          <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
            {safeIdx + 1}/{Math.max(1, slides.length)}
          </span>
        </div>

        {/* CARD PREÇO (gradiente laranja/rose estilo TikTok Shop) */}
        <div className="px-4 pt-3">
          <div
            className="rounded-xl p-3 text-white"
            style={{ background: `linear-gradient(90deg, ${c.primary || "#f43f5e"}, #fb923c)` }}
          >
            <div className="flex items-end gap-2">
              <span className="text-2xl font-extrabold">{formatBRL(total)}</span>
              {discountPct > 0 && originalCents > 0 && (
                <>
                  <span className="mb-0.5 text-sm line-through text-white/70">{formatBRL(originalCents)}</span>
                  <span className="mb-0.5 rounded bg-white/25 px-1.5 py-0.5 text-[11px] font-bold">-{discountPct}%</span>
                </>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between text-[12px]">
              <span className="inline-flex items-center gap-1"><Truck className="size-3.5" /> Frete grátis</span>
              <span className="inline-flex items-center gap-1 font-semibold"><Clock className="size-3.5" /> Oferta acaba em {mm}:{ss}</span>
            </div>
          </div>
        </div>

        {/* TÍTULO + RATING */}
        <div className="px-4 pt-3">
          <h1 className="text-[15px] font-semibold leading-snug text-zinc-900">{p.product.name}</h1>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
            <span className="inline-flex items-center text-amber-500">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="size-3.5 fill-current" />
              ))}
            </span>
            <span className="font-medium text-zinc-700">{cfg.ratingValue}</span>
            <span>· {cfg.ratingCount} avaliações{cfg.soldText ? ` · ${cfg.soldText}` : ""}</span>
          </div>
          {cfg.socialProofEnabled && (
            <div className="mt-2">
              <LiveViewers enabled={cfg.socialProofEnabled} min={cfg.viewersMin} max={cfg.viewersMax} />
            </div>
          )}
          {p.product.description && (
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">{p.product.description}</p>
          )}
        </div>

        {/* VARIANTES VISUAIS (decorativas) */}
        {cfg.variants.length > 0 && (
          <div className="px-4 pt-3">
            <p className="mb-2 text-[13px] font-semibold text-zinc-700">{cfg.variantsLabel}</p>
            <div className="flex flex-wrap gap-2">
              {cfg.variants.map((v, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSelectedVariant(i);
                    // Pula o carrossel pra imagem da variante (vira a principal).
                    if (cfg.variants[i]?.image) setImgIdx(firstImageSlide);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition ${
                    selectedVariant === i
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  {v.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.image} alt={v.label} className="size-5 rounded object-cover" />
                  )}
                  {v.label}
                  {typeof v.priceDeltaCents === "number" && v.priceDeltaCents !== 0 && (
                    <span className="opacity-70">
                      {v.priceDeltaCents > 0 ? "+" : "−"}
                      {formatBRL(Math.abs(v.priceDeltaCents))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PROTEÇÃO DO CLIENTE */}
        <div className="mx-4 mt-4 rounded-lg bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="size-5 text-amber-600" />
            <h3 className="text-[15px] font-semibold text-amber-700">Proteção do cliente</h3>
          </div>
          <div className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-2 sm:gap-x-4">
            {cfg.protection.map((t, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[12px] text-zinc-700">
                <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FORMULÁRIO */}
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
          className="space-y-4 px-4 pt-5"
        >
          <BumpSlot slot="top" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={c.primary || "#f43f5e"} />

          <div className="rounded-xl border border-zinc-200 p-4 space-y-3">
            <h2 className="text-[15px] font-bold text-zinc-900">Seus dados</h2>
            {showEmail && (
              <div>
                <label className="mb-1 block text-[13px] font-medium text-zinc-700">E-mail</label>
                <EmailInput value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="seu@email.com" inputClassName="w-full rounded-lg border border-zinc-300 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500" />
              </div>
            )}
            {showName && (
              <div>
                <label className="mb-1 block text-[13px] font-medium text-zinc-700">Nome completo</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Seu nome" className="w-full rounded-lg border border-zinc-300 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500" />
              </div>
            )}
            {showPhone && (
              <div>
                <label className="mb-1 block text-[13px] font-medium text-zinc-700">Telefone / WhatsApp</label>
                <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} inputClassName="flex-1 rounded-r-lg border border-zinc-300 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500" borderColor="#d4d4d8" />
              </div>
            )}
            {showCpf && (
              <div>
                <label className="mb-1 block text-[13px] font-medium text-zinc-700">CPF</label>
                <input type="text" inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" maxLength={14} className="w-full rounded-lg border border-zinc-300 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500" />
              </div>
            )}

            {isPhysical && (
              <div className="space-y-3 border-t border-zinc-200 pt-3">
                <h3 className="text-[13px] font-bold text-zinc-900">Endereço de entrega</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className="relative col-span-1">
                    <input type="text" inputMode="numeric" value={form.cep} onChange={(e) => setForm({ ...form, cep: maskCep(e.target.value) })} placeholder="CEP" maxLength={9} required className="w-full rounded-lg border border-zinc-300 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none" />
                    {cepLookingUp && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-zinc-400" />}
                  </div>
                  <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua" required className="col-span-2 rounded-lg border border-zinc-300 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none" />
                </div>
                {cepError && <p className="text-[10px] text-zinc-500">{cepError}</p>}
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="Nº" required className="col-span-1 rounded-lg border border-zinc-300 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none" />
                  <input type="text" value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} placeholder="Complemento (opcional)" className="col-span-2 rounded-lg border border-zinc-300 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none" />
                </div>
                <input type="text" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} placeholder="Bairro" required className="w-full rounded-lg border border-zinc-300 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none" />
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Cidade" required className="col-span-2 rounded-lg border border-zinc-300 px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none" />
                  <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="UF" required maxLength={2} className="col-span-1 rounded-lg border border-zinc-300 px-3 py-3 text-sm uppercase focus:outline-none" />
                </div>
              </div>
            )}

            <BumpSlot slot="above_payment" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={c.primary || "#f43f5e"} />

            <div className="space-y-3 border-t border-zinc-200 pt-3">
              <h3 className="text-[15px] font-bold text-zinc-900">Pagamento</h3>
              <PaymentMethodTabs paymentMethods={enabledMethods} selected={methodSel.selected} onSelect={methodSel.setSelected} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={c.primary || "#f43f5e"} />
              {methodSel.selected === "pix" ? (
                <div className="rounded-xl border-2 p-4 flex items-center justify-center gap-2" style={{ borderColor: c.primary || "#f43f5e" }}>
                  <PixIcon color={c.primary || "#f43f5e"} size={18} />
                  <span className="text-sm font-semibold text-zinc-800">Pague no PIX e libere na hora</span>
                </div>
              ) : (
                <MethodPaymentPanel ref={stripeRef} method={methodSel.selected} isPreview={p.isPreview === true} slug={p.slug} amountCents={total} currency="BRL" customer={{ name: form.name, email: form.email, phone: form.phone, cpf: form.cpf, cep: form.cep, address: form.address, number: form.number, complement: form.complement, neighborhood: form.neighborhood, city: form.city, state: form.state }} variantId={p.variantId}
                bumpIds={extrasState.selectedBumpIds}
                shippingId={extrasState.selectedShippingId} utm={p.utm} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={c.primary || "#f43f5e"} onWalletStateChange={setWalletState} onCardCompleteChange={setCardComplete} />
              )}
            </div>
          </div>

          <BumpSlot slot="below_payment" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={c.primary || "#f43f5e"} />

          {shippingV2.length > 0 && (
            <ShippingList options={shippingV2} selectedId={extrasState.selectedShippingId} onSelect={extrasState.setSelectedShippingId} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={c.primary || "#f43f5e"} />
          )}

          {!((methodSel.selected === "apple_pay" || methodSel.selected === "google_pay") && walletState === "available") && (
            <button
              type="submit"
              disabled={loading || methodLoading || (isCardMethod && !cardComplete)}
              className="w-full rounded-full py-4 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition hover:opacity-90 disabled:opacity-40 active:scale-[0.98] min-h-[56px]"
              style={{ background: `linear-gradient(90deg, ${c.primary || "#f43f5e"}, #fb923c)` }}
            >
              {loading || methodLoading ? (
                <Loader2 className="mx-auto size-5 animate-spin" />
              ) : isCardMethod && !cardComplete ? (
                "Preencha os dados do cartão"
              ) : (
                p.ctaLabel || "Comprar agora"
              )}
            </button>
          )}

          {(error || methodError) && <p className="text-center text-xs text-red-500">{error || methodError}</p>}

          <BumpSlot slot="after_cta" position={p.bumpPosition} bumps={bumpsV2} selectedIds={extrasState.selectedBumpIds} onToggle={extrasState.toggleBump} textColor="#18181b" subtleColor="#71717a" borderColor="#e4e4e7" cardColor="#ffffff" accentColor={c.primary || "#f43f5e"} />
        </form>

        {/* AVALIAÇÕES */}
        <div className="mt-6 border-t border-zinc-100 px-4 py-5">
          <h2 className="mb-3 text-[15px] font-bold text-zinc-900">Avaliações dos clientes ({cfg.ratingCount})</h2>
          <div className="space-y-3">
            {cfg.reviews.map((r, i) => (
              <div key={i} className="rounded-lg bg-zinc-50 p-3">
                <div className="mb-1 flex items-center gap-2">
                  {r.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photo} alt={r.name} className="size-7 rounded-full object-cover" />
                  ) : (
                    <span className="inline-flex size-7 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-bold text-zinc-600">
                      {r.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="text-[13px] font-medium text-zinc-800">{r.name}</span>
                  <span className="ml-auto inline-flex text-amber-500">
                    {Array.from({ length: Math.max(0, Math.min(5, r.stars)) }).map((_, k) => (
                      <Star key={k} className="size-3 fill-current" />
                    ))}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-zinc-600">{r.text}</p>
                {r.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.photo} alt="" className="mt-2 h-24 w-24 rounded-lg object-cover" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
