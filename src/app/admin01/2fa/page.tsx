import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/admin-auth";
import { Verify2faClient } from "./client";

export default async function Verify2faPage() {
  const r = await getCurrentAdminSession();
  if (!r) redirect("/admin01/login");
  if (!r.admin.totpSecret) redirect("/admin01/2fa-setup");
  if (r.session.mfaPassed) redirect("/admin01/dashboard");
  return <Verify2faClient />;
}
