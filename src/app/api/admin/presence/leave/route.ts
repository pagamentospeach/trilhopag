/**
 * Saída da presença via `navigator.sendBeacon` (que só sabe fazer POST).
 * Chamado no `pagehide` — fechar a aba libera o lock na hora, sem esperar
 * os 30s de expiração do heartbeat.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { clearPresence } from "@/lib/admin-presence";

export const dynamic = "force-dynamic";

export async function POST() {
  const r = await requireAdmin();
  if (!r) return new NextResponse(null, { status: 401 });
  await clearPresence(r.admin.id);
  return new NextResponse(null, { status: 204 });
}
