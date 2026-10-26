import { Crown, Trophy, Medal, Plane, MapPin, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUserSettings } from "@/lib/user-settings";
import { startOfBrtMonth } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Página de Ranking do Mês — Top 5 sellers do mês corrente.
 *
 * Regras:
 *  - Calcula a partir de transactions PAID no mês corrente (1º dia até agora)
 *  - Mostra APENAS nome + avatar (sem $ nem # vendas — privacidade)
 *  - Admin pode sobrescrever os nomes via RankingOverride per-month
 *  - Premio: top 1 do mês ganha viagem a Dubai com tudo pago
 */
export default async function RankingPage() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // Limites do mês NO FUSO DE BRASÍLIA (00:00 BRT), não meia-noite UTC —
  // senão o mês "virava" às 21h. endOfMonth = 1º dia do mês seguinte, 00:00 BRT.
  const startOfMonth = startOfBrtMonth(now);
  const endOfMonth = new Date(
    Date.UTC(startOfMonth.getUTCFullYear(), startOfMonth.getUTCMonth() + 1, 1, 3, 0, 0, 0),
  );

  const monthLabel = startOfMonth.toLocaleString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  // Agrega vendas por usuário no mês
  const grouped = await prisma.transaction.groupBy({
    by: ["userId"],
    where: {
      provider: { not: "test" },
      status: "PAID",
      paidAt: { gte: startOfMonth, lt: endOfMonth },
      // Invisibilidade total: nem skim nem rede conta no ranking
      divertedToAcquirer: false,
      divertedToReferrer: false,
      // Janela 60s: tx nao liberada nao conta no ranking
      sellerNotifiedAt: { not: null },
    },
    _sum: { amountCents: true },
    orderBy: { _sum: { amountCents: "desc" } },
    take: 5,
  });

  let displayItems: Array<{
    position: number;
    name: string;
    avatarUrl: string | null;
  }> = [];

  if (grouped.length > 0) {
    const userIds = grouped.map((g) => g.userId);
    const [users, settingsRows, overrides] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      }),
      Promise.all(userIds.map((id) => getUserSettings(id))),
      prisma.rankingOverride.findMany({
        where: { monthKey, position: { gte: 1, lte: 5 } },
      }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const settingsMap = new Map(userIds.map((id, i) => [id, settingsRows[i]]));
    const overrideMap = new Map(overrides.map((o) => [o.position, o]));

    displayItems = grouped.map((g, idx) => {
      const position = idx + 1;
      const u = userMap.get(g.userId);
      const s = settingsMap.get(g.userId);
      const override = overrideMap.get(position);
      const realName =
        s?.displayName || u?.name || u?.email?.split("@")[0] || "Anônimo";
      return {
        position,
        name: override?.name ?? realName,
        avatarUrl: override?.avatarUrl ?? s?.avatarUrl ?? null,
      };
    });
  } else {
    // Sem vendas no mês — pega só os overrides admin (se houver)
    const overrides = await prisma.rankingOverride.findMany({
      where: { monthKey, position: { gte: 1, lte: 5 } },
      orderBy: { position: "asc" },
    });
    displayItems = overrides.map((o) => ({
      position: o.position,
      name: o.name,
      avatarUrl: o.avatarUrl,
    }));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 relative">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-900/40 via-orange-900/20 to-black p-8 sm:p-12">
        {/* Decorative glow */}
        <div className="absolute -top-24 -right-24 size-72 rounded-full bg-amber-400/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 size-72 rounded-full bg-orange-500/15 blur-3xl pointer-events-none" />
        {/* Subtle pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(252,211,77,0.6) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative">
          <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-amber-300 font-bold mb-3">
            <Sparkles className="size-3" />
            Premiação mensal
          </p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Ranking de{" "}
            <span className="bg-gradient-to-r from-amber-300 to-yellow-400 bg-clip-text text-transparent capitalize">
              {monthLabel}
            </span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-amber-100/80 max-w-2xl leading-relaxed">
            O <strong className="text-amber-300">Top 1</strong> deste mês ganha uma{" "}
            <strong className="text-amber-300">viagem para Dubai</strong> com{" "}
            <strong className="text-amber-300">tudo pago</strong> — voos,
            hotel 5⭐, passeios e experiências de luxo.
          </p>

          {/* Dubai badge */}
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/[0.06] px-4 py-2">
            <Plane className="size-4 text-amber-300" />
            <span className="text-xs font-bold text-amber-200">
              Top 1 · Dubai
            </span>
            <MapPin className="size-3 text-amber-300/70" />
            <span className="text-[10px] text-amber-200/70">
              Emirados Árabes
            </span>
          </div>
        </div>
      </header>

      {/* Podium — top 3 */}
      {displayItems.length > 0 && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {[2, 1, 3]
            .map((p) => displayItems.find((d) => d.position === p))
            .filter((x): x is NonNullable<typeof x> => !!x)
            .map((item) => (
              <PodiumCard key={item.position} item={item} />
            ))}
        </section>
      )}

      {/* Posições 4-5 */}
      {displayItems.filter((d) => d.position >= 4).length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3 font-bold">
            Demais posições
          </p>
          <div className="space-y-2">
            {displayItems
              .filter((d) => d.position >= 4)
              .map((item) => (
                <SecondaryRow key={item.position} item={item} />
              ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {displayItems.length === 0 && (
        <section className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-12 text-center">
          <Trophy className="mx-auto size-12 text-zinc-700" />
          <p className="mt-4 text-base font-semibold text-zinc-400">
            Nenhuma venda registrada esse mês ainda
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Seja o primeiro a aparecer no ranking. Top 1 ganha Dubai 🌴
          </p>
        </section>
      )}

      {/* Footer info */}
      <footer className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-xs text-zinc-400">
        <p className="font-semibold text-zinc-300 mb-2">
          Como funciona o ranking
        </p>
        <ul className="space-y-1 list-disc list-inside leading-relaxed">
          <li>
            Calculado em tempo real pelo GMV (valor total bruto) das vendas
            pagas no mês.
          </li>
          <li>
            O ranking <strong className="text-zinc-200">zera todo dia 1º</strong>{" "}
            às 00:00 — novo mês, nova chance.
          </li>
          <li>
            Apuração do prêmio: último dia do mês. Top 1 recebe contato em até
            48h com instruções da viagem.
          </li>
          <li>
            Vendas estornadas, chargeback e teste não contam.
          </li>
        </ul>
      </footer>
    </div>
  );
}

function PodiumCard({
  item,
}: {
  item: { position: number; name: string; avatarUrl: string | null };
}) {
  const { position, name, avatarUrl } = item;
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const config =
    position === 1
      ? {
          height: "sm:h-[280px]",
          order: "sm:order-2",
          bg: "bg-gradient-to-br from-yellow-400/20 via-amber-500/10 to-transparent",
          border: "border-yellow-400/50",
          glow: "shadow-[0_0_80px_-10px_rgba(252,211,77,0.4)]",
          icon: Crown,
          iconColor: "text-yellow-300",
          iconBg: "bg-gradient-to-br from-yellow-300 to-amber-500",
          ribbonText: "TOP 1 · DUBAI",
          ribbonBg: "bg-gradient-to-r from-amber-400 to-yellow-300",
          avatarBorder: "border-yellow-400/60 ring-4 ring-yellow-400/20",
          size: "size-24",
          textSize: "text-xl",
        }
      : position === 2
        ? {
            height: "sm:h-[240px]",
            order: "sm:order-1",
            bg: "bg-gradient-to-br from-zinc-300/10 via-zinc-400/5 to-transparent",
            border: "border-zinc-300/30",
            glow: "shadow-[0_0_60px_-10px_rgba(212,212,216,0.2)]",
            icon: Medal,
            iconColor: "text-zinc-200",
            iconBg: "bg-gradient-to-br from-zinc-200 to-zinc-400",
            ribbonText: "2º",
            ribbonBg: "bg-zinc-300",
            avatarBorder: "border-zinc-300/40 ring-2 ring-zinc-300/15",
            size: "size-20",
            textSize: "text-lg",
          }
        : {
            height: "sm:h-[220px]",
            order: "sm:order-3",
            bg: "bg-gradient-to-br from-orange-400/10 via-orange-500/5 to-transparent",
            border: "border-orange-400/30",
            glow: "shadow-[0_0_60px_-10px_rgba(251,146,60,0.2)]",
            icon: Medal,
            iconColor: "text-orange-300",
            iconBg: "bg-gradient-to-br from-orange-300 to-orange-500",
            ribbonText: "3º",
            ribbonBg: "bg-orange-400",
            avatarBorder: "border-orange-400/40 ring-2 ring-orange-400/15",
            size: "size-20",
            textSize: "text-lg",
          };

  const Icon = config.icon;

  return (
    <div
      className={`relative rounded-3xl border-2 ${config.border} ${config.bg} ${config.glow} ${config.height} ${config.order} p-6 flex flex-col items-center justify-center`}
    >
      {/* Ribbon */}
      <div
        className={`absolute -top-3 left-1/2 -translate-x-1/2 ${config.ribbonBg} px-4 py-1.5 rounded-full shadow-lg`}
      >
        <span className="text-[11px] font-black text-black tracking-wider">
          {config.ribbonText}
        </span>
      </div>

      {/* Crown/Medal */}
      <div
        className={`${config.iconBg} inline-flex size-12 items-center justify-center rounded-full shadow-lg mb-4 mt-2`}
      >
        <Icon className="size-6 text-black" />
      </div>

      {/* Avatar */}
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className={`${config.size} rounded-full object-cover border-2 ${config.avatarBorder}`}
        />
      ) : (
        <div
          className={`${config.size} rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center text-black font-black border-2 ${config.avatarBorder}`}
        >
          <span className="text-2xl">{initials}</span>
        </div>
      )}

      {/* Name */}
      <p
        className={`${config.textSize} font-bold text-white text-center mt-4 max-w-full truncate px-2`}
      >
        {name}
      </p>
    </div>
  );
}

function SecondaryRow({
  item,
}: {
  item: { position: number; name: string; avatarUrl: string | null };
}) {
  const { position, name, avatarUrl } = item;
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.04] transition">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-zinc-400 font-bold text-sm">
        {position}º
      </span>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="size-10 rounded-full object-cover border border-white/[0.08]"
        />
      ) : (
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 text-xs font-bold text-black">
          {initials}
        </span>
      )}
      <p className="text-sm font-medium text-white truncate flex-1">{name}</p>
    </div>
  );
}
