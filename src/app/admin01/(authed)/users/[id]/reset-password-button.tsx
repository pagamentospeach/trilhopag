"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  KeyRound,
  ShieldOff,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";
import {
  adminResetUserPassword,
  adminDisableUserTwoFactor,
} from "../../../actions";

/**
 * Controles de segurança da conta (admin) — dentro de "🪪 Identidade & status".
 *
 *  • Resetar senha → gera uma senha ALEATÓRIA nova e mostra UMA vez (pro admin
 *    repassar pro seller). A senha some ao sair/recarregar — não fica salva.
 *  • Remover 2FA → desativa o TOTP do seller (quando ele perde o autenticador).
 */
export function AdminSecurityControls({
  userId,
  email,
  twoFactorEnabled,
}: {
  userId: string;
  email: string;
  twoFactorEnabled: boolean;
}) {
  const router = useRouter();
  const [pendingPwd, startPwd] = useTransition();
  const [pending2fa, start2fa] = useTransition();
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetPassword() {
    if (
      !confirm(
        `Gerar uma SENHA NOVA aleatória pra ${email}?\n\nA senha atual deixa de funcionar na hora e o seller é deslogado. A nova senha vai aparecer aqui pra você copiar e repassar.`,
      )
    )
      return;
    setError(null);
    setCopied(false);
    startPwd(async () => {
      const r = await adminResetUserPassword(userId);
      if (r.ok) {
        setNewPassword(r.password);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  function copyPassword() {
    if (!newPassword) return;
    navigator.clipboard?.writeText(newPassword).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }

  function removeTwoFactor() {
    if (
      !confirm(
        `Remover o 2FA (autenticador) de ${email}?\n\nEle vai conseguir entrar só com email + senha, sem pedir código.`,
      )
    )
      return;
    setError(null);
    start2fa(async () => {
      const r = await adminDisableUserTwoFactor(userId);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-cyan-300" />
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-300">
          Segurança da conta
        </p>
      </div>

      {/* RESET DE SENHA */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] text-zinc-400">Senha de acesso</span>
          <button
            type="button"
            onClick={resetPassword}
            disabled={pendingPwd}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-50"
          >
            {pendingPwd ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <KeyRound className="size-3" />
            )}
            Resetar senha
          </button>
        </div>

        {newPassword && (
          <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/[0.06] p-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200/80">
              Nova senha (anote agora — some ao recarregar)
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all break-all rounded-md bg-black/40 px-3 py-2 font-mono text-sm text-white">
                {newPassword}
              </code>
              <button
                type="button"
                onClick={copyPassword}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/[0.1] bg-white/[0.04] px-2.5 py-2 text-[11px] text-zinc-200 hover:bg-white/[0.08]"
              >
                {copied ? (
                  <>
                    <Check className="size-3 text-cyan-300" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="size-3" /> Copiar
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">
              Repasse pro seller com segurança. Ele já pode entrar com{" "}
              <strong>{email}</strong> + essa senha. As sessões antigas foram
              encerradas.
            </p>
          </div>
        )}
      </div>

      {/* 2FA */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
        <span className="inline-flex items-center gap-1.5 text-[12px]">
          {twoFactorEnabled ? (
            <>
              <ShieldCheck className="size-3.5 text-cyan-300" />
              <span className="text-zinc-300">
                2FA <strong className="text-cyan-300">ativo</strong>
              </span>
            </>
          ) : (
            <>
              <ShieldOff className="size-3.5 text-zinc-500" />
              <span className="text-zinc-500">2FA inativo</span>
            </>
          )}
        </span>
        {twoFactorEnabled && (
          <button
            type="button"
            onClick={removeTwoFactor}
            disabled={pending2fa}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
          >
            {pending2fa ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ShieldOff className="size-3" />
            )}
            Remover 2FA
          </button>
        )}
      </div>

      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
