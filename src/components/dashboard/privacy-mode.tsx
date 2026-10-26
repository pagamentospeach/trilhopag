"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * MODO PRIVACIDADE (o olho do topbar) — 06/08/2026, davi: "O botao do olho
 * para ocultar as infos estao com um delay bizarro para censurar tudo!".
 *
 * ⚠️ Isto aqui é o conserto do delay, e o delay era de arquitetura, não de CSS.
 *
 * COMO ERA: `privacyMode` nascia no SERVER (getUserSettings, no layout) e descia
 * como prop pra sidebar, pro overview e pro topbar. O único que trocava na hora
 * era o topbar, que guardava uma cópia em useState — o resto da tela só mudava
 * quando o server component fosse renderizado DE NOVO. E o clique fazia isso na
 * sequência mais lenta possível:
 *
 *   clique → POST /quick-privacy → (sessão + SELECT + UPSERT no Neon)
 *          → router.refresh() → re-render do dashboard inteiro no server
 *          (todas as queries de métrica de novo) → HTML novo → só ENTÃO borra.
 *
 * Ou seja: o ícone virava na hora e os valores ficavam expostos por ~1–3s. Era
 * exatamente esse o "delay bizarro pra censurar tudo".
 *
 * COMO É: o valor mora aqui, no cliente. O clique troca o estado e TODO mundo
 * que lê o contexto (saldo da sidebar, cards de métrica, barra do topbar) borra
 * no mesmo frame. O POST vira gravação em segundo plano — ninguém espera por
 * ele — e o router.refresh() saiu de vez: a tela já está certa, atualizar o
 * server só repetiria as queries pra chegar no mesmo resultado.
 *
 * O valor do server (`initial`) continua sendo a verdade no primeiro paint,
 * então quem recarrega a página com o modo ligado já recebe tudo borrado — sem
 * flash do valor real.
 */

type PrivacyCtx = {
  privacyMode: boolean;
  toggle: () => void;
};

const Ctx = createContext<PrivacyCtx | null>(null);

export function PrivacyModeProvider({
  initial,
  children,
}: {
  initial: boolean;
  children: React.ReactNode;
}) {
  const [privacyMode, setPrivacyMode] = useState(initial);

  // O provider vive no layout do /dashboard, que NÃO remonta quando se navega
  // entre abas — então o estado do olho atravessa a navegação. Mas em reload
  // (ou em qualquer render novo do layout) o server manda o valor gravado, e
  // ele tem que ganhar do estado antigo.
  const lastInitial = useRef(initial);
  useEffect(() => {
    if (lastInitial.current !== initial) {
      lastInitial.current = initial;
      setPrivacyMode(initial);
    }
  }, [initial]);

  const toggle = useCallback(() => {
    const next = !privacyMode;
    // 1) UI primeiro. É o que mata o delay.
    setPrivacyMode(next);

    // 2) Persistência depois, sem ninguém esperando. Mando o valor DESEJADO em
    //    vez de pedir "inverte o que está no banco": com o toggle instantâneo o
    //    usuário consegue clicar 3x antes do primeiro POST responder, e três
    //    inversões concorrentes chegando fora de ordem deixariam o banco
    //    discordando da tela. Valor explícito é idempotente.
    fetch("/api/dashboard/quick-privacy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ privacyMode: next }),
    }).catch(() => {
      // Falhou gravar (offline, sessão expirada): volta pro que estava, senão a
      // tela mentiria dizendo que o modo ficou salvo.
      setPrivacyMode((m) => (m === next ? !next : m));
    });
  }, [privacyMode]);

  return <Ctx.Provider value={{ privacyMode, toggle }}>{children}</Ctx.Provider>;
}

/**
 * Lê o modo privacidade. Fora do provider devolve `false` (nada borrado) em vez
 * de estourar — assim um componente do dashboard reaproveitado em outra árvore
 * (admin, checkout público) não quebra a página inteira por causa de um blur.
 */
export function usePrivacyMode(): PrivacyCtx {
  return useContext(Ctx) ?? { privacyMode: false, toggle: () => {} };
}
