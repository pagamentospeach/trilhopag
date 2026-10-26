"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";

/**
 * Widget de anti-bot MANUAL — substituto do Cloudflare Turnstile.
 *
 * UX (davi 08/08/2026: "troque por algo mais simples tipo: Selecione o emoji
 * x / Varios emojis e a pessoa tem que clicar no certo"):
 *  - Carrega uma grade de emojis + o nome do alvo via /api/anti-bot/challenge
 *  - User clica no emoji certo — um toque, sem teclado
 *  - O que vai pro servidor é o ÍNDICE clicado; o índice correto só existe
 *    dentro do token HMAC, então o cliente nunca sabe a resposta
 *  - Botão "↻" pra sortear outra grade
 *  - Honeypot escondido (campo `_hp`) — bots preenchem, humano não vê
 *
 * Não depende de CSP/JS externo. Não trava em network errors.
 */

export type BotChallengeState = {
  /** Token HMAC do desafio (ou vazio se ainda carregando) */
  token: string;
  /** Nonce do desafio */
  nonce: string;
  /** Índice do emoji clicado, como string ("" = nada escolhido ainda) */
  answer: string;
  /** Timestamp de geração (pra timing check) */
  issuedAt: number;
  /** Expiry */
  expiresAt: number;
  /** Honeypot — humano deixa vazio */
  honeypot: string;
};

export type BotChallengeWidgetProps = {
  /** Chamado a cada mudança do estado (form pega pra mandar no submit). */
  onChange: (state: BotChallengeState) => void;
};

const EMPTY_STATE: BotChallengeState = {
  token: "",
  nonce: "",
  answer: "",
  issuedAt: 0,
  expiresAt: 0,
  honeypot: "",
};

export function BotChallengeWidget({ onChange }: BotChallengeWidgetProps) {
  const [target, setTarget] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [state, setState] = useState<BotChallengeState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChallenge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/anti-bot/challenge", {
        method: "GET",
        cache: "no-store",
      });
      if (!r.ok) {
        setError(
          r.status === 429
            ? "Muitas tentativas. Aguarde um pouco."
            : "Erro ao carregar verificação.",
        );
        return;
      }
      const data = await r.json();
      setTarget(data.target);
      setOptions(Array.isArray(data.options) ? data.options : []);
      const next: BotChallengeState = {
        token: data.token,
        nonce: data.nonce,
        answer: "",
        issuedAt: data.issuedAt,
        expiresAt: data.expiresAt,
        honeypot: "",
      };
      setState(next);
      onChange(next);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  useEffect(() => {
    loadChallenge();
  }, [loadChallenge]);

  function pick(index: number) {
    const next = { ...state, answer: String(index) };
    setState(next);
    onChange(next);
  }

  function handleHoneypotChange(v: string) {
    const next = { ...state, honeypot: v };
    setState(next);
    onChange(next);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-mist p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <ShieldCheck className="size-3.5 text-brand" />
          <span>
            {loading || error ? (
              "Confirme que você é humano"
            ) : (
              <>
                Clique no <span className="font-semibold text-ink">{target}</span>
              </>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={loadChallenge}
          title="Sortear outros emojis"
          aria-label="Sortear outros emojis"
          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-ink"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      ) : loading ? (
        <div className="mt-3 grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-6 gap-2">
          {options.map((emoji, i) => {
            const selected = state.answer === String(i);
            return (
              <button
                key={`${emoji}-${i}`}
                type="button"
                onClick={() => pick(i)}
                aria-pressed={selected}
                aria-label={`Emoji ${i + 1}`}
                className={`flex h-12 items-center justify-center rounded-lg border text-2xl leading-none transition ${
                  selected
                    ? "border-brand bg-brand/[0.10] ring-2 ring-brand/30"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span aria-hidden>{emoji}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* HONEYPOT: campo escondido. Humano não vê, bot preenche. */}
      <input
        type="text"
        name="_hp"
        tabIndex={-1}
        autoComplete="off"
        value={state.honeypot}
        onChange={(e) => handleHoneypotChange(e.target.value)}
        style={{
          position: "absolute",
          left: "-9999px",
          top: "-9999px",
          opacity: 0,
          pointerEvents: "none",
          height: 0,
          width: 0,
        }}
        aria-hidden="true"
      />
    </div>
  );
}
