/**
 * ESCOPOS DE CHAVE DE API — catálogo único.
 *
 * ⚠️ Módulo NEUTRO (sem "use client"/"use server", sem imports): o formulário
 * de criação e as rotas da API leem a MESMA lista. É o quarto lugar nesta
 * sessão onde essa separação foi necessária; sem ela, alguém copia a lista à
 * mão e as duas divergem.
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ─────────────────────────────────────────
 *
 * 09/08/2026. O campo `scopes` existe no model `ApiKey` desde sempre, e a
 * criação gravava `scopes: []` fixo. O `requireScope` trata lista vazia como
 * PERMISSIVA (e está certo — é o que mantém as chaves antigas funcionando).
 * Somando as duas coisas: toda chave já emitida é full access.
 *
 * E "full access" aqui inclui `POST /v1/withdrawals`, ou seja, tirar dinheiro
 * da conta. Uma chave criada pra um checkout externo só precisar gerar PIX
 * podia sacar o saldo inteiro se vazasse.
 *
 * ── POR QUE OS GATES VÊM JUNTO ──────────────────────────────────────────
 *
 * Antes desta data, de todas as rotas da v1, UMA consultava escopo
 * (withdrawals). As outras — transações, produtos, checkouts, assinaturas,
 * saldo — não tinham gate nenhum. Oferecer um seletor bonito de escopos sem
 * isso seria vender uma proteção que não existe, que é exatamente o defeito
 * que o 2FA do saque tinha (ver saques/actions.ts).
 *
 * ── COMPATIBILIDADE ─────────────────────────────────────────────────────
 *
 * Nada quebra pra quem já integra: TODAS as chaves existentes têm `scopes`
 * vazio, e lista vazia continua liberando tudo. Os gates só passam a recusar
 * quando a chave foi criada ESCOLHENDO escopos — o que só é possível a partir
 * de agora.
 */

export const API_SCOPES = [
  {
    key: "transactions",
    label: "Transações",
    desc: "Gerar cobrança PIX ou cartão, consultar e listar transações.",
  },
  {
    key: "products",
    label: "Produtos e checkouts",
    desc: "Criar, listar e editar produtos e ofertas.",
  },
  {
    key: "subscriptions",
    label: "Assinaturas",
    desc: "Criar, consultar e cancelar assinaturas recorrentes.",
  },
  {
    key: "balance",
    label: "Saldo",
    desc: "Consultar saldo e dados da conta.",
  },
  {
    key: "withdrawals",
    label: "Saques",
    desc: "Solicitar e consultar saques. Tira dinheiro da conta — só marque se a integração realmente precisar.",
    /** Marca visualmente o escopo que move dinheiro pra fora. */
    perigoso: true,
  },
] as const;

export type ApiScope = (typeof API_SCOPES)[number]["key"];

export const API_SCOPE_KEYS = API_SCOPES.map((s) => s.key) as readonly ApiScope[];

export function isApiScope(v: string): v is ApiScope {
  return (API_SCOPE_KEYS as readonly string[]).includes(v);
}

/** Opções de validade oferecidas na criação. `null` = não expira. */
export const API_KEY_VALIDADES = [
  { key: "0", label: "Não expira", dias: null },
  { key: "30", label: "30 dias", dias: 30 },
  { key: "90", label: "90 dias", dias: 90 },
  { key: "365", label: "1 ano", dias: 365 },
] as const;
