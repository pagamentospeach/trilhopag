/**
 * MODOS DE OPERAÇÃO DA CONTA — fonte única.
 *
 * 08/08/2026 (davi): "Vamos criar + um modo de conta na Trilho, o modo SUB
 * ADQUIRENTE GATEWAY (SAG) (...) deve ter tudo que os outros modo tem".
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * Antes do SAG os modos eram literais soltos: a lista dos três e a união dos
 * três apareciam ~60 vezes em ~30 arquivos (zod enums,
 * tipos de props, Records de metadados, arrays de UI, casts). Adicionar um
 * quarto modo copiando e colando teria funcionado na maioria dos lugares e
 * falhado silenciosamente no resto — um `Record<Mode, ...>` sem a chave nova
 * não quebra em runtime, só devolve `undefined` no meio de uma tela.
 *
 * Centralizando, o TypeScript passa a ser quem procura: qualquer
 * `Record<OpsMode, X>` incompleto vira erro de compilação, e todo `z.enum`
 * aceita o modo novo sem ninguém precisar lembrar dele. O próximo modo custa
 * uma linha aqui e os buracos que o compilador apontar.
 *
 * REGRA: nunca escreva "black"/"white"/"hot"/"sag" solto fora daqui. Importe
 * `OpsMode` ou `OPS_MODES`.
 *
 * SEM DEPENDÊNCIAS DE PROPÓSITO: este módulo é importado tanto por Server
 * Actions quanto por componentes "use client". Importar zod aqui arrastaria a
 * biblioteca inteira pro bundle do navegador só pra desenhar uma aba. Quem
 * precisa validar escreve `z.enum(OPS_MODES)` no próprio schema — zod 4 aceita
 * tupla readonly direto.
 */

/* -------------------------------------------------------------------------
 * MODO DA CONTA (User.pixOpsMode / User.cardOpsMode)
 * ---------------------------------------------------------------------- */

/**
 * Ordem importa: é a ordem em que os modos aparecem em TODA a UI (abas do
 * admin, cards de "mover modo", colunas de taxas padrão).
 */
export const OPS_MODES = ["black", "white", "hot", "sag"] as const;

export type OpsMode = (typeof OPS_MODES)[number];

/** Modo de quem não tem modo: bate com o `@default("black")` do Prisma. */
export const DEFAULT_PIX_OPS_MODE: OpsMode = "black";
/** Cartão nasce em white — ver `@default("white")` de User.cardOpsMode. */
export const DEFAULT_CARD_OPS_MODE: OpsMode = "white";

export function isOpsMode(value: unknown): value is OpsMode {
  return (
    typeof value === "string" && (OPS_MODES as readonly string[]).includes(value)
  );
}

/**
 * Normaliza o valor cru que veio do banco. `User.pixOpsMode` é String no
 * Prisma (não enum), então nada impede uma linha antiga ou um seed torto de
 * trazer lixo — aqui isso vira o default em vez de vazar pra dentro da UI.
 */
export function toOpsMode(
  value: unknown,
  fallback: OpsMode = DEFAULT_PIX_OPS_MODE,
): OpsMode {
  return isOpsMode(value) ? value : fallback;
}

/* -------------------------------------------------------------------------
 * MODO DA ADQUIRENTE (Acquirer.mode) e compatibilidade
 * ---------------------------------------------------------------------- */

/**
 * O que pode estar em `Acquirer.mode`. Além dos modos de conta existem dois
 * COMBINADOS, que só fazem sentido do lado da adquirente:
 *   - "both"      → serve seller black E seller white
 *   - "white_hot" → serve seller white E seller hot
 * Não existe modo de conta "both"/"white_hot" — por isso a lista é separada
 * de OPS_MODES em vez de ser a mesma.
 */
export const ACQUIRER_MODES = [
  ...OPS_MODES,
  "both",
  "white_hot",
] as const;

export type AcquirerMode = (typeof ACQUIRER_MODES)[number];

/**
 * Quais `Acquirer.mode` cada modo de conta pode usar. É esta tabela que o
 * dispatch de PIX e de cartão consulta pra montar o `where`.
 *
 * Duas categorias são EXCLUSIVAS — não caem em "both":
 *   - hot, porque é operação de taxa flat e a conta precisa de adquirente
 *     preparada pra isso.
 *   - sag, pelo mesmo motivo e mais um: sendo um modo novo, herdar as
 *     adquirentes "both" que já existem jogaria todo o parque atual dentro do
 *     SAG no primeiro deploy, sem ninguém ter escolhido isso. O admin habilita
 *     adquirente por adquirente marcando `mode = "sag"`.
 */
export const ACQUIRER_MODES_FOR: Record<OpsMode, readonly AcquirerMode[]> = {
  black: ["black", "both"],
  white: ["white", "both", "white_hot"],
  hot: ["hot", "white_hot"],
  sag: ["sag"],
};

export function isAcquirerMode(value: unknown): value is AcquirerMode {
  return (
    typeof value === "string" &&
    (ACQUIRER_MODES as readonly string[]).includes(value)
  );
}

/**
 * Normaliza `Acquirer.mode` (String no Prisma) pro union. Cuidado ao mudar o
 * fallback: as telas do admin colapsavam qualquer valor desconhecido em
 * "black", o que faria uma adquirente SAG aparecer como Black na lista.
 */
export function toAcquirerMode(
  value: unknown,
  fallback: AcquirerMode = "black",
): AcquirerMode {
  return isAcquirerMode(value) ? value : fallback;
}

/** Pronto pra jogar num `where: { mode: { in: ... } }` do Prisma. */
export function acquirerModesFor(mode: string): AcquirerMode[] {
  return [...ACQUIRER_MODES_FOR[toOpsMode(mode)]];
}

/**
 * Quais `Acquirer.mode` podem APARECER JUNTOS na tela de algum seller —
 * ou seja, existe pelo menos um modo de conta que enxerga os dois.
 *
 * Usado pelo dedup de nome nominal: duas adquirentes com o mesmo nominal só
 * são um problema se algum seller consegue ver as duas ao mesmo tempo.
 *
 * A lista era escrita à mão (`["black","white","hot","both"]` pro caso
 * "both"), o que já estava errado antes do SAG — incluía "hot", que nenhum
 * seller vê junto com "both", e esquecia "white_hot", que o seller white vê.
 * Derivando de ACQUIRER_MODES_FOR isso se corrige sozinho, e o SAG fica
 * naturalmente isolado (só colide com SAG).
 */
export function collidingAcquirerModes(mode: string): AcquirerMode[] {
  const target = isAcquirerMode(mode) ? mode : "black";
  const out = new Set<AcquirerMode>([target]);
  for (const opsMode of OPS_MODES) {
    const visible = ACQUIRER_MODES_FOR[opsMode];
    if (visible.includes(target)) for (const m of visible) out.add(m);
  }
  return [...out];
}

/* -------------------------------------------------------------------------
 * METADADOS DE UI
 * ---------------------------------------------------------------------- */

/**
 * Rótulo e subtítulo de cada modo. Fica aqui (e não em cada tela) porque o
 * mesmo par label/sub era repetido em 6 componentes do admin, e eles já
 * tinham divergido entre si antes.
 *
 * `pixOnly` responde "este modo movimenta cartão?" — os editores de desvio e
 * de taxa aparente usam isso pra decidir se mostram a coluna de cartão.
 * Atenção: quem manda de verdade em cartão é `PlatformModeDefaults.cardEnabled`
 * (dado, editável em /admin01/taxas-padrao). Este flag é só a forma do
 * formulário.
 */
export const OPS_MODE_META: Record<
  OpsMode,
  { label: string; sub: string; pixOnly: boolean }
> = {
  black: { label: "Black", sub: "PIX anônimo", pixOnly: true },
  white: { label: "White", sub: "PIX + cartão", pixOnly: false },
  hot: { label: "Hot", sub: "Alta conversão", pixOnly: true },
  sag: { label: "SAG", sub: "Sub adquirente gateway", pixOnly: false },
};

/**
 * "Este modo movimenta cartão?" — inverso de `pixOnly`, em função pra ser usado
 * direto com o valor cru do banco (String no Prisma). Substitui os
 * `mode === "white"` espalhados por mode-defaults.ts, que passariam a mentir
 * agora que o SAG também tem cartão.
 */
export function modeHasCard(mode: string): boolean {
  return !OPS_MODE_META[toOpsMode(mode)].pixOnly;
}

export const OPS_MODE_LABEL: Record<OpsMode, string> = {
  black: OPS_MODE_META.black.label,
  white: OPS_MODE_META.white.label,
  hot: OPS_MODE_META.hot.label,
  sag: OPS_MODE_META.sag.label,
};
