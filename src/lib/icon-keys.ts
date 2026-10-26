/**
 * 31/07/2026 (davi): "Tira esses emojis da dashboard, somente icones!".
 *
 * Conquistas, tiers e prêmios guardavam o ícone como EMOJI literal
 * (`icon: "🏆"`). Emoji na dashboard renderiza diferente em cada SO (Apple x
 * Windows x Android), quebra o alinhamento vertical do texto e destoa do
 * resto da UI, que é 100% lucide. Agora o campo `icon` guarda uma CHAVE e
 * quem renderiza é o `<GameIcon />`.
 *
 * Este arquivo é PURO (zero React) de propósito: `achievements.ts` e
 * `rewards.ts` importam `prisma`, ou seja, rodam só no servidor — não podem
 * puxar componente nenhum. O map chave → componente lucide vive na camada de
 * UI (`src/components/ui/game-icon.tsx`), tipado como `Record<IconKey, ...>`
 * pra o TypeScript obrigar o map a cobrir toda chave nova que aparecer aqui.
 */
export type IconKey =
  // conquistas
  | "package"
  | "link"
  | "money"
  | "flame"
  | "trophy"
  | "crown"
  | "banknote"
  | "gem"
  | "trending-up"
  | "rocket"
  | "bank"
  | "plug"
  | "flask"
  | "bot"
  | "palette"
  // tiers
  | "sprout"
  | "medal"
  | "award"
  // prêmios
  | "gift";
