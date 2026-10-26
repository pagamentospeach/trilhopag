"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantém o quadro ao vivo sem ninguém apertar F5.
 *
 * 12/08/2026 (davi): "várias funções ali não estão funcionando de forma ao
 * vivo, então tem que recarregar a página pra elas aparecerem".
 *
 * São DOIS problemas diferentes com o mesmo sintoma, e este arquivo resolve o
 * segundo:
 *
 *  1. A própria ação da pessoa não aparecia. Era o bug da cópia local em
 *     client.tsx, que só re-sincronizava quando o ID do quadro mudava.
 *     Corrigido lá.
 *  2. A ação DOS OUTROS nunca chegava. Um quadro de sócios é compartilhado:
 *     o Lucas move um card e o Davi continua vendo o card no lugar antigo até
 *     recarregar. É o que este hook cobre.
 *
 * ── POR QUE POLLING E NÃO WEBSOCKET ─────────────────────────────────────
 *
 * Três pessoas num quadro interno. Um `router.refresh()` a cada 12s custa uma
 * consulta pequena e nada de infraestrutura. WebSocket exigiria um servidor
 * com estado — que este projeto não tem, porque roda serverless na Vercel.
 *
 * ── AS TRÊS PAUSAS ──────────────────────────────────────────────────────
 *
 * Atualizar na hora errada é pior que não atualizar:
 *
 *  - ABA ESCONDIDA: sem `visibilitychange`, o navegador seguiria consultando
 *    a cada 12s com a aba em segundo plano o dia inteiro. Ao voltar, atualiza
 *    na hora — que é justo quando a pessoa quer ver o que mudou.
 *  - DIGITANDO ou ARRASTANDO: um refresh no meio de um texto substitui o
 *    valor do campo pelo do servidor e come o que estava sendo escrito. O
 *    `podePausar` vem do componente, que sabe se tem modal aberto ou arraste
 *    em curso.
 *  - JÁ ATUALIZANDO: evita empilhar refresh quando a rede está lenta.
 */
export function useQuadroAoVivo(podePausar: () => boolean, intervaloMs = 12_000) {
  const router = useRouter();
  // Ref e não state: trocar a função de pausa não pode re-renderizar o quadro.
  // A escrita vai DENTRO de um efeito porque mexer em `.current` durante o
  // render é impuro (o React 19 avisa, com razão).
  const pausarRef = useRef(podePausar);
  useEffect(() => {
    pausarRef.current = podePausar;
  });

  useEffect(() => {
    let vivo = true;

    function tentar() {
      if (!vivo) return;
      if (document.visibilityState !== "visible") return;
      if (pausarRef.current()) return;
      router.refresh();
    }

    const timer = setInterval(tentar, intervaloMs);

    // Voltou pra aba: atualiza imediatamente em vez de esperar o próximo tick.
    function aoVoltar() {
      if (document.visibilityState === "visible") tentar();
    }
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      vivo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router, intervaloMs]);
}
