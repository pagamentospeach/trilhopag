"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdminSession } from "@/lib/admin-auth";

/**
 * ORGANIZADOR DOS SOCIOS — server actions.
 *
 * 12/08/2026 (davi), duas mensagens seguidas:
 *   "tira essas opcoes de arquivar e tudo mais, deixa so excluir (...) tudo de
 *    firula voce tira, so quero que o basico funcione muito bem"
 *   "o texto da descricao clicando no proprio card sem abrir card nenhum (...)
 *    pra nao ficar abrindo um monte de aba"
 *
 * Sobrou o osso: quadro, coluna, card, quem e o responsavel. Tudo editado na
 * propria tela, sem modal.
 *
 * Sairam: arquivamento, cores, etiquetas, prioridade, prazo, checklist,
 * comentarios, duplicar e o painel de metricas.
 *
 * ⚠️ TODA action passa por `exigirAdmin()`. Sao server actions, ou seja,
 * endpoints HTTP de verdade: sem a checagem, quem descobrisse o id de um card
 * poderia edita-lo com um fetch. O layout do /admin01 protege a TELA, nao as
 * actions.
 *
 * ⚠️ AGORA SO EXISTE EXCLUIR, E EXCLUIR NAO VOLTA. Antes havia arquivamento
 * como rede de seguranca. Por isso toda exclusao que leva outra coisa junto
 * (coluna com cards, quadro com colunas) exige `confirmado: true`, e a tela so
 * manda esse true depois de dizer o que vai embora.
 *
 * Os campos que sairam da tela (arquivado, cor, prioridade, prazo,
 * concluidoEm) e as tabelas de etiqueta, checklist e comentario continuam no
 * schema. Nao apago coluna e tabela de banco em producao pra tirar botao de
 * tela: o que ja foi escrito fica, e voltar qualquer um deles e so mexer no
 * front.
 */

async function exigirAdmin(): Promise<string> {
  const s = await getCurrentAdminSession();
  if (!s?.admin?.id) throw new Error("nao autorizado");
  return s.admin.id;
}

/**
 * Tetos de tamanho.
 *
 * ⚠️ 12/08/2026: eram 40 pra coluna e 60 pro quadro, apertados demais. O davi
 * escreveu "David - Codigo / marketing SEO / IA / videos" no nome da coluna e
 * o texto sumia no "vi" — 40 caracteres cravados. O nome agora quebra em
 * várias linhas na tela, então não há motivo pra ser curto.
 *
 * Continuam existindo porque `String` no Postgres é TEXT sem limite: sem corte
 * aqui, um paste de 2 MB entraria no banco e todo carregamento do quadro
 * pagaria por isso. É trava contra acidente, não regra de estilo.
 */
const MAX_NOME = 200;
const MAX_TITULO = 500;
const MAX_DESCRICAO = 20_000;

function ok() {
  revalidatePath("/admin01/organizador");
  return { ok: true as const };
}

// ─── Quadros ────────────────────────────────────────────────────────────────

export async function criarQuadro(nome: string) {
  await exigirAdmin();
  const limpo = nome.trim().slice(0, MAX_NOME);
  if (!limpo) return { ok: false as const, erro: "Dê um nome ao quadro." };
  const ultimo = await prisma.board.findFirst({
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  const board = await prisma.board.create({
    data: {
      nome: limpo,
      ordem: (ultimo?.ordem ?? -1) + 1,
      // Ja nasce com as tres colunas. Quadro vazio pede uma decisao ("como eu
      // chamo a primeira coluna?") antes de deixar a pessoa fazer o que ela
      // veio fazer, que e escrever a primeira tarefa.
      listas: {
        create: [
          { nome: "A fazer", ordem: 0 },
          { nome: "Fazendo", ordem: 1 },
          { nome: "Feito", ordem: 2 },
        ],
      },
    },
    select: { id: true },
  });
  revalidatePath("/admin01/organizador");
  return { ok: true as const, boardId: board.id };
}

export async function renomearQuadro(id: string, nome: string) {
  await exigirAdmin();
  const limpo = nome.trim().slice(0, MAX_NOME);
  if (!limpo) return { ok: false as const, erro: "Nome vazio." };
  await prisma.board.update({ where: { id }, data: { nome: limpo } });
  return ok();
}

/** Exclui o quadro com colunas e cards. Sem volta — a tela confirma antes. */
export async function excluirQuadro(id: string, confirmado = false) {
  await exigirAdmin();
  const cards = await prisma.boardCard.count({
    where: { lista: { boardId: id } },
  });
  if (!confirmado) {
    return { ok: false as const, erro: "precisa_confirmar", cards };
  }
  await prisma.board.delete({ where: { id } });
  return ok();
}

// ─── Colunas ────────────────────────────────────────────────────────────────

export async function criarLista(boardId: string, nome: string) {
  await exigirAdmin();
  const limpo = nome.trim().slice(0, MAX_NOME);
  if (!limpo) return { ok: false as const, erro: "Nome vazio." };
  const ultima = await prisma.boardList.findFirst({
    where: { boardId },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  await prisma.boardList.create({
    data: { boardId, nome: limpo, ordem: (ultima?.ordem ?? -1) + 1 },
  });
  return ok();
}

export async function renomearLista(id: string, nome: string) {
  await exigirAdmin();
  const limpo = nome.trim().slice(0, MAX_NOME);
  if (!limpo) return { ok: false as const, erro: "Nome vazio." };
  await prisma.boardList.update({ where: { id }, data: { nome: limpo } });
  return ok();
}

/** Exclui a coluna com os cards dentro. A tela diz quantos antes de confirmar. */
export async function excluirLista(id: string, confirmado = false) {
  await exigirAdmin();
  const cards = await prisma.boardCard.count({ where: { listId: id } });
  if (cards > 0 && !confirmado) {
    return { ok: false as const, erro: "precisa_confirmar", cards };
  }
  await prisma.boardList.delete({ where: { id } });
  return ok();
}

/** Reordena as colunas. Recebe os ids na ordem final. */
export async function reordenarListas(ids: string[]) {
  await exigirAdmin();
  await prisma.$transaction(
    ids.map((id, i) =>
      prisma.boardList.update({ where: { id }, data: { ordem: i } }),
    ),
  );
  // Sem revalidate: a tela ja moveu (otimista) e um refresh aqui faria a
  // coluna pular de volta e voltar de novo.
  return { ok: true as const };
}

// ─── Cards ──────────────────────────────────────────────────────────────────

export async function criarCard(listId: string, titulo: string) {
  const adminId = await exigirAdmin();
  const limpo = titulo.trim().slice(0, MAX_TITULO);
  if (!limpo) return { ok: false as const, erro: "Escreva algo." };
  const ultimo = await prisma.boardCard.findFirst({
    where: { listId },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  await prisma.boardCard.create({
    data: {
      listId,
      titulo: limpo,
      ordem: (ultimo?.ordem ?? -1) + 1,
      criadoPorId: adminId,
    },
  });
  return ok();
}

export async function atualizarCard(
  id: string,
  dados: {
    titulo?: string;
    descricao?: string;
    responsavelId?: string | null;
  },
) {
  await exigirAdmin();
  await prisma.boardCard.update({
    where: { id },
    data: {
      ...(dados.titulo !== undefined
        ? { titulo: dados.titulo.trim().slice(0, MAX_TITULO) }
        : {}),
      ...(dados.descricao !== undefined
        ? { descricao: dados.descricao.slice(0, MAX_DESCRICAO) }
        : {}),
      ...(dados.responsavelId !== undefined
        ? { responsavelId: dados.responsavelId || null }
        : {}),
    },
  });
  return ok();
}

/**
 * Move o card. Recebe a ORDEM FINAL das colunas envolvidas, não um índice.
 *
 * ⚠️ Mandar a lista inteira é o que faz isso ser correto. A primeira versão
 * recebia um índice e abria espaço com um `updateMany ... ordem >= indice`, e
 * errava em três casos: mover dentro da mesma coluna (o card que saía era
 * empurrado junto), coluna de origem nunca recompactada (buracos na ordem, e
 * depois de umas dez movidas dois cards empatavam) e, com filtro ligado, o
 * índice era a posição na lista FILTRADA. Assim é idempotente: repetir a
 * chamada dá o mesmo resultado.
 */
export async function moverCard(
  cardId: string,
  destinoListId: string,
  /** ids da coluna de destino, na ordem final, incluindo o card movido. */
  ordemDestino: string[],
  /** ids da coluna de origem depois da saída. Vazio quando é a mesma coluna. */
  ordemOrigem: string[] = [],
) {
  await exigirAdmin();
  await prisma.$transaction([
    ...ordemDestino.map((id, i) =>
      prisma.boardCard.update({
        where: { id },
        data: { ordem: i, ...(id === cardId ? { listId: destinoListId } : {}) },
      }),
    ),
    ...ordemOrigem.map((id, i) =>
      prisma.boardCard.update({ where: { id }, data: { ordem: i } }),
    ),
  ]);
  return { ok: true as const };
}

/**
 * Marca ou desmarca o card como feito.
 *
 * 12/08/2026 (davi): "adiciona no quadro uma funcao de check".
 *
 * Guarda a DATA e nao um booleano. `concluidoEm` ja existia no schema e custa
 * o mesmo, mas responde "quando terminou" alem de "terminou" — que e a
 * pergunta da sexta-feira ("o que a gente entregou essa semana?"). Desmarcar
 * volta pra null: card reaberto nao pode continuar contando como feito.
 */
export async function alternarConcluido(id: string, feito: boolean) {
  await exigirAdmin();
  await prisma.boardCard.update({
    where: { id },
    data: { concluidoEm: feito ? new Date() : null },
  });
  return ok();
}

export async function excluirCard(id: string) {
  await exigirAdmin();
  await prisma.boardCard.delete({ where: { id } });
  return ok();
}
