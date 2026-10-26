import {
  Award,
  Banknote,
  Bot,
  CircleDollarSign,
  Crown,
  FlaskConical,
  Flame,
  Gem,
  Gift,
  Landmark,
  Link2,
  Medal,
  Package,
  Palette,
  Plug,
  Rocket,
  Sprout,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { IconKey } from "@/lib/icon-keys";

/**
 * 31/07/2026 (davi): "Tira esses emojis da dashboard, somente icones!".
 * Único lugar que traduz a chave guardada em achievements/tiers/rewards pro
 * componente lucide. Tipado como `Record<IconKey, LucideIcon>` — se alguém
 * adicionar uma conquista com chave nova e esquecer de mapear aqui, o build
 * quebra em vez de renderizar um buraco na tela.
 */
const ICONS: Record<IconKey, LucideIcon> = {
  // conquistas
  package: Package,
  link: Link2,
  money: CircleDollarSign,
  flame: Flame,
  trophy: Trophy,
  crown: Crown,
  banknote: Banknote,
  gem: Gem,
  "trending-up": TrendingUp,
  rocket: Rocket,
  bank: Landmark,
  plug: Plug,
  flask: FlaskConical,
  bot: Bot,
  palette: Palette,
  // tiers
  sprout: Sprout,
  medal: Medal,
  award: Award,
  // prêmios
  gift: Gift,
};

export function GameIcon({
  name,
  className = "size-4",
}: {
  name: IconKey;
  className?: string;
}) {
  const Icon = ICONS[name] ?? Trophy;
  return <Icon className={className} aria-hidden />;
}
