"use client";

import { useEffect } from "react";

/**
 * Retoma o redirect pós-pagamento quando a aba do checkout foi RECARREGADA.
 *
 * Causa #1 de "upsell não redireciona" no mobile: pra pagar o PIX o cliente sai
 * pro app do banco. Ao voltar, iOS/Android frequentemente RECARREGAM a aba — o
 * estado React e o polling do PixResultDisplay/PixCheckout se perdem e o cliente
 * cai de volta no formulário, nunca sendo redirecionado pro upsell.
 *
 * Solução: ao gerar o PIX, usePixFlow/PixCheckout gravam o txId em localStorage
 * (`tp_pix_<slug>`). Este watcher, montado em TODO checkout, lê isso no load e
 * retoma o polling do /status — se já estiver PAID, redireciona pro destino
 * (mesma prioridade do /status: upsell do seller > thankYou > /obrigado).
 *
 * Idempotente: limpa a chave ao detectar PAID/EXPIRED, então não re-dispara se
 * o cliente apertar "voltar" depois de cair no upsell.
 */
export function PixResumeWatcher({ slug }: { slug: string }) {
  useEffect(() => {
    const KEY = `tp_pix_${slug}`;
    const MAX_AGE = 20 * 60 * 1000; // TTL do PIX (~20min)
    const STOP_AFTER = 8 * 60 * 1000; // para de pollar após 8min sem pagar
    const startedAt = Date.now();
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const read = () => {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const o = JSON.parse(raw) as { tx?: string; ts?: number };
        if (!o?.tx) return null;
        if (Date.now() - (o.ts ?? 0) > MAX_AGE) {
          localStorage.removeItem(KEY);
          return null;
        }
        return o;
      } catch {
        return null;
      }
    };
    const clear = () => {
      try {
        localStorage.removeItem(KEY);
      } catch {
        // ignore
      }
    };

    const check = async () => {
      if (!alive) return;
      const info = read();
      if (!info) return; // nada pendente nesta máquina
      try {
        const res = await fetch(`/api/transactions/${info.tx}/status`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.status === "PAID") {
            clear();
            const dest =
              typeof data.thankYouUrl === "string" && data.thankYouUrl
                ? data.thankYouUrl
                : `/c/${slug}/obrigado?tx=${info.tx}`;
            window.location.href = dest;
            return;
          }
          if (data?.status === "EXPIRED" || data?.status === "FAILED") {
            clear();
            return;
          }
        }
      } catch {
        // rede instável — tenta no próximo tick
      }
      if (alive && Date.now() - startedAt < STOP_AFTER) {
        timer = setTimeout(check, 3000);
      }
    };

    // Primeiro check após 2s — dá precedência ao PixResultDisplay/PixCheckout na
    // tela do QR (eles disparam o pixel de Purchase antes de redirecionar). No
    // caso de aba RECARREGADA (sem QR montado), este watcher é quem resolve.
    timer = setTimeout(check, 2000);

    // Cliente VOLTOU pro checkout → checa NA HORA. pageshow cobre o bfcache do
    // iOS (que não dispara visibilitychange).
    const wake = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden")
        return;
      if (timer) clearTimeout(timer);
      check();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
    };
  }, [slug]);

  return null;
}
