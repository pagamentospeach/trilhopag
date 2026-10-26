"use client";

/**
 * Registra o service worker silenciosamente assim que o dashboard monta.
 * Não pede permissão — só prepara o SW pra que o usuário possa ativar push
 * com 1 toque depois. Idempotente.
 *
 * SELF-HEAL (jun/2026): se ESTE navegador já tem permissão concedida E uma
 * push subscription ativa, re-registra o endpoint atual no servidor (upsert
 * idempotente). Isso recupera, sem o user fazer nada:
 *   - devices cuja sub foi salva errada no passado (POST achatado dava 400 e a
 *     sub nunca entrava no banco, mesmo com a sub existindo no navegador);
 *   - subs limpas do server por 410 mas ainda válidas no device;
 *   - troca de conta no mesmo navegador (reassocia ao userId logado).
 * NÃO cria sub nova quando não existe — respeita quem desativou de propósito.
 *
 * Fica vivo no layout do dashboard.
 */
import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        await navigator.serviceWorker.ready;
        if (cancelled) return;
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          "PushManager" in window
        ) {
          const sub = await reg.pushManager.getSubscription();
          if (sub && !cancelled) {
            const body = sub.toJSON();
            if (body.endpoint && body.keys) {
              await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  endpoint: body.endpoint,
                  keys: body.keys,
                }),
              }).catch(() => {});
            }
          }
        }
      } catch {
        // silencioso — não bloqueia UX
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
