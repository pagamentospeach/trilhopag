import { cookies, headers } from "next/headers";
import { auth } from "./auth";
import { prisma } from "./prisma";

export const ACTIVE_ACCOUNT_COOKIE = "tp_active_account";

export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * Returns the userId that the current session is "operating as".
 * Falls back to the session user when no sub-account cookie is set.
 */
export async function getEffectiveUserId(): Promise<string | null> {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return null;
  const cookieStore = await cookies();
  const cookieUserId = cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value;
  if (!cookieUserId || cookieUserId === sessionUserId) return sessionUserId;
  const sub = await prisma.user.findFirst({
    where: { id: cookieUserId, parentUserId: sessionUserId },
    select: { id: true },
  });
  return sub ? cookieUserId : sessionUserId;
}

export type AccountSwitch = {
  id: string;
  displayName: string;
  email: string;
  isParent: boolean;
  isSubAccount: boolean;
  isCurrent: boolean;
};

export async function listSwitchableAccounts(): Promise<AccountSwitch[]> {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return [];
  const effective = (await getEffectiveUserId()) ?? sessionUserId;

  const me = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: {
      id: true,
      email: true,
      name: true,
      settings: { select: { displayName: true } },
      subAccounts: {
        select: {
          id: true,
          email: true,
          name: true,
          settings: { select: { displayName: true } },
        },
      },
    },
  });
  if (!me) return [];

  const parent: AccountSwitch = {
    id: me.id,
    displayName: me.settings?.displayName ?? me.name ?? me.email.split("@")[0],
    email: me.email,
    isParent: true,
    isSubAccount: false,
    isCurrent: me.id === effective,
  };
  const subs: AccountSwitch[] = me.subAccounts.map((s) => ({
    id: s.id,
    displayName: s.settings?.displayName ?? s.name ?? s.email.split("@")[0],
    email: s.email,
    isParent: false,
    isSubAccount: true,
    isCurrent: s.id === effective,
  }));
  return [parent, ...subs];
}
