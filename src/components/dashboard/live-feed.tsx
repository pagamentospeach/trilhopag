"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { Volume2, VolumeX, Sparkles, ChevronRight } from "lucide-react";
import { formatBRL } from "@/lib/utils";
import { playSaleSound, unlockSaleSound } from "@/lib/sale-sound";

type Event = {
  id: string;
  amount_cents: number;
  net_cents: number;
  product: string;
  customer_name: string | null;
  method: string;
  paid_at: string;
};

/**
 * 06/08/2026 (davi mandou o arquivo: "Troca o som das notificacoes para esse
 * som dinheiro"): aqui o botão de mudo era decorativo.
 *
 * O `<audio>` apontava pra um data-URI de WAV que é o stub clássico de
 * SILÊNCIO — declarava um chunk `data` de ~1.6GB e trazia 3 bytes de zero.
 * Nunca saiu som nenhum do "Vendas ao vivo", só o ícone de alto-falante
 * alternando. Agora toca o mesmo /sounds/dinheiro.mp3 do toast, via
 * @/lib/sale-sound.
 */

export function LiveFeed({
  initial,
  soundEnabled,
}: {
  initial: Event[];
  soundEnabled: boolean;
}) {
  const [events, setEvents] = useState<Event[]>(initial);
  const [muted, setMuted] = useState(!soundEnabled);
  const lastSeenRef = useRef<string>(
    initial[0]?.paid_at ?? new Date().toISOString(),
  );

  // Autoplay policy: áudio só destrava dentro de um gesto do usuário.
  useEffect(() => {
    const unlock = () => void unlockSaleSound();
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  }, []);

  useEffect(() => {
    // PERF: polling pausa quando aba invisivel (document.hidden=true).
    // Antes polla a cada 8s mesmo aba em background — gastava CPU + rede
    // a toa pra seller com varias abas ou dashboards minimizados.
    let stopped = false;
    let nextId: number | null = null;
    async function tick() {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const res = await fetch(
            `/api/dashboard/feed?since=${encodeURIComponent(lastSeenRef.current)}`,
            { cache: "no-store" },
          );
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.events) && data.events.length > 0) {
              setEvents((prev) => {
                const ids = new Set(prev.map((e) => e.id));
                const fresh = data.events.filter((e: Event) => !ids.has(e.id));
                if (fresh.length === 0) return prev;
                if (!muted) playSaleSound();
                lastSeenRef.current = fresh[0].paid_at;
                return [...fresh, ...prev].slice(0, 10);
              });
            }
          }
        } catch {}
      }
      if (!stopped) nextId = window.setTimeout(tick, 8000);
    }
    nextId = window.setTimeout(tick, 8000);
    // Dispara tick imediato quando aba volta a ficar visivel
    function onVisibility() {
      if (!document.hidden && !stopped) {
        if (nextId !== null) clearTimeout(nextId);
        tick();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      if (nextId !== null) clearTimeout(nextId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [muted]);

  return (
    // 29/07/2026 (davi 'arruma esse espaco em branco de baixo do grafico, so
    // diminuir a box de Vendas ao vivo do tamanho certinho'): antes o outer
    // era so `p-5` sem cap de altura + a lista de eventos crescia ate 10 itens
    // (~600px). Grid `auto-rows` esticava a linha inteira pra caber o LiveFeed
    // → o chart do lado (h-72 fixo) ficava com espaço em branco embaixo.
    // Fix: flex h-full flex-col no outer (preenche a altura da célula do
    // grid) + flex-1/min-h-0/overflow-y-auto na lista + max-h-72 pra CAPAR o
    // intrinseco (senao a lista com 10 eventos ainda estica a row via
    // min-content sizing). max-h-72 (18rem/288px) casa com o `h-72` do
    // RevenueChart → ambos ficam alinhados.
    //
    // 06/08/2026 (davi, três rodadas: 'esses campos de metricas nao ficam
    // legais transparentes... opaco mas com elegancia' → 'ficou cinza, tinha
    // que ser preto elegante com detalhes' → 'queria algo mais preto'):
    // mesma superfície dos MetricCard — `bg-black`, um degrau mais escuro que
    // a página (#050505), sem gradiente de luz (era ele que puxava o topo pro
    // cinza). Forma definida só pela borda: fio de luz em cima, ring interno
    // e sombra funda. Se só os 4 KPIs mudassem, esse painel do lado ficaria
    // destoando de todo o resto da tela.
    //
    // HOVER (06/08/2026, davi): "Esse efeitinho quando passa o mouse em cima
    // na dashboard, faz esse mesmo efeito para o grafico e o vendas ao vivo".
    // Mesmas classes dos MetricCard — borda acende ciano, sombra ciano, o card
    // sobe 2px e o brilho difuso aparece no canto. `motion-safe:` no
    // deslocamento: quem tem "reduzir movimento" no SO fica só com a cor.
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-black p-5 shadow-[0_16px_40px_-24px_rgba(0,0,0,1)] ring-1 ring-inset ring-white/[0.04] transition-all duration-300 ease-out will-change-transform hover:border-cyan-400/30 hover:shadow-[0_18px_44px_-20px_rgba(34, 211, 238,0.28)] motion-safe:hover:-translate-y-0.5">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      {/* Brilho ciano do canto. Maior que o dos KPIs (size-40 vs size-28)
          porque o painel é bem mais alto — o mesmo halo pequeno sumiria. */}
      <span className="pointer-events-none absolute -right-14 -top-14 size-40 rounded-full bg-cyan-400/20 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />
      {/* `relative` nos filhos: o overlay de luz acima é position:absolute e,
          num mesmo contexto de empilhamento, elemento posicionado pinta em
          cima de bloco não-posicionado. Sem isso o gradiente passaria por
          cima do conteúdo. */}
      <div className="relative flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex size-2 items-center justify-center">
            <span className="absolute inline-flex size-2 animate-ping rounded-full bg-cyan-400/60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-cyan-400" />
          </span>
          <h3 className="text-sm font-medium text-white">Vendas ao vivo</h3>
        </div>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="rounded-full p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
          title={muted ? "Ativar som" : "Silenciar"}
          aria-label={muted ? "Ativar som" : "Silenciar"}
        >
          {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </button>
      </div>

      <div className="relative mt-4 flex-1 min-h-0 max-h-72 space-y-2 overflow-y-auto pr-1">
        {events.length === 0 ? (
          <p className="py-8 text-center text-xs text-zinc-500">
            Esperando a primeira venda. Ela vai aparecer aqui em tempo real.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((ev) => (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
              {/* 09/08/2026, seção 4: "Clique na transação deve abrir
                  detalhes". O feed mostrava a venda e terminava ali — pra ver
                  qualquer coisa a mais o seller ia pro Financeiro e caçava a
                  linha na mão.
                  O destino usa o MESMO `?highlight=` que o push de venda paga
                  usa, e que passou a funcionar em 08/08 (antes o redirect de
                  /dashboard/vendas jogava a query fora). Uma correção, dois
                  caminhos: notificação e feed chegam na mesma tela. */}
              <Link
                href={`/dashboard/financeiro?tab=entradas&highlight=${ev.id}`}
                className="flex items-center gap-3 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] p-3 transition hover:border-cyan-400/35 hover:bg-cyan-400/[0.08]"
              >
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-cyan-400/20 text-cyan-300">
                  <Sparkles className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">
                    <span className="font-medium">
                      {ev.customer_name ?? "Alguém"}
                    </span>{" "}
                    comprou{" "}
                    <span className="text-zinc-400">{ev.product}</span>
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {timeAgo(ev.paid_at)} · {ev.method}
                  </p>
                </div>
                <span className="font-mono text-sm font-semibold text-cyan-300 tabular-nums">
                  +{formatBRL(ev.amount_cents)}
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-cyan-400/40" />
              </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}
