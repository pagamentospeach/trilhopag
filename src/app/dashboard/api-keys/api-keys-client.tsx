"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { API_SCOPES, API_KEY_VALIDADES } from "@/lib/api-scopes";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import {
  Copy,
  Check,
  KeyRound,
  Trash2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createApiKey,
  revokeApiKey,
  setApiKeyIpTrusted,
  deleteApiKeyIp,
} from "./actions";

export type ApiKeyIpRow = {
  id: string;
  ip: string;
  firstSeenAt: string;
  lastSeenAt: string;
  requestCount: number;
  createdCount: number;
  trusted: boolean;
  alertedAt: string | null;
};

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  ips: ApiKeyIpRow[];
};

export function ApiKeysClient({ rows }: { rows: ApiKeyRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Chave em revogação. Não-nulo = diálogo aberto. */
  const [revogando, setRevogando] = useState<{ id: string; label: string } | null>(null);
  const [esquecendoIp, setEsquecendoIp] = useState<{ id: string; ip: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await createApiKey(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNewKey(r.key);
      setName("");
      router.refresh();
    });
  }

  /**
   * Revogar chave de API.
   *
   * 08/08/2026: era `confirm()` nativo. Revogar derruba integração em produção
   * na hora e não tem desfazer — merece um diálogo que DIGA isso, e não um
   * "tem certeza?" do sistema que o navegador ainda por cima deixa suprimir.
   */
  function onRevoke(id: string, label: string) {
    setRevogando({ id, label });
  }

  function confirmarRevogacao() {
    if (!revogando) return;
    const { id, label } = revogando;
    startTransition(async () => {
      const r = await revokeApiKey(id);
      setRevogando(null);
      if (r.ok) {
        toast.sucesso(`Chave "${label}" revogada.`);
        router.refresh();
      } else {
        toast.erro(r.error);
      }
    });
  }

  async function onToggleTrust(usageId: string, trusted: boolean) {
    startTransition(async () => {
      const r = await setApiKeyIpTrusted({ ipUsageId: usageId, trusted });
      if (r.ok) router.refresh();
      else toast.erro(r.error);
    });
  }

  function onForgetIp(usageId: string, ip: string) {
    setEsquecendoIp({ id: usageId, ip });
  }

  function confirmarEsquecerIp() {
    if (!esquecendoIp) return;
    startTransition(async () => {
      const r = await deleteApiKeyIp(esquecendoIp.id);
      setEsquecendoIp(null);
      if (r.ok) router.refresh();
      else toast.erro(r.error);
    });
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Banner amarelo aparece quando alguma chave tem IP não-confirmado.
  // (Removemos o gate `ip.alertedAt` porque não notificamos mais — o
  // seller só vê aqui, então mostrar todos os IPs não-confiáveis é o certo.)
  const anyUntrusted = rows.some((r) => r.ips.some((ip) => !ip.trusted));

  return (
    <>
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <h2 className="text-sm font-medium text-white">Criar nova chave</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Você verá a chave completa uma única vez após gerar. Guarde em local seguro.
        </p>
        <form onSubmit={onCreate} className="mt-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="name">Nome / descrição</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Backend produção"
                required
              />
            </div>
            <div className="sm:w-44">
              <Label htmlFor="validadeDias">Validade</Label>
              <select
                id="validadeDias"
                name="validadeDias"
                defaultValue="0"
                className="h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-white focus:border-cyan-400/40 focus:outline-none"
              >
                {API_KEY_VALIDADES.map((v) => (
                  <option key={v.key} value={v.dias ?? 0}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ESCOPOS (09/08/2026).
              Antes toda chave saía com acesso total, incluindo saque via API —
              uma chave feita só pra gerar PIX num checkout externo podia
              esvaziar a conta se vazasse.
              Deixar TUDO desmarcado mantém o comportamento antigo (acesso
              total). É intencional: quem já tem script rodando não pode ser
              obrigado a adivinhar escopos, e o aviso abaixo diz isso na cara
              em vez de esconder. */}
          <fieldset>
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              O que esta chave pode fazer
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {API_SCOPES.map((sc) => (
                <label
                  key={sc.key}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition ${
                    "perigoso" in sc && sc.perigoso
                      ? "border-amber-400/25 bg-amber-400/[0.04] hover:bg-amber-400/[0.07]"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <input
                    type="checkbox"
                    name={`scope_${sc.key}`}
                    className="mt-0.5 size-4 shrink-0 rounded border-white/15 bg-white/[0.05] text-cyan-400 focus:ring-cyan-400/30"
                  />
                  <span className="min-w-0">
                    <span className="block text-zinc-200">{sc.label}</span>
                    <span className="block text-[11px] leading-snug text-zinc-500">
                      {sc.desc}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Sem nenhum marcado, a chave tem acesso total — que é como todas as
              chaves criadas até hoje funcionam. Marque só o que a sua
              integração usa.
            </p>
          </fieldset>

          <Button type="submit" loading={isPending} className="sm:w-auto">
            <KeyRound className="size-4" /> Gerar chave
          </Button>
        </form>
        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      {newKey && (
        <div className="rounded-2xl border border-cyan-400/40 bg-cyan-400/[0.06] p-6">
          <div className="flex items-start gap-3">
            <KeyRound className="size-5 text-cyan-300 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-cyan-200">
                Chave criada — copie agora
              </p>
              <p className="mt-1 text-xs text-zinc-300">
                Esta é a única vez que você verá a chave completa. Depois disso só vai aparecer o prefixo.
              </p>
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-cyan-300 break-all">
                <span className="flex-1">{newKey}</span>
                <button
                  type="button"
                  onClick={copyKey}
                  className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                  aria-label="Copiar"
                >
                  {copied ? (
                    <Check className="size-4 text-cyan-400" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setNewKey(null)}
                className="mt-4 text-xs text-zinc-400 hover:text-white"
              >
                Já guardei, dispensar
              </button>
            </div>
          </div>
        </div>
      )}

      {anyUntrusted && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/[0.06] p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 text-amber-300 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-100">
            <p className="font-medium">Detectamos IPs novos usando suas chaves.</p>
            <p className="mt-1 text-xs text-amber-200/80">
              Se você reconhece — clique em <b>Confiar neste IP</b> pra silenciar
              o alerta. Se NÃO reconhece — clique em <b>Revogar chave</b> AGORA.
              Chave revogada para de funcionar imediatamente e você cria uma nova.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-x-auto">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-sm font-medium text-white">Chaves ativas</h2>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-zinc-500">
            Nenhuma chave criada ainda.
          </div>
        ) : (
          <div className="min-w-[720px]">
            {rows.map((k) => {
              const isOpen = expanded[k.id] ?? false;
              const untrustedCount = k.ips.filter((ip) => !ip.trusted).length;
              return (
                <div
                  key={k.id}
                  className="border-b border-white/[0.04] last:border-b-0"
                >
                  <div className="group grid grid-cols-12 gap-4 px-5 py-4 text-sm">
                    <div className="col-span-4">
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((s) => ({ ...s, [k.id]: !isOpen }))
                        }
                        className="flex items-center gap-2 font-medium text-white text-left"
                      >
                        {isOpen ? (
                          <ChevronDown className="size-4 text-zinc-500" />
                        ) : (
                          <ChevronRight className="size-4 text-zinc-500" />
                        )}
                        {k.name}
                        {untrustedCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            <ShieldAlert className="size-3" />
                            {untrustedCount} IP{untrustedCount > 1 ? "s" : ""}
                          </span>
                        )}
                      </button>
                      {k.revokedAt && (
                        <p className="mt-0.5 pl-6 text-xs text-red-300">
                          Revogada
                        </p>
                      )}
                    </div>
                    <div className="col-span-3 font-mono text-xs text-zinc-300">
                      {k.prefix}…
                    </div>
                    <div className="col-span-2 text-xs text-zinc-400">
                      {k.lastUsedAt
                        ? `Usada ${new Date(k.lastUsedAt).toLocaleDateString("pt-BR")}`
                        : "Nunca usada"}
                    </div>
                    <div className="col-span-2 text-xs text-zinc-500">
                      {new Date(k.createdAt).toLocaleDateString("pt-BR")}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {!k.revokedAt && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => onRevoke(k.id, k.name)}
                          className="rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 opacity-0 group-hover:opacity-100 transition"
                          aria-label="Revogar"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-white/[0.04] bg-black/20 px-5 py-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-medium text-zinc-300">
                          IPs que usaram esta chave
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {k.ips.length} registro{k.ips.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      {k.ips.length === 0 ? (
                        <p className="text-xs text-zinc-500">
                          Nenhum uso registrado ainda. Assim que a chave for chamada, o IP aparecerá aqui.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {k.ips.map((ip) => (
                            <div
                              key={ip.id}
                              className={`flex items-center gap-3 rounded-lg border p-2.5 text-xs ${
                                ip.trusted
                                  ? "border-emerald-400/20 bg-emerald-400/[0.04]"
                                  : "border-white/[0.06] bg-white/[0.02]"
                              }`}
                            >
                              <div className="shrink-0">
                                {ip.trusted ? (
                                  <ShieldCheck className="size-4 text-emerald-400" />
                                ) : (
                                  <ShieldAlert className="size-4 text-amber-300" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-mono text-zinc-100">
                                  {ip.ip}
                                </p>
                                <p className="mt-0.5 text-[11px] text-zinc-500">
                                  {ip.requestCount} req · {ip.createdCount} tx ·
                                  1ª vez{" "}
                                  {new Date(ip.firstSeenAt).toLocaleString(
                                    "pt-BR",
                                    {
                                      timeZone: "America/Sao_Paulo",
                                      dateStyle: "short",
                                      timeStyle: "short",
                                    },
                                  )}{" "}
                                  · última{" "}
                                  {new Date(ip.lastSeenAt).toLocaleString(
                                    "pt-BR",
                                    {
                                      timeZone: "America/Sao_Paulo",
                                      dateStyle: "short",
                                      timeStyle: "short",
                                    },
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {!k.revokedAt && !ip.trusted && (
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() =>
                                      onToggleTrust(ip.id, true)
                                    }
                                    className="rounded-md border border-emerald-400/30 bg-emerald-400/[0.06] px-2 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-400/[0.12] disabled:opacity-50"
                                  >
                                    Confiar neste IP
                                  </button>
                                )}
                                {ip.trusted && !k.revokedAt && (
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() =>
                                      onToggleTrust(ip.id, false)
                                    }
                                    className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:text-white disabled:opacity-50"
                                  >
                                    Desconfiar
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => onForgetIp(ip.id, ip.ip)}
                                  className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                                  aria-label="Esquecer IP"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {!k.revokedAt && untrustedCount > 0 && (
                        <div className="mt-3 flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/[0.06] p-3">
                          <p className="text-xs text-red-200">
                            Não reconhece esses IPs? Revogar essa chave desativa
                            o acesso imediatamente.
                          </p>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => onRevoke(k.id, k.name)}
                            className="rounded-md bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                          >
                            Revogar chave agora
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!revogando}
        titulo="Revogar chave de API?"
        descricao={
          <>
            A chave <strong className="text-zinc-200">{revogando?.label}</strong>{" "}
            para de funcionar imediatamente, e qualquer integração que a use vai
            começar a receber erro. Não dá pra reativar: você precisa criar uma
            chave nova e trocar no seu sistema.
          </>
        }
        confirmarLabel="Revogar chave"
        destrutivo
        carregando={isPending}
        onCancelar={() => setRevogando(null)}
        onConfirmar={confirmarRevogacao}
      />

      <ConfirmDialog
        open={!!esquecendoIp}
        titulo="Esquecer este IP?"
        descricao={
          <>
            O IP <strong className="text-zinc-200">{esquecendoIp?.ip}</strong> sai
            da lista. Se ele voltar a usar sua chave, você recebe o alerta de IP
            novo de novo.
          </>
        }
        confirmarLabel="Esquecer IP"
        carregando={isPending}
        onCancelar={() => setEsquecendoIp(null)}
        onConfirmar={confirmarEsquecerIp}
      />
    </>
  );
}
