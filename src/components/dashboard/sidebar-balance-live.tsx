"use client";

import { useEffect, useState } from "react";
import { formatBRL } from "@/lib/utils";
import { usePrivacyMode } from "@/components/dashboard/privacy-mode";

/**
 * 23/07/2026 (davi): saldo AO VIVO na sidebar — atualiza sem reload sempre
 * que cai venda aprovada.
 *
 * Escuta o evento `bp:balance-tick` disparado pelo <SalesToastFeed> a cada
 * poll (5s). Se o valor mudou, atualiza com pulse verde + fade.
 *
 * Zero request extra — reusa o polling que ja rolava pra o feed de toasts.
 * Se o SalesToastFeed nao estiver montado (ex: pagina que nao inclui ele),
 * fallback silencioso pra mostrar o initialCents estatico.
 */
export function SidebarBalanceLive({ initialCents }: { initialCents: number }) {
  // 06/08/2026 (davi: "delay bizarro para censurar"): o saldo era o pior caso
  // do bug — vinha por prop do server, então continuava na tela até o
  // router.refresh() terminar. Agora lê o contexto e some no clique.
  const { privacyMode } = usePrivacyMode();
  const [cents, setCents] = useState(initialCents);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    function onTick(e: Event) {
      const detail = (e as CustomEvent).detail as { balanceCents?: number };
      const next = detail?.balanceCents;
      if (typeof next !== "number") return;
      setCents((prev) => {
        if (prev === next) return prev;
        // Pulse verde curto quando o valor muda (feedback visual)
        setPulse(true);
        setTimeout(() => setPulse(false), 1400);
        return next;
      });
    }
    window.addEventListener("bp:balance-tick", onTick);
    return () => window.removeEventListener("bp:balance-tick", onTick);
  }, []);

  return (
    // 06/08/2026 (davi): "aumenta o tamanho do campo de saldo disponivel" →
    // xl (20px) virou 3xl (30px). Aí veio "pode dar uma diminuidinha nesse
    // texto do campo de disponivel" e desceu pra 2xl (24px): ainda maior que
    // o original, sem o valor gritar mais alto que o resto da sidebar.
    //
    // `tabular-nums` continua sendo o que segura o número no lugar quando o
    // saldo muda ao vivo — sem ele, cada dígito tem largura própria e o valor
    // "pula" a cada tick de 5s.
    <p
      className={
        "relative mt-1 text-2xl font-bold tabular-nums tracking-tight transition-all duration-500 " +
        (pulse
          ? "text-cyan-300 scale-[1.04]"
          : "text-white group-hover:text-cyan-200")
      }
    >
      {privacyMode ? "●●●●●" : formatBRL(cents)}
    </p>
  );
}
