"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  ShieldCheck,
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Banknote,
  Server,
  Percent,
  ScrollText,
  Contact,
  LayoutGrid,
} from "lucide-react";
import { LogoutButton } from "../logout-button";

/** Map iconName → componente lucide. DEFINIDO AQUI (client component) porque
 *  componentes/funcoes NAO podem ser passados de Server p/ Client Component
 *  no RSC ("Functions cannot be passed directly to Client Components"). O
 *  server (layout.tsx) passa so o iconName (string) em navItems.
 *
 *  08/08/2026 (davi): so ficaram os icones das abas que ainda existem. Trophy,
 *  Lightbulb, Target, Globe, Tag, Palette, Plug e Activity saíram junto com
 *  as telas que foram apagadas (ranking, sugestões, top ofertas, domínios,
 *  preços, temas). */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  LayoutGrid,
  Users,
  FileText,
  CreditCard,
  Banknote,
  Server,
  Percent,
  ScrollText,
  Contact,
};

export type AdminNavItem = {
  label: string;
  href: string;
  iconName: string;
  group?: string;
  badgeKey?: string;
};

/**
 * Shell responsivo do admin.
 *
 * Mobile (< md): topbar com hamburger, sidebar vira drawer off-canvas
 * com overlay. Conteudo ocupa 100% da largura.
 * Desktop (>= md): sidebar fixa lateral igual ao layout antigo.
 *
 * O drawer fecha automaticamente quando o pathname muda (clicou num link).
 * O server-component pai (layout.tsx) passa nav + badges ja resolvidos.
 */
export function AdminShell({
  navItems,
  badges,
  adminEmail,
  children,
}: {
  navItems: AdminNavItem[];
  badges: Record<string, number>;
  adminEmail: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Fecha drawer ao navegar
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll quando drawer aberto (mobile)
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* MOBILE TOPBAR — only < md */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-black/80 backdrop-blur px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
            <ShieldCheck className="size-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">Trilho Admin</p>
            <p className="text-[9px] text-red-400 uppercase tracking-wider leading-none mt-0.5">
              Restricted
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-zinc-300 hover:bg-white/[0.06] hover:text-white transition"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* OVERLAY mobile quando drawer aberto */}
      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
          aria-label="Fechar menu"
        />
      )}

      <div className="flex">
        {/* SIDEBAR (drawer no mobile, fixa no desktop) */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw]
            border-r border-white/[0.08] bg-black/95
            transform transition-transform duration-200 ease-out
            ${open ? "translate-x-0" : "-translate-x-full"}
            md:sticky md:top-0 md:h-screen md:w-64 md:max-w-none
            md:translate-x-0 md:bg-black/40 md:transform-none
            flex flex-col
          `}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                <ShieldCheck className="size-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Trilho Admin</p>
                <p className="text-[10px] text-red-400 uppercase tracking-wider">
                  Restricted
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="md:hidden rounded-lg p-1.5 text-zinc-400 hover:text-white"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </button>
          </div>

          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navItems.map((n, i) => {
              const Icon = ICON_MAP[n.iconName];
              const prevGroup = i > 0 ? navItems[i - 1].group : undefined;
              const showHeader = n.group && n.group !== prevGroup;
              const isActive =
                pathname === n.href || pathname.startsWith(n.href + "/");
              return (
                <div key={n.href}>
                  {showHeader && (
                    <p className="px-3 pt-3 pb-1 text-[9px] uppercase tracking-[0.2em] text-zinc-600">
                      {n.group}
                    </p>
                  )}
                  <Link
                    href={n.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                      isActive
                        ? "bg-white/[0.06] text-white"
                        : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    {Icon && <Icon className="size-4" />}
                    <span className="flex-1">{n.label}</span>
                    {n.badgeKey && badges[n.badgeKey] > 0 && (
                      <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-black">
                        {badges[n.badgeKey]}
                      </span>
                    )}
                  </Link>
                </div>
              );
            })}
          </nav>

          <div className="border-t border-white/[0.06] p-3 space-y-1 shrink-0">
            <p className="px-3 py-1 text-[10px] text-zinc-500 truncate">
              {adminEmail}
            </p>
            <LogoutButton />
          </div>
        </aside>

        {/* MAIN — full width no mobile, resto no desktop */}
        <main className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
