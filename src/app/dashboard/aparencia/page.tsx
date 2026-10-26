import { requireUserId } from "@/lib/auth-helpers";
import { getUserSettings } from "@/lib/user-settings";
import { prisma } from "@/lib/prisma";
import { getOwnedThemes } from "@/lib/theme-access";
import { AppearanceClient } from "./client";

export default async function AparenciaPage() {
  const userId = await requireUserId();
  const [settings, ownedSet, user] = await Promise.all([
    getUserSettings(userId),
    getOwnedThemes(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { balanceCents: true },
    }),
  ]);
  const ownedThemes = Array.from(ownedSet);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Aparência</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Personalize seu gateway. Skin, cor accent, padrão de fundo, avatar e meta de
          faturamento.
        </p>
      </header>
      <AppearanceClient
        defaults={settings}
        ownedThemes={ownedThemes}
        balanceCents={user?.balanceCents ?? 0}
      />
    </div>
  );
}
