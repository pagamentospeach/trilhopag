"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import {
  Copy,
  Check,
  Megaphone,
  RotateCcw,
  Send,
  Loader2,
  Shuffle,
} from "lucide-react";
import { adminPostNominaisToTelegram } from "../../actions";
import {
  ACQUIRER_MODES_FOR,
  OPS_MODES,
  type AcquirerMode,
  type OpsMode,
} from "@/lib/ops-modes";

type AcqLite = {
  nominalName: string;
  mode: AcquirerMode;
  active: boolean;
  globalEnabled: boolean;
};

const DEFAULT_INTRO = `ATENÇÃO

Todas as chaves foram resetadas! e as conversões já estão subindo, bora trazer sua op para escalar hoje 🔥🔥`;

/**
 * Variações prontas do cabeçalho — pra não repetir a MESMA mensagem nos
 * grupos toda vez. Mesmo tom da padrão (chaves resetadas / conversão em alta
 * / hora de escalar). Clicar carrega no cabeçalho; o resto da mensagem
 * (lista de nominais) continua igual.
 */
const INTRO_VARIATIONS: string[] = [
  `🚨 ATENÇÃO

Chaves resetadas e a conversão já tá voando! Hora de subir a verba e escalar forte hoje 🔥🔥`,
  `⚡ BORA PRA CIMA

Nominais novas no ar e a conversão subindo absurdo. Quem escalar agora colhe o resultado 💸`,
  `🔥 LIBEROU GERAL

Todas as chaves foram renovadas — aprovação alta e PIX caindo redondo. Sobe a op e bora escalar 🚀`,
  `📢 AVISO IMPORTANTE

Adquirentes resetadas e conversão em alta. Momento perfeito pra trazer sua operação e escalar hoje mesmo 🔥`,
  `💎 CHAVES NOVAS NO AR

Conversão subindo em tempo real. Tá esperando o quê? Sobe a operação e bora faturar 🤑`,
  `🚀 TÁ VOANDO

Resetamos tudo e a aprovação disparou. Aproveita a janela e escala sua op agora 🔥🔥`,
  `🟢 SINAL VERDE

Nominais atualizadas e PIX aprovando liso. Hora de subir a verba e escalar de verdade 💪`,
  `🔥🔥 OPORTUNIDADE

Chaves zeradas e conversão nas alturas. Traz sua operação e escala antes que encha 🏃‍♂️💨`,
  `📈 CONVERSÃO EM ALTA

Todas as chaves resetadas e aprovando muito bem. Sobe a op hoje e surfa essa onda 🌊🔥`,
  `⚡ ATUALIZAÇÃO

Nominais novas liberadas pra todo mundo. Aprovação alta = hora de escalar. Bora pra cima 🚀`,
  `🤑 DINHEIRO NA MESA

Reset feito e conversão subindo forte. Quem escalar agora pega o pico. Sobe a verba 🔥`,
  `🚨 LIBERADO

Chaves renovadas e PIX entrando redondo. Momento de ouro pra escalar sua operação hoje 💎🔥`,
  `🔥 PEGA A ONDA

Conversão voando depois do reset das chaves. Sobe a op e escala enquanto tá quente 🚀`,
  `💥 TÁ ON

Chaves novas, conversão em alta e PIX caindo. Aproveita o momento e escala sua op hoje 🔥🔥`,
  `🏆 TOPOU?

Chaves resetadas, aprovação alta e a galera já escalando. Sobe a tua op e bora bater meta hoje 🔥💰`,
];

const LS_KEY = "tp_nominais_intro";

/**
 * Gerador de mensagem pra colar (WhatsApp/Telegram) com as NOMINAIS atuais
 * de todas as adquirentes — black e white. A lista vem direto do banco
 * (sempre atualizada). O cabecalho (intro) eh editavel e fica salvo no
 * navegador (localStorage) pra reusar.
 */
export function NominaisMessage({ acquirers }: { acquirers: AcqLite[] }) {
  const [intro, setIntro] = useState(DEFAULT_INTRO);
  const [filter, setFilter] = useState<"all" | OpsMode>("all");
  const [onlyLive, setOnlyLive] = useState(true);
  const [copied, setCopied] = useState(false);
  const [tgPending, startTg] = useTransition();
  const [tgMsg, setTgMsg] = useState<string | null>(null);

  // Carrega intro salva (client-only) na montagem.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved !== null) setIntro(saved);
    } catch {
      // localStorage indisponivel — segue com o default
    }
  }, []);

  function updateIntro(v: string) {
    setIntro(v);
    try {
      localStorage.setItem(LS_KEY, v);
    } catch {
      // ignore
    }
  }

  function pickRandomIntro() {
    // Sorteia uma variação diferente da atual (quando dá) pra não repetir a
    // mesma mensagem do último envio.
    const pool = INTRO_VARIATIONS.filter((v) => v !== intro);
    const list = pool.length > 0 ? pool : INTRO_VARIATIONS;
    updateIntro(list[Math.floor(Math.random() * list.length)]);
  }

  // Conta por modo pra mostrar nos botões de filtro. Quem responde "esta
  // adquirente serve o modo X?" é ACQUIRER_MODES_FOR — a mesma tabela do
  // dispatcher ("both" conta em black e white, "white_hot" em white e hot).
  const counts = useMemo(() => {
    const out = Object.fromEntries(OPS_MODES.map((m) => [m, 0])) as Record<
      OpsMode,
      number
    >;
    for (const a of acquirers) {
      if (onlyLive && (!a.active || !a.globalEnabled)) continue;
      if (!a.nominalName.trim()) continue;
      for (const m of OPS_MODES) {
        if (ACQUIRER_MODES_FOR[m].includes(a.mode)) out[m]++;
      }
    }
    return out;
  }, [acquirers, onlyLive]);

  // Nominais filtradas + dedup (case-insensitive).
  const nominais = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of acquirers) {
      if (onlyLive && (!a.active || !a.globalEnabled)) continue;
      if (filter !== "all" && !ACQUIRER_MODES_FOR[filter].includes(a.mode)) {
        continue;
      }
      const name = a.nominalName.trim();
      if (!name) continue;
      const key = name.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }, [acquirers, filter, onlyLive]);

  const message = useMemo(() => {
    const lines = nominais.map((n) => `🔹 ${n}`).join("\n");
    const head = intro.trim();
    return (head ? `${head}\n\n` : "") + lines;
  }, [intro, nominais]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // Fallback pra browsers/contextos sem clipboard API
      const ta = document.createElement("textarea");
      ta.value = message;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // ignore
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function postTelegram() {
    setTgMsg(null);
    startTg(async () => {
      const r = await adminPostNominaisToTelegram(message);
      setTgMsg(r.ok ? "✓ Postado no Telegram" : r.error);
      if (r.ok) setTimeout(() => setTgMsg(null), 3000);
    });
  }

  const FilterBtn = ({
    val,
    label,
    count,
  }: {
    val: "all" | OpsMode;
    label: string;
    count?: number;
  }) => (
    <button
      type="button"
      onClick={() => setFilter(val)}
      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
        filter === val
          ? "bg-cyan-400 text-black"
          : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]"
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span className="ml-1 opacity-70">({count})</span>
      )}
    </button>
  );

  return (
    <details className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <summary className="cursor-pointer select-none border-b border-white/[0.06] px-5 py-3 flex items-center gap-2 hover:bg-white/[0.02]">
        <Megaphone className="size-4 text-cyan-300" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white">
            Mensagem pros sellers (nominais)
          </h2>
          <p className="text-[11px] text-zinc-500">
            Lista sempre atualizada com as nominais do banco. Edite o cabeçalho
            e copie.
          </p>
        </div>
      </summary>

      <div className="p-5 space-y-3">
        {/* Cabecalho editavel */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
            Cabeçalho (editável, salvo no navegador)
          </label>
          <textarea
            value={intro}
            onChange={(e) => updateIntro(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white resize-y"
          />
          <button
            type="button"
            onClick={() => updateIntro(DEFAULT_INTRO)}
            className="mt-1 inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            <RotateCcw className="size-2.5" /> restaurar padrão
          </button>

          {/* Variações prontas — clique pra trocar o cabeçalho e não repetir
              a mesma mensagem nos grupos. */}
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                Variações ({INTRO_VARIATIONS.length}) — clique pra usar
              </span>
              <button
                type="button"
                onClick={pickRandomIntro}
                className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                title="Sortear uma variação diferente da atual"
              >
                <Shuffle className="size-3" /> Aleatória
              </button>
            </div>
            <div className="grid max-h-44 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {INTRO_VARIATIONS.map((v, i) => {
                const active = v === intro;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => updateIntro(v)}
                    title={v}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] leading-snug transition ${
                      active
                        ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
                        : "border-white/[0.06] bg-black/20 text-zinc-300 hover:border-white/[0.15] hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="line-clamp-2">
                      {v.replace(/\s*\n+\s*/g, " · ")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterBtn val="all" label="Todas" count={nominais.length} />
          <FilterBtn val="black" label="🖤 Black" count={counts.black} />
          <FilterBtn val="white" label="🤍 White" count={counts.white} />
          <FilterBtn val="hot" label="🔥 Hot" count={counts.hot} />
          <FilterBtn val="sag" label="SAG" count={counts.sag} />
          <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyLive}
              onChange={(e) => setOnlyLive(e.target.checked)}
              className="accent-cyan-400"
            />
            só ativas + globais
          </label>
        </div>

        {/* Preview da mensagem */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">
              Prévia ({nominais.length} nominais)
            </label>
            <div className="flex items-center gap-1.5">
              {tgMsg && (
                <span
                  className={`text-[10px] ${tgMsg.startsWith("✓") ? "text-cyan-300" : "text-red-300"}`}
                  title={tgMsg}
                >
                  {tgMsg.length > 32 ? tgMsg.slice(0, 32) + "…" : tgMsg}
                </span>
              )}
              <button
                type="button"
                onClick={postTelegram}
                disabled={nominais.length === 0 || tgPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/20 border border-sky-500/30 px-3 py-1.5 text-[11px] font-bold text-sky-300 hover:bg-sky-500/30 disabled:opacity-40"
                title="Postar no canal do Telegram (configurar TELEGRAM_ANNOUNCE_BOT_TOKEN + _CHAT_ID)"
              >
                {tgPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Send className="size-3" />
                )}
                Telegram
              </button>
              <button
                type="button"
                onClick={copy}
                disabled={nominais.length === 0}
                className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-1.5 text-[11px] font-bold text-black hover:bg-cyan-300 disabled:opacity-40"
              >
                {copied ? (
                  <>
                    <Check className="size-3" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="size-3" /> Copiar mensagem
                  </>
                )}
              </button>
            </div>
          </div>
          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-[13px] leading-relaxed text-zinc-200 font-sans">
            {message || "(nenhuma nominal pra exibir com esse filtro)"}
          </pre>
        </div>
      </div>
    </details>
  );
}
