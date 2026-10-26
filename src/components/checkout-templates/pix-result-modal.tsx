"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, ShieldCheck, ArrowLeft } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import type { PixResult } from "./use-pix-flow";
import { mergePixResult, type PixResultConfig } from "./configs";
import { ReceiptUpload } from "./receipt-upload";
import { onFbqReady, onTtqReady } from "./pixel-ready";

export function PixResultDisplay({
  pix,
  priceCents,
  productName,
  productImage,
  productDescription,
  primaryColor,
  textColor = "#18181b",
  pixResultConfig,
  onBack,
  currency = "BRL",
  receiptUpload = false,
}: {
  pix: PixResult;
  priceCents: number;
  productName: string;
  productImage?: string | null;
  productDescription?: string | null;
  primaryColor: string;
  textColor?: string;
  pixResultConfig?: PixResultConfig;
  /**
   * Quando fornecido, mostra botão "Voltar" acima do conteúdo.
   * Ao clicar, chama esta função — o template deve resetar o pix state
   * (`reset()` do usePixFlow) pra permitir gerar um Pix novo.
   *
   * Auto.tsx NÃO passa onBack (gera Pix automaticamente, sem form pra voltar).
   */
  onBack?: () => void;
  /** Moeda do checkout (BRL/USD/EUR). Default BRL. */
  currency?: string;
  /** Quando true, mostra o campo de "enviar comprovante" (opção do seller). */
  receiptUpload?: boolean;
}) {
  const cfg = mergePixResult(pixResultConfig);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>(pix.qrCode || "");
  const [paid, setPaid] = useState(false);
  // URL de destino pós-pagamento (upsell do seller > thankYou > /obrigado),
  // resolvida pelo /status. Guardada em state pra renderizar um BOTÃO visível
  // de "Continuar" — garantia de que o cliente chega no upsell mesmo se o
  // auto-redirect falhar/atrasar (tab suspensa no mobile, bloqueio, etc.).
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const formatBRL = (cents: number) => formatMoney(cents, currency);

  // POLLING DE PAGAMENTO + PIXEL DE CONVERSÃO.
  // Antes, só o dropv2 fazia polling; o PixResultDisplay (usado por auto/extra/
  // simple/fast/tiktok_shop/mercado_livre/amazon/shopee) deixava o cliente
  // parado no QR. Como o cliente do PIX paga no app do banco e raramente volta
  // pra /obrigado, o pixel de Purchase NUNCA disparava — "pixel não pega".
  // Agora: detecta PAID, dispara Purchase/CompletePayment no pixel do checkout
  // (window.fbq/ttq já inicializados pelo PixelScripts; event_id = txId garante
  // DEDUP com o CAPI server-side e com a página /obrigado) e redireciona.
  useEffect(() => {
    const txId = pix.transactionId;
    // Preview do builder não tem tx real — não faz polling.
    if (!txId || txId === "preview-tx" || pix.qrCode === "PREVIEW") return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // 30/07/2026 (davi 'pixel nao marca'): igual ao purchase-pixel.tsx, o
    // marker de dedup era gravado ANTES de tentar disparar. Se o fbq/ttq ainda
    // não tivesse carregado (adblock lento, 3G), o evento sumia e o marker
    // impedia qualquer nova tentativa. Agora espera o pixel e marca depois.
    const firePurchasePixel = () => {
      const key = `tp_pixpaid_${txId}`;
      try {
        if (sessionStorage.getItem(key)) return;
      } catch {
        // sessionStorage bloqueado — segue (event_id garante dedup no Meta)
      }
      let marked = false;
      const mark = () => {
        if (marked) return;
        marked = true;
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          // ignora
        }
      };
      const value = Number((priceCents / 100).toFixed(2));
      onFbqReady((fbq) => {
        fbq("track", "Purchase", { value, currency }, { eventID: txId });
        mark();
      });
      onTtqReady((ttq) => {
        ttq.track("CompletePayment", { value, currency }, { event_id: txId });
        mark();
      });
    };

    const poll = async () => {
      if (!alive) return;
      try {
        const res = await fetch(`/api/transactions/${txId}/status`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.status === "PAID") {
            firePurchasePixel();
            const dest =
              typeof data.thankYouUrl === "string" ? data.thankYouUrl : null;
            if (dest) {
              // DIRETO: vai pro upsell NA HORA, SEM mostrar tela de "pagamento
              // aprovado" no meio. O pixel já disparou (síncrono) acima e o
              // CAPI server-side garante o dedup do Purchase, então não há
              // motivo pra delay — o seller quer redirect imediato.
              window.location.href = dest;
              return;
            }
            // Só quando NÃO há pra onde ir (checkout sem upsell/thankYou) é que
            // mostramos o estado "aprovado" como fallback.
            setPaid(true);
            return; // pago → para o polling
          }
          if (data?.status === "EXPIRED" || data?.status === "FAILED") return;
        }
      } catch {
        // rede instável — tenta de novo no próximo tick
      }
      if (alive) timer = setTimeout(poll, 2500);
    };

    // Primeiro check após 1.5s. O poll só LÊ o servidor (devolve PENDING até
    // pagar), então checar mais cedo não custa nada pro cliente e faz o redirect
    // disparar mais rápido assim que o webhook confirma o pagamento.
    timer = setTimeout(poll, 1500);

    // Quando o cliente VOLTA pro checkout (saiu pro app do banco, pagou, voltou),
    // dispara um poll NA HORA — mobile suspende timers em background, então sem
    // isto o redirect pro upsell demorava/parecia que "não funcionou".
    // Escutamos 3 sinais de "voltou" porque os navegadores divergem:
    //  - visibilitychange: aba volta a ficar visível (cobre a maioria);
    //  - focus: a janela reganha foco (desktop + parte do mobile);
    //  - pageshow: restauração do bfcache no Safari/iOS — este NÃO dispara
    //    visibilitychange, então sem ele o iPhone ficava preso no QR mesmo
    //    depois de pago. É o caso mais comum de "upsell não funciona" no iOS.
    const wake = () => {
      if (!alive) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (timer) clearTimeout(timer);
      poll();
    };
    if (typeof window !== "undefined") {
      document.addEventListener("visibilitychange", wake);
      window.addEventListener("focus", wake);
      window.addEventListener("pageshow", wake);
    }

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      if (typeof window !== "undefined") {
        document.removeEventListener("visibilitychange", wake);
        window.removeEventListener("focus", wake);
        window.removeEventListener("pageshow", wake);
      }
    };
  }, [pix.transactionId, pix.qrCode, priceCents, currency]);

  // Se servidor não veio com QR image, gera no cliente a partir do EMV code.
  // Roda assíncrono pra não bloquear a renderização — usuário já vê o resto da tela.
  // Try/catch defensivo: se QRCode.toDataURL throw (caso raro, ex: pixCode
  // muito longo, char inválido, etc.), não derruba o render.
  useEffect(() => {
    if (qrDataUrl || !pix.pixCode) return;
    let canceled = false;
    try {
      QRCode.toDataURL(pix.pixCode, {
        width: 384,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
      })
        .then((url) => {
          if (!canceled) setQrDataUrl(url);
        })
        .catch((e) => {
          console.warn("[pix-result] QR generation failed:", e);
        });
    } catch (e) {
      console.warn("[pix-result] QR sync error:", e);
    }
    return () => {
      canceled = true;
    };
  }, [pix.pixCode, qrDataUrl]);

  function copyCode() {
    // Beacon de "copied" pra metrica de funil de conversao
    // (gerados → copiados → pagos). Fire-and-forget — nao bloqueia o copy.
    try {
      if (pix.transactionId) {
        // Pega sessionId pra cruzar com CheckoutVisit (metricas)
        let sessionId: string | null = null;
        try {
          const keys = Object.keys(sessionStorage).filter((k) =>
            k.startsWith("bp-cv-"),
          );
          if (keys.length > 0) sessionId = sessionStorage.getItem(keys[0]);
        } catch {
          // ignore
        }
        fetch(`/api/transactions/${pix.transactionId}/copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
    // Try-catch porque navigator.clipboard pode falhar em contextos sem
    // permissão (iframes cross-origin, mobile browsers em modo restrito).
    try {
      navigator.clipboard
        .writeText(pix.pixCode)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          // Fallback: prompt o user a copiar manualmente
          window.prompt("Copie o código PIX:", pix.pixCode);
        });
    } catch {
      window.prompt("Copie o código PIX:", pix.pixCode);
    }
  }

  // ESTADO PAGO: tela de sucesso com BOTÃO garantido pro upsell. O cliente do
  // PIX paga no app do banco e, ao voltar pra esta aba, vê o botão e toca —
  // chegando no upsell mesmo que o auto-redirect não dispare. Esta é a parte
  // que faltava: antes só havia o redirect automático (que depende de o cliente
  // estar com a aba ativa no exato momento do PAID).
  if (paid) {
    return (
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-center"
        style={{ color: textColor }}
      >
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-50">
          <Check className="size-9 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-emerald-700">
          Pagamento aprovado!
        </h2>
        {redirectUrl ? (
          <>
            <p className="mt-2 text-sm text-zinc-600">
              Toque no botão abaixo para continuar e liberar seu acesso.
            </p>
            <a
              href={redirectUrl}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg py-4 text-base font-bold uppercase tracking-wider text-white transition hover:opacity-90 active:scale-[0.98] min-h-[52px]"
              style={{ background: primaryColor }}
            >
              Continuar →
            </a>
            <p className="mt-3 text-xs text-zinc-400">
              Redirecionando automaticamente…
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">
            Tudo certo! Seu pagamento foi confirmado.
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      style={{ color: textColor }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition min-h-[36px]"
        >
          <ArrowLeft className="size-3.5" />
          Voltar
        </button>
      )}
      <div className="flex flex-col items-center gap-3 text-center">
        {productImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={productImage}
            alt={productName ?? "Produto"}
            className="size-14 rounded-full object-cover bg-zinc-100 border border-zinc-200"
          />
        ) : (
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-zinc-100 border border-zinc-200 text-zinc-400 text-xs">
            {(productName ?? "??").slice(0, 2).toUpperCase()}
          </span>
        )}
        <h2 className="text-lg font-bold leading-tight">{productName ?? "Produto"}</h2>
        {productDescription && (
          <p className="text-xs text-zinc-500 leading-snug">{productDescription}</p>
        )}
        <p className="text-base">
          {cfg.valueTotalLabel}{" "}
          <strong style={{ color: primaryColor }} className="text-lg">
            {formatBRL(priceCents)}
          </strong>
        </p>
      </div>

      <p className="mt-6 text-center text-sm text-zinc-600">{cfg.scanText}</p>

      <div className="mt-4 flex justify-center">
        <div className="rounded-lg border border-zinc-200 bg-white p-2 w-full max-w-[280px]">
          {pix.qrCode === "PREVIEW" ? (
            <div className="aspect-square w-full flex flex-col items-center justify-center gap-2 bg-zinc-50 rounded">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#71717a"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-16"
              >
                <rect width="5" height="5" x="3" y="3" rx="1" />
                <rect width="5" height="5" x="16" y="3" rx="1" />
                <rect width="5" height="5" x="3" y="16" rx="1" />
                <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
                <path d="M21 21v.01" />
                <path d="M12 7v3a2 2 0 0 1-2 2H7" />
                <path d="M3 12h.01" />
                <path d="M12 3h.01" />
                <path d="M12 16v.01" />
                <path d="M16 12h1" />
                <path d="M21 12v.01" />
                <path d="M12 21v-1" />
              </svg>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                Preview · QR não gerado
              </p>
            </div>
          ) : qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR Code Pix"
              className="aspect-square w-full object-contain"
            />
          ) : (
            <div className="aspect-square w-full flex items-center justify-center text-xs text-zinc-400">
              Gerando QR...
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-400">
        <div className="flex-1 border-t border-zinc-200" />
        <span>ou</span>
        <div className="flex-1 border-t border-zinc-200" />
      </div>

      <div className="mt-3">
        <input
          type="text"
          value={pix.pixCode}
          readOnly
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-center font-mono text-[13px] text-zinc-700"
          style={{ fontSize: "13px" }}
        />
      </div>

      <button
        type="button"
        onClick={copyCode}
        className="mt-3 w-full rounded-lg py-4 text-sm font-bold uppercase tracking-wider text-white transition hover:opacity-90 flex items-center justify-center gap-2 active:scale-[0.98] min-h-[52px]"
        style={{ background: primaryColor }}
      >
        {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
        {copied ? cfg.copiedLabel : cfg.copyLabel}
      </button>

      {/* Instrução-chave: o cliente sai pro app do banco pra pagar. Pedir pra
          VOLTAR aqui é o que dispara o redirect pro upsell (o checkout detecta
          o PAID assim que a aba volta a ficar visível). */}
      <p className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2.5 text-center text-xs font-medium text-amber-700">
        Após pagar, volte para esta tela — você será redirecionado
        automaticamente.
      </p>

      <div className="mt-6 rounded-xl bg-zinc-50 p-4 text-xs text-zinc-700">
        <p className="text-center font-semibold mb-3">{cfg.comoPagarTitle}</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 text-xs">
              <ShieldCheck className="size-3" />
            </span>
            <p>{cfg.comoPagarStep1}</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-600">
              <Check className="size-3" />
            </span>
            <p>{cfg.comoPagarStep2}</p>
          </div>
        </div>
      </div>

      {/* ENVIO DE COMPROVANTE — só quando o seller habilita (theme.receiptUpload). */}
      <ReceiptUpload
        enabled={receiptUpload}
        txId={pix.transactionId}
        preview={pix.qrCode === "PREVIEW"}
        primaryColor={primaryColor}
      />
    </div>
  );
}

