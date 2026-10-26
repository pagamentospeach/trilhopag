"use client";

import { usePrivacyMode } from "@/components/dashboard/privacy-mode";

/**
 * Esconde um valor em dinheiro quando o olho do topbar esta fechado.
 *
 * Existe pra o resto da tela poder ser Server Component: sem isso, qualquer
 * bloco com um valor dentro teria que virar cliente inteiro so pra ler o
 * contexto do modo privacidade. Aqui so a folha e cliente.
 *
 * Borra em vez de trocar por bolinhas de proposito: o numero continua
 * ocupando a mesma largura, entao a lista nao muda de layout quando o olho
 * abre e fecha. `select-none` porque texto borrado ainda e copiavel, e o
 * ponto do modo e ninguem ao lado ler o valor.
 */
export function PrivateText({ children }: { children: React.ReactNode }) {
  const { privacyMode } = usePrivacyMode();
  if (!privacyMode) return <>{children}</>;
  return (
    <span aria-hidden className="select-none blur-[6px]">
      {children}
    </span>
  );
}
