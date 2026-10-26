import Link from "next/link";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Produto",
    links: [
      { label: "Visão geral", href: "#produto" },
      { label: "Soluções", href: "#solucoes" },
      { label: "Preços", href: "#precos" },
      { label: "Criar conta", href: "/signup" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Contato", href: "mailto:contato@trilhopag.com" },
    ],
  },
  {
    title: "Suporte",
    links: [
      { label: "Documentação", href: "/docs" },
      { label: "Perguntas frequentes", href: "#faq" },
      { label: "Entrar", href: "/login" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Termos", href: "/terms" },
      { label: "Privacidade", href: "/privacy" },
      { label: "Exclusão de dados", href: "/data-deletion" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-100 bg-mist">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Link
              href="/"
              aria-label="Trilho Pag"
              className="flex items-center gap-2.5"
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
            <p className="mt-4 max-w-[15rem] text-[14px] leading-relaxed text-slate-500">
              Infraestrutura de pagamentos para negócios que precisam receber
              sem complicação.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("/") ? (
                      <Link
                        href={l.href}
                        className="text-[14px] text-slate-600 transition hover:text-ink"
                      >
                        {l.label}
                      </Link>
                    ) : (
                      <a
                        href={l.href}
                        className="text-[14px] text-slate-600 transition hover:text-ink"
                      >
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-slate-200/70 pt-6 text-[13px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Trilho Pag. Feito no Brasil.</span>
          <span className="font-mono">trilhopag.com</span>
        </div>
      </div>
    </footer>
  );
}
