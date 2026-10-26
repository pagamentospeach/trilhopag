"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// 29/07/2026 (davi): tirado badge "recomendado" do Dominio Proprio (ficava
// poluindo visualmente sem agregar) + removidas as abas "Cupons", "Pixels" e
// "Disparo (SMS/Email)". Pixels vive SO no checkout builder; disparo foi
// removido pq nao entregava o que prometia — davi 'apaga a aba de disparo
// (sms/email)'.
//
// 10/08/2026 (davi): "TIRAR ABA 'MUDAR ADQUIRENTE' DENTRO DO PRODUTO". Sai
// junto com a /dashboard/adquirentes — quem escolhe adquirente agora e o
// admin, no painel dele. O campo `acquirerByMode` do Product continua no
// banco e continua sendo respeitado pelo dispatcher; so nao ha mais tela do
// seller pra mexer nele.
const TABS = [
  { key: "", label: "Ofertas", soon: false, badge: undefined as string | undefined },
  { key: "/dominio", label: "Domínio Próprio", soon: false, badge: undefined },
  { key: "/coproducao", label: "Coprodução/Sócio", soon: false, badge: undefined },
  { key: "/entregavel", label: "Entregável", soon: false, badge: undefined },
];

export function ProductTabsNav({ productId }: { productId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/produtos/${productId}`;
  return (
    // 29/07/2026 (davi 'tira essa sombra ali, ta jogada'): removido o fade
    // gradient da direita. Nao precisa mais — com 6 abas cabem confortavel
    // em desktop e o overflow-x nativo ja da o comportamento certo em mobile
    // (a sombra ficava "jogada" quando os tabs ja cabiam sem overflow).
    <div className="overflow-x-auto scrollbar-thin">
      <div className="flex min-w-max gap-1 border-b border-white/[0.06]">
        {TABS.map((t) => {
          const href = `${base}${t.key}`;
          const active =
            (t.key === "" && pathname === base) ||
            (t.key !== "" && pathname.startsWith(href));
          return (
            <Link
              key={t.key || "ofertas"}
              href={href}
              className={cn(
                "relative whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition",
                active
                  ? "border-cyan-400 text-cyan-300"
                  : "border-transparent text-zinc-400 hover:text-white",
              )}
            >
              {t.label}
              {t.soon && (
                <span className="ml-2 rounded-full bg-yellow-400/15 px-1.5 py-0 text-[9px] text-yellow-200">
                  em breve
                </span>
              )}
              {t.badge && (
                <span className="ml-2 rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300">
                  {t.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
