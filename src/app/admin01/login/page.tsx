import { LoginClient } from "./client";
import { ensureAdminsExist } from "@/lib/admin-auth";

export default async function AdminLoginPage() {
  await ensureAdminsExist();
  return <LoginClient />;
}
