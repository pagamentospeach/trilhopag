"use client";

import { useState, useTransition } from "react";
import {
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
  Copy,
  Check,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  startTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
} from "./actions";

export function SecuritySection({
  twoFactorEnabled,
}: {
  twoFactorEnabled: boolean;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400">
          <ShieldCheck className="size-4" />
        </span>
        <h2 className="text-sm font-medium text-white">Segurança</h2>
      </div>

      <ChangePasswordForm />
      <div className="border-t border-white/[0.05]" />
      <TwoFactor enabled={twoFactorEnabled} />
    </section>
  );
}

/* ============================ Senha ============================ */

function ChangePasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const currentPassword = String(fd.get("currentPassword") || "");
    const newPassword = String(fd.get("newPassword") || "");
    const confirm = String(fd.get("confirm") || "");

    if (newPassword.length < 8) {
      setErr("A nova senha precisa ter no mínimo 8 caracteres.");
      return;
    }
    if (newPassword !== confirm) {
      setErr("As senhas não conferem.");
      return;
    }

    startTransition(async () => {
      try {
        const r = await authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        });
        if (r.error) {
          setErr(r.error.message || "Erro ao alterar senha.");
        } else {
          setMsg("Senha alterada — outras sessões foram desconectadas.");
          (e.target as HTMLFormElement).reset();
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro ao alterar senha.";
        setErr(msg);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-zinc-300">
        <Lock className="size-4 text-cyan-300" />
        <p className="font-medium">Alterar senha</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Senha atual</Label>
          <Input name="currentPassword" type="password" required minLength={6} />
        </div>
        <div>
          <Label>Nova senha</Label>
          <Input name="newPassword" type="password" required minLength={8} />
        </div>
        <div>
          <Label>Confirmar nova senha</Label>
          <Input name="confirm" type="password" required minLength={8} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {msg && <span className="text-xs text-cyan-300">{msg}</span>}
        {err && <span className="text-xs text-red-300">{err}</span>}
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : "Alterar senha"}
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        Após alterar, outras sessões ativas (outros navegadores/devices) serão deslogadas.
      </p>
    </form>
  );
}

/* ============================ 2FA ============================ */

function TwoFactor({ enabled }: { enabled: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-zinc-300">
        <ShieldCheck className="size-4 text-cyan-300" />
        <p className="font-medium">Autenticação em 2 fatores (TOTP)</p>
      </div>

      {enabled ? <TwoFactorEnabledPanel /> : <TwoFactorSetupPanel />}
    </div>
  );
}

function TwoFactorSetupPanel() {
  const [step, setStep] = useState<"idle" | "scanning">("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function start() {
    setErr(null);
    startTransition(async () => {
      const r = await startTwoFactorSetup();
      if (r.ok) {
        setQr(r.qrDataUrl);
        setSecret(r.secret);
        setStep("scanning");
      } else {
        setErr(r.error || "Erro ao iniciar.");
      }
    });
  }

  function confirm() {
    setErr(null);
    startTransition(async () => {
      const r = await confirmTwoFactorSetup(code);
      if (r.ok) {
        // recarrega o painel para mostrar estado "ativo"
        if (typeof window !== "undefined") window.location.reload();
      } else {
        setErr(r.error || "Código inválido.");
      }
    });
  }

  function copySecret() {
    if (!secret) return;
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (step === "idle") {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm text-white">
              Exigir 2FA para saques e operações sensíveis
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Recomendado pra contas com volume acima de R$ 5.000/mês. Use Google
              Authenticator, Authy, 1Password ou qualquer app TOTP.
            </p>
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] text-yellow-200">
              <ShieldCheck className="size-3" /> Desativado
            </p>
          </div>
          <Button onClick={start} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : "Ativar 2FA"}
          </Button>
        </div>
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      </div>
    );
  }

  // scanning
  return (
    <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.03] p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Smartphone className="size-4 text-cyan-300" />
        <p className="text-sm font-medium text-white">
          Escaneie o QR Code com seu app authenticator
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[280px_1fr]">
        <div className="rounded-xl bg-white p-3">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR Code 2FA" className="size-full" />
          )}
        </div>

        <div className="space-y-4">
          <div>
            <Label>Ou digite a chave manualmente</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                value={secret ?? ""}
                readOnly
                className="font-mono text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={copySecret}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                title="Copiar"
              >
                {copied ? (
                  <Check className="size-4 text-cyan-400" />
                ) : (
                  <Copy className="size-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <Label>Digite o código de 6 dígitos gerado pelo app</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              className="font-mono tracking-widest text-lg"
              autoFocus
            />
          </div>

          {err && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {err}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStep("idle");
                setQr(null);
                setSecret(null);
                setCode("");
                setErr(null);
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={isPending || code.length !== 6}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Confirmar e ativar"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TwoFactorEnabledPanel() {
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onDisable() {
    setErr(null);
    startTransition(async () => {
      const r = await disableTwoFactor(code);
      if (r.ok) {
        if (typeof window !== "undefined") window.location.reload();
      } else {
        setErr(r.error || "Erro ao desativar.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/[0.05] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300">
            <ShieldCheck className="size-4" /> 2FA ativado
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Sua conta agora pede um código do app authenticator em operações
            sensíveis. Guarde o app — sem ele você não consegue logar.
          </p>
        </div>
        {!disabling && (
          <Button
            variant="ghost"
            onClick={() => setDisabling(true)}
            disabled={isPending}
          >
            Desativar
          </Button>
        )}
      </div>

      {disabling && (
        <div className="border-t border-cyan-400/20 pt-3 space-y-3">
          <p className="text-xs text-zinc-400">
            Pra desativar, digite o código atual do seu app:
          </p>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            className="font-mono tracking-widest"
            autoFocus
          />
          {err && (
            <p className="text-xs text-red-300">{err}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDisabling(false);
                setCode("");
                setErr(null);
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={onDisable}
              disabled={isPending || code.length !== 6}
              variant="danger"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Confirmar desativação"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
