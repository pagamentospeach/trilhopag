/**
 * Heartbeat da presença ao vivo do admin.
 *
 * POST { pathname, label, takeover? } → { peers, lockedBy, canEdit }
 * DELETE → tira o admin da lista (fechou a aba / logout)
 *
 * Só responde pra sessão admin COM 2FA passado. Sem sessão = 401 seco,
 * sem pistas de que a rota existe.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { heartbeat, clearPresence } from "@/lib/admin-presence";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const r = await requireAdmin();
  if (!r) return new NextResponse(null, { status: 401 });

  let body: { pathname?: string; label?: string; takeover?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // corpo inválido → trata como heartbeat vazio
  }

  const state = await heartbeat({
    adminId: r.admin.id,
    sessionId: r.session.id,
    pathname: typeof body.pathname === "string" ? body.pathname : "/admin01",
    label: typeof body.label === "string" ? body.label : "",
    takeover: body.takeover === true,
  });

  return NextResponse.json(state, {
    headers: { "cache-control": "no-store" },
  });
}

export async function DELETE() {
  const r = await requireAdmin();
  if (!r) return new NextResponse(null, { status: 401 });
  await clearPresence(r.admin.id);
  return new NextResponse(null, { status: 204 });
}
