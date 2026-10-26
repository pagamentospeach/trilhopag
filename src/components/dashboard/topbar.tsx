"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Bell,
  Eye,
  EyeOff,
  Menu,
  Moon,
  Sun,
  Gift,
  LogOut,
  Sparkles,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { DARK_THEME_KEY, LIGHT_THEME_KEY } from "@/lib/theme-mode";
import { usePrivacyMode } from "@/components/dashboard/privacy-mode";
import {
  NotificacoesLista,
  type Notificacao,
} from "@/components/dashboard/notificacoes-lista";

// PERF: PushSettings só aparece dentro do dropdown de notificações (fechado no
// primeiro paint) e usa APIs só de browser. Carrega sob demanda pra sair do
// bundle inicial do topbar.
const PushSettings = dynamic(
  () => import("./push-settings").then((m) => ({ default: m.PushSettings })),
  { ssr: false },
);

/**
 * 06/08/2026 (davi): "pode apagar 100% essa opcao de linguas, so vai ter pt br!"
 *
 * O seletor de idioma (pt-BR / en-US), o overlay de "Trocando para…" e a server
 * action setLocale sairam daqui. O next-intl continua montado — todo o
 * dashboard le string por t() — mas travado em pt-BR, sem UI pra trocar.
 *
 * No lugar entrou o toggle escuro/claro, do lado do olho, como davi pediu.
 */

export function Topbar({
  displayName,
  avatarUrl,
  pushPublicKey,
  notificacoes,
  naoLidas,
  theme,
}: {
  displayName: string;
  avatarUrl: string | null;
  pushPublicKey: string | null;
  /** Central do sino (09/08/2026, secao 19). */
  notificacoes: Notificacao[];
  naoLidas: number;
  theme: string;
}) {
  const router = useRouter();
  // O olho não guarda mais cópia local do estado: quem manda é o
  // PrivacyModeProvider (layout do dashboard), pra sidebar e os cards de
  // métrica borrarem no MESMO frame que o ícone vira. Ver privacy-mode.tsx.
  const { privacyMode, toggle: togglePrivacy } = usePrivacyMode();
  const [isLight, setIsLight] = useState(theme === LIGHT_THEME_KEY);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreClosing, setMoreClosing] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifClosing, setNotifClosing] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Helper: fecha dropdown com animacao (07/07/2026, david — "essa mesma
  // animacao mov das sub contas nos popups do topbar"). Renderiza durante
  // 160ms com classe animate-bp-popover-out-top e depois desmonta.
  function closeAnim(
    isOpen: boolean,
    setClosing: (v: boolean) => void,
    setOpen: (v: boolean) => void,
  ) {
    if (!isOpen) return;
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 160);
  }
  const closeMore = () => closeAnim(moreOpen, setMoreClosing, setMoreOpen);
  const closeNotif = () => closeAnim(notifOpen, setNotifClosing, setNotifOpen);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node))
        closeMore();
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        closeNotif();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moreOpen, notifOpen]);

  /**
   * Escuro (padrão) ↔ claro. O tema real mora em UserSettings.theme e sai
   * renderizado como data-theme no wrapper do /dashboard/layout.
   *
   * Escrevo o data-theme na hora, ANTES do fetch: o CSS é 100% variável, então
   * a troca é instantânea e não pisca esperando o round-trip. O router.refresh()
   * depois só realinha o server component com o que já está na tela.
   */
  function toggleTheme() {
    const next = isLight ? DARK_THEME_KEY : LIGHT_THEME_KEY;
    setIsLight(!isLight);
    document
      .querySelector("[data-theme]")
      ?.setAttribute("data-theme", next);
    fetch("/api/dashboard/quick-theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).then(() => router.refresh());
  }

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-white/[0.06] bg-black/60 px-3 backdrop-blur sm:gap-3 sm:px-6"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Hamburger mobile — dispara custom event que a sidebar escuta */}
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("bp:sidebar-open"));
          }
        }}
        className="-ml-1 inline-flex size-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.05] hover:text-white md:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Olho de ocultar valores */}
      <button
        type="button"
        onClick={togglePrivacy}
        className="rounded-full p-2 text-zinc-400 hover:bg-white/[0.05] hover:text-white transition"
        title={privacyMode ? "Exibir valores" : "Ocultar valores"}
        aria-label={privacyMode ? "Exibir valores" : "Ocultar valores"}
      >
        {privacyMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>

      {/* 06/08/2026 (davi): "Ao lado do iconezinho de olho na barra superior
          adcione um icone de toogle dark mode / white mode". Escuro é o
          padrão — o sol só aparece quando já está claro. */}
      <button
        type="button"
        onClick={toggleTheme}
        role="switch"
        aria-checked={isLight}
        className="rounded-full p-2 text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
        title={isLight ? "Mudar para o modo escuro" : "Mudar para o modo claro"}
        aria-label={
          isLight ? "Mudar para o modo escuro" : "Mudar para o modo claro"
        }
      >
        {isLight ? (
          <Sun className="size-4 text-amber-400" />
        ) : (
          <Moon className="size-4" />
        )}
      </button>


      {/* Empurra o grupo da direita (sino + avatar) pro canto.
          10/08/2026: era `sm:hidden` porque no desktop quem ocupava o meio
          era a barra de faturamento, que tinha `flex-1`. Com ela removida,
          o desktop ficou sem nada empurrando e a topbar inteira desabou pra
          esquerda. Agora o espacador vale nos dois tamanhos. */}
      <div className="flex-1" />

      <div className="flex items-center gap-1">
        {/* 06/08/2026 (davi): "Apaga esse iconezinho de suporte dai" — o
            headset saiu do topbar. Virou o botão flutuante com a logo da Trilho
            (SupportFab, montado no layout do dashboard). */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => (notifOpen ? closeNotif() : setNotifOpen(true))}
            className="rounded-full p-2 text-zinc-400 hover:bg-white/[0.05] hover:text-white transition"
            aria-label="Notificações"
          >
            <Bell className="size-4" />
            {/* Contador de nao lidas. `99+` porque tres digitos estouram o
                circulo, e a diferenca entre 100 e 240 avisos nao muda o que a
                pessoa faz. */}
            {naoLidas > 0 && (
              <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-cyan-400 px-1 text-[9px] font-bold leading-4 text-black">
                {naoLidas > 99 ? "99+" : naoLidas}
              </span>
            )}
          </button>
          {(notifOpen || notifClosing) && (
            <div
              className={`fixed inset-x-2 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-white/[0.08] bg-zinc-950/95 shadow-2xl backdrop-blur sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-h-none ${
                notifClosing ? "animate-bp-popover-out-top" : "animate-bp-popover-in-top"
              }`}
            >
              <div className="border-b border-white/[0.06] px-4 py-3">
                <p className="text-sm font-medium text-white">Notificações</p>
              </div>

              <NotificacoesLista itens={notificacoes} />

              <div className="border-t border-white/[0.06] px-4 py-3">
                <p className="text-[10px] text-zinc-500">
                  Receba vendas pendentes e pagas no seu celular
                </p>
              </div>
              <PushSettings publicKey={pushPublicKey} />
            </div>
          )}
        </div>

        <div ref={moreRef} className="relative ml-1">
          <button
            type="button"
            onClick={() => (moreOpen ? closeMore() : setMoreOpen(true))}
            className="inline-flex size-9 items-center justify-center overflow-hidden rounded-full border-2 border-white/[0.08] bg-white/[0.04] text-xs font-semibold text-white transition hover:border-cyan-400/30"
            title="Conta e opções"
            aria-label="Abrir menu da conta"
            aria-expanded={moreOpen}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                className="size-full object-cover"
              />
            ) : (
              <span className="text-cyan-300">{initials}</span>
            )}
          </button>
          {(moreOpen || moreClosing) && (
            <div
              className={`absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/95 py-1 shadow-2xl backdrop-blur ${
                moreClosing ? "animate-bp-popover-out-top" : "animate-bp-popover-in-top"
              }`}
            >
              <Link href="/dashboard/perfil" onClick={closeMore} className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.04] hover:text-white">
                <Sparkles className="size-3.5" /> Meu perfil
              </Link>
              {/* 10/08/2026 (davi): "vamos adcionar uma aba de indique e ganhe
                  1% (...) na parte ali de quando clica na foto de perfil". */}
              <Link href="/dashboard/indique" onClick={closeMore} className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.04] hover:text-white">
                <Gift className="size-3.5" /> Indique e ganhe
              </Link>
              <div className="my-1 border-t border-white/[0.06]" />
              <button type="button" onClick={handleSignOut} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-red-500/10 hover:text-red-300">
                <LogOut className="size-3.5" /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
