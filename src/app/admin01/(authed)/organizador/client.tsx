"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, GripVertical, Trash2, Pencil, LayoutGrid } from "lucide-react";
import { ToastHost, toast } from "@/components/ui/toast";
import { useQuadroAoVivo } from "./live";
import * as A from "./actions";

/**
 * ORGANIZADOR — quadro dos sócios.
 *
 * ── SEM MODAL, DE PROPÓSITO ─────────────────────────────────────────────
 *
 * 12/08/2026 (davi): "o texto da descrição clicando no próprio card sem abrir
 * card nenhum (...) pra não ficar abrindo um monte de aba".
 *
 * A versão anterior tinha um modal com responsável, prioridade, prazo,
 * etiquetas, checklist e comentários. Pra escrever uma linha de contexto a
 * pessoa abria uma janela, achava o campo e fechava. Agora título e descrição
 * são editados no lugar onde já estão escritos: clicou, virou campo, saiu do
 * campo, salvou.
 *
 * ── DRAG NATIVO ─────────────────────────────────────────────────────────
 *
 * O projeto já arrasta em quatro lugares com os eventos de HTML5 direto. Uma
 * biblioteca de drag somaria peso ao bundle do admin pra repetir o que já
 * funciona.
 *
 * ── MOVIMENTO OTIMISTA ──────────────────────────────────────────────────
 *
 * O card muda de coluna na tela ANTES do servidor responder. Sem isso ele
 * volta pro lugar antigo por um instante e depois pula, que é a sensação de
 * travado que faz a pessoa arrastar de novo.
 */

type Socio = { id: string; name: string; email: string };
type Card = {
  id: string;
  titulo: string;
  descricao: string;
  /** ISO quando marcado como feito; null quando não. */
  concluidoEm: string | null;
  responsavel: Socio | null;
};
type Lista = { id: string; nome: string; cards: Card[] };
type Quadro = { id: string; nome: string; listas: Lista[] };

function primeiroNome(s: { name: string; email: string } | null): string {
  if (!s) return "";
  return s.name?.trim() || s.email.split("@")[0];
}

function iniciais(s: { name: string; email: string }): string {
  return primeiroNome(s).slice(0, 2).toUpperCase();
}

export function Organizador({
  quadros,
  quadroAtual,
  socios,
  euId,
}: {
  quadros: { id: string; nome: string }[];
  quadroAtual: Quadro | null;
  socios: Socio[];
  euId: string | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();

  /**
   * Cópia local do quadro, só pra mover card/coluna sem esperar o servidor.
   *
   * ⚠️ Compara a REFERÊNCIA do objeto, não o id. Uma versão anterior comparava
   * o id e, como ele não muda quando você cria um card, todo refresh era
   * ignorado: a ação gravava no banco e a tela seguia mostrando a cópia velha.
   * Cada refresh traz um objeto novo do servidor e a cópia é descartada;
   * durante um arraste nada chega do servidor, então ela sobrevive.
   */
  const [local, setLocal] = useState<Quadro | null>(quadroAtual);
  const [refServidor, setRefServidor] = useState(quadroAtual);
  if (quadroAtual !== refServidor) {
    setRefServidor(quadroAtual);
    setLocal(quadroAtual);
  }
  const q = local ?? quadroAtual;

  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colArrastando, setColArrastando] = useState<number | null>(null);

  /**
   * Quadro ao vivo: puxa mudanças dos outros sócios sozinho.
   *
   * Pausa quando um refresh atrapalharia de verdade: arraste em curso (o card
   * pularia da mão) ou cursor dentro de um campo (o texto sendo escrito seria
   * substituído pelo do servidor).
   */
  useQuadroAoVivo(() => {
    if (arrastando || colArrastando !== null) return true;
    const tag =
      typeof document !== "undefined" ? document.activeElement?.tagName : null;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  });

  function rodar(fn: () => Promise<{ ok: boolean; erro?: string }>, msg?: string) {
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) toast.erro(r.erro ?? "Não deu.");
        else if (msg) toast.sucesso(msg);
        router.refresh();
      } catch {
        toast.erro("Erro de conexão. Nada foi salvo.");
        router.refresh();
      }
    });
  }

  /** Aplica a mudança na cópia local na hora, pro clique não parecer travado. */
  function patchCard(cardId: string, fn: (c: Card) => Card) {
    setLocal((atual) => {
      const base = atual ?? quadroAtual;
      if (!base) return atual;
      return {
        ...base,
        listas: base.listas.map((l) => ({
          ...l,
          cards: l.cards.map((c) => (c.id === cardId ? fn(c) : c)),
        })),
      };
    });
  }

  /**
   * Solta o card ANTES do card `antesDoId` (null = no fim da coluna).
   * Trabalha com ID e não com índice — ver o comentário de `moverCard`.
   */
  function soltarCardEm(listId: string, antesDoId: string | null) {
    if (!arrastando || !q) return;
    const cardId = arrastando;
    setArrastando(null);
    if (cardId === antesDoId) return;

    const copia: Quadro = {
      ...q,
      listas: q.listas.map((l) => ({ ...l, cards: [...l.cards] })),
    };
    let card: Card | undefined;
    let origemId = "";
    for (const l of copia.listas) {
      const i = l.cards.findIndex((c) => c.id === cardId);
      if (i >= 0) {
        card = l.cards.splice(i, 1)[0];
        origemId = l.id;
        break;
      }
    }
    if (!card) return;
    const destino = copia.listas.find((l) => l.id === listId);
    if (!destino) return;
    const pos = antesDoId ? destino.cards.findIndex((c) => c.id === antesDoId) : -1;
    destino.cards.splice(pos >= 0 ? pos : destino.cards.length, 0, card);
    setLocal(copia);

    const ordemDestino = destino.cards.map((c) => c.id);
    const ordemOrigem =
      origemId && origemId !== listId
        ? (copia.listas.find((l) => l.id === origemId)?.cards ?? []).map((c) => c.id)
        : [];

    start(async () => {
      const r = await A.moverCard(cardId, listId, ordemDestino, ordemOrigem);
      if (!r.ok) toast.erro("Não consegui mover.");
      router.refresh();
    });
  }

  if (!q) {
    return (
      <>
        <ToastHost />
        <PrimeiroQuadro
          onCriar={(nome) =>
            start(async () => {
              const r = await A.criarQuadro(nome);
              if (!r.ok) return toast.erro(r.erro ?? "Não deu.");
              router.refresh();
            })
          }
        />
      </>
    );
  }

  return (
    <>
      <ToastHost />
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        {/* ── Barra de quadros ──────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3 md:px-6">
          <LayoutGrid className="size-4 text-cyan-400" />
          {quadros.map((qq) => (
            <button
              key={qq.id}
              type="button"
              onClick={() => router.push(`/admin01/organizador?q=${qq.id}`)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                qq.id === q.id
                  ? "bg-cyan-400/15 text-cyan-300 ring-1 ring-inset ring-cyan-400/30"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              {qq.nome}
            </button>
          ))}
          <NovoQuadro
            onCriar={(nome) =>
              start(async () => {
                const r = await A.criarQuadro(nome);
                if (!r.ok) return toast.erro(r.erro ?? "Não deu.");
                toast.sucesso("Quadro criado.");
                if (r.boardId) router.push(`/admin01/organizador?q=${r.boardId}`);
              })
            }
          />

          <div className="flex-1" />

          <RenomearQuadro
            nome={q.nome}
            onSalvar={(nome) =>
              rodar(() => A.renomearQuadro(q.id, nome), "Nome trocado.")
            }
          />
          <button
            type="button"
            title="Excluir este quadro"
            onClick={() =>
              start(async () => {
                const r = await A.excluirQuadro(q.id, false);
                if (!r.ok && r.erro === "precisa_confirmar") {
                  const n = (r as { cards?: number }).cards ?? 0;
                  if (
                    !confirm(
                      `Excluir o quadro "${q.nome}"?\n\nVão junto ${n} card(s) e todas as colunas. Não tem como desfazer.`,
                    )
                  )
                    return;
                  const r2 = await A.excluirQuadro(q.id, true);
                  if (!r2.ok) return toast.erro("Não deu.");
                  toast.sucesso("Quadro excluído.");
                  router.push("/admin01/organizador");
                  return;
                }
                router.refresh();
              })
            }
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="size-4" />
          </button>
        </div>

        {/* ── Colunas ───────────────────────────────────────────────────── */}
        <div className="flex flex-1 gap-3 overflow-x-auto p-4 md:p-6">
          {q.listas.map((l, li) => (
            <section
              key={l.id}
              className={`flex w-[300px] shrink-0 flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] ${
                colArrastando === li ? "opacity-60" : ""
              }`}
            >
              <header
                // ⚠️ `draggable` fica na ALÇA, nao no header inteiro. Com ele
                // aqui, clicar no nome pra editar comecava um arraste em vez
                // de posicionar o cursor, e o campo perdia o foco sem salvar.
                onDragStart={() => setColArrastando(li)}
                onDragOver={(e) => {
                  if (colArrastando === null || colArrastando === li) return;
                  e.preventDefault();
                  const ids = q.listas.map((x) => x.id);
                  const [m] = ids.splice(colArrastando, 1);
                  ids.splice(li, 0, m);
                  setLocal({
                    ...q,
                    listas: ids.map((id) => q.listas.find((x) => x.id === id)!),
                  });
                  setColArrastando(li);
                }}
                onDragEnd={() => {
                  if (colArrastando !== null && local) {
                    const ids = local.listas.map((x) => x.id);
                    start(async () => {
                      await A.reordenarListas(ids);
                    });
                  }
                  setColArrastando(null);
                }}
                className="flex items-start gap-2 border-b border-white/[0.06] px-3 py-2.5"
              >
                <span
                  draggable
                  title="Arraste pra reordenar a coluna"
                  className="mt-0.5 cursor-grab text-zinc-600 active:cursor-grabbing"
                >
                  <GripVertical className="size-3.5 shrink-0" />
                </span>
                <TextoEditavel
                  valor={l.nome}
                  onSalvar={(nome) => rodar(() => A.renomearLista(l.id, nome))}
                  // `min-w-0` deixa o flex encolher; sem ele um nome longo
                  // empurrava o contador e a lixeira pra fora da coluna. Sem
                  // `truncate`: o nome desce pra segunda linha em vez de virar
                  // "João - Marketing Comercial …".
                  className="min-w-0 flex-1 text-sm font-medium leading-snug text-white"
                />
                {/* "2/5" em vez de "5": com o check, o que interessa e
                    quanto falta, nao quanto tem. */}
                <span className="mt-0.5 shrink-0 rounded-full bg-white/[0.06] px-1.5 text-[10px] tabular-nums text-zinc-400">
                  {l.cards.filter((c) => c.concluidoEm).length}/{l.cards.length}
                </span>
                <button
                  type="button"
                  title="Excluir coluna"
                  onClick={() =>
                    start(async () => {
                      const r = await A.excluirLista(l.id, false);
                      if (!r.ok && r.erro === "precisa_confirmar") {
                        const n = (r as { cards?: number }).cards ?? 0;
                        if (
                          !confirm(
                            `Excluir a coluna "${l.nome}"?\n\nVão junto ${n} card(s). Não tem como desfazer.`,
                          )
                        )
                          return;
                        const r2 = await A.excluirLista(l.id, true);
                        if (!r2.ok) return toast.erro("Não deu.");
                      } else if (!r.ok) {
                        return toast.erro("Não deu.");
                      }
                      toast.sucesso("Coluna excluída.");
                      router.refresh();
                    })
                  }
                  className="mt-0.5 shrink-0 rounded p-1 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </header>

              <div
                className="flex-1 space-y-2 overflow-y-auto p-2"
                onDragOver={(e) => arrastando && e.preventDefault()}
                onDrop={() => soltarCardEm(l.id, null)}
              >
                {l.cards.map((c) => (
                  <CardNoQuadro
                    key={c.id}
                    card={c}
                    socios={socios}
                    euId={euId}
                    arrastando={arrastando === c.id}
                    podeSoltar={!!arrastando}
                    onDragStart={() => setArrastando(c.id)}
                    onDragEnd={() => setArrastando(null)}
                    onDrop={() => soltarCardEm(l.id, c.id)}
                    onSalvarTitulo={(titulo) => {
                      patchCard(c.id, (x) => ({ ...x, titulo }));
                      rodar(() => A.atualizarCard(c.id, { titulo }));
                    }}
                    onSalvarDescricao={(descricao) => {
                      patchCard(c.id, (x) => ({ ...x, descricao }));
                      rodar(() => A.atualizarCard(c.id, { descricao }));
                    }}
                    onResponsavel={(id) => {
                      patchCard(c.id, (x) => ({
                        ...x,
                        responsavel: socios.find((s) => s.id === id) ?? null,
                      }));
                      rodar(() => A.atualizarCard(c.id, { responsavelId: id }));
                    }}
                    onCheck={(feito) => {
                      patchCard(c.id, (x) => ({
                        ...x,
                        concluidoEm: feito ? new Date().toISOString() : null,
                      }));
                      rodar(() => A.alternarConcluido(c.id, feito));
                    }}
                    onExcluir={() => {
                      if (!confirm(`Excluir "${c.titulo}"?`)) return;
                      rodar(() => A.excluirCard(c.id), "Card excluído.");
                    }}
                  />
                ))}

                <NovoCard onCriar={(t) => rodar(() => A.criarCard(l.id, t))} />
              </div>
            </section>
          ))}

          <NovaColuna
            onCriar={(nome) => rodar(() => A.criarLista(q.id, nome), "Coluna criada.")}
          />
        </div>
      </div>
    </>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────

/**
 * Texto que vira campo ao clicar e salva ao sair.
 *
 * É a peça central do "sem abrir aba nenhuma": serve pro nome da coluna, pro
 * título e pra descrição do card. Salva no blur e no Enter; Escape desiste sem
 * gravar. Sem botão de salvar, que seria mais um clique.
 */
function TextoEditavel({
  valor,
  onSalvar,
  className = "",
  placeholder,
  multilinha = false,
  onEditandoChange,
}: {
  valor: string;
  onSalvar: (v: string) => void;
  className?: string;
  placeholder?: string;
  multilinha?: boolean;
  /**
   * Avisa o pai que virou campo.
   *
   * ⚠️ É o que conserta o "mudo o nome e não salva". O card e o cabeçalho da
   * coluna são `draggable`, e um elemento arrastável ENGOLE o clique-e-arraste
   * dentro dele: o navegador começa a arrastar em vez de deixar o cursor
   * selecionar texto, e o campo perde o foco sem disparar o blur direito. O
   * pai usa este aviso pra desligar o `draggable` enquanto o campo está
   * aberto.
   */
  onEditandoChange?: (v: boolean) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);

  function abrir() {
    setRascunho(valor);
    setEditando(true);
    onEditandoChange?.(true);
  }

  function fechar() {
    setEditando(false);
    onEditandoChange?.(false);
  }

  function confirmar() {
    fechar();
    const limpo = rascunho.trim();
    if (limpo !== valor.trim()) onSalvar(limpo);
  }

  if (!editando) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          abrir();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") abrir();
        }}
        // `break-words` porque nome de coluna e título de card longos
        // (“João - Marketing Comercial …”) estouravam a caixa ou eram cortados
        // em vez de descer pra linha de baixo.
        className={`${className} cursor-text break-words ${
          !valor && placeholder ? "italic text-zinc-600" : ""
        }`}
      >
        {valor || placeholder}
      </span>
    );
  }

  if (multilinha) {
    return (
      <textarea
        autoFocus
        rows={3}
        value={rascunho}
        placeholder={placeholder}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          // Enter quebra linha aqui; Escape desiste. Descrição costuma ter mais
          // de uma linha, então prender o Enter atrapalharia.
          if (e.key === "Escape") {
            setRascunho(valor);
            fechar();
          }
        }}
        className={`${className} w-full resize-y rounded border border-cyan-400/40 bg-black/60 px-1.5 py-0.5 outline-none`}
      />
    );
  }

  return (
    <input
      autoFocus
      value={rascunho}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmar();
        }
        if (e.key === "Escape") {
          setRascunho(valor);
          fechar();
        }
      }}
      className={`${className} w-full rounded border border-cyan-400/40 bg-black/60 px-1.5 py-0.5 outline-none`}
    />
  );
}

function CardNoQuadro({
  card,
  socios,
  euId,
  arrastando,
  podeSoltar,
  onDragStart,
  onDragEnd,
  onDrop,
  onSalvarTitulo,
  onSalvarDescricao,
  onResponsavel,
  onCheck,
  onExcluir,
}: {
  card: Card;
  socios: Socio[];
  euId: string | null;
  arrastando: boolean;
  podeSoltar: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onSalvarTitulo: (v: string) => void;
  onSalvarDescricao: (v: string) => void;
  onResponsavel: (id: string) => void;
  onCheck: (feito: boolean) => void;
  onExcluir: () => void;
}) {
  const [editandoDono, setEditandoDono] = useState(false);
  // Mesma armadilha do header da coluna: um <article draggable> engole o
  // clique-e-arraste dentro dos campos. Enquanto o título, a descrição ou o
  // seletor de responsável estiverem abertos, o card não arrasta.
  const [editandoTexto, setEditandoTexto] = useState(false);
  const podeArrastar = !editandoTexto && !editandoDono;

  return (
    <article
      draggable={podeArrastar}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => podeSoltar && e.preventDefault()}
      onDrop={(e) => {
        e.stopPropagation();
        onDrop();
      }}
      className={`group rounded-xl border bg-black/40 p-2.5 transition hover:border-cyan-400/30 ${
        card.concluidoEm
          ? "border-white/[0.04] opacity-60"
          : "border-white/[0.08]"
      } ${arrastando ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-2">
        {/* O check fica ANTES do título, na altura da primeira linha. É o
            primeiro alvo do olho e da mão — marcar feito é a ação mais
            repetida do quadro. `shrink-0` pra ele não ser espremido quando o
            título ocupa duas linhas. */}
        <input
          type="checkbox"
          checked={!!card.concluidoEm}
          onChange={(e) => onCheck(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          title={card.concluidoEm ? "Desmarcar" : "Marcar como feito"}
          className="mt-[3px] size-3.5 shrink-0 cursor-pointer accent-cyan-400"
        />
        <TextoEditavel
          valor={card.titulo}
          onSalvar={onSalvarTitulo}
          onEditandoChange={setEditandoTexto}
          className={`min-w-0 flex-1 text-[13px] leading-snug ${
            card.concluidoEm ? "text-zinc-600 line-through" : "text-zinc-100"
          }`}
        />
        <button
          type="button"
          onClick={onExcluir}
          title="Excluir card"
          className="shrink-0 rounded p-0.5 text-zinc-700 opacity-0 transition hover:text-red-300 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* A descrição é editada AQUI, no lugar onde ela aparece. Vazia, mostra
          "descrição…" em cinza — é o convite pra clicar, senão não haveria onde
          clicar num card sem descrição. */}
      <div className="mt-1">
        <TextoEditavel
          valor={card.descricao}
          onSalvar={onSalvarDescricao}
          onEditandoChange={setEditandoTexto}
          placeholder="descrição…"
          multilinha
          className="block whitespace-pre-line text-[11px] leading-relaxed text-zinc-500"
        />
      </div>

      <div className="mt-2">
        {editandoDono ? (
          <select
            autoFocus
            value={card.responsavel?.id ?? ""}
            onChange={(e) => {
              onResponsavel(e.target.value);
              setEditandoDono(false);
            }}
            onBlur={() => setEditandoDono(false)}
            className="rounded border border-cyan-400/40 bg-black/60 px-1.5 py-0.5 text-[11px] text-white outline-none"
          >
            <option value="" className="bg-zinc-900">
              Ninguém
            </option>
            {socios.map((s) => (
              <option key={s.id} value={s.id} className="bg-zinc-900">
                {primeiroNome(s)}
                {s.id === euId ? " (eu)" : ""}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            onClick={() => setEditandoDono(true)}
            title="Quem faz"
            className="inline-flex items-center gap-1.5 rounded-full px-1 py-0.5 text-[10px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
          >
            {card.responsavel ? (
              <>
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-cyan-400/15 text-[9px] font-bold text-cyan-300">
                  {iniciais(card.responsavel)}
                </span>
                {primeiroNome(card.responsavel)}
              </>
            ) : (
              <>
                <span className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-white/20 text-zinc-600">
                  <Plus className="size-2.5" />
                </span>
                quem faz
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
}

function PrimeiroQuadro({ onCriar }: { onCriar: (nome: string) => void }) {
  const [nome, setNome] = useState("Operação");
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-center">
        <LayoutGrid className="mx-auto size-8 text-cyan-400" />
        <h1 className="mt-3 text-lg font-semibold text-white">
          Organizador dos sócios
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
          Quadros, colunas e cards pra dividir o que cada um faz. O primeiro
          quadro já vem com A fazer, Fazendo e Feito.
        </p>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="mt-4 w-full rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/40"
          placeholder="Nome do quadro"
        />
        <button
          type="button"
          onClick={() => onCriar(nome)}
          className="mt-3 w-full rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-cyan-300"
        >
          Criar quadro
        </button>
      </div>
    </div>
  );
}

function RenomearQuadro({
  nome,
  onSalvar,
}: {
  nome: string;
  onSalvar: (n: string) => void;
}) {
  const [abrir, setAbrir] = useState(false);
  const [v, setV] = useState(nome);
  if (!abrir)
    return (
      <button
        type="button"
        title="Trocar o nome do quadro"
        onClick={() => {
          setV(nome);
          setAbrir(true);
        }}
        className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
      >
        <Pencil className="size-4" />
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim() && v.trim() !== nome) onSalvar(v);
        setAbrir(false);
      }}
      className="flex items-center gap-1.5"
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setAbrir(false)}
        className="w-44 rounded-lg border border-cyan-400/40 bg-black/40 px-2.5 py-1.5 text-sm text-white outline-none"
      />
      <button
        type="submit"
        className="rounded-lg bg-cyan-400 px-2.5 py-1.5 text-xs font-semibold text-black"
      >
        Salvar
      </button>
      <button
        type="button"
        onClick={() => setAbrir(false)}
        className="text-zinc-500 hover:text-white"
      >
        <X className="size-4" />
      </button>
    </form>
  );
}

function NovoQuadro({ onCriar }: { onCriar: (n: string) => void }) {
  const [abrir, setAbrir] = useState(false);
  const [nome, setNome] = useState("");
  if (!abrir)
    return (
      <button
        type="button"
        onClick={() => setAbrir(true)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
      >
        <Plus className="size-3.5" /> Quadro
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!nome.trim()) return;
        onCriar(nome);
        setNome("");
        setAbrir(false);
      }}
      className="flex items-center gap-1.5"
    >
      <input
        autoFocus
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setAbrir(false)}
        placeholder="Nome do quadro"
        className="w-44 rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-sm text-white outline-none focus:border-cyan-400/40"
      />
      <button
        type="submit"
        className="rounded-lg bg-cyan-400 px-2.5 py-1.5 text-xs font-semibold text-black"
      >
        Criar
      </button>
      <button
        type="button"
        onClick={() => setAbrir(false)}
        className="text-zinc-500 hover:text-white"
      >
        <X className="size-4" />
      </button>
    </form>
  );
}

function NovaColuna({ onCriar }: { onCriar: (n: string) => void }) {
  const [abrir, setAbrir] = useState(false);
  const [nome, setNome] = useState("");
  if (!abrir)
    return (
      <button
        type="button"
        onClick={() => setAbrir(true)}
        className="h-fit w-[300px] shrink-0 rounded-2xl border border-dashed border-white/[0.1] px-3 py-3 text-left text-sm text-zinc-500 transition hover:border-cyan-400/30 hover:text-white"
      >
        <Plus className="mr-1 inline size-4" /> Nova coluna
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!nome.trim()) return;
        onCriar(nome);
        setNome("");
        setAbrir(false);
      }}
      className="h-fit w-[300px] shrink-0 rounded-2xl border border-white/[0.1] bg-white/[0.02] p-2"
    >
      <input
        autoFocus
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setAbrir(false)}
        placeholder="Nome da coluna"
        className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
      />
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="submit"
          className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-black"
        >
          Adicionar
        </button>
        <button
          type="button"
          onClick={() => setAbrir(false)}
          className="px-2 text-zinc-500 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
    </form>
  );
}

function NovoCard({ onCriar }: { onCriar: (t: string) => void }) {
  const [abrir, setAbrir] = useState(false);
  const [txt, setTxt] = useState("");
  if (!abrir)
    return (
      <button
        type="button"
        onClick={() => setAbrir(true)}
        className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
      >
        <Plus className="mr-1 inline size-3.5" /> Adicionar card
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!txt.trim()) return;
        onCriar(txt);
        setTxt("");
      }}
    >
      <textarea
        autoFocus
        rows={2}
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => {
          // Enter salva, Shift+Enter quebra linha. Digitar tarefa é rápido e ir
          // no mouse a cada uma mata o ritmo.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (txt.trim()) {
              onCriar(txt);
              setTxt("");
            }
          }
          if (e.key === "Escape") setAbrir(false);
        }}
        placeholder="O que precisa ser feito?"
        className="w-full resize-none rounded-xl border border-white/[0.1] bg-black/40 p-2.5 text-[13px] text-white outline-none focus:border-cyan-400/40"
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          type="submit"
          className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-black"
        >
          Adicionar
        </button>
        <button
          type="button"
          onClick={() => setAbrir(false)}
          className="text-zinc-500 hover:text-white"
        >
          <X className="size-4" />
        </button>
        <span className="text-[10px] text-zinc-600">Enter salva</span>
      </div>
    </form>
  );
}
