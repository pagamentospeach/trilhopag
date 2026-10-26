import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";
import { checkOnAction } from "@/lib/achievements";
import { canUserApplyTheme, FREE_THEME_KEYS } from "@/lib/theme-access";
import { THEMES } from "@/lib/themes";

/**
 * Atalho pra trocar de tema rapido (used pelos botoes no sidebar).
 *
 * CRITICAL FIX (jun/2026): antes a enum permitia "minimal" sem checar
 * ownership — seller podia POSTar e aplicar o tema pago sem pagar.
 *
 * Agora aceita QUALQUER themeKey valida do registry, mas valida via
 * canUserApplyTheme (free + comprado + friend account bypass).
 */
const Body = z.object({
  theme: z.string().min(1).max(60),
});

export async function POST(request: Request) {
  const session = await requireSession();
  const userId = session.user.id;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 422 });
  }

  // 1. Tema precisa existir no registry
  if (!THEMES.some((t) => t.key === parsed.data.theme)) {
    return NextResponse.json(
      { error: "unknown_theme", knownFree: FREE_THEME_KEYS },
      { status: 422 },
    );
  }

  // 2. User precisa ter direito de aplicar (free, comprado, ou friend)
  const allowed = await canUserApplyTheme(userId, parsed.data.theme);
  if (!allowed) {
    return NextResponse.json(
      {
        error: "payment_required",
        message:
          "Você precisa comprar esse tema antes de aplicá-lo. Vá em Aparência.",
      },
      { status: 402 },
    );
  }

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, theme: parsed.data.theme },
    update: { theme: parsed.data.theme },
  });
  await checkOnAction(userId, "skin_changed");
  return NextResponse.json({ ok: true, theme: parsed.data.theme });
}
