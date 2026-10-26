"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  PartyPopper,
  RefreshCw,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { addCustomDomain, verifyCustomDomain } from "./actions";

/**
 * CONECTAR DOMÍNIO — fluxo contínuo (seção 16 do prompt de revamp).
 *
 * As cinco peças que a seção pede já existiam e funcionavam, mas em três
 * superfícies desconectadas: um modal que só recebia o nome, um guia genérico
 * no topo da página numerando passos abstratos, e o card do domínio lá embaixo
 * com os registros reais. O seller tinha que ler o guia, fechar o modal,
 * achar o card e correlacionar "passo 1" com o registro certo.
 *
 * Aqui é um caminho só: digita → vê OS SEUS registros → verifica → sucesso.
 *
 * ── O QUE FAZ ISTO NÃO SER SÓ COSMÉTICO ─────────────────────────────────
 *
 * 1. Os registros são os DESTE domínio, calculados do nome que a pessoa acabou
 *    de digitar — não um exemplo com "suamarca.com" que ela precisa traduzir.
 * 2. Cada registro tem botão de copiar. Host de TXT de subdomínio é
 *    `_trilhopag-verify.checkout`, e digitar isso à mão erra.
 * 3. O passo 3 faz polling. Propagação de DNS leva minutos, e a alternativa
 *    era o seller clicar "verificar" repetidamente — que ainda esbarra no
 *    rate-limit de 1 min por domínio da própria action.
 *
 * ⚠️ O intervalo do polling é 65s, não menos: `verifyCustomDomain` recusa
 * duas checagens em menos de 60s (`lastCheckAt`). Bater mais rápido só geraria
 * uma fila de "Aguarde 1 min" que o seller leria como falha.
 */

/** TLDs de dois níveis — sem isso `loja.com.br` seria lido como subdomínio. */
const NESTED_TLDS = new Set(["com", "net", "org", "gov", "edu"]);

type Passo = "nome" | "dns" | "verificando" | "pronto";

export function DomainWizard({ onFechar }: { onFechar: () => void }) {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>("nome");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [criado, setCriado] = useState<{
    id: string;
    domain: string;
    verifyToken: string;
  } | null>(null);

  function adicionar() {
    setErro(null);
    if (!nome.trim()) {
      setErro("Digite um domínio.");
      return;
    }
    start(async () => {
      const r = await addCustomDomain({ domain: nome });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setCriado({ id: r.id, domain: r.domain, verifyToken: r.verifyToken });
      setPasso("dns");
      // Refresh já aqui: o domínio existe no banco, então a lista atrás do
      // modal deve mostrá-lo mesmo que a pessoa feche antes de verificar.
      router.refresh();
    });
  }

  function verificar() {
    if (!criado) return;
    setErro(null);
    setPasso("verificando");
    start(async () => {
      const r = await verifyCustomDomain(criado.id);
      if (r.ok) {
        setPasso("pronto");
        router.refresh();
      } else {
        setErro(r.error ?? "Ainda não deu.");
        setPasso("dns");
      }
    });
  }

  // Polling enquanto o passo de verificação está aberto.
  useEffect(() => {
    if (passo !== "verificando" || !criado) return;
    const id = setInterval(async () => {
      const r = await verifyCustomDomain(criado.id);
      if (r.ok) {
        setPasso("pronto");
        router.refresh();
      }
      // Falha NÃO interrompe: propagação de DNS demora, e sair do modo de
      // espera a cada tentativa frustrada faria a tela piscar entre estados.
    }, 65_000);
    return () => clearInterval(id);
  }, [passo, criado, router]);

  const registros = criado ? calcularRegistros(criado) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-titulo"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/[0.08] bg-zinc-950 p-6 sm:rounded-2xl"
      >
        <Trilha passo={passo} />

        {passo === "nome" && (
          <>
            <h3 id="wizard-titulo" className="mt-4 text-lg font-bold text-white">
              Qual domínio você vai conectar?
            </h3>
            <p className="mt-1 text-[13px] text-zinc-400">
              Pode ser o domínio inteiro (<code>suamarca.com</code>) ou um
              subdomínio (<code>checkout.suamarca.com</code>). Ele precisa ser
              seu — a gente confirma isso no próximo passo.
            </p>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !pending && adicionar()}
              placeholder="checkout.suamarca.com"
              autoFocus
              className="mt-4 w-full rounded-lg border border-white/[0.08] bg-black/30 p-2.5 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/40 focus:outline-none"
            />
            {erro && <Erro texto={erro} />}
            <Botoes
              onCancelar={onFechar}
              pending={pending}
              acaoLabel="Continuar"
              onAcao={adicionar}
            />
          </>
        )}

        {(passo === "dns" || passo === "verificando") && registros && (
          <>
            <h3 id="wizard-titulo" className="mt-4 text-lg font-bold text-white">
              Crie estes dois registros
            </h3>
            <p className="mt-1 text-[13px] text-zinc-400">
              No painel de quem vendeu{" "}
              <span className="font-mono text-zinc-200">{criado?.domain}</span>{" "}
              (Hostinger, GoDaddy, Registro.br, Cloudflare). Copie exatamente.
            </p>

            <div className="mt-4 space-y-2">
              {registros.map((r) => (
                <Registro key={r.tipo} {...r} />
              ))}
            </div>

            <p className="mt-3 border-l-2 border-white/[0.12] pl-3 text-[11.5px] leading-relaxed text-zinc-400">
              Se o seu DNS é Cloudflare, a nuvem do registro precisa ficar{" "}
              <strong className="text-zinc-200">cinza</strong> (DNS only).
              Laranja não funciona.
            </p>

            {erro && <Erro texto={erro} />}

            {passo === "verificando" ? (
              <div className="mt-5 flex items-center gap-2.5 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.06] px-3 py-3 text-[13px] text-cyan-200">
                <Loader2 className="size-4 shrink-0 animate-spin" />
                <span>
                  Procurando os registros… Isso costuma levar de 5 a 30 minutos.
                  Pode fechar esta janela: a gente continua verificando sozinho
                  a cada 5 minutos.
                </span>
              </div>
            ) : (
              <Botoes
                onCancelar={onFechar}
                cancelarLabel="Fechar"
                pending={pending}
                acaoLabel="Já criei, verificar"
                onAcao={verificar}
              />
            )}
          </>
        )}

        {passo === "pronto" && (
          <div className="py-4 text-center">
            <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
              <PartyPopper className="size-7" />
            </span>
            <h3 id="wizard-titulo" className="mt-4 text-lg font-bold text-white">
              Domínio conectado
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-zinc-400">
              <span className="font-mono text-zinc-200">{criado?.domain}</span>{" "}
              está verificado. Seus checkouts já podem usar ele.
            </p>
            <button
              type="button"
              onClick={() => {
                toast.sucesso("Domínio conectado.");
                onFechar();
              }}
              className="mt-5 rounded-lg bg-cyan-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-cyan-300"
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── peças ─────────────────────────── */

const PASSOS: Array<{ key: Passo; label: string }> = [
  { key: "nome", label: "Domínio" },
  { key: "dns", label: "DNS" },
  { key: "pronto", label: "Pronto" },
];

function Trilha({ passo }: { passo: Passo }) {
  // "verificando" não é um degrau próprio na trilha: é o mesmo passo de DNS
  // esperando resposta. Três bolinhas descrevem melhor o caminho que quatro,
  // sendo uma delas um estado transitório.
  const atual = passo === "verificando" ? "dns" : passo;
  const idx = PASSOS.findIndex((p) => p.key === atual);
  return (
    <ol className="flex items-center gap-2">
      {PASSOS.map((p, i) => (
        <li key={p.key} className="flex flex-1 items-center gap-2">
          <span
            className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
              i < idx
                ? "bg-cyan-400 text-black"
                : i === idx
                  ? "bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/50"
                  : "bg-white/[0.06] text-zinc-600"
            }`}
          >
            {i < idx ? <Check className="size-3" strokeWidth={3} /> : i + 1}
          </span>
          <span
            className={`text-[11px] ${i <= idx ? "text-zinc-300" : "text-zinc-600"}`}
          >
            {p.label}
          </span>
          {i < PASSOS.length - 1 && (
            <span
              className={`h-px flex-1 ${i < idx ? "bg-cyan-400/40" : "bg-white/[0.08]"}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function Registro({
  tipo,
  host,
  valor,
  nota,
}: {
  tipo: string;
  host: string;
  valor: string;
  nota?: string;
}) {
  const [copiado, setCopiado] = useState<"host" | "valor" | null>(null);
  function copiar(qual: "host" | "valor", texto: string) {
    navigator.clipboard.writeText(texto);
    setCopiado(qual);
    setTimeout(() => setCopiado(null), 2000);
  }
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <span className="inline-block rounded bg-white/[0.10] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
        {tipo}
      </span>
      <div className="mt-2 grid gap-1.5">
        <Campo
          rotulo="Host"
          valor={host}
          copiado={copiado === "host"}
          onCopiar={() => copiar("host", host)}
        />
        <Campo
          rotulo="Valor"
          valor={valor}
          copiado={copiado === "valor"}
          onCopiar={() => copiar("valor", valor)}
        />
      </div>
      {nota && <p className="mt-2 text-[11px] text-zinc-500">{nota}</p>}
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  copiado,
  onCopiar,
}: {
  rotulo: string;
  valor: string;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-zinc-500">
        {rotulo}
      </span>
      <code className="min-w-0 flex-1 truncate rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-zinc-200">
        {valor}
      </code>
      <button
        type="button"
        onClick={onCopiar}
        aria-label={copiado ? "Copiado" : `Copiar ${rotulo}`}
        className="shrink-0 rounded p-1 text-zinc-500 transition hover:text-cyan-300"
      >
        {copiado ? (
          <Check className="size-3.5 text-cyan-400" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}

function Erro({ texto }: { texto: string }) {
  return (
    <p
      role="alert"
      className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/[0.08] p-2.5 text-[12px] text-amber-200"
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      {texto}
    </p>
  );
}

function Botoes({
  onCancelar,
  cancelarLabel = "Cancelar",
  onAcao,
  acaoLabel,
  pending,
}: {
  onCancelar: () => void;
  cancelarLabel?: string;
  onAcao: () => void;
  acaoLabel: string;
  pending: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={onCancelar}
        className="rounded-lg border border-white/[0.10] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.05] disabled:opacity-50"
      >
        {cancelarLabel}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onAcao}
        className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-300 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
        {acaoLabel}
      </button>
    </div>
  );
}

/**
 * Os dois registros DESTE domínio.
 *
 * Mesma regra do card da lista: o TXT de verificação vai num host SEPARADO do
 * CNAME, porque DNS não deixa um CNAME coexistir com outro registro no mesmo
 * nome — é por isso que a Hostinger recusa "dois hosts iguais".
 */
function calcularRegistros(d: { domain: string; verifyToken: string }) {
  const parts = d.domain.split(".");
  const isApex =
    parts.length === 2 || (parts.length === 3 && NESTED_TLDS.has(parts[1]));

  return [
    {
      tipo: "TXT",
      host: isApex ? "@" : `_trilhopag-verify.${parts[0]}`,
      valor: `trilhopag-verify=${d.verifyToken}`,
      nota: isApex
        ? "Prova que o domínio é seu."
        : "Prova que o domínio é seu. O host é diferente do CNAME abaixo, de propósito.",
    },
    isApex
      ? {
          tipo: "A",
          host: "@",
          valor: "76.76.21.21",
          nota: "Aponta pro nosso servidor.",
        }
      : {
          tipo: "CNAME",
          host: parts[0],
          valor: "cname.vercel-dns.com",
          nota: "Aponta pro nosso servidor.",
        },
  ];
}
