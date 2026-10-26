"use client";

import { useEffect, useState } from "react";
import {
  Copy,
  Check,
  QrCode,
  X,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type PixResponse = {
  transaction_id: string;
  status: string;
  amount_cents: number;
  // copy_paste pode vir null quando dispatch esta pendente (retry via cron).
  // Nesse caso pix_status="generating" e o polling em /status pega o QR
  // assim que aparecer. Ver /api/checkouts/[slug]/pix (fluxo "PIX sempre gera").
  copy_paste: string | null;
  qr_code_image: string | null;
  expires_at: string | null;
  pix_status?: "generating" | "ready" | "paid" | "expired";
  // OPCIONAL de propósito: a API de create (/checkouts/[slug]/pix) NÃO retorna
  // mais este campo (refator do QR pro cliente). O destino pós-pagamento vem do
  // /status (data.thankYouUrl), que resolve o upsell do seller.
  thank_you_url?: string;
};

type Stage = "form" | "loading" | "qr" | "expired";

export type BumpProduct = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
};

export function PixCheckout({
  slug,
  variantId,
  utm,
  priceCents,
  ctaLabel,
  bump,
}: {
  slug: string;
  variantId?: string | null;
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    content: string | null;
    term: string | null;
    fbclid: string | null;
    ttclid: string | null;
    gclid: string | null;
  };
  priceCents: number;
  ctaLabel: string;
  bump?: BumpProduct | null;
}) {
  const [stage, setStage] = useState<Stage>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [bumpSelected, setBumpSelected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const total =
    priceCents + (bump && bumpSelected ? bump.priceCents : 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStage("loading");

    const res = await fetch(`/api/checkouts/${slug}/pix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: { name, email, cpf, phone: phone || null },
        variant_id: variantId ?? null,
        bump_selected: bumpSelected,
        utm,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.message ?? err.error ?? `Erro ${res.status}`);
      setStage("form");
      return;
    }

    const data: PixResponse = await res.json();
    setPix(data);
    setStage("qr");

    // Persiste o txId pendente — pro redirect pós-pagamento sobreviver a
    // reload/kill da aba (mobile volta do app do banco e recarrega a página).
    // PixResumeWatcher retoma o polling no load e redireciona pro upsell.
    try {
      if (data.transaction_id) {
        localStorage.setItem(
          `tp_pix_${slug}`,
          JSON.stringify({ tx: data.transaction_id, ts: Date.now() }),
        );
      }
    } catch {
      // localStorage indisponível — segue sem persistência
    }
  }

  useEffect(() => {
    if (stage !== "qr" || !pix) return;
    let stopped = false;

    const finishPaid = (data: { thankYouUrl?: unknown }) => {
      // DESTINO pós-pagamento: upsell do seller > thankYou > /obrigado.
      // window.location.href navega tanto URL EXTERNA (upsell) quanto rota
      // interna (/obrigado) — por isso NÃO usamos mais o useRouter aqui.
      const dest =
        (typeof data.thankYouUrl === "string" && data.thankYouUrl) ||
        pix.thank_you_url ||
        `/c/${slug}/obrigado?tx=${pix.transaction_id}`;
      window.location.href = dest;
    };

    const check = async () => {
      if (stopped) return;
      try {
        const res = await fetch(
          `/api/transactions/${pix.transaction_id}/status`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json();
        // FLUXO "PIX sempre gera" (08/07/2026): se recebemos 202 no create
        // (dispatch pendente), copy_paste vem null. O polling em /status
        // devolve pix.copy_paste assim que o cron gerar. Aqui detectamos
        // o momento em que o QR ficou pronto e re-hidrata o state.
        if (!pix.copy_paste && data.pix?.copy_paste) {
          setPix({
            ...pix,
            copy_paste: data.pix.copy_paste,
            expires_at: data.pix.expires_at ?? pix.expires_at,
            pix_status: "ready",
          });
        }
        if (data.status === "PAID") {
          stopped = true;
          clearInterval(interval);
          finishPaid(data);
        } else if (data.status === "EXPIRED" || data.status === "FAILED") {
          stopped = true;
          clearInterval(interval);
          setStage("expired");
        }
      } catch {}
    };

    const interval = setInterval(check, 3000);
    check(); // 1º poll IMEDIATO — não espera os 3s do intervalo.
    // Cliente voltou do app do banco (pagou) → checa NA HORA. iOS restaura via
    // bfcache SEM disparar visibilitychange, por isso ouvimos focus+pageshow.
    const wake = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      check();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
    };
    // IMPORTANTE: deps SÓ com valores estáveis (sem `router`). O countdown
    // re-renderiza a cada 1s; se um dep trocar de referência por render, este
    // effect se recria e limpa o setInterval antes do 1º poll — era o bug.
  }, [stage, pix, slug]);

  useEffect(() => {
    if (stage !== "qr" || !pix?.expires_at) return;
    function tick() {
      const remaining = Math.max(
        0,
        Math.floor((new Date(pix!.expires_at!).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining === 0) setStage("expired");
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [stage, pix]);

  async function copyCode() {
    if (!pix?.copy_paste) return;
    await navigator.clipboard.writeText(pix.copy_paste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Marca server-side que o cliente copiou — métrica de conversão
    // (fire-and-forget, sem atrapalhar UX)
    if (pix.transaction_id) {
      fetch(`/api/transactions/${pix.transaction_id}/copy`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    }
  }

  function reset() {
    setStage("form");
    setPix(null);
    setError(null);
  }

  if (stage === "qr" && pix) {
    return (
      <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.04] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="size-5 text-cyan-300" />
            <h3 className="font-medium text-white">Escaneie pra pagar</h3>
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 flex justify-center">
          {!pix.copy_paste ? (
            // Fluxo "PIX sempre gera": dispatch pendente, cron esta gerando.
            // Mostra spinner amigavel enquanto o polling em /status pega o QR.
            <div className="size-64 rounded-lg bg-white/[0.05] border border-cyan-400/20 flex flex-col items-center justify-center gap-3 text-center px-6">
              <Loader2 className="size-8 animate-spin text-cyan-400" />
              <div className="text-xs text-zinc-300 font-medium">
                Gerando seu PIX...
              </div>
              <div className="text-[10px] text-zinc-500 leading-tight">
                Isso leva alguns segundos.
                <br />
                Nao feche esta pagina.
              </div>
            </div>
          ) : pix.qr_code_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pix.qr_code_image}
              alt="QR code Pix"
              className="size-64 rounded-lg bg-white p-3"
            />
          ) : (
            <div className="size-64 rounded-lg bg-white/[0.05] flex items-center justify-center text-zinc-500 text-xs">
              QR code indisponível
            </div>
          )}
        </div>

        <div className="mt-5">
          <Label>Ou copie o código Pix</Label>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 p-3">
            <span className="flex-1 font-mono text-[10px] text-zinc-300 break-all line-clamp-2">
              {pix.copy_paste ?? "Gerando..."}
            </span>
            <button
              type="button"
              onClick={copyCode}
              disabled={!pix.copy_paste}
              className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copied ? (
                <Check className="size-4 text-cyan-400" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <Loader2 className="size-3 animate-spin" />
            Aguardando pagamento...
          </div>
          {secondsLeft > 0 && (
            <span className="font-mono text-zinc-500">
              expira em {Math.floor(secondsLeft / 60)}:
              {String(secondsLeft % 60).padStart(2, "0")}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (stage === "expired") {
    return (
      <div className="rounded-2xl border border-red-400/30 bg-red-400/[0.05] p-6 text-center">
        <p className="text-sm text-red-200">
          Esta cobrança expirou ou foi cancelada.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-full bg-cyan-400 px-5 py-2 text-sm font-medium text-black hover:bg-cyan-300"
        >
          Gerar nova
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4"
    >
      <h3 className="text-sm font-medium text-white">Seus dados</h3>
      <div>
        <Label htmlFor="name">Nome completo</Label>
        <Input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
        />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            required
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="000.000.000-00"
            inputMode="numeric"
          />
        </div>
        <div>
          <Label htmlFor="phone">WhatsApp (opcional)</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
            inputMode="tel"
          />
        </div>
      </div>

      {bump && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-yellow-400/30 bg-yellow-400/[0.05] p-4 hover:bg-yellow-400/[0.08] transition">
          <input
            type="checkbox"
            checked={bumpSelected}
            onChange={(e) => setBumpSelected(e.target.checked)}
            className="mt-0.5 size-4 rounded border-white/20 bg-black/40 text-cyan-400 focus:ring-cyan-400/40"
          />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-yellow-100">
                ⚡ Oferta exclusiva: {bump.name}
              </p>
              <span className="font-mono text-sm text-cyan-300">
                +R$ {(bump.priceCents / 100).toFixed(2).replace(".", ",")}
              </span>
            </div>
            {bump.description && (
              <p className="mt-1 text-xs text-yellow-100/80">{bump.description}</p>
            )}
          </div>
        </label>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <Button
        type="submit"
        loading={stage === "loading"}
        className="w-full"
        size="lg"
      >
        <QrCode className="size-4" /> {ctaLabel} — R${" "}
        {(total / 100).toFixed(2).replace(".", ",")}
      </Button>
      <p className="text-center text-xs text-zinc-500">
        Pagamento seguro via Pix. Confirmação automática em segundos.
      </p>
    </form>
  );
}
