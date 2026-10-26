import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { DocsSidebarNav, DocsMobileNav } from "./nav";

/**
 * 06/08/2026 (davi): "A documentacao da trilho ta MUITO feia, deixa mais
 * bonitnho e ta sem a logo".
 *
 * A LOGO: nunca existiu aqui. O que tinha era um quadradinho ciano com a letra
 * "B" digitada à mão (`<span className="...bg-cyan-400...">B</span>`) — um
 * placeholder que ficou. Agora é o arquivo de verdade (trilhopag-logo2.png),
 * no mesmo formato do header da landing: círculo de 30px com anel ciano e o
 * wordmark "Trilho" em itálico, Trilho branco + Pag ciano. Assim quem cai na
 * doc vindo do site reconhece que é a mesma marca.
 *
 * O header também virou sticky com backdrop-blur: a doc tem ~900 linhas e o
 * botão de gerar API key sumia no primeiro scroll.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      {/* Grid decorativo só no topo, atrás do header. `fixed` (não absolute)
          pra não esticar a página inteira. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[320px] grid-bg opacity-60" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[320px] bg-gradient-to-b from-cyan-400/[0.04] to-transparent" />

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/"
              aria-label="Trilho"
              className="flex shrink-0 items-center gap-2.5 tracking-tight"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/trilhopag-logo2.png"
                alt=""
                width={30}
                height={30}
                className="size-[30px] shrink-0 rounded-full object-contain ring-1 ring-cyan-400/20"
              />
              <span className="text-[17px] font-extrabold italic leading-none">
                <span className="text-white">Trilho</span>
                <span className="text-cyan-400">Pag</span>
              </span>
            </Link>
            <span className="hidden shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[11px] font-medium text-zinc-400 sm:inline">
              Docs
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1 text-sm sm:gap-3">
            <Link
              href="/"
              className="hidden items-center gap-1.5 text-zinc-400 transition hover:text-white md:inline-flex"
            >
              <ArrowLeft className="size-3.5" />
              Site
            </Link>
            <Link
              href="/login"
              className="hidden px-1 text-zinc-400 transition hover:text-white sm:inline"
            >
              Entrar
            </Link>
            <Link
              href="/dashboard/api-keys"
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-cyan-300 sm:px-4"
            >
              <KeyRound className="size-3.5" />
              Gerar API Key
            </Link>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <DocsMobileNav />
      </div>

      <div className="relative z-10 mx-auto grid max-w-6xl gap-12 px-6 pb-24 pt-10 lg:grid-cols-[210px_1fr]">
        <aside className="hidden lg:block">
          {/* `top-24` limpa o header de 64px + respiro. A altura travada em
              calc(100vh - header) com overflow próprio evita que o índice
              (5 grupos, 13 itens) fique cortado em telas baixas. */}
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
            <DocsSidebarNav />
          </div>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>

      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-zinc-500">
          <p>© {new Date().getFullYear()} Trilho · API v1</p>
          <div className="flex flex-wrap items-center gap-5">
            <a
              href="/api/v1/openapi.json"
              className="transition hover:text-zinc-300"
            >
              OpenAPI
            </a>
            <Link href="/dashboard/suporte" className="transition hover:text-zinc-300">
              Suporte
            </Link>
            <Link href="/terms" className="transition hover:text-zinc-300">
              Termos
            </Link>
            <Link href="/privacy" className="transition hover:text-zinc-300">
              Privacidade
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
