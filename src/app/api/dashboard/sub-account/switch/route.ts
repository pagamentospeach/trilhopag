import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId } from "@/lib/auth-helpers";
import { ACTIVE_ACCOUNT_COOKIE } from "@/lib/effective-user";

const Body = z.object({
  accountId: z.string().min(1),
});

export async function POST(request: Request) {
  const sessionUserId = await requireSessionUserId();
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

  // Validate: must be self or a sub-account
  if (parsed.data.accountId !== sessionUserId) {
    const sub = await prisma.user.findFirst({
      where: { id: parsed.data.accountId, parentUserId: sessionUserId },
      select: { id: true },
    });
    if (!sub) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const response = NextResponse.json({ ok: true });
  if (parsed.data.accountId === sessionUserId) {
    response.cookies.delete(ACTIVE_ACCOUNT_COOKIE);
  } else {
    response.cookies.set(ACTIVE_ACCOUNT_COOKIE, parsed.data.accountId, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}
