"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  QrCode,
  Loader2,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  History,
  CheckCircle2,
  Clock,
  XCircle,
  Wallet,
  TrendingUp,
  Search,
  ExternalLink,
  Share2,
} from "lucide-react";
import { MAIN_DOMAIN } from "@/lib/checkout-url";
import { toast } from "@/components/ui/toast";
import { formatBRL } from "@/lib/utils";
import { createManualCharge, type ManualChargeResult } from "./actions";

type Summary = {
  paidTodayCents: number;
  paidTodayNetCents: number;
  paidTodayCount: number;
  conversionRate: number | null;
  paidCount: number;
  lostCount: number;
};

type Acq = {
  id: string;
  nominalName: string;
  institution: string | null;
  shortCode: string;
  adminNote: string | null;
  mode: "black" | "white" | "both";
};

type Charge = {
  id: string;
  amountCents: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
  copyPaste: string | null;
  label: string;
  acquirer: string | null;
};

const STATUS_META: Record<
  string,
  { label: string; cls: string }
> = {
  PAID: { label: "Pago", cls: "bg-cyan-400/15 text-cyan-300 border-cyan-400/30" },
  PENDING: {
    label: "Aguardando",
    cls: "bg-yellow-400/15 text-yellow-300 border-yellow-400/30",
  },
  EXPIRED: { label: "Expirado", cls: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30" },
  FAILED: { label: "Falhou", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  REFUNDED: { label: "Reembolsado", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  CHARGEBACK: { label: "Chargeback", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  CANCELED: { label: "Cancelado", cls: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function parseToCents(s: string): number {
  // Aceita "10", "10,50", "10.50", "1.000,00" etc → centavos
  const cleaned = s.replace(/[^\d,.]/g, "");
  if (!cleaned) return 0;
  // Se tem virgula, ela eh o separador decimal (pt-BR); pontos = milhar.
  let normalized: string;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function CobrancasClient({
  acquirers,
  history,
  summary,
}: {
  /**
   * 10/08/2026: o seller nao escolhe mais adquirente aqui, entao a lista
   * sobrou APENAS como guarda: zero adquirente elegivel = nao adianta
   * mostrar o formulario, o PIX nao seria gerado.
   */
  acquirers: Acq[];
  history: Charge[];
  summary: Summary;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<
    Extract<ManualChargeResult, { ok: true }> | null
  >(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Status ao vivo da cobrança recém-gerada (polling no /status).
  const [liveStatus, setLiveStatus] = useState<string>("PENDING");
  // Filtro + busca do histórico.
  const [statusFilter, setStatusFilter] = useState<
    "all" | "PAID" | "PENDING" | "EXPIRED"
  >("all");
  const [search, setSearch] = useState("");

  const amountCents = parseToCents(amount);

  // Histórico filtrado. Sem filtro/busca → últimas 10. Com filtro → todos os
  // matches (das últimas 50 carregadas pelo server).
  const q = search.trim().toLowerCase();
  const filtering = statusFilter !== "all" || q !== "";
  const filteredCharges = history.filter((c) => {
    if (statusFilter === "PAID" && c.status !== "PAID") return false;
    if (statusFilter === "PENDING" && c.status !== "PENDING") return false;
    if (
      statusFilter === "EXPIRED" &&
      !["EXPIRED", "FAILED", "CANCELED"].includes(c.status)
    ) {
      return false;
    }
    if (q) {
      const hay = `${c.label} ${c.acquirer ?? ""} ${(c.amountCents / 100)
        .toFixed(2)
        .replace(".", ",")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const displayCharges = filtering
    ? filteredCharges
    : filteredCharges.slice(0, 10);

  // POLLING: enquanto o result está PENDING, consulta o status a cada 4s.
  // Quando vira PAID/EXPIRED/etc, para e atualiza o histórico.
  useEffect(() => {
    if (!result || liveStatus !== "PENDING") return;
    const txId = result.transactionId;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/transactions/${txId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        if (!active) return;
        if (data.status && data.status !== "PENDING") {
          setLiveStatus(data.status);
          router.refresh();
        }
      } catch {
        /* ignora — tenta de novo no próximo tick */
      }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [result, liveStatus, router]);

  async function copyText(text: string, id?: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  function generate() {
    setErr(null);
    if (amountCents < 500) {
      setErr("Valor mínimo: R$ 5,00");
      return;
    }
    startTransition(async () => {
      const r = await createManualCharge({
        amountCents,
        name: name.trim() || null,
      });
      if (r.ok) {
        setLiveStatus("PENDING");
        setResult(r);
        // Atualiza o histórico (server re-fetch) com a nova cobrança.
        router.refresh();
      } else {
        setErr(r.error);
      }
    });
  }

  async function copyCode() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.copyPaste);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = result.copyPaste;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setResult(null);
    setLiveStatus("PENDING");
    setAmount("");
    setName("");
    setErr(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <QrCode className="size-6 text-cyan-300" /> Cobranças
        </h1>
        <p className="text-sm text-zinc-400">
          Gere um PIX avulso com o valor e nome que quiser, na adquirente que
          escolher. Você recebe o QR Code e o copia e cola na hora.
        </p>
      </header>

      {acquirers.length === 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-5 text-sm text-amber-200 flex items-start gap-3">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div>
            Nenhuma adquirente PIX disponível pra sua conta no momento. Fale com
            o suporte.
          </div>
        </div>
      ) : result ? (
        // ===== RESULTADO: QR + copia e cola =====
        <div className="rounded-2xl border border-cyan-400/25 bg-white/[0.02] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-cyan-300/80 font-bold">
                PIX gerado
              </p>
              <p className="text-2xl font-bold text-white tabular-nums">
                {formatBRL(result.amountCents)}
              </p>
              <p className="text-[11px] text-zinc-500">
                Recebedor: {result.nominalName}
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05]"
            >
              <Sparkles className="size-3.5" /> Nova cobrança
            </button>
          </div>

          {/* STATUS AO VIVO (polling) */}
          {liveStatus === "PAID" ? (
            <div className="flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-300">
              <CheckCircle2 className="size-5 shrink-0" /> Pagamento confirmado!
              Caiu em Vendas e o saldo foi creditado.
            </div>
          ) : liveStatus === "EXPIRED" ? (
            <div className="flex items-center gap-2 rounded-xl border border-zinc-600/40 bg-zinc-600/10 px-4 py-3 text-sm font-semibold text-zinc-300">
              <Clock className="size-5 shrink-0" /> PIX expirado — gere uma nova
              cobrança.
            </div>
          ) : liveStatus !== "PENDING" ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">
              <XCircle className="size-5 shrink-0" />{" "}
              {STATUS_META[liveStatus]?.label ?? liveStatus}.
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-yellow-400/30 bg-yellow-400/[0.07] px-4 py-3 text-sm font-medium text-yellow-200">
              <Loader2 className="size-4 shrink-0 animate-spin" /> Aguardando
              pagamento… (atualiza sozinho)
            </div>
          )}

          {liveStatus !== "PAID" && (
            <>
              {/* LINK PÚBLICO (09/08/2026, seção 6). A cobrança entregava QR e
                  copia-e-cola só DENTRO do painel — pra mandar pro cliente o
                  seller tirava print do QR. Agora existe URL, e com ela os
                  três botões que a seção pede. A página é /p/[id]; o que ela
                  expõe (e o que não) está documentado lá. */}
              <LinkPublico id={result.transactionId} />

              {result.qrDataUrl && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.qrDataUrl}
                    alt="QR Code PIX"
                    className="size-64 rounded-xl bg-white p-2"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
                  PIX copia e cola
                </label>
                <textarea
                  readOnly
                  value={result.copyPaste}
                  rows={3}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-zinc-200 font-mono resize-none break-all"
                />
                <button
                  type="button"
                  onClick={copyCode}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-black hover:bg-cyan-300"
                >
                  {copied ? (
                    <>
                      <Check className="size-4" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" /> Copiar código PIX
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 text-center">
                Quando o cliente pagar, a venda cai em{" "}
                <span className="text-zinc-300">Vendas</span> e o saldo é
                creditado normalmente.
              </p>
            </>
          )}
        </div>
      ) : (
        // ===== FORM =====
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-zinc-400 block mb-1.5">
              Valor
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
                R$
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-xl border border-white/[0.1] bg-black/30 pl-9 pr-3 py-3 text-lg text-white font-mono tabular-nums focus:border-cyan-400/50 outline-none"
              />
            </div>
            {amountCents > 0 && amountCents < 500 && (
              <p className="text-[11px] text-amber-300 mt-1">
                Mínimo R$ 5,00
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-zinc-400 block mb-1.5">
              Nome <span className="text-zinc-600 normal-case">(opcional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: João da Silva / Mentoria"
              maxLength={120}
              className="w-full rounded-xl border border-white/[0.1] bg-black/30 px-3 py-3 text-sm text-white focus:border-cyan-400/50 outline-none"
            />
          </div>


          {err && err.includes("MIN_FEE_VIOLATION") ? (
            /* Popup destaque quando o gate de taxa minima bloqueou o PIX
               (08/07/2026 david). Comunica FORTE que ha algo errado e
               que so o admin pode resolver. */
            <div className="rounded-xl border-2 border-amber-400/40 bg-gradient-to-br from-amber-500/15 to-orange-500/5 p-4">
              <div className="flex items-start gap-3">
                <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 ring-1 ring-amber-400/30">
                  <AlertTriangle className="size-5 text-amber-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">
                    Taxa PIX abaixo do mínimo permitido
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
                    Sua conta está configurada com uma taxa PIX abaixo do mínimo
                    contratual. Por segurança o gateway <strong>não gera PIX</strong> nesta
                    conta até que a taxa seja corrigida.
                  </p>
                  <p className="mt-2 text-xs font-semibold text-amber-200">
                    👉 Entre em contato com o administrador para corrigir a sua
                    taxa antes de continuar.
                  </p>
                  <a
                    href="/dashboard/suporte"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-2 text-xs font-bold text-black hover:bg-amber-300"
                  >
                    Falar com o admin
                  </a>
                </div>
              </div>
            </div>
          ) : err ? (
            <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">
              {err}
            </p>
          ) : null}

          <button
            type="button"
            onClick={generate}
            disabled={pending || amountCents < 500}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-black hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Gerando PIX…
              </>
            ) : (
              <>
                <QrCode className="size-4" /> Gerar PIX
              </>
            )}
          </button>
        </div>
      )}

      {/* ===== RESUMO ===== */}
      {history.length > 0 && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-cyan-300/80">
              <Wallet className="size-3" /> Recebido hoje
            </p>
            <p className="mt-1 text-xl font-bold font-mono tabular-nums text-cyan-300">
              {formatBRL(summary.paidTodayNetCents)}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              {summary.paidTodayCount}{" "}
              {summary.paidTodayCount === 1 ? "cobrança paga" : "cobranças pagas"}
              {" · bruto "}
              <span className="font-mono tabular-nums text-zinc-400">
                {formatBRL(summary.paidTodayCents)}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-400">
              <TrendingUp className="size-3" /> Conversão
            </p>
            <p
              className={`mt-1 text-xl font-bold font-mono tabular-nums ${
                summary.conversionRate === null
                  ? "text-zinc-600"
                  : summary.conversionRate >= 70
                    ? "text-cyan-300"
                    : summary.conversionRate >= 40
                      ? "text-yellow-300"
                      : "text-red-300"
              }`}
            >
              {summary.conversionRate === null
                ? "—"
                : `${summary.conversionRate.toFixed(0)}%`}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              {summary.paidCount} pagas / {summary.lostCount} perdidas
            </p>
          </div>
        </section>
      )}

      {/* ===== HISTÓRICO DE COBRANÇAS ===== */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="size-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-white">
              Histórico de cobranças
            </h2>
            {history.length > 0 && (
              <span className="ml-auto text-[11px] text-zinc-500">
                {filtering
                  ? `${displayCharges.length} de ${history.length}`
                  : `últimas ${Math.min(10, history.length)}`}
              </span>
            )}
          </div>

          {history.length > 0 && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, adquirente ou valor…"
                  className="w-full rounded-lg border border-white/[0.08] bg-black/30 pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400/40"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as typeof statusFilter)
                }
                className="rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-400/40"
              >
                <option value="all" className="bg-zinc-900">
                  Todas
                </option>
                <option value="PAID" className="bg-zinc-900">
                  Pagas
                </option>
                <option value="PENDING" className="bg-zinc-900">
                  Aguardando
                </option>
                <option value="EXPIRED" className="bg-zinc-900">
                  Expiradas/Falhou
                </option>
              </select>
            </div>
          )}
        </div>

        {history.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">
            Nenhuma cobrança gerada ainda. Crie a primeira acima.
          </p>
        ) : displayCharges.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">
            Nenhuma cobrança encontrada com esse filtro.
          </p>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {displayCharges.map((c) => {
              const meta = STATUS_META[c.status] ?? {
                label: c.status,
                cls: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30",
              };
              const canCopy = c.status === "PENDING" && !!c.copyPaste;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-white">
                        {c.label}
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="truncate text-[10px] text-zinc-500">
                      <span className="text-zinc-400">
                        {c.acquirer ?? "—"}
                      </span>
                      {" · "}
                      {timeAgo(c.createdAt)} atrás
                      {c.status === "PAID" && c.paidAt
                        ? ` · pago ${timeAgo(c.paidAt)} atrás`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-right font-mono tabular-nums text-sm text-white">
                    {formatBRL(c.amountCents)}
                  </span>
                  {canCopy && (
                    <button
                      type="button"
                      onClick={() => copyText(c.copyPaste!, c.id)}
                      className="shrink-0 rounded-lg border border-white/[0.1] p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                      title="Copiar código PIX"
                    >
                      {copiedId === c.id ? (
                        <Check className="size-3.5 text-cyan-300" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}


/**
 * Os três botões da seção 6: copiar link, abrir e compartilhar.
 *
 * "Compartilhar" usa a Web Share API, que abre a bandeja nativa do celular
 * (WhatsApp, Telegram, e-mail) — exatamente o caminho que o seller já fazia
 * na mão mandando print do QR. Onde ela não existe (a maior parte dos
 * navegadores de desktop), o botão copia e avisa que copiou.
 */
function LinkPublico({ id }: { id: string }) {
  const [copiado, setCopiado] = useState(false);

  /**
   * URL montada com `MAIN_DOMAIN`, não com `window.location.origin`.
   *
   * A primeira versão usava o origin do navegador, e isso tem um defeito que
   * só aparece longe daqui: num deploy de PREVIEW da Vercel o origin é
   * `trilhopag-abc123.vercel.app`, e o seller copiaria esse link e mandaria
   * pro cliente. O link funcionaria hoje e morreria no próximo deploy.
   *
   * De quebra, sai o efeito que existia só pra ler `window` — o valor agora é
   * constante e o componente renderiza igual no servidor e no cliente.
   */
  const url = `${MAIN_DOMAIN}/p/${id}`;

  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">
        Link pra mandar pro cliente
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/30 p-2">
        <code className="min-w-0 flex-1 truncate px-1 font-mono text-[12px] text-cyan-300">
          {url}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
          aria-label="Copiar link"
          title="Copiar link"
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
        >
          {copiado ? (
            <Check className="size-4 text-cyan-400" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label="Abrir link"
          title="Abrir link"
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
        >
          <ExternalLink className="size-4" />
        </a>
        {/* Sempre renderizado, com degradação no clique. Decidir na
            renderização se `navigator.share` existe exigiria ler o navegador
            durante o render — o que difere entre servidor e cliente e dá erro
            de hidratação. No clique, `navigator` já existe com certeza. */}
        <button
          type="button"
          onClick={() => {
            if (navigator.share) {
              // `catch` vazio de propósito: fechar a bandeja de compartilhar
              // rejeita a promise, e isso não é erro nenhum.
              navigator.share({ title: "Pagamento", url }).catch(() => {});
            } else {
              navigator.clipboard.writeText(url);
              toast.sucesso("Link copiado pra você compartilhar.");
            }
          }}
          aria-label="Compartilhar link"
          title="Compartilhar"
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
        >
          <Share2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
