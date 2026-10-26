"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile widget client component.
 *
 * Carrega o script da CF lazy via `<script>` dinâmico. Renderiza o widget
 * invisível (managed mode) e devolve o token via `onSuccess(token)`.
 *
 * Se `NEXT_PUBLIC_TURNSTILE_SITE_KEY` não está setada, o widget vira no-op
 * e `onSuccess("")` é chamado imediatamente — permite dev local sem
 * configuração.
 *
 * Em produção SEM sitekey, o componente loga warning mas continua
 * funcionando (failure-open no frontend; backend faz failure-closed).
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "invisible";
          appearance?: "always" | "execute" | "interaction-only";
          action?: string;
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile load failed")));
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile load failed"));
    document.head.appendChild(s);
  });
}

export type TurnstileWidgetProps = {
  /** Chamado quando o usuário (ou o managed challenge) completa com sucesso */
  onSuccess: (token: string) => void;
  /** Erro de rede / challenge falhou */
  onError?: () => void;
  /** Token expirou (5min default) — você deve resetar e re-renderizar */
  onExpired?: () => void;
  /** Tema do widget */
  theme?: "light" | "dark" | "auto";
  /** Ação semântica pra Cloudflare classificar comportamento (login, signup, etc) */
  action?: string;
  className?: string;
};

export function TurnstileWidget({
  onSuccess,
  onError,
  onExpired,
  theme = "auto",
  action,
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) {
      // Sem sitekey — bypass silencioso (dev). Sinaliza success vazio
      // pra desbloquear o submit do form.
      onSuccess("");
      setUnavailable(true);
      return;
    }

    let mounted = true;
    loadScript()
      .then(() => {
        if (!mounted || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => {
            setLoadError(false);
            onSuccess(token);
          },
          "error-callback": () => {
            setLoadError(true);
            onError?.();
          },
          "expired-callback": () => onExpired?.(),
          theme,
          action,
          // managed = CF decide se mostra UI; sempre mantemos espaço pro widget
          // ficar visível quando precisar (não esconde nem em interação leve)
          appearance: "always",
        });
      })
      .catch(() => {
        // Falha ao carregar (CSP bloqueando, rede offline, etc).
        // Marca como erro pro usuário SABER que precisa recarregar — sem
        // permitir submit silencioso (fail-closed também no frontend).
        setLoadError(true);
        if (mounted) setUnavailable(true);
      });

    return () => {
      mounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
      }
    };
  }, [siteKey, onSuccess, onError, onExpired, theme, action]);

  // Sem sitekey configurada — não renderiza nada (dev)
  if (!siteKey) {
    return null;
  }

  if (loadError && unavailable) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200 max-w-md text-center">
        Verificação de segurança não carregou. Recarregue a página
        (Cmd/Ctrl + R) e tente de novo.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      data-turnstile-widget
    />
  );
}
