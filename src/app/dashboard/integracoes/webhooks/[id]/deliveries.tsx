"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  Loader2,
  Send,
  RotateCw,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { testWebhook, resendDelivery } from "../actions";

/**
 * Histórico de entregas (seção 13: "testar webhook, reenviar evento,
 * visualizar logs").
 *
 * O `payload` e o `responseBody` já eram GRAVADOS a cada entrega e nunca
 * chegavam à tela: o dev via evento, status e número de tentativas, e pra
 * descobrir por que o endpoint dele recusou tinha que ir no log do próprio
 * servidor. Aqui os dois campos aparecem, e é o que transforma esta tela em
 * ferramenta de diagnóstico em vez de placar.
 *
 * NENHUM DADO NOVO é gravado por causa desta tela — só passou a ser exibido.
 */

export type Entrega = {
  id: string;
  event: string;
  statusCode: number | null;
  succeeded: boolean;
  attempts: number;
  createdAt: string;
  payload: string;
  responseBody: string | null;
};

const FILTROS = [
  { key: "todas", label: "Todas" },
  { key: "ok", label: "Entregues" },
  { key: "falha", label: "Falharam" },
] as const;

const PAGE_SIZE = 15;

export function Deliveries({
  webhookId,
  entregas,
  ativo,
}: {
  webhookId: string;
  entregas: Entrega[];
  ativo: boolean;
}) {
  const [filtro, setFiltro] = useState<string>("todas");
  const [aberta, setAberta] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pending, start] = useTransition();
  /** Id da entrega em reenvio — pro spinner ficar só na linha certa. */
  const [reenviando, setReenviando] = useState<string | null>(null);

  const lista = useMemo(() => {
    if (filtro === "ok") return entregas.filter((e) => e.succeeded);
    if (filtro === "falha") return entregas.filter((e) => !e.succeeded);
    return entregas;
  }, [entregas, filtro]);

  const totalPages = Math.max(1, Math.ceil(lista.length / PAGE_SIZE));
  const paginaAtual = Math.min(page, totalPages - 1);
  const visiveis = lista.slice(
    paginaAtual * PAGE_SIZE,
    paginaAtual * PAGE_SIZE + PAGE_SIZE,
  );

  function enviarTeste() {
    start(async () => {
      const r = await testWebhook(webhookId);
      if (r.ok) {
        toast.sucesso(
          "Evento de teste enviado. O resultado aparece no histórico abaixo.",
        );
      } else {
        toast.erro(r.error ?? "Não deu pra enviar o teste.");
      }
    });
  }

  function reenviar(id: string) {
    setReenviando(id);
    start(async () => {
      const r = await resendDelivery(id);
      setReenviando(null);
      if (r.ok) toast.sucesso("Evento reenviado com sucesso.");
      else toast.erro(r.error ?? "Não deu pra reenviar.");
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-white">Entregas</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-black/30 p-1">
            {FILTROS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFiltro(f.key);
                  setPage(0);
                }}
                aria-pressed={filtro === f.key}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  filtro === f.key
                    ? "bg-cyan-400/15 text-cyan-300"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={enviarTeste}
            // Desativado some com o botão de teste: mandar evento pra um
            // webhook desligado sempre falharia, e um botão que só sabe dar
            // erro é pior que a ausência dele.
            disabled={pending || !ativo}
            title={ativo ? undefined : "Ative o webhook para testar"}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-zinc-200 transition hover:bg-white/[0.06] disabled:opacity-40"
          >
            {pending && !reenviando ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Send className="size-3" />
            )}
            Enviar teste
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        {visiveis.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            {entregas.length === 0
              ? "Nenhuma entrega ainda. Use “Enviar teste” pra conferir se o endpoint responde."
              : "Nenhuma entrega com esse filtro."}
          </p>
        ) : (
          visiveis.map((e) => {
            const abertaAqui = aberta === e.id;
            return (
              <div
                key={e.id}
                className="border-b border-white/[0.04] last:border-b-0"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`shrink-0 ${e.succeeded ? "text-cyan-300" : "text-red-300"}`}
                  >
                    {e.succeeded ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <XCircle className="size-4" />
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={() => setAberta(abertaAqui ? null : e.id)}
                    aria-expanded={abertaAqui}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12px] text-white">
                        {e.event}
                      </span>
                      <span className="block text-[11px] text-zinc-500">
                        {e.createdAt}
                        {e.attempts > 1 && ` · ${e.attempts} tentativas`}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] ${
                        e.succeeded
                          ? "bg-cyan-400/15 text-cyan-300"
                          : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {/* Sem status = nem chegou a receber resposta (DNS,
                          timeout, recusa de conexão). "—" seria mudo; "sem
                          resposta" já aponta pra onde investigar. */}
                      {e.statusCode ?? "sem resposta"}
                    </span>
                    <ChevronDown
                      className={`size-3.5 shrink-0 text-zinc-600 transition-transform ${abertaAqui ? "rotate-180" : ""}`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => reenviar(e.id)}
                    disabled={pending || !ativo}
                    title="Reenviar este evento"
                    aria-label={`Reenviar ${e.event}`}
                    className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40"
                  >
                    {reenviando === e.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="size-3.5" />
                    )}
                  </button>
                </div>

                {abertaAqui && (
                  <div className="space-y-3 border-t border-white/[0.04] bg-black/20 px-4 py-3">
                    <Bloco titulo="Payload enviado" conteudo={e.payload} />
                    <Bloco
                      titulo="Resposta do seu servidor"
                      conteudo={
                        e.responseBody ||
                        "O servidor não devolveu corpo na resposta."
                      }
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {lista.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span className="tabular-nums">
            {paginaAtual * PAGE_SIZE + 1}–
            {Math.min((paginaAtual + 1) * PAGE_SIZE, lista.length)} de{" "}
            {lista.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((n) => Math.max(0, n - 1))}
              disabled={paginaAtual === 0}
              className="rounded-lg border border-white/[0.08] px-3 py-1.5 font-medium transition hover:bg-white/[0.05] disabled:opacity-30"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((n) => Math.min(totalPages - 1, n + 1))}
              disabled={paginaAtual >= totalPages - 1}
              className="rounded-lg border border-white/[0.08] px-3 py-1.5 font-medium transition hover:bg-white/[0.05] disabled:opacity-30"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Bloco({ titulo, conteudo }: { titulo: string; conteudo: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {titulo}
      </p>
      {/* `break-all` e altura máxima: resposta de servidor pode ser uma página
          de erro HTML inteira, e sem teto ela empurraria a lista pra fora da
          tela. */}
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white/[0.06] bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
        {conteudo}
      </pre>
    </div>
  );
}
