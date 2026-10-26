"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const LINKS = [
  { label: "Produto", href: "#produto" },
  { label: "Soluções", href: "#solucoes" },
  { label: "Desenvolvedores", href: "#desenvolvedores" },
  { label: "Preços", href: "#precos" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 bg-white/85 backdrop-blur-xl transition-shadow duration-300 ${
        scrolled ? "border-b border-slate-200/80" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3.5 sm:px-10">
        <Link href="/" aria-label="Trilho Pag" className="flex items-center gap-2.5">
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

        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link
            href="/login"
            className="hidden rounded-full px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:text-ink sm:inline-flex"
          >
            Entrar
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink/90"
          >
            Começar agora
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            className="ml-1 inline-flex size-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-slate-200/80 bg-white px-6 py-3 md:hidden">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2 py-2.5 text-[15px] font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2 py-2.5 text-[15px] font-medium text-slate-700 transition hover:bg-slate-50 sm:hidden"
          >
            Entrar
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
