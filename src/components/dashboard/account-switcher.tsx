"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  Plus,
  Check,
  UserCircle2,
  Trash2,
  LogOut,
  Pencil,
  Palette,
  Settings,
  Loader2,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { renameAccount } from "@/app/dashboard/account-actions";
import type { AccountSwitch } from "@/lib/effective-user";

// 08/08/2026 (davi): o badge do modo de adquirente saiu daqui junto com a
// seleção de modo — modo é decisão do admin e não aparece pro seller.
export function AccountSwitcher({ accounts }: { accounts: AccountSwitch[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // "closing" dispara a animacao de saida ANTES de desmontar o dropdown.
  // Rende quando (open || closing); animate-out roda por 160ms e depois
  // closing volta pra false + open ja foi setado false.
  const [closing, setClosing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  // 23/07/2026 (davi): sub-conta agora exige email pra admin buscar depois.
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [switching, setSwitching] = useState(false);
  const [isPending, startTransition] = useTransition();
  const current = accounts.find((a) => a.isCurrent) ?? accounts[0];
  // Refs pra click-outside: qualquer clique fora do wrapper fecha o
  // dropdown com animacao. Wrapper cobre botao + popup (siblings).
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fecha com animacao (usa em toggle + click-outside + acoes que ja
  // fechavam o dropdown direto tipo trocar conta / criar sub / signout).
  function closeWithAnimation() {
    if (!open) return;
    setClosing(true);
    // Duracao alinhada com duration-150 da classe animate-out abaixo.
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 160);
  }

  // Click-outside — fecha se clicar fora do wrapper enquanto aberto.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        closeWithAnimation();
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tecla ESC fecha o dropdown (parity com dialogs padrao).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeWithAnimation();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!current) return null;

  function switchTo(id: string) {
    setError(null);
    setSwitching(true); // tela de carregamento clean (< 2s) na troca de conta
    startTransition(async () => {
      const res = await fetch("/api/dashboard/sub-account/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id }),
      });
      if (res.ok) {
        closeWithAnimation();
        router.refresh();
        // mantém o overlay enquanto re-hidrata; some em ~1.1s (sempre < 2s)
        setTimeout(() => setSwitching(false), 1100);
      } else {
        setSwitching(false);
      }
    });
  }

  function submitRename(id: string) {
    const name = renameDraft.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    startTransition(async () => {
      const r = await renameAccount(id, name);
      setRenamingId(null);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  function deleteSub(id: string, name: string) {
    if (
      !confirm(
        `Excluir a sub-conta "${name}"?\n\nIsso vai apagar TODOS os produtos, vendas e dados dela. Não tem volta.\n\nA sub-conta precisa estar com saldo zero e sem saques pendentes.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/dashboard/sub-account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id }),
      });
      if (res.ok) {
        closeWithAnimation();
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? data.error ?? "Erro ao excluir.");
      }
    });
  }

  function createSub(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const nameTrim = newName.trim();
    const emailTrim = newEmail.trim().toLowerCase();
    if (!nameTrim) return;
    // Validacao basica de email do lado do cliente (o backend Zod valida serio).
    if (!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setError("Informe um email válido pra essa sub-conta.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/dashboard/sub-account/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameTrim, email: emailTrim }),
      });
      if (res.ok) {
        setNewName("");
        setNewEmail("");
        setCreating(false);
        closeWithAnimation();
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? data.error ?? "Erro ao criar sub-conta.");
      }
    });
  }

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = current.displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sessionAccount = accounts.find((a) => a.isParent);
  const isOnSub = current.isSubAccount;

  return (
    <>
      {/* Tela de carregamento clean (< 2s) ao trocar de conta */}
      {switching && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-cyan-400/20" />
              <div className="relative inline-flex size-14 items-center justify-center rounded-full bg-cyan-400/15 ring-2 ring-cyan-400/40">
                <Loader2 className="size-6 animate-spin text-cyan-300" />
              </div>
            </div>
            <p className="text-sm font-medium text-white">Trocando de conta…</p>
          </div>
        </div>
      )}
      <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => (open ? closeWithAnimation() : setOpen(true))}
        className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 text-left transition hover:border-cyan-400/30 hover:bg-white/[0.04]"
      >
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-semibold text-cyan-300">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-white">
              {current.displayName}
            </p>
            {isOnSub && (
              <span className="rounded-full bg-purple-400/15 px-1.5 py-0 text-[8px] uppercase tracking-wider text-purple-300">
                Sub
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-zinc-500">
            {accounts.length > 1
              ? `${accounts.length - 1} sub-conta${accounts.length > 2 ? "s" : ""}`
              : current.email}
          </p>
        </div>
        <ChevronDown
          className={`size-3.5 shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {(open || closing) && (
        <div
          className={`absolute bottom-0 left-full z-50 ml-2 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-white/[0.08] bg-zinc-950/95 shadow-2xl backdrop-blur ${
            closing ? "animate-bp-popover-out" : "animate-bp-popover-in"
          }`}
        >
          <div className="px-3 pb-1 pt-3 text-[10px] uppercase tracking-wider text-zinc-500">
            Trocar conta
          </div>
          <div className="max-h-64 overflow-y-auto">
            {accounts.map((a) => (
              <div
                key={a.id}
                className={`group flex items-center gap-2 px-3 py-2 text-xs transition ${
                  a.isCurrent
                    ? "bg-cyan-400/10 text-cyan-300"
                    : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {renamingId === a.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitRename(a.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1"
                  >
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-cyan-400/40 bg-white/[0.04] px-2 py-1 text-xs text-white outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isPending}
                      title="Salvar"
                      className="shrink-0 rounded p-1 text-cyan-300 hover:bg-cyan-400/15"
                    >
                      <Check className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      title="Cancelar"
                      className="shrink-0 rounded p-1 text-zinc-400 hover:bg-white/[0.06]"
                    >
                      <X className="size-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => switchTo(a.id)}
                      disabled={a.isCurrent || isPending}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                    >
                      <UserCircle2 className="size-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{a.displayName}</p>
                        {a.isParent && (
                          <p className="text-[9px] text-zinc-500">
                            Conta principal
                          </p>
                        )}
                        {a.isSubAccount && (
                          <p className="text-[9px] text-zinc-500">Sub-conta</p>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(a.id);
                        setRenameDraft(a.displayName);
                      }}
                      disabled={isPending}
                      title="Renomear"
                      className="invisible shrink-0 rounded p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-white group-hover:visible"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <Link
                      href="/dashboard/aparencia"
                      onClick={() => closeWithAnimation()}
                      title="Mudar aparência do gateway"
                      className="invisible shrink-0 rounded p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-fuchsia-300 group-hover:visible"
                    >
                      <Palette className="size-3" />
                    </Link>
                    <Link
                      href="/dashboard/perfil"
                      onClick={() => closeWithAnimation()}
                      title="Ajustes da conta"
                      className="invisible shrink-0 rounded p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-cyan-300 group-hover:visible"
                    >
                      <Settings className="size-3" />
                    </Link>
                    {a.isSubAccount && (
                      <button
                        type="button"
                        onClick={() => deleteSub(a.id, a.displayName)}
                        disabled={isPending}
                        className="invisible shrink-0 rounded p-1 text-zinc-500 hover:bg-red-500/15 hover:text-red-300 group-hover:visible"
                        title="Excluir sub-conta"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                    {a.isCurrent && (
                      <Check className="ml-auto size-3 shrink-0 text-cyan-400" />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="border-t border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[10px] text-red-300">
              {error}
            </div>
          )}

          <div className="border-t border-white/[0.06] p-2">
            {creating ? (
              <form onSubmit={createSub} className="space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome da sub-conta"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-cyan-400/50 focus:outline-none"
                />
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Email da sub-conta (obrigatório)"
                  required
                  autoComplete="off"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-cyan-400/50 focus:outline-none"
                />
                {error && (
                  <p className="text-[10px] text-red-300">{error}</p>
                )}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setError(null);
                      setNewName("");
                      setNewEmail("");
                    }}
                    className="flex-1 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-zinc-300 hover:bg-white/[0.04]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || !newName.trim() || !newEmail.trim()}
                    className="flex-1 rounded-lg bg-cyan-400 px-2 py-1.5 text-[10px] font-medium text-black hover:bg-cyan-300 disabled:opacity-50"
                  >
                    {isPending ? "Criando..." : "Criar e entrar"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (sessionAccount && current.isSubAccount) {
                    // Switch to parent first then prompt
                    switchTo(sessionAccount.id);
                  }
                  setCreating(true);
                }}
                disabled={current.isSubAccount && !sessionAccount}
                className="flex w-full items-center gap-2 rounded-lg bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-300 transition hover:bg-cyan-400/15"
                title={
                  current.isSubAccount
                    ? "Volte pra conta principal pra criar sub-contas"
                    : "Cria uma nova dashboard separada"
                }
              >
                <Plus className="size-3.5" />
                Criar sub-conta
              </button>
            )}
          </div>

          <div className="border-t border-white/[0.06] p-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-400 transition hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut className="size-3.5" /> Sair da conta
            </button>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
