"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { Check, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { AuthButton } from "@/components/auth/ui";

/**
 * Código de 6 dígitos que confirma o email.
 *
 * 08/08/2026 (davi): "A verificacao do email deveria estar junto na aba de
 * registro!". Por isso o formulário virou COMPONENTE em vez de página: o
 * cadastro monta ele como último passo, sem trocar de URL, e a rota
 * /verify-email continua existindo só pra quem chega por link antigo ou pelo
 * banner do painel.
 *
 * A regra que guia o resto do arquivo: NINGUÉM pode ficar preso aqui. Se o
 * email não sai (rate limit do provedor, Resend fora do ar, Outlook engolindo),
 * a tela diz o que aconteceu e oferece a saída — em vez de mostrar "enviado!"
 * e deixar a pessoa olhando pra uma caixa de entrada vazia, que foi
 * exatamente a reclamação.
 */

type Done = "verified" | "skipped";

/** O servidor derruba o código 15 minutos depois de emitir. */
const CODE_TTL_MS = 15 * 60 * 1000;

function mmss(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function EmailCodeForm({
  email,
  alreadySent = false,
  sendProblem = null,
  onDone,
}: {
  email: string;
  /** Um código já foi disparado antes desta tela montar? Evita gastar dois. */
  alreadySent?: boolean;
  /** Por que o envio anterior falhou, se falhou. Aparece de cara. */
  sendProblem?: string | null;
  onDone: (how: Done) => void;
}) {
  const reduced = useReducedMotion();
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [focused, setFocused] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(sendProblem);
  const [ok, setOk] = useState(false);
  const [cooldown, setCooldown] = useState(alreadySent ? 30 : 0);
  const [bypassing, setBypassing] = useState(false);
  // `alreadySent` só vem de quem acabou de disparar (o passo do cadastro ou o
  // ?fresh=1), então contar 15min a partir de agora bate com o servidor.
  const [expiresAt, setExpiresAt] = useState<number | null>(
    alreadySent ? Date.now() + CODE_TTL_MS : null,
  );
  const [now, setNow] = useState(() => Date.now());
  // O atalho "entrar sem verificar" aparece depois de 30s ou do primeiro
  // reenvio: quem recebe o código na hora nunca vê a opção, quem está
  // esperando à toa vê uma saída clara. Se o envio já falhou, aparece de cara.
  const [showBypass, setShowBypass] = useState(!!sendProblem);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  // Controle imperativo em vez de `key` no elemento: remontar a linha de
  // campos a cada erro faria o foco pular pra fora no meio da digitação.
  const shake = useAnimationControls();

  const code = digits.join("");
  const complete = code.length === 6;
  const expired = expiresAt !== null && now >= expiresAt;

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const send = useCallback(async () => {
    setResending(true);
    setError(null);
    try {
      const r = await fetch("/api/signup/send-verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        sent?: boolean;
        alreadyVerified?: boolean;
        message?: string;
      };
      // Este email já estava confirmado — não faz sentido pedir código. Sem
      // isso, a pessoa esperava pra sempre por um email que o servidor nunca
      // ia mandar.
      if (data.alreadyVerified) {
        onDone("verified");
        return;
      }
      if (!r.ok) {
        setError(data.message ?? "Não foi possível enviar o código agora.");
        setShowBypass(true);
        return;
      }
      setCooldown(60);
      setExpiresAt(Date.now() + CODE_TTL_MS);
      setDigits(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
    } catch {
      setError("Erro de rede. Tente reenviar.");
      setShowBypass(true);
    } finally {
      setResending(false);
    }
  }, [email, onDone]);

  // Dispara o primeiro código, a não ser que quem montou já tenha mandado.
  const autoSent = useRef(alreadySent);
  useEffect(() => {
    if (autoSent.current || !email) return;
    autoSent.current = true;
    void send();
  }, [email, send]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Um relógio só pra contagem de validade. Só roda enquanto há o que contar.
  useEffect(() => {
    if (expiresAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (showBypass) return;
    const t = setTimeout(() => setShowBypass(true), 30_000);
    return () => clearTimeout(t);
  }, [showBypass]);

  const confirm = useCallback(
    async (value: string) => {
      if (loading || ok) return;
      if (value.length !== 6) {
        setError("Digite os 6 dígitos.");
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const r = await fetch("/api/signup/verify-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code: value }),
        });
        const data = (await r.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (!r.ok) {
          setError(data.message ?? "Código inválido.");
          if (!reduced) {
            void shake.start({
              x: [0, -9, 8, -6, 4, 0],
              transition: { duration: 0.42 },
            });
          }
          setLoading(false);
          if (data.error === "expired" || data.error === "not_found") {
            setDigits(["", "", "", "", "", ""]);
            inputs.current[0]?.focus();
            setShowBypass(true);
          }
          return;
        }
        setOk(true);
        onDone("verified");
      } catch {
        setError("Erro de rede. Tente de novo.");
        setLoading(false);
      }
    },
    [email, loading, ok, onDone, reduced, shake],
  );

  /**
   * Confirma sozinho quando o sexto dígito entra. Guarda o último código
   * tentado pra não repetir a mesma chamada se a pessoa apagar e redigitar
   * exatamente o que já falhou.
   */
  const lastTried = useRef<string>("");
  useEffect(() => {
    if (!complete || loading || ok || expired) return;
    if (lastTried.current === code) return;
    lastTried.current = code;
    void confirm(code);
  }, [code, complete, loading, ok, expired, confirm]);

  function setDigit(i: number, raw: string) {
    const clean = raw.replace(/\D/g, "").slice(0, 1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = clean;
      return next;
    });
    if (clean && i < 5) inputs.current[i + 1]?.focus();
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    setDigits(pasted.split("").concat(Array(6).fill("")).slice(0, 6));
    inputs.current[Math.min(5, pasted.length)]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) inputs.current[i + 1]?.focus();
  }

  /**
   * Entra sem confirmar. O cookie tp_verify_skip=1 desarma o redirect do
   * /dashboard, e no lugar dele fica um banner fixo cobrando a confirmação.
   */
  function skip() {
    if (bypassing) return;
    setBypassing(true);
    document.cookie = `tp_verify_skip=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    onDone("skipped");
  }

  if (ok) return <VerifiedState reduced={!!reduced} />;

  return (
    <div className="space-y-6">
      {/* Pra quem foi, e por quanto tempo vale. */}
      <div className="rounded-2xl border border-slate-200 bg-mist/70 px-4 py-3.5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          Código de 6 dígitos enviado para
        </p>
        <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">
          {email}
        </p>
        {expiresAt !== null ? (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-400">
            <span
              className={`size-1.5 rounded-full ${
                expired ? "bg-slate-300" : "bg-brand"
              } ${expired || reduced ? "" : "animate-pulse"}`}
            />
            {expired ? (
              <span className="text-slate-500">
                Código expirado. Peça um novo abaixo.
              </span>
            ) : (
              <>
                Expira em{" "}
                <span className="font-mono tabular-nums text-slate-500">
                  {mmss(expiresAt - now)}
                </span>
              </>
            )}
          </p>
        ) : null}
      </div>

      {/* Os seis campos. Agrupados 3 + 3 porque é assim que o código chega
       *  escrito no email — ler e digitar viram o mesmo movimento. */}
      <motion.div
        animate={shake}
        className="flex items-center justify-center gap-2 sm:gap-2.5"
      >
        {digits.map((d, i) => (
          <div key={i} className="contents">
            {i === 3 ? (
              <span aria-hidden className="mx-0.5 h-px w-3 bg-slate-300" />
            ) : null}
            <div className="relative flex-1">
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label={`Dígito ${i + 1}`}
                maxLength={1}
                value={d}
                disabled={loading || expired}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onPaste={onPaste}
                onFocus={(e) => {
                  setFocused(i);
                  e.currentTarget.select();
                }}
                onBlur={() => setFocused((f) => (f === i ? null : f))}
                className={`h-[58px] w-full rounded-2xl border bg-white text-center text-[26px] font-semibold tabular-nums text-ink outline-none transition-all duration-150 disabled:opacity-60 sm:h-16 ${
                  focused === i
                    ? "border-brand shadow-[0_0_0_4px_rgba(51,210,217,0.16)]"
                    : d
                      ? "border-slate-300 shadow-[0_1px_2px_rgba(7,26,51,0.05)]"
                      : "border-slate-200"
                }`}
              />
              {/* Cursor do campo ativo e vazio: mostra onde o próximo dígito
               *  cai sem depender do caret nativo, que some no mobile. */}
              {focused === i && !d && !reduced ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 animate-pulse bg-brand"
                />
              ) : null}
            </div>
          </div>
        ))}
      </motion.div>

      {error ? (
        <p
          role="alert"
          className="text-center text-[13px] font-medium text-red-600"
        >
          {error}
        </p>
      ) : null}

      <AuthButton
        type="button"
        onClick={() => void confirm(code)}
        loading={loading}
        disabled={!complete || expired}
      >
        {loading ? "Confirmando…" : "Confirmar e entrar"}
      </AuthButton>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => void send()}
          disabled={resending || (cooldown > 0 && !expired) || !email}
          className="inline-flex items-center gap-1.5 font-medium text-slate-500 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${resending ? "animate-spin" : ""}`} />
          {resending
            ? "Enviando…"
            : cooldown > 0 && !expired
              ? `Reenviar em ${cooldown}s`
              : "Reenviar código"}
        </button>
        <span className="text-xs text-slate-400">Confira o spam também</span>
      </div>

      {showBypass ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-ink">O código não chegou?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            Alguns provedores (Outlook, Hotmail, Live) atrasam ou bloqueiam. Sua
            conta já está criada. Entre agora e confirme o email depois, pelo
            painel.
          </p>
          <button
            type="button"
            onClick={skip}
            disabled={bypassing}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            <LogIn className="size-4" />
            {bypassing ? "Entrando…" : "Entrar sem confirmar agora"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Estado final. Fica no ar por um instante só (o `onDone` já navegou), então o
 * trabalho dele é dar a sensação de conclusão, não informar nada novo.
 */
function VerifiedState({ reduced }: { reduced: boolean }) {
  return (
    <div className="py-6 text-center">
      <div className="relative mx-auto size-16">
        {!reduced ? (
          <motion.span
            aria-hidden
            initial={{ scale: 0.6, opacity: 0.5 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
            className="absolute inset-0 rounded-full bg-brand/25"
          />
        ) : null}
        <motion.div
          initial={reduced ? false : { scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex size-16 items-center justify-center rounded-full bg-brand text-ink"
        >
          <Check className="size-8" strokeWidth={3} />
        </motion.div>
      </div>

      <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink">
        Email confirmado
      </h2>
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-[15px] text-slate-500">
        <ShieldCheck className="size-4 text-brand" />
        Preparando seu painel
      </p>
    </div>
  );
}
