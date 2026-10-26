"use server";

import { cookies, headers } from "next/headers";
import { logHoneypotHit, type HoneypotAction } from "@/lib/honeypot";

/**
 * HONEYPOT LOGIN — nunca autentica ninguém de verdade.
 *
 * Estratégia: aceita QUALQUER credencial na 3ª tentativa do mesmo browser
 * (tracked por cookie). Assim o atacante:
 *   - 1ª tentativa: "Senha incorreta" (parece real)
 *   - 2ª tentativa: "Senha incorreta"
 *   - 3ª tentativa: passa → cai no dashboard fake
 *
 * Isso é mais convincente que "aceita qualquer coisa na 1ª" (script kiddie
 * fica suspeito) OU "nunca aceita" (perde a diversão de mostrar dashboard fake).
 *
 * Cada tentativa é logada com email + senha em texto puro pra ver se estão
 * testando credenciais vazadas.
 */
export async function fakeLoginAction(email: string, password: string) {
  const h = await headers();
  const fakeReq = new Request("http://internal/admin/login", {
    headers: h as unknown as HeadersInit,
  });

  await logHoneypotHit({
    action: "attempt_login",
    request: fakeReq,
    details: { email, password },
  });

  // Track de tentativas por browser (cookie)
  const c = await cookies();
  const attemptsCookie = c.get("_hp_att");
  const attempts = Number(attemptsCookie?.value ?? 0) + 1;
  c.set("_hp_att", String(attempts), {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 60 * 60, // 1h
    path: "/admin",
  });

  // Random small delay (100-400ms) pra parecer real que consulta DB
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 300));

  if (attempts < 3) {
    const msgs = [
      "Senha incorreta.",
      "Email ou senha inválidos.",
      "Credenciais inválidas. Tente novamente.",
    ];
    return {
      ok: false as const,
      error: msgs[attempts - 1] ?? msgs[msgs.length - 1],
    };
  }

  // Passou. Seta cookie de "sessão fake" pra permitir navegar pelo painel fake.
  c.set("_hp_session", `fake_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24, // 24h de "diversão"
    path: "/admin",
  });

  return { ok: true as const };
}

/** Ação genérica pra qualquer botão do dashboard fake. Loga o clique. */
export async function fakeButtonAction(
  action: HoneypotAction,
  details?: {
    button?: string;
    targetUserId?: string;
    targetWithdrawalId?: string;
    payload?: unknown;
  },
) {
  const h = await headers();
  const fakeReq = new Request("http://internal/admin/action", {
    headers: h as unknown as HeadersInit,
  });
  await logHoneypotHit({ action, request: fakeReq, details });
  // Sempre retorna "processando..." pra fake feedback positivo
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));
  return { ok: true as const, fake: true };
}
