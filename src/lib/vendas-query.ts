// `Prisma` entra como VALOR e não só como tipo: o filtro de comprovante usa
// `Prisma.DbNull`, que é um sentinela em runtime.
import { Prisma } from "@prisma/client";
import { parseEmvMerchantName } from "./pix-emv";

/**
 * A CONSULTA DA ABA DE ENTRADAS — where, filtros e serialização, num lugar só.
 *
 * 08/08/2026. Este módulo nasce resolvendo dois problemas de uma vez.
 *
 * ── 1. OS FILTROS MENTIAM ────────────────────────────────────────────────
 *
 * Status, método, período, produto, oferta e busca rodavam em memória, sobre
 * as 50 linhas que a página tinha carregado. Filtrar por "PAID" varria 50
 * transações e devolvia o resultado com a mesma cara de sempre — sem nenhum
 * sinal de que a pergunta só tinha sido feita pra uma fatia. Quem vende pouco
 * nunca percebe; quem vende muito toma decisão em cima de resposta incompleta.
 *
 * O caso agudo era a BUSCA: procurar um cliente pelo nome, e-mail ou CPF
 * devolvia "nenhum resultado" quando a venda dele era a de número 200. A
 * seção 44 do prompt de revamp pergunta literalmente "eu consigo encontrar uma
 * transação rapidamente?", e a resposta era não.
 *
 * Agora quem filtra é o Postgres, e a lista inteira do seller entra na conta.
 *
 * ── 2. O SHAPE ERA COPIADO À MÃO EM DOIS LUGARES ─────────────────────────
 *
 * `financeiro/page.tsx` e `api/dashboard/vendas-more/route.ts` mapeavam a
 * transação campo a campo, com ~35 campos cada. O docstring da rota já pedia
 * "reproduz EXATAMENTE o select da page.tsx; se algum campo mudar lá,
 * atualizar aqui" — e mesmo assim divergiu: em 27/07/2026 o `providerId` foi
 * adicionado só na página, e toda venda trazida pelo botão "Ver mais"
 * aparecia sem provider ID no detalhe. Pedido escrito no comentário não é
 * garantia; uma função só é.
 *
 * ── SOBRE O PERÍODO, QUE É ONDE ISSO PODIA DAR ERRADO ────────────────────
 *
 * O corte de data vem do cliente já resolvido em `from`/`to` ISO, e não como
 * "7d" pro servidor interpretar. É de propósito: o filtro sempre foi relativo
 * ao fuso do NAVEGADOR do seller, e o servidor roda em UTC. Traduzir "hoje" no
 * servidor mudaria silenciosamente o que o seller vê perto da meia-noite.
 * Mandando o intervalo pronto, o significado continua exatamente o mesmo de
 * antes — só o lugar onde ele é aplicado mudou.
 */

export type VendasFiltros = {
  /** Status exato do enum, ou null pra todos. */
  status: string | null;
  /** "pix" | "card" | null. "card" é tudo que não é PIX (inclui wallets). */
  method: "pix" | "card" | null;
  productId: string | null;
  checkoutId: string | null;
  /** Busca livre: nome, e-mail, CPF ou id da transação. */
  q: string | null;
  /** Corte inferior/superior por `createdAt`, em ISO. */
  from: string | null;
  to: string | null;
  /** Só transações com comprovante anexado. */
  onlyReceipts: boolean;
  /** Faixa de valor em CENTAVOS (o campo da tela é em reais e converte). */
  minCents: number | null;
  maxCents: number | null;
};

export const FILTROS_VAZIOS: VendasFiltros = {
  status: null,
  method: null,
  productId: null,
  checkoutId: null,
  q: null,
  from: null,
  to: null,
  onlyReceipts: false,
  minCents: null,
  maxCents: null,
};

/**
 * O que o seller PODE ver. Nunca relaxar nada aqui sem entender os quatro.
 *
 * Esta é a única definição — a página e a rota de paginação leem daqui. Duas
 * cópias à mão desse filtro é o jeito mais rápido de um dia uma delas esquecer
 * o `divertedToAcquirer` e vazar desvio numa tela só.
 */
export function entradasVisiveis(userId: string) {
  return {
    userId,
    // Invisibilidade TOTAL do desvio: nem skim nem rede aparecem.
    divertedToAcquirer: false,
    divertedToReferrer: false,
    // FAILED nunca aparece pro seller: é erro de API/dispatcher, não venda.
    // Visível apenas no admin01 pra diagnóstico.
    status: { not: "FAILED" as const },
    // Janela de 60s: tx PAID recém-aprovada some da lista (parece continuar
    // PENDING pro seller) até `sellerNotifiedAt` ser preenchido.
    OR: [
      { status: { not: "PAID" as const } },
      { sellerNotifiedAt: { not: null } },
    ],
  };
}

/** Escapa `%` e `_`, que são curingas do LIKE do Postgres. */
function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Monta o `where` completo: visibilidade + filtros do seller.
 *
 * ⚠️ `AND` explícito em vez de espalhar as chaves no objeto raiz. O
 * `entradasVisiveis` já usa um `OR` (a janela de 60s), e o filtro de busca
 * precisa de outro `OR` (nome/e-mail/CPF/id). Dois `OR` no mesmo nível: o
 * segundo sobrescreveria o primeiro e a janela de camuflagem sumiria — venda
 * recém-paga apareceria pro seller antes da hora justamente quando ele
 * estivesse buscando.
 */
export function vendasWhere(
  userId: string,
  f: VendasFiltros,
): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [entradasVisiveis(userId)];

  if (f.status) {
    and.push({ status: f.status as Prisma.TransactionWhereInput["status"] });
  }

  if (f.method === "pix") {
    and.push({ method: "PIX" });
  } else if (f.method === "card") {
    // "Cartão" cobre cartão e carteiras (Google/Apple Pay, MB Way,
    // Multibanco). A regra sempre foi "tudo que não é PIX".
    and.push({ method: { not: "PIX" } });
  }

  if (f.productId) and.push({ productId: f.productId });
  if (f.checkoutId) and.push({ checkoutId: f.checkoutId });

  if (f.from || f.to) {
    and.push({
      createdAt: {
        ...(f.from ? { gte: new Date(f.from) } : {}),
        ...(f.to ? { lte: new Date(f.to) } : {}),
      },
    });
  }

  if (f.onlyReceipts) {
    // O comprovante mora dentro do JSON `providerPayload`, não em coluna
    // própria. `not: Prisma.DbNull` no caminho equivale a "a chave existe e
    // não é nula" — que é exatamente o que a tela mostra como "tem
    // comprovante".
    and.push({
      providerPayload: { path: ["receipt_url"], not: Prisma.DbNull },
    } as Prisma.TransactionWhereInput);
  }

  if (f.minCents !== null || f.maxCents !== null) {
    and.push({
      amountCents: {
        ...(f.minCents !== null ? { gte: f.minCents } : {}),
        ...(f.maxCents !== null ? { lte: f.maxCents } : {}),
      },
    });
  }

  if (f.q) {
    const q = f.q.trim();
    const soDigitos = q.replace(/\D/g, "");
    const like = escaparLike(q);
    const ors: Prisma.TransactionWhereInput[] = [
      { customerName: { contains: like, mode: "insensitive" } },
      { customerEmail: { contains: like, mode: "insensitive" } },
      { id: { contains: like, mode: "insensitive" } },
      // 09/08/2026: `providerId` entrou na busca. É o id do lado do PSP, e é
      // o número que o seller tem na mão quando abre o painel do adquirente
      // ou recebe um print do suporte — buscar por ele era impossível.
      { providerId: { contains: like, mode: "insensitive" } },
      { product: { name: { contains: like, mode: "insensitive" } } },
    ];
    // CPF é comparado só por dígitos porque o banco guarda com e sem
    // pontuação dependendo de quem gravou. Mínimo de 3 pra não fazer varredura
    // com o usuário tendo digitado uma letra só.
    if (soDigitos.length >= 3) {
      ors.push({ customerCpf: { contains: escaparLike(soDigitos) } });
    }
    and.push({ OR: ors });
  }

  return { AND: and };
}

/** `include` que o serializador abaixo espera. Casado com ele de propósito. */
export const VENDAS_INCLUDE = {
  product: { select: { name: true } },
} as const;

type TxComProduto = Prisma.TransactionGetPayload<{
  include: typeof VENDAS_INCLUDE;
}>;

/**
 * Transação do banco → objeto que o `VendasClient` consome.
 *
 * FONTE ÚNICA. Campo novo entra AQUI e chega nos dois caminhos (primeira
 * página e "Ver mais") junto. Foi a falta disso que fez o `providerId` sumir
 * do detalhe das vendas paginadas por quase duas semanas.
 */
export function serializeTx(t: TxComProduto) {
  const payload = t.providerPayload as Record<string, unknown> | null;
  return {
    id: t.id,
    productId: t.productId,
    checkoutId: t.checkoutId,
    createdAt: t.createdAt.toISOString(),
    paidAt: t.paidAt?.toISOString() ?? null,
    // 09/08/2026: os carimbos que faltavam, pra montar a linha do tempo do
    // detalhe (seção 5). Adicionados AQUI, no serializador único — e por isso
    // chegam de graça nos dois caminhos (primeira página e "Ver mais"). Foi
    // exatamente a duplicação desses dois caminhos que fez o `providerId`
    // sumir das vendas paginadas por duas semanas.
    pixCopiedAt: t.pixCopiedAt?.toISOString() ?? null,
    expiredAt: t.expiredAt?.toISOString() ?? null,
    refundedAt: t.refundedAt?.toISOString() ?? null,
    sellerNotifiedAt: t.sellerNotifiedAt?.toISOString() ?? null,
    availableAt: t.availableAt?.toISOString() ?? null,
    releasedToBalance: t.releasedToBalance,
    customerName: t.customerName,
    customerEmail: t.customerEmail,
    customerPhone: t.customerPhone,
    customerCpf: t.customerCpf,
    customerIp: t.customerIp,
    customerCep: t.customerCep,
    customerAddress: t.customerAddress,
    customerNumber: t.customerNumber,
    customerComplement: t.customerComplement,
    customerNeighborhood: t.customerNeighborhood,
    customerCity: t.customerCity,
    customerState: t.customerState,
    productName: t.product.name,
    method: t.method,
    // Nominal = nome do recebedor gravado no QR do PIX (tag EMV 59). É o nome
    // que cai no extrato do cliente.
    nominal: parseEmvMerchantName(t.pixCopyPaste ?? ""),
    amountCents: t.amountCents,
    netCents: t.netCents,
    feeCents: t.feeCents,
    status: t.status,
    utmSource: t.utmSource,
    utmMedium: t.utmMedium,
    utmCampaign: t.utmCampaign,
    utmContent: t.utmContent,
    utmTerm: t.utmTerm,
    fbclid: t.fbclid,
    ttclid: t.ttclid,
    gclid: t.gclid,
    originHost: t.originHost,
    originPath: t.originPath,
    pixCopyPaste: t.pixCopyPaste,
    providerId: t.providerId,
    receiptUrl: (payload?.receipt_url as string | undefined) ?? null,
    abVariant: (payload?.ab_variant as string | undefined) ?? null,
    abTemplate: (payload?.ab_template as string | undefined) ?? null,
  };
}

export type TxSerializada = ReturnType<typeof serializeTx>;

/** Lê os filtros de uma query string. Usado pela rota de paginação. */
export function parseVendasFiltros(sp: URLSearchParams): VendasFiltros {
  const str = (k: string) => {
    const v = sp.get(k)?.trim();
    return v ? v : null;
  };
  const method = str("method");
  return {
    status: str("status"),
    method: method === "pix" || method === "card" ? method : null,
    productId: str("productId"),
    checkoutId: str("checkoutId"),
    // Teto de tamanho na busca: o valor vira LIKE, e string gigante só serve
    // pra fazer o banco trabalhar à toa.
    q: str("q")?.slice(0, 120) ?? null,
    from: str("from"),
    to: str("to"),
    onlyReceipts: sp.get("receipts") === "1",
    minCents: parseCents(sp.get("min")),
    maxCents: parseCents(sp.get("max")),
  };
}

/**
 * Centavos vindos da query string.
 *
 * Devolve `null` (sem filtro) pra qualquer coisa que não seja inteiro >= 0.
 * Valor malformado colado na URL não pode virar `NaN` no `where` — o Prisma
 * aceitaria e o Postgres devolveria conjunto vazio, o que pro seller parece
 * "não tenho nenhuma venda" em vez de "esse filtro é inválido".
 */
function parseCents(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
