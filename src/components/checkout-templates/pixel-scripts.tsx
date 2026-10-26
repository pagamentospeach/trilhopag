"use client";

import Script from "next/script";
import { useEffect } from "react";
import {
  onFbqReady,
  onTtqReady,
  sessionEventId,
  fbParams,
  ttqParams,
} from "./pixel-ready";

/**
 * Injeta os scripts dos pixels FB/TikTok e dispara os eventos de ENTRADA no
 * checkout: PageView (inline no snippet), ViewContent e InitiateCheckout.
 *
 * 30/07/2026 (davi 'o pixel do tiktok e facebookads nao estao marcando o IC
 * quando o lead entra no checkout'):
 *
 *  - InitiateCheckout agora dispara AQUI, quando o lead ABRE o checkout, que
 *    é o significado esperado do evento. Antes ele só saía no usePixFlow,
 *    depois do PIX gerado — o que virou AddPaymentInfo (evento correto pra
 *    "preencheu os dados e pediu o pagamento").
 *  - Todos os eventos passaram a esperar o pixel existir (onFbqReady/
 *    onTtqReady) em vez de checar `if (window.fbq)` uma única vez. Como o
 *    <Script afterInteractive> roda DEPOIS do useEffect, aquela checagem dava
 *    false e o evento sumia sem erro.
 *  - Payload deixou de ser `{}`: vai com value/currency/content — sem isso o
 *    Meta/TikTok não otimizam por valor.
 *
 * event_id: estável por sessão (sessionEventId) e enviado em TODOS os
 * eventos, pra dedup contra o CAPI server-side e contra reload de aba.
 */
export function PixelScripts({
  fbPixelId,
  tkPixelId,
  priceCents,
  currency = "BRL",
  productId,
  productName,
  slug,
}: {
  fbPixelId: string | null;
  tkPixelId: string | null;
  priceCents: number;
  /** Moeda do checkout — gringa/gringa-drop usam USD/EUR. Default BRL. */
  currency?: string;
  productId?: string | null;
  productName?: string | null;
  /** Usado só pra chavear os event_id por checkout. */
  slug?: string;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!fbPixelId && !tkPixelId) return;

    // Preview do builder não deve poluir o pixel do seller com eventos falsos.
    const isPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";
    if (isPreview) return;

    const key = slug || window.location.pathname;
    const content = {
      value: priceCents / 100,
      currency,
      contentId: productId,
      contentName: productName,
    };
    const viewContentId = sessionEventId(`vc_${key}`);
    const initiateId = sessionEventId(`ic_${key}`);

    const cancels: Array<() => void> = [];

    if (fbPixelId) {
      cancels.push(
        onFbqReady((fbq) => {
          // PageView NÃO é disparado aqui — já sai inline no snippet abaixo.
          // Disparar de novo contava 2x cada visita.
          fbq("track", "ViewContent", fbParams(content), {
            eventID: viewContentId,
          });
          fbq("track", "InitiateCheckout", fbParams(content), {
            eventID: initiateId,
          });
        }),
      );
    }

    if (tkPixelId) {
      cancels.push(
        onTtqReady((ttq) => {
          ttq.track("ViewContent", ttqParams(content), {
            event_id: viewContentId,
          });
          ttq.track("InitiateCheckout", ttqParams(content), {
            event_id: initiateId,
          });
        }),
      );
    }

    return () => cancels.forEach((cancel) => cancel());
  }, [fbPixelId, tkPixelId, priceCents, currency, productId, productName, slug]);

  return (
    <>
      {fbPixelId && (
        <Script id="fb-pixel" strategy="afterInteractive">
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
            fbq('track', 'PageView');
          `}
        </Script>
      )}
      {tkPixelId && (
        <Script id="tk-pixel" strategy="afterInteractive">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
              ttq.load('${tkPixelId}');
              ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
      )}
    </>
  );
}
