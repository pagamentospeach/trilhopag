"use client";

import { useEffect } from "react";

/**
 * Camada de fricção anti-devtools — SOMENTE DESKTOP.
 *
 * REALIDADE: É IMPOSSÍVEL bloquear devtools 100% num navegador moderno.
 * Tudo que roda no cliente pode ser inspecionado. O que dá pra fazer:
 *
 * 1. Aumentar o atrito (atalhos comuns, click direito).
 * 2. Detectar abertura de devtools e avisar/redirecionar.
 * 3. Limpar console pra não dar pista de implementação.
 * 4. Avisar em console: "isso é um golpe se mandaram colar código aqui".
 *
 * BUG ANTERIOR EM MOBILE: a heuristica de detectar devtools via delta
 * `outerWidth - innerWidth > 160` disparava em mobile por causa de:
 *  - URL bar do iOS/Android escondendo/aparecendo no scroll (~50-100px)
 *  - Teclado virtual subindo (delta de altura gigante)
 *  - Rotacao portrait → landscape
 *  - Pinch-to-zoom mudando innerWidth
 * Resultado: overlay "Inspecao bloqueada" aparecia aleatoriamente em
 * usuarios mobile legitimos, bloqueando o app.
 *
 * Mais grave: o `contextmenu` blocker quebrava o long-press de mobile,
 * impedindo copiar/colar texto, links, codigos PIX etc.
 *
 * FIX: detecta touch device e PULA toda a camada agressiva. Mantem
 * apenas o aviso de console (Self-XSS) e os keyboard shortcuts (que
 * sao no-op em mobile mas funcionam em desktop). Aviso ANTI-GOLPE
 * roda em todo mundo.
 *
 * A REAL proteção é no servidor — server actions com ownership
 * checks, API keys com escopo, rate-limit. Nao em UI tricks.
 */
export function AntiDevtools() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;

    // ============ AVISO ANTI-GOLPE (todos os devices) ============
    try {
      const big = "font-size: 22px; font-weight: bold; color: #ef4444;";
      const norm = "font-size: 14px; color: #d4d4d8;";
      // eslint-disable-next-line no-console
      console.log("%c⚠️ Pare!", big);
      // eslint-disable-next-line no-console
      console.log(
        "%cSe alguém te pediu pra colar código aqui, é GOLPE. Você pode perder sua conta Trilho e seu dinheiro. Feche este painel.",
        norm,
      );
    } catch {}

    // ============ DETECTA MOBILE/TOUCH — pula resto se for ============
    // window.matchMedia('(pointer: coarse)') — true em touchscreens
    // navigator.maxTouchPoints > 0 — touch suportado
    // 'ontouchstart' in window — fallback iOS antigo
    const isTouchDevice =
      window.matchMedia?.("(pointer: coarse)").matches ||
      (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) ||
      "ontouchstart" in window;
    if (isTouchDevice) {
      // Mobile/tablet: nao bloqueia nada (long-press, scroll, etc precisam funcionar).
      // Aviso ja foi printado acima.
      return;
    }

    // ============ DESKTOP-ONLY: blocking layer ============

    // 1. Bloqueia atalhos comuns
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // F12
      if (e.key === "F12") {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+I / J / C (devtools, console, inspector)
      if (ctrl && shift && (k === "i" || k === "j" || k === "c")) {
        e.preventDefault();
        return false;
      }
      // Ctrl+U (view-source)
      if (ctrl && k === "u") {
        e.preventDefault();
        return false;
      }
      // Ctrl+S (save page) — não crítico mas evita "salvar" o dashboard
      if (ctrl && k === "s") {
        e.preventDefault();
        return false;
      }
    };

    // 2. Bloqueia click direito
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // 3. Detector de devtools via diferença de window dimensions.
    //    Quando devtools abre (docked), há um delta entre outer/inner.
    //    SO RODA EM DESKTOP (mobile pula antes desse bloco).
    //
    // PERF (jun/2026): antes rodava setInterval(1500ms) lendo
    // outerWidth/innerWidth — cada leitura forca layout reflow no doc,
    // somando 40+ reflows/min. Em PCs fracos isso travava o tab.
    // Agora roda em requestIdleCallback (so quando o browser ta ocioso),
    // com intervalo MINIMO de 5s entre checks.
    let warned = false;
    let lastCheck = 0;
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    const MIN_INTERVAL_MS = 5000;

    const detect = () => {
      if (Date.now() - lastCheck < MIN_INTERVAL_MS) return;
      lastCheck = Date.now();
      const threshold = 160;
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      if (widthDelta > threshold || heightDelta > threshold) {
        if (!warned) {
          warned = true;
          try {
            // eslint-disable-next-line no-console
            console.clear();
          } catch {}
          showWarning();
        }
      } else {
        warned = false;
      }
    };

    // Agenda check via idle callback (com fallback pra setTimeout em browsers
    // velhos que nao suportam requestIdleCallback).
    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const wAny = window as IdleWindow;
    const scheduleCheck = () => {
      if (wAny.requestIdleCallback) {
        idleId = wAny.requestIdleCallback(
          () => {
            detect();
            timeoutId = window.setTimeout(scheduleCheck, MIN_INTERVAL_MS);
          },
          { timeout: 10_000 },
        );
      } else {
        timeoutId = window.setTimeout(() => {
          detect();
          scheduleCheck();
        }, MIN_INTERVAL_MS);
      }
    };

    document.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("contextmenu", onContext);
    scheduleCheck();

    return () => {
      document.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("contextmenu", onContext);
      if (idleId !== null && wAny.cancelIdleCallback) {
        wAny.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      hideWarning();
    };
  }, []);

  return null;
}

function showWarning() {
  if (typeof document === "undefined") return;
  if (document.getElementById("__tp_devtools_warn")) return;
  const el = document.createElement("div");
  el.id = "__tp_devtools_warn";
  el.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.94);display:flex;align-items:center;justify-content:center;font-family:system-ui;padding:24px;";
  el.innerHTML = `
    <div style="max-width:480px;text-align:center;color:#fafafa;">
      <div style="font-size:48px;margin-bottom:16px;">🔒</div>
      <h2 style="font-size:20px;font-weight:600;margin:0 0 12px;">Inspeção bloqueada</h2>
      <p style="font-size:14px;color:#a3a3a3;line-height:1.5;margin:0 0 8px;">
        Esta página não pode ser inspecionada por motivos de segurança.
      </p>
      <p style="font-size:13px;color:#a3a3a3;line-height:1.5;margin:0;">
        Se alguém te orientou a abrir o inspecionar e colar código, é uma tentativa de golpe.
        Feche o devtools pra continuar usando o painel.
      </p>
    </div>
  `;
  document.body.appendChild(el);
}

function hideWarning() {
  if (typeof document === "undefined") return;
  document.getElementById("__tp_devtools_warn")?.remove();
}
