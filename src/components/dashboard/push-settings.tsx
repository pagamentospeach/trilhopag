"use client";

/**
 * PushSettings — UI compacta que vive dentro do painel de notificações
 * do topbar. Mostra status atual do browser (granted/denied/default),
 * permite ativar, e oferece toggles individuais (pendente/paga).
 *
 * Salva sub no servidor via /api/push/subscribe ao ativar.
 * Comportamento ofline-safe: se o browser não suportar Notification API
 * (Safari iOS sem A2HS, ou navegador antigo), mostra mensagem de fallback.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  Smartphone,
  TestTube2,
} from "lucide-react";

type AggregateSettings = {
  notifyOnPending: boolean;
  notifyOnPaid: boolean;
  count: number;
};

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; ++i) view[i] = raw.charCodeAt(i);
  return buf;
}

export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agg, setAgg] = useState<AggregateSettings>({
    notifyOnPending: true,
    notifyOnPaid: true,
    count: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  // Detecta suporte + estado atual
  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;
    setSupported(ok);
    if (!ok) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    // Detecta sub existente
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      })
      .catch(() => setSubscribed(false));
    // Sincroniza toggles do server
    fetch("/api/push/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data?.aggregate) setAgg(data.aggregate);
      })
      .catch(() => {});
  }, []);

  const registerSW = useCallback(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("sem service worker");
    // Idempotente: navigator faz reuse se já existir
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return reg;
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    if (!publicKey) {
      setError("Push não configurado no servidor.");
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError(
          perm === "denied"
            ? "Permissão negada — habilite manualmente nas configurações do navegador."
            : "Permissão não concedida.",
        );
        return;
      }
      const reg = await registerSW();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const body = sub.toJSON();
      const resp = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: body.endpoint,
          keys: body.keys,
        }),
      });
      if (!resp.ok) throw new Error("falha ao salvar subscription");
      setSubscribed(true);
      // Recarrega aggregate
      const data = await fetch("/api/push/settings").then((r) => r.json());
      if (data?.aggregate) setAgg(data.aggregate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }, [publicKey, registerSW]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao desativar");
    } finally {
      setBusy(false);
    }
  }, []);

  const toggle = useCallback(async (field: "notifyOnPending" | "notifyOnPaid", value: boolean) => {
    setAgg((prev) => ({ ...prev, [field]: value }));
    await fetch("/api/push/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    }).catch(() => {});
  }, []);

  const sendTest = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/push/test", { method: "POST" });
      setTestSent(true);
      setTimeout(() => setTestSent(false), 4000);
    } finally {
      setBusy(false);
    }
  }, []);

  if (supported === null) {
    return (
      <div className="px-4 py-6 text-center">
        <Loader2 className="mx-auto size-4 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!supported) {
    // Detecta o PORQUÊ pra guiar o caminho certo (cada caso tem solução):
    //  - in-app (Instagram/FB/TikTok/WhatsApp webview): abrir no navegador real
    //  - iOS Safari: instalar como App (push só funciona em PWA na Apple)
    //  - resto: navegador antigo
    const ua =
      typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const isInApp =
      /FBAN|FBAV|Instagram|Line|MicroMessenger|TikTok|Twitter|Snapchat|GSA|musical_ly/i.test(
        ua,
      );
    const isIOS =
      /iPhone|iPad|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) &&
        typeof navigator !== "undefined" &&
        (navigator as { maxTouchPoints?: number }).maxTouchPoints !== undefined &&
        ((navigator as { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1);

    return (
      <div className="px-4 py-5">
        <Smartphone className="mx-auto mb-2 size-5 text-zinc-600" />
        {isInApp ? (
          <>
            <p className="text-center text-xs font-medium text-amber-200">
              Abra no navegador pra ativar as notificações
            </p>
            <p className="mt-2 text-[11px] text-zinc-400 leading-relaxed">
              Você está abrindo dentro de um app (Instagram, WhatsApp, etc.), e
              esses navegadores internos não suportam notificação. Toque no menu{" "}
              <strong>⋮</strong> (ou <strong>compartilhar</strong>) e escolha{" "}
              <strong>&quot;Abrir no Chrome/Safari&quot;</strong>. Depois é só
              ativar aqui.
            </p>
          </>
        ) : isIOS ? (
          <>
            <p className="text-center text-xs font-medium text-amber-200">
              No iPhone, instale o Trilho como App
            </p>
            <p className="mt-2 text-[11px] text-zinc-400 leading-relaxed">
              A Apple só permite notificação web quando o site está na Tela de
              Início. Passo a passo (no Safari):
            </p>
            <ol className="mt-2 space-y-1 text-[11px] text-zinc-400 list-decimal list-inside">
              <li>
                Toque em <strong>Compartilhar</strong> (quadrado com seta ↑)
              </li>
              <li>
                <strong>Adicionar à Tela de Início</strong>
              </li>
              <li>Abra o Trilho por esse ícone novo</li>
              <li>Volte aqui e ative as notificações</li>
            </ol>
          </>
        ) : (
          <>
            <p className="text-center text-xs text-zinc-400">
              Seu navegador não suporta notificações push.
            </p>
            <p className="mt-1 text-center text-[10px] text-zinc-600">
              Use o Chrome, Edge, Firefox ou Safari atualizado (no PC ou
              Android). No iPhone, instale o Trilho como App.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      {!subscribed || permission !== "granted" ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl bg-cyan-400/[0.06] p-3 ring-1 ring-cyan-400/15">
            <div className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-cyan-400/15">
              <Bell className="size-4 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white">Ativar push no celular</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                Receba alerta de venda pendente e venda paga direto na tela do
                celular, mesmo com o app fechado.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-bold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Bell className="size-3.5" />
            )}
            {busy ? "Configurando…" : "Ativar notificações"}
          </button>
          {error && (
            <p className="text-[11px] text-red-300">
              {error}
            </p>
          )}
          {permission === "denied" && (
            <p className="text-[10px] text-zinc-500">
              Bloqueado no navegador. Clique no cadeado/ⓘ ao lado da URL → Notificações → Permitir.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-cyan-400/[0.06] px-3 py-2 ring-1 ring-cyan-400/15">
            <CheckCircle2 className="size-4 text-cyan-300" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-cyan-100">Push ativo</p>
              <p className="text-[10px] text-zinc-400">
                {agg.count} {agg.count === 1 ? "dispositivo" : "dispositivos"} inscritos
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <ToggleRow
              label="Venda pendente"
              hint="PIX gerado, aguardando pagamento"
              checked={agg.notifyOnPending}
              onChange={(v) => toggle("notifyOnPending", v)}
            />
            <ToggleRow
              label="Venda paga"
              hint="Pagamento confirmado, saldo creditado"
              checked={agg.notifyOnPaid}
              onChange={(v) => toggle("notifyOnPaid", v)}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={sendTest}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] px-2 py-2 text-[11px] font-medium text-zinc-200 transition hover:bg-white/[0.10] disabled:opacity-60"
            >
              <TestTube2 className="size-3" />
              {testSent ? "Enviado!" : "Enviar teste"}
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-zinc-400 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
            >
              <BellOff className="size-3" />
              Desativar
            </button>
          </div>
          {error && (
            <p className="text-[11px] text-red-300">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.03]">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white">{label}</p>
        <p className="text-[10px] text-zinc-500">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-cyan-400" : "bg-white/[0.10]"
        }`}
      >
        <span
          className={`absolute top-0.5 inline-block size-4 rounded-full bg-zinc-950 transition ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}
