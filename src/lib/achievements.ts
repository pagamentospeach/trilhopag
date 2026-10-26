import { prisma } from "./prisma";
import type { IconKey } from "./icon-keys";

export type AchievementDef = {
  key: string;
  title: string;
  description: string;
  /** Chave lucide (ver `icon-keys.ts`) — NÃO emoji. Renderiza via `<GameIcon />`. */
  icon: IconKey;
  rarity: "bronze" | "silver" | "gold" | "platinum";
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: "first_product",
    title: "Primeiro produto",
    description: "Você criou seu primeiro produto.",
    icon: "package",
    rarity: "bronze",
  },
  {
    key: "first_checkout",
    title: "Primeiro checkout",
    description: "Você publicou um checkout.",
    icon: "link",
    rarity: "bronze",
  },
  {
    key: "first_sale",
    title: "Primeira venda",
    description: "Sua primeira venda confirmada. Bem-vindo ao clube.",
    icon: "money",
    rarity: "silver",
  },
  {
    key: "ten_sales",
    title: "10 vendas",
    description: "10 vendas confirmadas. Bora pra 100.",
    icon: "flame",
    rarity: "silver",
  },
  {
    key: "hundred_sales",
    title: "100 vendas",
    description: "100 vendas. Você é oficialmente um vendedor.",
    icon: "trophy",
    rarity: "gold",
  },
  {
    key: "thousand_sales",
    title: "1.000 vendas",
    description: "1k vendas. Lenda.",
    icon: "crown",
    rarity: "platinum",
  },
  {
    key: "r1k",
    title: "R$ 1.000 faturados",
    description: "Mil reais na conta.",
    icon: "banknote",
    rarity: "bronze",
  },
  {
    key: "r10k",
    title: "R$ 10.000 faturados",
    description: "10k. Cinco zeros.",
    icon: "gem",
    rarity: "silver",
  },
  {
    key: "r100k",
    title: "R$ 100.000 faturados",
    description: "Seis zeros. Próxima parada: milhão.",
    icon: "trending-up",
    rarity: "gold",
  },
  {
    key: "r1m",
    title: "R$ 1 milhão",
    description: "Sete zeros. Você é a referência.",
    icon: "rocket",
    rarity: "platinum",
  },
  {
    key: "first_withdrawal",
    title: "Primeiro saque",
    description: "Dinheiro saiu da conta Trilho.",
    icon: "bank",
    rarity: "bronze",
  },
  {
    key: "integration_master",
    title: "Mestre das integrações",
    description: "Configurou UTMify + Webhook + Tracking.",
    icon: "plug",
    rarity: "silver",
  },
  {
    key: "ab_tester",
    title: "Cientista do checkout",
    description: "Criou um A/B test.",
    icon: "flask",
    rarity: "silver",
  },
  {
    key: "ai_user",
    title: "Pediu pra IA",
    description: "Usou o assistente IA.",
    icon: "bot",
    rarity: "bronze",
  },
  {
    key: "skin_collector",
    title: "Colecionador de skins",
    description: "Trocou de tema. Bom gosto.",
    icon: "palette",
    rarity: "bronze",
  },
];

export function getDef(key: string) {
  return ACHIEVEMENTS.find((a) => a.key === key) ?? null;
}

async function unlockAchievement(userId: string, key: string) {
  try {
    await prisma.achievement.create({ data: { userId, key } });
  } catch {
    // already unlocked, ignore
  }
}

export async function checkSaleAchievements(userId: string) {
  // Skip desviadas (06/07): conquistas devem refletir SO vendas visiveis pro
  // seller — se contamos as desviadas, ele desbloqueia "R$10k" quando o
  // faturamento real dele nao chegou la, e o valor de desconfia (ou pior:
  // percebe drift entre "R$10k conquista" e "R$8k saldo/dashboard").
  const [salesCount, totalSum] = await Promise.all([
    prisma.transaction.count({
      where: {
        userId,
        status: "PAID",
        divertedToAcquirer: false,
        divertedToReferrer: false,
      },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        status: "PAID",
        divertedToAcquirer: false,
        divertedToReferrer: false,
      },
      _sum: { amountCents: true },
    }),
  ]);
  const total = totalSum._sum.amountCents ?? 0;

  const toCheck: Array<[string, boolean]> = [
    ["first_sale", salesCount >= 1],
    ["ten_sales", salesCount >= 10],
    ["hundred_sales", salesCount >= 100],
    ["thousand_sales", salesCount >= 1000],
    ["r1k", total >= 100_000],
    ["r10k", total >= 1_000_000],
    ["r100k", total >= 10_000_000],
    ["r1m", total >= 100_000_000],
  ];
  for (const [key, cond] of toCheck) {
    if (cond) await unlockAchievement(userId, key);
  }
}

export async function checkOnAction(userId: string, action: string) {
  switch (action) {
    case "product_created":
      await unlockAchievement(userId, "first_product");
      break;
    case "checkout_created":
      await unlockAchievement(userId, "first_checkout");
      break;
    case "withdrawal_created":
      await unlockAchievement(userId, "first_withdrawal");
      break;
    case "ab_variant_created":
      await unlockAchievement(userId, "ab_tester");
      break;
    case "ai_used":
      await unlockAchievement(userId, "ai_user");
      break;
    case "skin_changed":
      await unlockAchievement(userId, "skin_collector");
      break;
    case "integration_configured": {
      const counts = await Promise.all([
        prisma.utmifyConfig.findUnique({ where: { userId } }),
        prisma.webhook.count({ where: { userId } }),
        prisma.trackingPixel.count({ where: { userId } }),
      ]);
      const ok = (counts[0] ? 1 : 0) + (counts[1] > 0 ? 1 : 0) + (counts[2] > 0 ? 1 : 0);
      if (ok >= 3) await unlockAchievement(userId, "integration_master");
      break;
    }
  }
}

export async function getUserAchievements(userId: string) {
  const unlocked = await prisma.achievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: "desc" },
  });
  const unlockedKeys = new Set(unlocked.map((a) => a.key));
  return ACHIEVEMENTS.map((def) => ({
    ...def,
    unlocked: unlockedKeys.has(def.key),
    unlockedAt: unlocked.find((a) => a.key === def.key)?.unlockedAt ?? null,
  }));
}
