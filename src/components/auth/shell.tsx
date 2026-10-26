import Link from "next/link";
import { FallingDots } from "@/components/falling-dots";

/**
 * Moldura clara das telas fora do dashboard (login, cadastro, KYC).
 *
 * Vive num componente porque o `body` global é escuro: qualquer rota que não
 * pinte o próprio fundo branco herda o preto do dashboard.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-white">
      {/* Mesmo degrade suave do topo do hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-mist to-white"
      />
      {/* Aqui o fundo é branco fixo (não passa pelo data-theme), então a
          chuva precisa do ciano mais escuro na unha pra não sumir. */}
      <FallingDots tone="ink" />

      <header className="relative z-10 px-6 py-5 sm:px-10">
        <Link
          href="/"
          aria-label="Trilho Pag"
          className="inline-flex items-center gap-2.5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/trilhopag-mark.png"
            alt=""
            width={28}
            height={28}
            className="size-7 object-contain"
          />
          <span className="text-[19px] font-extrabold italic leading-none tracking-tight">
            <span className="text-ink">Trilho</span>
            <span className="text-brand">Pag</span>
          </span>
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-start justify-center px-6 py-10 sm:items-center sm:py-14">
        {children}
      </main>
    </div>
  );
}
