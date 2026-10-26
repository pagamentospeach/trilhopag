import { AuthShell } from "@/components/auth/shell";

/**
 * Tema CLARO, igual a landing (davi 08/08/2026: "login / register 100% white
 * do mesmo jeito da landing page").
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
