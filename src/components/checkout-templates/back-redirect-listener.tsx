"use client";

import { useEffect } from "react";

/**
 * Wireup do backRedirectUrl do Checkout.
 *
 * Quando o seller configura uma URL de "back redirect", queremos que se o
 * cliente clicar em VOLTAR no navegador (depois de ja ter entrado no
 * checkout), em vez de sair da pagina ele caia num downsell/oferta extra.
 *
 * Como funciona:
 *  1. Ao montar, pushamos um state extra no history. Agora ha 2 entradas
 *     na pilha desse domain: a entrada original (pre-checkout) + a nova
 *     (sentinela).
 *  2. Quando o usuario clica "Voltar" do browser, dispara `popstate`.
 *     Interceptamos e redirecionamos pra `backRedirectUrl`.
 *  3. Se o usuario NAO clicou em voltar (navegacao normal por links da
 *     pagina), nao interfere — o popstate so dispara em back/forward.
 *
 * Caveats:
 *  - Navegadores SAFARI iOS as vezes nao dispatcham popstate em swipe-back.
 *    Workaround conhecido eh inflar a stack com varios pushState (overkill
 *    pra direct response — mantemos simples).
 *  - Em iframes (embedded checkouts), o redirect vai pro iframe nao o
 *    parent. Cliente checkout em iframe nao eh use case nosso.
 *
 * Fire-and-forget: o componente nao renderiza nada, so adiciona listener.
 */
export function BackRedirectListener({ url }: { url: string }) {
  useEffect(() => {
    if (!url) return;

    // INFLA a pilha de history com VÁRIOS sentinelas. Com 1 só, o "voltar"
    // falhava em Safari iOS (swipe-back não dispara popstate de forma
    // confiável) — por isso o backredirect "não funcionava". Com N entradas,
    // o back dispara popstate de forma robusta antes de sair da página.
    try {
      for (let i = 0; i < 5; i++) {
        window.history.pushState(
          { __trilhopag_back_sentinel: true, i },
          "",
          window.location.href,
        );
      }
    } catch {
      // Alguns browsers em modo privado podem bloquear — falha silenciosa.
      return;
    }

    let fired = false;
    function onPopState(_e: PopStateEvent) {
      if (fired) return;
      fired = true;
      // RE-TRAP antes de redirecionar: re-empurra um state pra o usuário NÃO
      // "escapar" da página caso o redirect demore um tick (mantém o back preso).
      try {
        window.history.pushState(
          { __trilhopag_back_sentinel: true },
          "",
          window.location.href,
        );
      } catch {
        // ignore
      }
      // Redireciona pra URL configurada (downsell / oferta extra).
      try {
        window.location.href = url;
      } catch {
        window.location.replace(url);
      }
    }

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [url]);

  return null;
}
