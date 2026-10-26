/**
 * HONEYPOT — layout isolado (sem sidebar / providers do dashboard real).
 *
 * Toda página aqui é FAKE. Se um user chega em `/admin`, é atacante ou
 * scanner. Ninguém legítimo entra aqui (admin real usa outro path).
 */
export const metadata = {
  title: "Trilho Admin · Painel de Controle",
  robots: { index: false, follow: false },
};

export default function HoneypotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-black text-white">{children}</div>;
}
