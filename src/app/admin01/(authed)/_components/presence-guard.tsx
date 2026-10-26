"use client";

import { useCallback, useState } from "react";
import { PresenceBar } from "./presence-bar";

/**
 * Casca client que junta a barra de presença com a trava de edição.
 *
 * Quando outro sócio tem o controle da aba, o conteúdo inteiro recebe
 * `inert`: o React 19 repassa o atributo nativo, e o browser tira TODOS os
 * descendentes da árvore de interação — clique, foco, teclado, atalhos e
 * leitores de tela param de enxergar. É bem mais firme que `pointer-events:
 * none`, que ainda deixa tabular até um botão e apertar Enter.
 */
export function PresenceGuard({
  labels,
  children,
}: {
  labels: Record<string, string>;
  children: React.ReactNode;
}) {
  const [locked, setLocked] = useState(false);
  // useCallback pra não recriar a prop a cada render (o efeito da barra
  // depende dela).
  const onLockChange = useCallback((v: boolean) => setLocked(v), []);

  return (
    <>
      <PresenceBar labels={labels} onLockChange={onLockChange} />
      <div
        inert={locked}
        className={
          locked ? "select-none opacity-55 transition-opacity" : undefined
        }
      >
        {children}
      </div>
    </>
  );
}
