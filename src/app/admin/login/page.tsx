import { headers } from "next/headers";
import { logHoneypotHit } from "@/lib/honeypot";
import { LoginClient } from "./client";

export default async function FakeAdminLoginPage() {
  // Loga cada visualização — quem chega no /admin/login é 100% suspeito
  const h = await headers();
  const fakeReq = new Request("http://internal/admin/login", {
    headers: h as unknown as HeadersInit,
  });
  await logHoneypotHit({ action: "view_login", request: fakeReq });

  return <LoginClient />;
}
