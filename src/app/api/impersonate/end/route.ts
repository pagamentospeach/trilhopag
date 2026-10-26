import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Encerra a impersonation: limpa o cookie de sessão do seller + o marcador
 * tp_impersonating e volta pro /admin01. A sessão de admin (tp_admin_session)
 * é um cookie separado e continua intacta.
 */
export async function GET(request: Request) {
  const c = await cookies();
  const secure = process.env.NODE_ENV === "production";
  const prefix = secure ? "__Secure-" : "";
  const names = [
    `${prefix}trilho.session_token`,
    `${prefix}trilho.session_data`,
    "tp_impersonating",
  ];
  for (const name of names) {
    c.set(name, "", {
      httpOnly: name !== "tp_impersonating",
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return NextResponse.redirect(new URL("/admin01", request.url));
}
