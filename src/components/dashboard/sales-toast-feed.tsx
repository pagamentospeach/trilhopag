"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Volume2, VolumeX, DollarSign, Bell } from "lucide-react";
import { formatBRL } from "@/lib/utils";
import { playSaleSound, unlockSaleSound } from "@/lib/sale-sound";

/**
 * Notificacoes IN-APP no canto superior direito do dashboard (08/07/2026,
 * david mostrou print da caju de referencia). Toca "cha-ching" quando cai
 * uma venda e mostra card com "Venda pendente/aprovada · Você ganhou R$X".
 *
 * Comportamento:
 *  - Polling a cada 5s no /api/dashboard/toast-feed.
 *  - Pausa polling quando aba nao esta visivel (economiza CPU/rede).
 *  - Volume ligado por padrao; toggle salvo em localStorage
 *    (tp_sales_toast_muted).
 *  - Cada toast some sozinho apos ~7s; empilha ate 5 (mais novo em cima).
 *  - PENDING = ambar; PAID = verde (ciano). Ambos com icone de dinheiro.
 *  - PRIMEIRA carga NAO toca som (evita "explosao" quando o seller abre
 *    o dashboard depois de horas fechado). So toca a partir do 2o tick.
 *
 * Som:
 *  - 06/08/2026 (davi mandou o arquivo): toca o som de dinheiro dele,
 *    /sounds/dinheiro.mp3, no lugar do "ka-ching" que era sintetizado aqui no
 *    WebAudio. Toda a mecanica (decodificar 1x, ganho, destravar) mora em
 *    @/lib/sale-sound, compartilhada com o <LiveFeed>.
 *  - Toca so 1x por batch (evita cacofonia com 5 vendas em 5s).
 *  - Autoplay policy: WebAudio precisa de gesto do usuario pra desbloquear.
 *    Antes do 1o click ficamos "armados" mas mudos; o 1o click destrava.
 */
type ToastEvent = {
  id: string;
  tx_id: string;
  kind: "pending" | "paid";
  amount_cents: number;
  net_cents: number;
  product: string;
  customer_name: string | null;
  method: string;
  at: string;
};

const MAX_VISIBLE = 5;
const AUTO_DISMISS_MS = 7000;
const POLL_INTERVAL_MS = 5000;

export function SalesToastFeed() {
  const [items, setItems] = useState<ToastEvent[]>([]);
  const [muted, setMuted] = useState<boolean>(false);
  const [audioReady, setAudioReady] = useState<boolean>(false);
  const lastSinceRef = useRef<string>(new Date().toISOString());
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isFirstTickRef = useRef<boolean>(true);

  // Hidrata mute state do localStorage
  useEffect(() => {
    try {
      const v = localStorage.getItem("tp_sales_toast_muted");
      if (v === "1") setMuted(true);
    } catch {}
  }, []);

  // Destrava audio no PRIMEIRO gesto do usuario. Depois disso o WebAudio
  // pode tocar livremente. Autoplay policy do Chrome/Safari exige isso.
  //
  // 06/08/2026: alem de criar o AudioContext, o unlock ja dispara o download +
  // decode do /sounds/dinheiro.mp3. Assim a PRIMEIRA venda ja sai com som — se
  // deixasse pra baixar so na hora, a primeira sairia muda ou atrasada.
  useEffect(() => {
    function unlock() {
      if (unlockSaleSound()) setAudioReady(true);
    }
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  }, []);

  // Toca o som de dinheiro do davi (/sounds/dinheiro.mp3). O ganho, o decode
  // 1x e o resume do contexto ficam em @/lib/sale-sound.
  function playSale() {
    if (muted) return;
    playSaleSound();
  }

  // Polling do feed
  useEffect(() => {
    let stopped = false;
    let timerId: number | null = null;

    async function tick() {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const res = await fetch(
            `/api/dashboard/toast-feed?since=${encodeURIComponent(lastSinceRef.current)}`,
            { cache: "no-store" },
          );
          if (res.ok) {
            const data = (await res.json()) as {
              events: ToastEvent[];
              server_time: string;
              balance_cents?: number;
            };
            const fresh = data.events.filter(
              (e) => !seenIdsRef.current.has(e.id),
            );
            if (fresh.length > 0) {
              fresh.forEach((e) => seenIdsRef.current.add(e.id));
              // Adiciona no comeco (mais novo em cima); limita MAX_VISIBLE
              setItems((prev) => [...fresh, ...prev].slice(0, MAX_VISIBLE));
              // Toca so a partir do 2o tick (evita "explosao" no load)
              if (!isFirstTickRef.current) {
                playSale();
              }
              // Auto-dismiss cada uma apos AUTO_DISMISS_MS
              fresh.forEach((e) => {
                setTimeout(() => {
                  setItems((prev) => prev.filter((x) => x.id !== e.id));
                }, AUTO_DISMISS_MS);
              });
            }
            // 23/07/2026 (davi): dispara evento com balance atual.
            // <SidebarBalanceLive> escuta e atualiza sem reload.
            if (typeof data.balance_cents === "number") {
              window.dispatchEvent(
                new CustomEvent("bp:balance-tick", {
                  detail: { balanceCents: data.balance_cents },
                }),
              );
            }
            lastSinceRef.current = data.server_time;
          }
        } catch {}
      }
      isFirstTickRef.current = false;
      if (!stopped) {
        timerId = window.setTimeout(tick, POLL_INTERVAL_MS);
      }
    }
    // Primeiro tick com pequeno delay pra nao competir com renderizacao
    timerId = window.setTimeout(tick, 1500);

    function onVis() {
      if (!document.hidden && !stopped) {
        if (timerId !== null) clearTimeout(timerId);
        tick();
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      if (timerId !== null) clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem("tp_sales_toast_muted", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  function dismiss(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 sm:right-6 sm:top-6">
      {/* Toggle de som — so aparece quando ha toasts OU quando audio esta
          armado mas mutado (pra o seller lembrar que ele mesmo desligou). */}
      {(items.length > 0 || (audioReady && muted)) && (
        <div className="pointer-events-auto flex justify-end">
          <button
            type="button"
            onClick={toggleMute}
            title={muted ? "Ativar som de venda" : "Silenciar som de venda"}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-medium text-zinc-300 backdrop-blur hover:bg-black/80 hover:text-white"
          >
            {muted ? (
              <>
                <VolumeX className="size-3" /> Sem som
              </>
            ) : (
              <>
                <Volume2 className="size-3" /> Com som
              </>
            )}
          </button>
        </div>
      )}
      <AnimatePresence initial={false}>
        {items.map((e) => {
          const isPaid = e.kind === "paid";
          return (
            <motion.div
              key={e.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className={`pointer-events-auto group flex items-center gap-3 rounded-2xl border p-3 pr-4 shadow-2xl backdrop-blur ${
                isPaid
                  ? "border-cyan-400/25 bg-black/70 shadow-cyan-400/10"
                  : "border-amber-400/25 bg-black/70 shadow-amber-400/10"
              }`}
              onClick={() => dismiss(e.id)}
              role="alert"
              title="Clique pra dispensar"
            >
              <span
                className={`relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${
                  isPaid
                    ? "bg-cyan-400/15 text-cyan-300"
                    : "bg-amber-400/15 text-amber-300"
                }`}
              >
                {isPaid ? (
                  <DollarSign className="size-5" />
                ) : (
                  <Bell className="size-5" />
                )}
                <span
                  className={`absolute -inset-0.5 rounded-xl opacity-60 blur-md ${
                    isPaid ? "bg-cyan-400/25" : "bg-amber-400/25"
                  }`}
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p
                    className={`truncate text-[13px] font-semibold ${
                      isPaid ? "text-cyan-200" : "text-amber-200"
                    }`}
                  >
                    {isPaid ? "Venda aprovada" : "Venda pendente"}
                  </p>
                  <span className="ml-auto shrink-0 text-[10px] text-zinc-500">
                    agora
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-zinc-300">
                  Você ganhou:{" "}
                  <span className="font-mono font-semibold text-white">
                    {formatBRL(e.net_cents)}
                  </span>
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
