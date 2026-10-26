"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Banknote,
  Smartphone,
  Download,
  Loader2,
  AlertTriangle,
  Pencil,
  Sparkles,
  Zap,
  Volume2,
  VolumeX,
} from "lucide-react";

/** Texto de orientação quando o push não é suportado — guia pelo caso real
 *  (in-app webview / iPhone / navegador antigo). Roda só no client. */
function pushUnsupportedHint(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isInApp =
    /FBAN|FBAV|Instagram|Line|MicroMessenger|TikTok|Twitter|Snapchat|GSA|musical_ly/i.test(
      ua,
    );
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) &&
      ((navigator as { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1);
  if (isInApp) {
    return "Você abriu dentro de um app (Instagram/WhatsApp/etc.). Toque no menu ⋮ ou Compartilhar → \"Abrir no Chrome/Safari\" e ative por lá.";
  }
  if (isIOS) {
    return "No iPhone, a Apple só permite push com o site na Tela de Início: Compartilhar (↑) → Adicionar à Tela de Início → abra por esse ícone → ative aqui.";
  }
  return "Use Chrome, Edge, Firefox ou Safari atualizado (PC/Android). No iPhone, instale o Trilho como App.";
}

type EventKey = "pending" | "paid" | "withdrawal";

type EventPrefs = {
  title?: string;
  body?: string;
  emoji?: string;
  sound?: boolean;
  vibrate?: boolean;
  /**
   * 30/07/2026 (davi): quando true, appenda uma linha 'Via 🤖 X · 🛍️ Y · 📦 Z'
   * ao body com a origem da venda. Opt-in.
   */
  showSource?: boolean;
};

type AllPrefs = Partial<Record<EventKey, EventPrefs>>;

const DEFAULTS: Record<EventKey, Required<EventPrefs>> = {
  pending: {
    title: "{emoji} PIX gerado",
    body: "{amount} aguardando pagamento de {customer}",
    emoji: "🕐",
    sound: true,
    vibrate: true,
    showSource: false,
  },
  paid: {
    title: "{emoji} +{amount}!",
    body: "Venda aprovada — {customer} pagou {product}",
    emoji: "💰",
    sound: true,
    vibrate: true,
    showSource: false,
  },
  withdrawal: {
    title: "{emoji} Saque pago",
    body: "{amount} foi enviado pra sua chave PIX",
    emoji: "🏦",
    sound: true,
    vibrate: true,
    showSource: false,
  },
};

/**
 * Tab de Notificações na pagina de perfil.
 *
 * Funcionalidades:
 *  1. Pedir permissao do navegador + subscribe push
 *  2. Toggles por evento (venda pendente / venda paga / saque aprovado)
 *  3. Botao de instalar PWA (mobile = "Adicionar a tela inicial")
 *  4. Botao de "enviar teste"
 *
 * Suporta multiplos devices — cada device tem sua propria subscription
 * mas os toggles do user sao globais (mudam em todas as subs ao mesmo
 * tempo).
 */
type Aggregate = {
  notifyOnPending: boolean;
  notifyOnPaid: boolean;
  notifyOnWithdrawalPaid: boolean;
  count: number;
};

export function NotificacoesTab() {
  const [agg, setAgg] = useState<Aggregate | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [installPromptEvt, setInstallPromptEvt] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isStandalone, setIsStandalone] = useState(false);
  const [prefs, setPrefs] = useState<AllPrefs>({});
  const [isFriend, setIsFriend] = useState(false);
  // Inscrição DESTE navegador/dispositivo (não o agregado de todos). É isso
  // que decide se mostramos o botão "ativar" aqui — senão um 2º dispositivo
  // via como "já inscrito" (porque outro device tem sub) e nunca registrava
  // a própria sub.
  const [localSubscribed, setLocalSubscribed] = useState(false);

  // Load aggregate
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    // Standalone check (PWA já instalado)
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;
    setIsStandalone(!!standalone);

    // Inscrição real DESTE navegador (independente do agregado do server).
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setLocalSubscribed(!!sub))
        .catch(() => setLocalSubscribed(false));
    }

    fetch("/api/push/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d?.aggregate) setAgg(d.aggregate);
        if (d?.prefs) setPrefs(d.prefs);
        if (typeof d?.isFriendAccount === "boolean") setIsFriend(d.isFriendAccount);
      })
      .catch(() => {});

    // Capture install prompt
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function subscribe() {
    setBusy(true);
    setMsg(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setMsg("Seu navegador não suporta notificações push.");
        return;
      }
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setMsg("Permissão negada. Habilite nas configurações do navegador.");
        return;
      }
      // Get VAPID public key
      const vapidRes = await fetch("/api/push/vapid").then((r) => r.json());
      if (!vapidRes?.publicKey) {
        setMsg("Servidor de push não configurado. Contate o suporte.");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidRes.publicKey) as BufferSource,
      });

      // Salva no server. IMPORTANTE: forma aninhada { keys: { p256dh, auth } }
      // — é o shape que a API espera. Antes mandava achatado e o POST falhava
      // com 400 (sub nunca salva), mas o código não checava resp.ok e ainda
      // mostrava "ativado" — por isso não chegava push nesses dispositivos.
      const subJson = sub.toJSON();
      const resp = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
          },
        }),
      });
      if (!resp.ok) {
        throw new Error("falha ao registrar no servidor");
      }
      setLocalSubscribed(true);
      // Refresh aggregate
      const d = await fetch("/api/push/settings").then((r) => r.json());
      if (d?.aggregate) setAgg(d.aggregate);
      setMsg("✓ Notificações ativadas neste dispositivo.");
    } catch (e) {
      setMsg(`Erro: ${e instanceof Error ? e.message : "desconhecido"}`);
    } finally {
      setBusy(false);
    }
  }

  async function setToggle(
    key: "notifyOnPending" | "notifyOnPaid" | "notifyOnWithdrawalPaid",
    value: boolean,
  ) {
    if (!agg) return;
    setAgg({ ...agg, [key]: value });
    await fetch("/api/push/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {});
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      const d = await r.json();
      setMsg(
        d.ok
          ? `✓ Teste enviado (${d.sent ?? 0} dispositivo(s))`
          : `Erro: ${d.error ?? "desconhecido"}`,
      );
    } catch {
      setMsg("Erro ao enviar teste");
    } finally {
      setBusy(false);
    }
  }

  async function installPWA() {
    if (!installPromptEvt) return;
    installPromptEvt.prompt();
    const { outcome } = await installPromptEvt.userChoice;
    if (outcome === "accepted") {
      setIsStandalone(true);
      setInstallPromptEvt(null);
    }
  }

  // "Inscrito" reflete ESTE dispositivo: precisa de permissão concedida E de
  // uma push subscription ativa neste navegador. Antes usava o agregado
  // (agg.count > 0), então um 2º device nunca era convidado a se inscrever.
  const subscribed = localSubscribed && permission === "granted";

  return (
    <div className="space-y-6">
      {/* ============ PWA INSTALL ============ */}
      <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.06] to-transparent p-5">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl bg-cyan-400/[0.15] inline-flex items-center justify-center shrink-0">
            <Smartphone className="size-5 text-cyan-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white">
              Aplicativo do gateway no seu celular
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Baixe o Trilho como app no seu celular pra receber notificações
              de venda em tempo real, sem precisar abrir o navegador. Funciona
              como qualquer outro app — fica no app drawer.
            </p>

            {isStandalone ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-cyan-400/15 px-3 py-1.5 text-xs text-cyan-300 font-bold">
                <CheckCircle2 className="size-3.5" />
                App já instalado neste dispositivo
              </div>
            ) : installPromptEvt ? (
              <button
                type="button"
                onClick={installPWA}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-300"
              >
                <Download className="size-3.5" />
                Instalar agora
              </button>
            ) : (
              <details className="mt-3">
                <summary className="text-xs text-cyan-300 cursor-pointer hover:text-cyan-200">
                  Como instalar manualmente →
                </summary>
                <div className="mt-2 space-y-2 text-[11px] text-zinc-400 pl-2 border-l border-cyan-400/20">
                  <p>
                    <strong className="text-zinc-200">Android (Chrome):</strong>{" "}
                    abra o menu (⋮) → "Adicionar à tela inicial" → "Instalar".
                  </p>
                  <p>
                    <strong className="text-zinc-200">iPhone (Safari):</strong>{" "}
                    toque no botão compartilhar (□↑) → "Adicionar à Tela de
                    Início".
                  </p>
                  <p>
                    <strong className="text-zinc-200">Desktop (Chrome/Edge):</strong>{" "}
                    aparece um ícone ⊕ na barra de endereços ou em menu →
                    "Instalar Trilho".
                  </p>
                </div>
              </details>
            )}
          </div>
        </div>
      </div>

      {/* ============ PUSH SUBSCRIPTION ============ */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`size-10 rounded-xl inline-flex items-center justify-center shrink-0 ${
              subscribed
                ? "bg-blue-400/[0.15] text-blue-300"
                : "bg-zinc-700/40 text-zinc-500"
            }`}
          >
            {subscribed ? (
              <Bell className="size-5" />
            ) : (
              <BellOff className="size-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white">
              Notificações push
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              {permission === "unsupported"
                ? "Notificações push não funcionam neste navegador/contexto."
                : subscribed
                  ? `Ativas neste dispositivo · ${agg?.count} aparelho(s) cadastrado(s).`
                  : "Receba avisos de venda aprovada, pendente e saque pago — direto no seu celular ou desktop."}
            </p>
            {permission === "unsupported" && (
              <p className="text-[11px] text-amber-200/80 mt-1.5 leading-relaxed">
                {pushUnsupportedHint()}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {!subscribed && permission !== "unsupported" && (
                <button
                  type="button"
                  onClick={subscribe}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-400 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Bell className="size-3.5" />
                  )}
                  Ativar notificações neste dispositivo
                </button>
              )}
              {subscribed && (
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs text-zinc-200 hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    "Enviar notificação de teste"
                  )}
                </button>
              )}
            </div>
            {permission === "denied" && (
              <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-[11px] text-yellow-200 inline-flex items-start gap-2">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  Você bloqueou notificações pro Trilho neste navegador.
                  Habilite manualmente: cadeado na barra de endereço → permissões
                  → notificações → "Permitir".
                </span>
              </div>
            )}
          </div>
        </div>

        {/* TOGGLES — sempre visíveis mas desabilitados se não subscrito */}
        {agg && (
          <div className="space-y-2 pt-4 border-t border-white/[0.04]">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">
              Quando me notificar
            </p>
            <ToggleRow
              Icon={Clock}
              label="Venda pendente (PIX gerado)"
              desc="Cliente abriu o checkout e gerou QR Code"
              checked={agg.notifyOnPending}
              onChange={(v) => setToggle("notifyOnPending", v)}
              disabled={!subscribed}
              accent="yellow"
            />
            <ToggleRow
              Icon={CheckCircle2}
              label="Venda aprovada"
              desc="Cliente pagou e o dinheiro caiu na sua conta"
              checked={agg.notifyOnPaid}
              onChange={(v) => setToggle("notifyOnPaid", v)}
              disabled={!subscribed}
              accent="cyan"
            />
            <ToggleRow
              Icon={Banknote}
              label="Saque aprovado"
              desc="Admin enviou seu PIX e o dinheiro saiu pro seu banco"
              checked={agg.notifyOnWithdrawalPaid}
              onChange={(v) => setToggle("notifyOnWithdrawalPaid", v)}
              disabled={!subscribed}
              accent="blue"
            />
          </div>
        )}

        {msg && (
          <p
            className={`mt-3 text-xs px-3 py-2 rounded-lg ${
              msg.startsWith("✓")
                ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-200"
                : "bg-red-500/10 border border-red-500/30 text-red-200"
            }`}
          >
            {msg}
          </p>
        )}
      </div>

      {/* ============ CUSTOMIZATION (3 panels) ============ */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl inline-flex items-center justify-center shrink-0 bg-purple-400/[0.15] text-purple-300">
            <Pencil className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white">
              Personalizar texto das notificações
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Reescreva o título e corpo de cada tipo. Use{" "}
              <code className="text-purple-300">{"{amount}"}</code>,{" "}
              <code className="text-purple-300">{"{customer}"}</code>,{" "}
              <code className="text-purple-300">{"{product}"}</code>,{" "}
              <code className="text-purple-300">{"{offer}"}</code>,{" "}
              <code className="text-purple-300">{"{bot}"}</code>,{" "}
              <code className="text-purple-300">{"{emoji}"}</code> como
              variáveis. Prefere o toggle{" "}
              <span className="text-orange-300">📍 Origem</span>? Ele adiciona
              a linha "Via ..." automaticamente sem editar template.
            </p>
          </div>
        </div>

        <CustomizePanel
          eventKey="paid"
          label="Venda aprovada"
          accent="cyan"
          prefs={prefs.paid}
          onSave={async (p) => {
            const r = await fetch("/api/push/prefs", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paid: p }),
            }).then((r) => r.json());
            if (r.ok) setPrefs(r.prefs);
          }}
        />
        <CustomizePanel
          eventKey="pending"
          label="Venda pendente"
          accent="yellow"
          prefs={prefs.pending}
          onSave={async (p) => {
            const r = await fetch("/api/push/prefs", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pending: p }),
            }).then((r) => r.json());
            if (r.ok) setPrefs(r.prefs);
          }}
        />
        <CustomizePanel
          eventKey="withdrawal"
          label="Saque aprovado"
          accent="blue"
          prefs={prefs.withdrawal}
          onSave={async (p) => {
            const r = await fetch("/api/push/prefs", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ withdrawal: p }),
            }).then((r) => r.json());
            if (r.ok) setPrefs(r.prefs);
          }}
        />
      </div>

      {/* ============ SPAM GENERATOR (friend account only) ============ */}
      {isFriend && <SpamGenerator />}
    </div>
  );
}

function CustomizePanel({
  eventKey,
  label,
  accent,
  prefs,
  onSave,
}: {
  eventKey: EventKey;
  label: string;
  accent: "cyan" | "yellow" | "blue";
  prefs: EventPrefs | undefined;
  onSave: (p: EventPrefs) => Promise<void>;
}) {
  const def = DEFAULTS[eventKey];
  const [title, setTitle] = useState(prefs?.title ?? "");
  const [body, setBody] = useState(prefs?.body ?? "");
  const [emoji, setEmoji] = useState(prefs?.emoji ?? def.emoji);
  const [sound, setSound] = useState(prefs?.sound ?? true);
  const [vibrate, setVibrate] = useState(prefs?.vibrate ?? true);
  // 30/07/2026 (davi): "Mostrar origem" só faz sentido nos eventos de venda
  // (pending/paid). Saque nao tem produto/oferta/bot associado — toggle fica
  // escondido em `withdrawal`.
  const [showSource, setShowSource] = useState(prefs?.showSource ?? false);
  const showSourceToggleAvailable =
    eventKey === "paid" || eventKey === "pending";
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const accentMap = {
    cyan: "border-cyan-400/30 bg-cyan-400/[0.04]",
    yellow: "border-yellow-400/30 bg-yellow-400/[0.04]",
    blue: "border-blue-400/30 bg-blue-400/[0.04]",
  };
  const textMap = {
    cyan: "text-cyan-300",
    yellow: "text-yellow-300",
    blue: "text-blue-300",
  };

  async function save() {
    setSaving(true);
    await onSave({
      title: title.trim() || undefined,
      body: body.trim() || undefined,
      emoji: emoji.trim() || undefined,
      sound,
      vibrate,
      showSource,
    });
    setSaving(false);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  }

  function reset() {
    setTitle("");
    setBody("");
    setEmoji(def.emoji);
    setSound(true);
    setVibrate(true);
    setShowSource(false);
  }

  return (
    <details className={`rounded-xl border ${accentMap[accent]} group`}>
      <summary className="cursor-pointer px-4 py-3 list-none flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <div>
            <p className={`text-sm font-bold ${textMap[accent]}`}>{label}</p>
            <p className="text-[10px] text-zinc-500">
              {title.trim() || def.title}
            </p>
          </div>
        </div>
        <span className="text-zinc-500 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
            Emoji
          </label>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 8))}
            maxLength={8}
            className="w-20 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-2xl text-center"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
            Título
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            maxLength={80}
            placeholder={def.title}
            className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
          />
          <p className="text-[9px] text-zinc-500 mt-1">
            {title.length}/80 · vazio = usa "{def.title}"
          </p>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
            Corpo (texto)
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 200))}
            maxLength={200}
            rows={2}
            placeholder={def.body}
            className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 resize-none"
          />
          <p className="text-[9px] text-zinc-500 mt-1">
            {body.length}/200 · vazio = usa "{def.body}"
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSound((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] border ${
              sound
                ? "bg-cyan-400/10 border-cyan-400/30 text-cyan-300"
                : "bg-zinc-700/30 border-zinc-600/30 text-zinc-500"
            }`}
          >
            {sound ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
            Som {sound ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setVibrate((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] border ${
              vibrate
                ? "bg-purple-400/10 border-purple-400/30 text-purple-300"
                : "bg-zinc-700/30 border-zinc-600/30 text-zinc-500"
            }`}
          >
            <Zap className="size-3" />
            Vibrar {vibrate ? "ON" : "OFF"}
          </button>
          {/* 30/07/2026 (davi): Toggle 'Mostrar origem' — opt-in. Quando ON,
              o push mostra 'Via 🤖 Bot · 🛍️ Oferta · 📦 Produto' abaixo do
              corpo. Se OFF, notificacao fica identica ao que era antes. */}
          {showSourceToggleAvailable && (
            <button
              type="button"
              onClick={() => setShowSource((v) => !v)}
              title="Quando ativo, adiciona uma linha 'Via 🤖 Bot · 🛍️ Oferta · 📦 Produto' na notificação — pra ver de onde veio a venda"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] border ${
                showSource
                  ? "bg-orange-400/10 border-orange-400/40 text-orange-300"
                  : "bg-zinc-700/30 border-zinc-600/30 text-zinc-500"
              }`}
            >
              <span className="text-[13px] leading-none">📍</span>
              Origem {showSource ? "ON" : "OFF"}
            </button>
          )}
        </div>
        {showSourceToggleAvailable && showSource && (
          <p className="mt-1 rounded-lg border border-orange-400/20 bg-orange-400/[0.04] px-3 py-2 text-[10px] text-orange-200/80">
            <strong>Origem ativa.</strong> Cada notificação vai mostrar uma
            linha extra tipo <code className="text-orange-300">📍 🤖 MeuBot · 🛍️ oferta-vip · 📦 Curso X</code>{" "}
            (só aparece o que existir na venda: bot, oferta, produto).
          </p>
        )}
        <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold disabled:opacity-50 ${
              accent === "cyan"
                ? "bg-cyan-400 text-black hover:bg-cyan-300"
                : accent === "yellow"
                  ? "bg-yellow-400 text-black hover:bg-yellow-300"
                  : "bg-blue-500 text-white hover:bg-blue-400"
            }`}
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : null}
            {savedAt ? "✓ Salvo" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-400 hover:bg-white/[0.05]"
          >
            Resetar
          </button>
        </div>
      </div>
    </details>
  );
}

function SpamGenerator() {
  const [event, setEvent] = useState<EventKey>("paid");
  const [rate, setRate] = useState(3);
  const [duration, setDuration] = useState(10);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function start() {
    setResult(null);
    setRunning(true);
    try {
      const r = await fetch("/api/push/spam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, ratePerSec: rate, durationSec: duration }),
      }).then((r) => r.json());
      if (r.ok) {
        setResult(`✓ ${r.sent}/${r.requested} notificações enviadas (${(r.durationMs / 1000).toFixed(1)}s)`);
      } else {
        setResult(`Erro: ${r.error ?? r.message ?? "unknown"}`);
      }
    } catch {
      setResult("Erro de rede");
    } finally {
      setRunning(false);
    }
  }

  const total = rate * duration;

  return (
    <div className="rounded-2xl border border-pink-400/30 bg-gradient-to-br from-pink-400/[0.06] to-fuchsia-400/[0.04] p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-xl bg-pink-400/[0.15] inline-flex items-center justify-center shrink-0">
          <Sparkles className="size-5 text-pink-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-white inline-flex items-center gap-2">
            Gerador de notificações
            <span className="text-[9px] uppercase tracking-wider bg-pink-400/20 text-pink-200 px-1.5 py-0.5 rounded font-bold">
              Conta amigo
            </span>
          </h3>
          <p className="text-xs text-zinc-300 mt-1">
            Dispara notificações fake (nome, valor, produto aleatórios) pra
            criar prints/Reels de "vendas chegando". Respeita o template e os
            toggles configurados acima.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
            Evento
          </label>
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value as EventKey)}
            className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-white"
          >
            <option value="paid">💰 Venda aprovada</option>
            <option value="pending">🕐 Venda pendente</option>
            <option value="withdrawal">🏦 Saque aprovado</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
            Por segundo (1-10)
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={rate}
            onChange={(e) => setRate(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-white tabular-nums"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
            Duração seg (1-30)
          </label>
          <input
            type="number"
            min={1}
            max={30}
            value={duration}
            onChange={(e) => setDuration(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
            className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-white tabular-nums"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-full bg-pink-500 px-5 py-2 text-sm font-bold text-white hover:bg-pink-400 disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {running ? "Disparando..." : `Disparar ${total} push(es)`}
        </button>
        <p className="text-[11px] text-pink-200/70">
          {rate}/s × {duration}s = <strong>{total}</strong> notificações
        </p>
      </div>
      {result && (
        <p
          className={`text-xs px-3 py-2 rounded-lg ${
            result.startsWith("✓")
              ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-200"
              : "bg-red-500/10 border border-red-500/30 text-red-200"
          }`}
        >
          {result}
        </p>
      )}
    </div>
  );
}

function ToggleRow({
  Icon,
  label,
  desc,
  checked,
  onChange,
  disabled,
  accent,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  accent: "yellow" | "cyan" | "blue";
}) {
  const accentMap = {
    yellow: "text-yellow-300",
    cyan: "text-cyan-300",
    blue: "text-blue-300",
  };
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/30 p-3 transition-colors ${
        disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-black/40 cursor-pointer"
      }`}
    >
      <Icon className={`size-4 ${accentMap[accent]} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">{label}</p>
        <p className="text-[11px] text-zinc-500 mt-0.5">{desc}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="size-4 accent-cyan-400 mt-1 shrink-0"
      />
    </label>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Tipos do beforeinstallprompt (nao incluso em lib.dom.d.ts standard)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
