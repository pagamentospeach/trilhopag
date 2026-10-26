"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDownToLine, Eye, EyeOff, QrCode } from "lucide-react";
import { formatBRL } from "@/lib/utils";
import { usePrivacyMode } from "@/components/dashboard/privacy-mode";

/**
 * O cartao de saldo do topo da home no celular — a peca que faz a tela ler
 * como app de banco em vez de painel de metricas.
 *
 * Tres coisas moram juntas aqui de proposito:
 *
 *  - o VALOR, grande. E a resposta da pergunta que fez a pessoa abrir o app.
 *  - o OLHO, no proprio cartao. No desktop ele vive no topbar, longe; no
 *    celular o gesto e "abri o app no onibus, escondi o saldo", e ele precisa
 *    estar do lado do numero. E o mesmo estado do topbar (mesmo contexto),
 *    entao esconder aqui esconde tudo.
 *  - as duas ACOES de dinheiro, sacar e cobrar. Sao as unicas duas coisas que
 *    se faz com um saldo, e ficam dentro do cartao em vez de numa fileira
 *    solta de atalhos — atalho fora de contexto e so mais um menu.
 *
 * O valor acompanha o `bp:balance-tick`, o mesmo evento que o saldo da
 * sidebar ja escutava: quando cai venda o numero sobe sozinho, sem request
 * novo (quem faz o poll e o SalesToastFeed, que ja estava montado).
 */
export function MobileBalance({ initialCents }: { initialCents: number }) {
  const { privacyMode, toggle } = usePrivacyMode();
  const [cents, setCents] = useState(initialCents);
  const [pulse, setPulse] = useState(false);

  // O layout do painel nao remonta na navegacao entre abas, mas um reload
  // traz saldo novo do servidor — ele tem que ganhar do estado antigo.
  useEffect(() => setCents(initialCents), [initialCents]);

  useEffect(() => {
    function onTick(e: Event) {
      const next = (e as CustomEvent).detail?.balanceCents;
      if (typeof next !== "number") return;
      setCents((prev) => {
        if (prev === next) return prev;
        setPulse(true);
        setTimeout(() => setPulse(false), 1400);
        return next;
      });
    }
    window.addEventListener("bp:balance-tick", onTick);
    return () => window.removeEventListener("bp:balance-tick", onTick);
  }, []);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-black p-5">
      {/* Brilho da marca no canto. Sem blur grande: `blur-3xl` num elemento
       *  desse tamanho e uma das coisas que mais custa GPU em aparelho fraco,
       *  e um gradiente radial da o mesmo resultado de graca. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(34,211,238,0.20), transparent)",
        }}
      />

      <div className="relative flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Saldo disponível
        </p>
        <button
          type="button"
          onClick={toggle}
          className="-my-1 rounded-full p-1 text-zinc-500 transition active:scale-90"
          aria-label={privacyMode ? "Exibir saldo" : "Ocultar saldo"}
        >
          {privacyMode ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </button>
      </div>

      <p
        className={`relative mt-1.5 text-[34px] font-bold leading-none tabular-nums tracking-tight transition-colors duration-500 ${
          pulse ? "text-cyan-300" : "text-white"
        }`}
      >
        {privacyMode ? "R$ ●●●●" : formatBRL(cents)}
      </p>

      <div className="relative mt-5 grid grid-cols-2 gap-2">
        <Action
          href="/dashboard/financeiro?tab=saidas"
          icon={<ArrowDownToLine className="size-4" />}
          label="Sacar"
        />
        <Action
          href="/dashboard/cobrancas"
          icon={<QrCode className="size-4" />}
          label="Cobrar"
          primary
        />
      </div>
    </section>
  );
}

function Action({
  href,
  icon,
  label,
  primary = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition active:scale-[0.97] ${
        primary
          ? "bg-cyan-400 text-black"
          : "border border-white/[0.10] bg-white/[0.04] text-white"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
