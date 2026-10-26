"use client";

import Script from "next/script";
import { useEffect } from "react";
import { onFbqReady, onTtqReady } from "./pixel-ready";

/** Dispara Purchase nos pixels FB/TikTok ao carregar a página de obrigado. */
export function PurchasePixelFire({
  fbPixelId,
  tkPixelId,
  amountCents,
  transactionId,
}: {
  fbPixelId: string | null;
  tkPixelId: string | null;
  amountCents: number;
  transactionId: string;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 30/07/2026 (davi 'pixel nao marca'): ANTES o marker de dedup era gravado
    // no sessionStorage ANTES de tentar disparar, e o disparo era guardado por
    // `if (window.fbq)`. Como o <Script afterInteractive> costuma rodar DEPOIS
    // do useEffect, a guarda dava false, o evento não saía — e o marker já
    // estava gravado, então nunca mais tentava. Purchase perdido pra sempre.
    // Agora: espera o pixel existir e só marca DEPOIS de disparar de verdade.
    const key = `tp_purchase_${transactionId}`;
    let fired = false;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      // sessionStorage bloqueado — segue sem dedup local (o event_id cobre)
    }

    const mark = () => {
      if (fired) return;
      fired = true;
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        // ignora
      }
    };

    const value = Number((amountCents / 100).toFixed(2));
    const cancels: Array<() => void> = [];

    // event_id = transactionId — bate com CAPI server-side (markTransactionPaid
    // chama fireConversionEvents com event_id: tx.id), garantindo DEDUP no
    // Facebook/TikTok. Sem isso, conversão contaria 2x.
    if (fbPixelId) {
      cancels.push(
        onFbqReady((fbq) => {
          fbq(
            "track",
            "Purchase",
            { value, currency: "BRL", content_type: "product", num_items: 1 },
            { eventID: transactionId },
          );
          mark();
        }),
      );
    }
    if (tkPixelId) {
      cancels.push(
        onTtqReady((ttq) => {
          ttq.track(
            "CompletePayment",
            { value, currency: "BRL" },
            { event_id: transactionId },
          );
          mark();
        }),
      );
    }

    return () => cancels.forEach((cancel) => cancel());
  }, [fbPixelId, tkPixelId, amountCents, transactionId]);

  return (
    <>
      {fbPixelId && (
        <Script id="fb-pixel-thanks" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${fbPixelId}');
          `}
        </Script>
      )}
      {tkPixelId && (
        <Script id="tk-pixel-thanks" strategy="afterInteractive">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
              ttq.load('${tkPixelId}');
            }(window, document, 'ttq');
          `}
        </Script>
      )}
    </>
  );
}
