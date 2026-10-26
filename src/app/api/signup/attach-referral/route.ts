import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth-helpers";
import { attachReferralByCode } from "@/lib/signup-bootstrap";

const Body = z.object({ code: z.string().min(2).max(40) });

/**
 * Anexa o currentUser como REFERIDO do user que possui o `referralCode`.
 *
 * Single-link flow: cada user tem 1 (e apenas 1) referralCode no User. As
 * "default fees" pra novos signups são lidas dos campos linkDefault* do
 * referrer (com fallback pras taxas do próprio referrer quando null).
 *
 * Segurança:
 *  - Self-referral bloqueado
 *  - Loop bloqueado (B → A → B)
 *  - Update atomic só se referredByUserId atualmente null (anti-fraude)
 */
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

  // Toda a lógica (segurança self-referral/loop, herança de taxas
  // linkDefault*, deviation default, update atômico) vive em signup-bootstrap
  // — a MESMA usada pelo fluxo Google/OAuth no databaseHooks.user.create.after.
  const result = await attachReferralByCode(userId, parsed.data.code);
  return NextResponse.json(result);
}
