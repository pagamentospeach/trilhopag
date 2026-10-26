"use client";

import { useTransition } from "react";
import {
  AlertCircle,
  ShieldCheck,
  LogOut,
  Settings,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { fakeButtonAction } from "../actions";

/**
 * DASHBOARD FAKE — ZERO informação sensível ou útil.
 *
 * Design intencional: mostra "Erro ao carregar dados" pra atacante gastar
 * tempo clicando em Retry / navegando pelo menu. Cada clique é um hit no
 * honeypot. Auto-ban em 5 hits/hora.
 *
 * NÃO tem: números de volume, saldos, listas de saques, nomes/emails, PIX,
 * nomes de adquirentes, nomes de crons, features internas, ações reais.
 */
export function DashboardClient() {
  const [isPending, startTransition] = useTransition();

  function trackClick(button: string) {
    startTransition(async () => {
      await fakeButtonAction("click_button", { button });
    });
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 flex items-center justify-center">
              <ShieldCheck className="size-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-red-400 font-semibold">
                Admin
              </p>
              <p className="text-sm font-bold text-white -mt-0.5">Painel</p>
            </div>
          </div>
          <button
            onClick={() => trackClick("logout")}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
          >
            <LogOut className="size-3.5" />
            Sair
          </button>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        {/* Menu lateral com nomes GENÉRICOS */}
        <nav className="space-y-1">
          {[
            { icon: BarChart3, label: "Dashboard", active: true },
            { icon: Settings, label: "Configurações" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => trackClick(`nav_${item.label}`)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                item.active
                  ? "bg-white/[0.05] text-white"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.02]"
              }`}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Conteúdo: erro "não carregou nada" */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-8 text-center">
            <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-amber-500/15">
              <AlertCircle className="size-6 text-amber-300" />
            </div>
            <h2 className="text-base font-semibold text-white">
              Erro ao carregar dados
            </h2>
            <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
              Não foi possível conectar ao serviço interno. Sua sessão está ativa
              mas os dados operacionais estão temporariamente indisponíveis.
            </p>
            <button
              onClick={() => trackClick("retry_load")}
              disabled={isPending}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] px-4 py-2 text-xs text-zinc-300 transition disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
              Tentar novamente
            </button>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-zinc-950 p-4">
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Se o problema persistir, contate o administrador do sistema. Não
              tente reiniciar processos operacionais manualmente. Todas as
              tentativas de acesso são registradas e auditadas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
