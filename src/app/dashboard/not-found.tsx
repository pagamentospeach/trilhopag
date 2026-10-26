import Link from "next/link";
import { Compass, Home } from "lucide-react";

/**
 * 404 dentro do /dashboard — preserva a sidebar (não cai no 404 global).
 */
export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <p className="text-7xl font-black leading-none bg-gradient-to-b from-cyan-300 to-cyan-600/30 bg-clip-text text-transparent tracking-tighter">
          404
        </p>
        <h1 className="mt-2 text-xl font-bold text-white tracking-tight">
          Não encontramos essa página
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          A URL pode ter mudado ou o recurso não existe mais. Volta pro
          dashboard ou usa o menu lateral.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-300"
          >
            <Home className="size-3.5" />
            Início
          </Link>
          <Link
            href="/dashboard/produtos"
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
          >
            <Compass className="size-3.5" />
            Meus Produtos
          </Link>
        </div>
      </div>
    </div>
  );
}
