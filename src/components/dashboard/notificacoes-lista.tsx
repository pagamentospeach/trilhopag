"use client";

import Link from "next/link";
import { useTransition } from "react";
import {
  CheckCheck,
  CircleDollarSign,
  Globe,
  Repeat,
  Wallet,
  Info,
} from "lucide-react";
import { marcarLida, marcarTodasLidas } from "@/app/dashboard/notificacoes-actions";

/**
 * A lista da central de notificações (seção 19).
 *
 * Antes de 09/08/2026 o sino continha SÓ o painel de configuração de push. A
 * seção 19 pede uma central: lista de eventos, marcar como lida, marcar todas
 * e abrir o item relacionado. As configurações de push continuam logo abaixo —
 * não foram removidas, só deixaram de ser a única coisa ali.
 */

export type Notificacao = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  lida: boolean;
  /** Já formatado no servidor, no fuso de Brasília. */
  quando: string;
};

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  sale: CircleDollarSign,
  withdrawal: Wallet,
  domain: Globe,
  subscription: Repeat,
  system: Info,
};

export function NotificacoesLista({ itens }: { itens: Notificacao[] }) {
  const [pending, start] = useTransition();
  const temNaoLida = itens.some((i) => !i.lida);

  if (itens.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-[12px] text-zinc-500">
        Nada por aqui ainda. Vendas, saques e avisos aparecem nesta lista.
      </p>
    );
  }

  return (
    <div>
      {temNaoLida && (
        <div className="flex justify-end border-b border-white/[0.06] px-3 py-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => marcarTodasLidas().then(() => {}))}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 transition hover:text-cyan-300 disabled:opacity-50"
          >
            <CheckCheck className="size-3" /> Marcar todas como lidas
          </button>
        </div>
      )}

      <ul className="max-h-80 overflow-y-auto">
        {itens.map((n) => {
          const Icon = ICONES[n.kind] ?? Info;
          const conteudo = (
            <>
              <span
                className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full ${
                  n.lida
                    ? "bg-white/[0.05] text-zinc-500"
                    : "bg-cyan-400/15 text-cyan-300"
                }`}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[13px] leading-snug ${n.lida ? "text-zinc-400" : "font-medium text-white"}`}
                >
                  {n.title}
                </span>
                {n.body && (
                  <span className="block truncate text-[11px] text-zinc-500">
                    {n.body}
                  </span>
                )}
                <span className="block text-[10px] text-zinc-600">
                  {n.quando}
                </span>
              </span>
              {/* Ponto de não lida à direita: o padrão que todo app usa, e
                  some sozinho quando o item é aberto. */}
              {!n.lida && (
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan-400" />
              )}
            </>
          );

          const classe =
            "flex w-full items-start gap-2.5 border-b border-white/[0.04] px-3 py-2.5 text-left transition last:border-b-0 hover:bg-white/[0.03]";

          // Abrir a notificação marca como lida. Sem isso o seller teria que
          // clicar duas vezes: uma pra ir, outra pra limpar o ponto.
          if (n.href) {
            return (
              <li key={n.id}>
                <Link
                  href={n.href}
                  onClick={() => {
                    if (!n.lida) start(() => marcarLida(n.id).then(() => {}));
                  }}
                  className={classe}
                >
                  {conteudo}
                </Link>
              </li>
            );
          }
          return (
            <li key={n.id}>
              <button
                type="button"
                disabled={n.lida || pending}
                onClick={() => start(() => marcarLida(n.id).then(() => {}))}
                className={classe}
              >
                {conteudo}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
