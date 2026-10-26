"use client";

/**
 * StripeInspectorBlocker — esconde/remove o painel "Stripe Inspector"
 * (mostra Elements inspector, Magic fill, Card presets 4242/3184/0002).
 *
 * NOTA IMPORTANTE: esse painel costuma ser injetado pela EXTENSAO de
 * browser "Stripe Developer Tools" (Chrome/Brave/Firefox) ou pelo proprio
 * Stripe.js quando publishable key e de test E o visitante esta logado
 * no Stripe Dashboard. Clientes finais normalmente nao veem.
 *
 * Como o painel usa Shadow DOM (#adopted-style-sheet visivel no devtools),
 * CSS no <head> NAO alcanca o conteudo interno — precisamos achar o
 * elemento HOST do shadow root e remover ele.
 *
 * Estrategia:
 *  1. Sweep top-level children de <body> procurando shadow roots abertos
 *     que contenham texto "stripe developers" / "elements inspector" / etc.
 *  2. Sweep iframes com src/name suspeitos.
 *  3. MutationObserver pra capturar re-injecoes.
 *  4. Loop de retentativas por 15s pos-mount (Stripe Inspector pode
 *     demorar pra montar).
 *
 * Limitacao: nao funciona com extensoes que usem shadow root "closed"
 * — nesse caso, so desinstalar a extensao resolve.
 */
import { useEffect } from "react";

// Markers MULTILÍNGUES — o overlay "Stripe Developers / Appearance" é
// localizado pro idioma do browser/Stripe (o seller BR vê em PT: "Stripe
// Desenvolvedores", "Aparência", "Rótulos"…). Antes só tínhamos markers em
// inglês, então o painel em PT/ES/FR passava batido. Cobertura ampla agora.
const TEXT_MARKERS = [
  // EN
  "stripe developers",
  "elements inspector",
  "magic fill",
  "card presets",
  "3ds2 required card",
  "successful card",
  "api appearance",
  "export configuration",
  "disable animations",
  "appearance",
  "typography",
  "spacing",
  // PT
  "desenvolvedores",
  "aparência",
  "aparencia",
  "exportar configuração",
  "rótulos",
  "rotulos",
  "desativar animações",
  "tipografia",
  "espaçamento",
  "espacamento",
  // ES
  "desarrolladores",
  "apariencia",
  "exportar configuración",
  "etiquetas",
  "tipografía",
  "espaciado",
  // FR
  "développeurs",
  "apparence",
  "typographie",
  "espacement",
];

const ATTR_KEYWORDS = [
  "stripe-inspector",
  "stripeinspector",
  "stripe-test-mode",
  "stripetestmode",
  "stripe-developers",
  "stripedevelopers",
  "stripe-dev-tools",
  "stripe_dev",
  "m-outer", // nome conhecido do iframe do Inspector
  "stripe-launcher",
  "stripelauncher",
];

/**
 * Iframes do Stripe que precisamos PRESERVAR (Payment Element, 3DS, etc).
 * Tudo que NÃO bater com isso e for iframe do Stripe é candidato a remover.
 */
function isEssentialStripeIframe(iframe: HTMLIFrameElement): boolean {
  const src = (iframe.src || "").toLowerCase();
  const name = (iframe.name || "").toLowerCase();
  // Stripe.js core
  if (src.includes("js.stripe.com/v3")) return true;
  // Stripe Elements (payment, card, etc)
  if (src.includes("elements-inner") || src.includes("elements-frame")) return true;
  // Stripe private metrics/controller iframes (necessários pro funcionamento)
  if (name.startsWith("__privatestripe")) return true;
  if (name.includes("stripemetrics")) return true;
  if (name.includes("paymentelement")) return true;
  // 3DS challenge frame
  if (src.includes("3ds") || src.includes("stripe-3ds")) return true;
  return false;
}

function attrMatches(el: HTMLElement): boolean {
  const fields = [
    el.id,
    el.className?.toString?.() ?? "",
    el.getAttribute("data-testid") ?? "",
    el.getAttribute("aria-label") ?? "",
    el.getAttribute("name") ?? "",
    el.getAttribute("title") ?? "",
    (el as HTMLIFrameElement).src ?? "",
  ];
  for (const f of fields) {
    const v = (f || "").toLowerCase();
    if (ATTR_KEYWORDS.some((k) => v.includes(k))) return true;
  }
  return false;
}

function shadowTextMatches(el: HTMLElement): boolean {
  // shadowRoot pode lancar se for closed — try/catch
  try {
    const shadow = (
      el as HTMLElement & { shadowRoot: ShadowRoot | null }
    ).shadowRoot;
    if (!shadow) return false;
    const text = (shadow.textContent || "").toLowerCase().slice(0, 3000);
    if (!text) return false;
    return markerHit(text);
  } catch {
    return false;
  }
}

/**
 * Decide se um texto é o overlay do Stripe. Como só varremos filhos top-level
 * do <body> (nosso app fica em #__next, ignorado), o risco de falso positivo é
 * baixo. Regra: "stripe" + 1 marker localizado, OU 2+ markers (cobre o painel
 * em qualquer idioma sem depender da palavra "stripe").
 */
function markerHit(text: string): boolean {
  const hits = TEXT_MARKERS.filter((m) => text.includes(m)).length;
  if (text.includes("stripe") && hits >= 1) return true;
  return hits >= 2;
}

function plainTextMatches(el: HTMLElement): boolean {
  // Limita pra nao iterar a pagina inteira
  if (el.children.length > 60) return false;
  const text = (el.textContent || "").toLowerCase().slice(0, 3000);
  if (text.length < 20) return false;
  return markerHit(text);
}

function destroy(el: HTMLElement, reason: string) {
  // Marca pra nao reprocessar
  el.setAttribute("data-bp-blocked", "1");
  el.setAttribute("data-bp-blocked-reason", reason);
  // Esconde imediatamente
  el.style.setProperty("display", "none", "important");
  el.style.setProperty("visibility", "hidden", "important");
  el.style.setProperty("pointer-events", "none", "important");
  el.style.setProperty("opacity", "0", "important");
  el.style.setProperty("position", "fixed", "important");
  el.style.setProperty("top", "-99999px", "important");
  el.style.setProperty("left", "-99999px", "important");
  el.style.setProperty("width", "0", "important");
  el.style.setProperty("height", "0", "important");
  // Tenta tambem remover do DOM (mais seguro contra re-show via inline style)
  try {
    el.remove();
  } catch {
    // ignore
  }
}

export function StripeInspectorBlocker() {
  useEffect(() => {
    let stopped = false;

    function looksLikeFloatingLauncher(el: HTMLElement): boolean {
      // Detecta o launcher pill "stripe >" no canto inferior direito.
      // Sinais: position fixed, pequeno (<300px), ancorado bottom+right,
      // texto contém "stripe" ou shadow root tem "stripe".
      const style = window.getComputedStyle(el);
      if (style.position !== "fixed") return false;
      const rect = el.getBoundingClientRect();
      // Muito grande, descarta (não é o launcher)
      if (rect.width > 400 || rect.height > 200) return false;
      // Tem que estar perto da borda direita inferior
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const nearBottom = vh - rect.bottom < 120;
      const nearRight = vw - rect.right < 120;
      if (!(nearBottom && nearRight)) return false;
      // Texto inclui "stripe"?
      const text = (el.textContent || "").toLowerCase();
      if (text.includes("stripe")) return true;
      // Shadow root inclui "stripe"?
      try {
        const sr = (el as HTMLElement & { shadowRoot: ShadowRoot | null })
          .shadowRoot;
        if (sr && (sr.textContent || "").toLowerCase().includes("stripe")) {
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    }

    function nuke() {
      if (stopped) return;

      // 1. Top-level children de body — onde Stripe Inspector / extensao
      //    costuma injetar (fora do React tree)
      Array.from(document.body.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        if (child.dataset.bpBlocked === "1") return;
        // Skip nodes que sao parte do React tree (next root)
        if (child.id === "__next") return;
        if (child.tagName === "SCRIPT") return;
        if (child.tagName === "NOSCRIPT") return;
        if (child.tagName === "NEXT-ROUTE-ANNOUNCER") return;
        if (child.tagName === "TEMPLATE") return;
        // Iframes essenciais do Stripe nunca tocar
        if (
          child.tagName === "IFRAME" &&
          isEssentialStripeIframe(child as HTMLIFrameElement)
        ) {
          return;
        }

        let matched: string | null = null;
        if (attrMatches(child)) matched = "attr";
        else if (shadowTextMatches(child)) matched = "shadow-text";
        else if (plainTextMatches(child)) matched = "plain-text";
        else if (looksLikeFloatingLauncher(child)) matched = "floating-launcher";

        if (matched) destroy(child, matched);
      });

      // 2. iframes em qualquer lugar do documento — esconde os do Stripe
      //    que NÃO sejam essenciais (Payment Element, 3DS, etc são whitelisted)
      document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((iframe) => {
        if (iframe.dataset.bpBlocked === "1") return;
        // Iframe essencial — mantém
        if (isEssentialStripeIframe(iframe)) return;
        // Match por atributos suspeitos
        if (attrMatches(iframe)) {
          destroy(iframe, "iframe-attr");
          return;
        }
        // Iframe carregado do stripe.com mas NÃO essencial → suspeito (Inspector)
        const src = (iframe.src || "").toLowerCase();
        if (src.includes("stripe.com") || src.includes("stripe-cdn")) {
          destroy(iframe, "iframe-stripe-nonessential");
        }
      });
    }

    nuke();

    // MutationObserver — mudancas no body
    const obs = new MutationObserver(() => {
      requestAnimationFrame(nuke);
    });
    obs.observe(document.body, {
      childList: true,
      subtree: false, // top-level so — performance
    });

    // Retentativas: Stripe Inspector pode demorar pra montar (pos load do JS).
    // Roda a cada 500ms por 15s.
    let ticks = 30;
    const interval = window.setInterval(() => {
      if (stopped || ticks <= 0) {
        window.clearInterval(interval);
        return;
      }
      nuke();
      ticks--;
    }, 500);

    return () => {
      stopped = true;
      obs.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
