"use client";

import { useEffect, useState } from "react";
import { LIGHT_THEME_KEY } from "./theme-mode";

/**
 * Diz se o dashboard está no modo claro, e REAGE quando o toggle troca.
 *
 * Praticamente tudo vira claro sozinho pela inversão de variáveis CSS
 * (src/styles/themes.css). Este hook existe pro punhado de casos que o CSS não
 * alcança: SVG desenhado por biblioteca (Recharts escreve `stroke`/`fill` como
 * ATRIBUTO XML, e var() não resolve em atributo — só em propriedade CSS), então
 * essas cores precisam ser escolhidas em JS.
 *
 * Observa o data-theme do wrapper em vez de receber por prop: o toggle troca o
 * atributo na hora, antes do round-trip, e o gráfico acompanha no mesmo frame.
 */
export function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const el = document.querySelector("[data-theme]");
    if (!el) return;

    const read = () =>
      setIsLight(el.getAttribute("data-theme") === LIGHT_THEME_KEY);

    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return isLight;
}
