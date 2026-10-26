import { prisma } from "@/lib/prisma";
import { getCurrentAdminSession } from "@/lib/admin-auth";
import { Organizador } from "./client";

/**
 * ORGANIZADOR DOS SOCIOS — 12/08/2026 (davi): quadro estilo Trello pra dividir
 * o que cada um faz.
 *
 * Enxugado no mesmo dia, a pedido: sem arquivamento, sem cores, sem etiqueta,
 * prioridade, prazo, checklist, comentario, busca nem painel de metricas.
 * Sobrou quadro, coluna, card e responsavel — tudo editado na propria tela,
 * sem modal.
 *
 * `?q=` (quadro) mora na URL de proposito: da pra mandar "olha o quadro de
 * produto" no zap com link direto, em vez de "abre o organizador e clica na
 * segunda aba".
 */
export const dynamic = "force-dynamic";

export default async function OrganizadorPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const sessao = await getCurrentAdminSession();
  const euId = sessao?.admin?.id ?? null;

  const [quadros, socios] = await Promise.all([
    prisma.board.findMany({
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.adminAccount.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  if (quadros.length === 0) {
    return (
      <Organizador quadros={[]} quadroAtual={null} socios={socios} euId={euId} />
    );
  }

  const idEscolhido = quadros.find((q) => q.id === sp.q)?.id ?? quadros[0].id;

  const quadro = await prisma.board.findUnique({
    where: { id: idEscolhido },
    select: {
      id: true,
      nome: true,
      listas: {
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          nome: true,
          cards: {
            orderBy: { ordem: "asc" },
            select: {
              id: true,
              titulo: true,
              descricao: true,
              concluidoEm: true,
              responsavel: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  });

  return (
    <Organizador
      quadros={quadros}
      quadroAtual={
        quadro
          ? {
              ...quadro,
              listas: quadro.listas.map((l) => ({
                ...l,
                cards: l.cards.map((c) => ({
                  ...c,
                  // Date nao atravessa a fronteira server -> client.
                  concluidoEm: c.concluidoEm?.toISOString() ?? null,
                })),
              })),
            }
          : null
      }
      socios={socios}
      euId={euId}
    />
  );
}
