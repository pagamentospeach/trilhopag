/**
 * Layout do blog — visual isolado do dashboard. SEO-friendly.
 * Ninguém acessa via navegação interna; só via URL direto ou Google.
 */
import Link from "next/link";

export const metadata = {
  robots: { index: true, follow: true },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link href="/blog" className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-500" />
            <span className="text-sm font-bold text-white">Trilho <span className="text-zinc-500 font-normal">/ blog</span></span>
          </Link>
          <Link
            href="/signup"
            className="text-xs text-zinc-400 hover:text-cyan-400 transition"
          >
            Criar conta grátis →
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-white/[0.06] mt-16 py-8">
        <div className="mx-auto max-w-4xl px-6 text-center text-xs text-zinc-500">
          © Trilho · Gateway de pagamentos completo do Brasil
        </div>
      </footer>
    </div>
  );
}
