"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  Check,
  X,
  Copy,
  Globe,
  Trash2,
  RefreshCw,
  ShoppingBag,
  Shield,
  Video,
  GraduationCap,
} from "lucide-react";
import {
  deleteCustomDomain,
  verifyCustomDomain,
  updateDomainUsage,
} from "./actions";
import { DomainWizard } from "./wizard";

type Domain = {
  id: string;
  domain: string;
  status: string;
  verifyToken: string;
  verifiedAt: Date | null;
  useCheckout: boolean;
  useCloaker: boolean;
  useBturb: boolean;
  useMembros: boolean;
  errorMessage: string | null;
  lastCheckAt: Date | null;
  createdAt: Date;
};

export function DomainsClient({ domains: initial }: { domains: Domain[] }) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          {initial.length} domínio{initial.length === 1 ? "" : "s"} cadastrado{initial.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-300"
        >
          <Plus className="size-3.5" /> Adicionar domínio
        </button>
      </div>

      {initial.length === 0 && !showAdd ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-12 text-center">
          <Globe className="mx-auto size-10 text-zinc-600" />
          <p className="mt-4 text-base font-semibold text-white">
            Sem domínios cadastrados
          </p>
          <p className="mt-1 max-w-md mx-auto text-sm text-zinc-400">
            Adicione um domínio próprio (ex: <code>checkout.minhamarca.com</code>)
            pra usar nos seus checkouts, cloakers e vídeos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {initial.map((d) => (
            <DomainRow key={d.id} domain={d} />
          ))}
        </div>
      )}

      {/* Modal de adicionar */}
      {showAdd && <DomainWizard onFechar={() => setShowAdd(false)} />}
    </div>
  );
}

function DomainRow({ domain: d }: { domain: Domain }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(d.status !== "verified");
  const [removendo, setRemovendo] = useState(false);

  const txtRecord = `trilhopag-verify=${d.verifyToken}`;

  /**
   * Detecta se o dominio eh APEX (raiz, ex: meusite.com / meusite.com.br)
   * ou SUBDOMINIO (ex: checkout.meusite.com). DNS panels usam "@" pra
   * apontar pra raiz, ou o nome do subdominio pra subdomain.
   *
   * Heuristica simples (sem PSL):
   *  - 2 partes (meusite.com): apex → "@"
   *  - 3 partes E 2a parte eh um "TLD nested" conhecido (com, co, net,
   *    org, gov, edu, mil): apex → "@" (ex: meusite.com.br)
   *  - Resto: subdomain → primeira parte (ex: checkout.meusite.com → "checkout")
   */
  const parts = d.domain.split(".");
  const NESTED_TLDS = new Set([
    "com",
    "co",
    "net",
    "org",
    "gov",
    "edu",
    "mil",
  ]);
  const isApex =
    parts.length === 2 ||
    (parts.length === 3 && NESTED_TLDS.has(parts[1]));
  const cnameHost = isApex ? "@" : parts[0];
  // TXT de verificação em host SEPARADO do CNAME (regra de DNS: CNAME não
  // coexiste com outro registro no mesmo nome — por isso a Hostinger recusa
  // "dois hosts iguais"). Apex → @ ; subdomínio → _trilhopag-verify.<sub>.
  const txtHost = isApex ? "@" : `_trilhopag-verify.${parts[0]}`;

  function reverify() {
    startTransition(async () => {
      const r = await verifyCustomDomain(d.id);
      if (r.ok) {
        toast.sucesso("Domínio verificado.");
        router.refresh();
      } else {
        // Seção 38: o que vai pro toast é frase pra gente ler. O motivo
        // técnico da recusa (registro faltando, propagação) continua visível
        // no card, que é onde ele ajuda a agir.
        toast.erro(r.error ?? "Não deu pra verificar o domínio agora.");
      }
    });
  }

  // 08/08/2026: era `confirm()` nativo. Remover domínio derruba checkout no ar
  // — o diálogo agora diz exatamente o que volta pro padrão.
  function remove() {
    setRemovendo(true);
  }

  function confirmarRemocao() {
    startTransition(async () => {
      const r = await deleteCustomDomain(d.id);
      setRemovendo(false);
      if (r.ok) {
        toast.sucesso(`${d.domain} removido.`);
        router.refresh();
      }
    });
  }

  async function toggleUse(field: "useCheckout" | "useCloaker" | "useBturb" | "useMembros", value: boolean) {
    startTransition(async () => {
      await updateDomainUsage({ id: d.id, [field]: value });
      router.refresh();
    });
  }

  return (
    <div
      className={`rounded-2xl border p-5 ${
        d.status === "verified"
          ? "border-cyan-400/30 bg-cyan-400/[0.03]"
          : d.status === "failed"
            ? "border-red-500/30 bg-red-500/[0.03]"
            : "border-amber-400/30 bg-amber-400/[0.03]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-zinc-400" />
            <p className="font-mono text-base font-semibold text-white truncate">
              {d.domain}
            </p>
            <StatusBadge status={d.status} />
          </div>
          {d.status === "verified" && d.verifiedAt && (
            <p className="mt-1 text-[11px] text-zinc-500">
              Verificado em {new Date(d.verifiedAt).toLocaleString("pt-BR")}
            </p>
          )}
          {d.errorMessage && d.status !== "verified" && (
            <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/[0.08] p-2.5">
              <p className="text-xs font-semibold text-red-200">
                ⚠️ Ação necessária pra este domínio funcionar
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-red-100/90">
                {d.errorMessage}
              </p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
          >
            {expanded ? "Esconder" : "Configurar DNS"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-300"
            title="Remover"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
          {d.status !== "verified" && (
            <>
              <p className="text-xs font-semibold text-zinc-300">
                Adicione estes 2 registros no DNS do seu domínio:
              </p>
              <DnsRecord type="TXT" host={txtHost} value={txtRecord} />
              {isApex ? (
                <DnsRecord type="A" host="@" value="76.76.21.21" />
              ) : (
                <DnsRecord
                  type="CNAME"
                  host={cnameHost}
                  value="cname.vercel-dns.com"
                />
              )}
              <p className="text-[11px] text-zinc-500">
                <strong>⚠️ Cloudflare:</strong> se você usa Cloudflare DNS,
                deixe a nuvem laranja <strong>OFF</strong> (DNS only) nos 2
                records — senão Vercel não recebe os pedidos.
              </p>
              <button
                type="button"
                onClick={reverify}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-50"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Verificando…
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3.5" /> Verificar agora
                  </>
                )}
              </button>
              <p className="text-[10px] text-zinc-500">
                Se esquecer de clicar, nosso sistema tenta verificar
                automaticamente a cada 5 minutos.
              </p>
            </>
          )}

          {d.status === "verified" && (
            <>
              <p className="text-xs font-semibold text-zinc-300">
                Onde este domínio pode ser usado:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <UseToggle
                  icon={ShoppingBag}
                  label="Checkout"
                  value={d.useCheckout}
                  onChange={(v) => toggleUse("useCheckout", v)}
                />
                <UseToggle
                  icon={Shield}
                  label="Cloaker"
                  value={d.useCloaker}
                  onChange={(v) => toggleUse("useCloaker", v)}
                />
                <UseToggle
                  icon={Video}
                  label="Vídeos Bturb"
                  value={d.useBturb}
                  onChange={(v) => toggleUse("useBturb", v)}
                />
                <UseToggle
                  icon={GraduationCap}
                  label="Área de membros"
                  value={d.useMembros}
                  onChange={(v) => toggleUse("useMembros", v)}
                />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Pra usar em um checkout específico, vá em{" "}
                <strong>Produtos → produto → aba Domínio Próprio</strong>.
              </p>
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={removendo}
        titulo="Remover domínio?"
        descricao={
          <>
            <strong className="text-zinc-200">{d.domain}</strong> sai da conta.
            Checkouts, cloakers e áreas de membros que usam ele voltam pro
            domínio padrão na hora — quem tiver o link antigo salvo vai parar de
            conseguir abrir. Os registros de DNS continuam no seu provedor: você
            pode conectar de novo depois.
          </>
        }
        confirmarLabel="Remover domínio"
        destrutivo
        carregando={pending}
        onCancelar={() => setRemovendo(false)}
        onConfirmar={confirmarRemocao}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pending: {
      label: "Pendente",
      cls: "bg-amber-400/15 text-amber-300",
      icon: <Loader2 className="size-3 animate-pulse" />,
    },
    verifying: {
      label: "Verificando…",
      cls: "bg-blue-400/15 text-blue-300",
      icon: <Loader2 className="size-3 animate-spin" />,
    },
    verified: {
      label: "Verificado",
      cls: "bg-cyan-400/15 text-cyan-300",
      icon: <Check className="size-3" />,
    },
    failed: {
      label: "Falha",
      cls: "bg-red-500/15 text-red-300",
      icon: <X className="size-3" />,
    },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.cls}`}>
      {c.icon} {c.label}
    </span>
  );
}

function DnsRecord({
  type,
  host,
  value,
}: {
  type: "TXT" | "CNAME" | "A";
  host: string;
  value: string;
}) {
  const [copied, setCopied] = useState<"host" | "value" | null>(null);
  const doCopy = (field: "host" | "value", text: string) =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    });
  const line = (field: "host" | "value", label: string, text: string) => (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <code className="flex-1 truncate font-mono text-xs text-zinc-100">
        {text}
      </code>
      <button
        type="button"
        onClick={() => doCopy(field, text)}
        title={`Copiar ${label.toLowerCase()}`}
        className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
      >
        {copied === field ? (
          <Check className="size-3 text-cyan-400" />
        ) : (
          <Copy className="size-3" />
        )}
      </button>
    </div>
  );
  return (
    <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-black/30 p-3">
      <span className="inline-block rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-200">
        {type}
      </span>
      {line("host", "Host", host)}
      {line("value", "Valor", value)}
    </div>
  );
}

function UseToggle({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${
        value
          ? "border-cyan-400/30 bg-cyan-400/[0.06] text-cyan-200"
          : "border-white/[0.08] bg-white/[0.02] text-zinc-400"
      }`}
    >
      <Icon className="size-3.5" />
      <span className="flex-1 text-left">{label}</span>
      {value && <Check className="size-3" />}
    </button>
  );
}
