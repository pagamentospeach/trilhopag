"use client";

import { Check, Circle } from "lucide-react";

/**
 * LINHA DO TEMPO DA TRANSAÇÃO (seção 5 do prompt de revamp).
 *
 * ⚠️ ISTO É DERIVADO DOS CARIMBOS DE DATA, NÃO É UM LOG DE EVENTOS.
 *
 * A seção 5 pede "Pagamento criado → processado → aprovado → saldo
 * atualizado". A leitura óbvia é criar um model `TransactionEvent` e gravar
 * uma linha a cada transição. Não fiz, e por dois motivos:
 *
 * 1. TABELA NOVA COMEÇA VAZIA. Toda venda anterior à migration mostraria uma
 *    linha do tempo em branco — justamente as vendas que alguém abre pra
 *    entender o que aconteceu. Os carimbos já existem em TODAS as linhas,
 *    inclusive nas antigas.
 *
 * 2. Gravar evento a cada transição significa escrever dentro de
 *    `markTransactionPaid`, que é o caminho crítico de pagamento. Um insert a
 *    mais ali troca risco real por conveniência de tela.
 *
 * E tem um terceiro, mais silencioso: um log seria uma SEGUNDA fonte da
 * verdade sobre quando a venda foi paga. Duas fontes divergem, e aí ninguém
 * sabe qual acreditar. Aqui a linha do tempo é uma leitura dos mesmos campos
 * que o resto do painel usa — não pode discordar deles.
 *
 * O que isso custa: não há evento para coisa que não deixou carimbo (tentativa
 * de cartão recusada, retentativa de webhook). Se um dia precisar disso, é
 * backend novo e decisão do davi.
 */

export type EventoTx = {
  quando: string | null;
  titulo: string;
  detalhe?: string;
};

export function Timeline({ eventos }: { eventos: EventoTx[] }) {
  // Só o que aconteceu. Passo futuro em cinza sugeriria que a venda ainda vai
  // andar, e várias não vão (expirada, estornada).
  const ocorridos = eventos.filter((e) => e.quando);
  if (ocorridos.length === 0) return null;

  return (
    <ol className="relative space-y-3 pl-5">
      {/* A linha vertical é um pseudo-elemento do <ol>, não um filho por item:
          assim ela não some entre os pontos quando o espaçamento muda. */}
      <span
        aria-hidden
        className="absolute bottom-2 left-[5px] top-2 w-px bg-white/[0.10]"
      />
      {ocorridos.map((e, i) => {
        const ultimo = i === ocorridos.length - 1;
        return (
          <li key={e.titulo} className="relative">
            <span
              aria-hidden
              className={`absolute -left-5 top-1 inline-flex size-[11px] items-center justify-center rounded-full ${
                ultimo ? "bg-cyan-400 text-black" : "bg-white/[0.15] text-transparent"
              }`}
            >
              {ultimo ? (
                <Check className="size-2" strokeWidth={4} />
              ) : (
                <Circle className="size-1" />
              )}
            </span>
            <p
              className={`text-[13px] leading-tight ${ultimo ? "font-medium text-white" : "text-zinc-300"}`}
            >
              {e.titulo}
            </p>
            <p className="text-[11px] text-zinc-500">
              {e.quando}
              {e.detalhe && ` · ${e.detalhe}`}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/** Data e hora no fuso de Brasília. O servidor roda em UTC. */
function fmt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Monta os eventos a partir dos carimbos.
 *
 * A ORDEM aqui é a ordem em que as coisas acontecem, e não a ordem dos
 * campos: expiração e estorno são finais alternativos, então ficam por
 * último. O componente só desenha o que tem data, então um PIX que expirou
 * simplesmente não mostra "aprovado".
 */
export function montarEventos(tx: {
  createdAt: string;
  pixCopiedAt: string | null;
  paidAt: string | null;
  sellerNotifiedAt: string | null;
  availableAt: string | null;
  releasedToBalance: boolean;
  expiredAt: string | null;
  refundedAt: string | null;
  method: string;
}): EventoTx[] {
  const ehPix = tx.method?.toUpperCase() === "PIX";
  return [
    {
      quando: fmt(tx.createdAt),
      titulo: ehPix ? "Cobrança criada" : "Pagamento iniciado",
    },
    {
      quando: fmt(tx.pixCopiedAt),
      titulo: "Cliente copiou o código PIX",
    },
    {
      quando: fmt(tx.paidAt),
      titulo: "Pagamento aprovado",
    },
    {
      quando: fmt(tx.sellerNotifiedAt),
      titulo: "Venda liberada pra você",
      detalhe: "aparece no extrato a partir daqui",
    },
    {
      // Só marca saldo atualizado quando de fato foi creditado. `availableAt`
      // sozinho é a data PREVISTA de liberação, e mostrá-lo como se fosse
      // crédito diria que o dinheiro está disponível antes de estar.
      quando: tx.releasedToBalance ? fmt(tx.availableAt) : null,
      titulo: "Saldo atualizado",
    },
    { quando: fmt(tx.expiredAt), titulo: "Cobrança expirou" },
    { quando: fmt(tx.refundedAt), titulo: "Valor devolvido" },
  ];
}
