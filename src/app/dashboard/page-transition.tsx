"use client";

/**
 * Envelope de PAGE TRANSITION do dashboard (07/07/2026, david): "aplique essa
 * mesma animacao para todas as abas da barra lateral do gateway".
 *
 * O <main> do layout.tsx re-renderiza o children a cada mudanca de rota, mas
 * como e o MESMO node DOM (o main em si), a `animation` CSS nao re-dispara
 * — so na primeira montagem. Solucao: envolvemos {children} num div com
 * `key={pathname}` pra forcar unmount+remount a cada nova rota, o que faz
 * o keyframe rodar toda vez.
 *
 * Efeito: cada aba da sidebar (Cobrancas, Adquirentes, Produtos, etc) entra
 * com fade + slide-up (mesmo estilo da home).
 */
import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // .bp-page-in ativa o stagger automatico dos filhos top-level da pagina
  // (definido em globals.css). key={pathname} re-monta a cada rota → o
  // keyframe roda de novo em cada aba da sidebar.
  return (
    <div key={pathname} className="bp-page-in">
      {children}
    </div>
  );
}
