import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getEffectiveUserId } from "./effective-user";
import { prisma } from "./prisma";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireUserId(): Promise<string> {
  const session = await requireSession();
  const id = await getEffectiveUserId();
  if (!id) redirect("/login");
  // HARD BLOCK (16/07/2026): seller com blocked=true não carrega NADA. O
  // hook `session.create.before` do BetterAuth já impede login, mas cobrimos
  // aqui de novo pra sessões criadas ANTES do ban (que ainda tem cookie
  // válido). Redirect pra /conta-bloqueada onde a página só mostra "Sua conta foi
  // suspensa. Contato: suporte@trilhopag.com" e nada mais.
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { blocked: true },
  });
  if (u?.blocked) redirect("/conta-bloqueada");
  return id;
}

/** The actual logged-in user (parent), regardless of which sub-account is active. */
export async function requireSessionUserId(): Promise<string> {
  const session = await requireSession();
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { blocked: true },
  });
  if (u?.blocked) redirect("/conta-bloqueada");
  return session.user.id;
}

/**
 * Verifica se o user logado é admin. Usa a sessão (não effective-user — sub-conta
 * NÃO herda admin do parent). Faz redirect pra /dashboard se não for admin.
 */
export async function requireAdmin(): Promise<string> {
  const session = await requireSession();
  const userId = session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, blocked: true },
  });
  if (!user || user.role !== "admin" || user.blocked) {
    redirect("/dashboard");
  }
  return userId;
}

/** True se o user é admin (sem redirect). */
export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  if (!session?.user?.id) return false;
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  return u?.role === "admin";
}
