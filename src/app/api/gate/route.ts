/**
 * Abre a porta do /admin01 depois dos 3 cliques no X da tela de erro falsa.
 *
 * Fica FORA de /admin01 de propósito: o `proxy.ts` reescreve tudo que passa
 * por lá sem o cookie, então a rota que emite o cookie não pode morar dentro
 * do que ela mesma destranca.
 */
import { NextResponse } from "next/server";
import { GATE_COOKIE, GATE_TTL_SECONDS, issueGateToken } from "@/lib/admin-gate";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(GATE_COOKIE, await issueGateToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GATE_TTL_SECONDS,
  });
  return res;
}
