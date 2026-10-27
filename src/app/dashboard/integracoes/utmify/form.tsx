"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, CheckCircle2, AlertCircle, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveUtmifyConfig,
  removeUtmifyConfig,
  testUtmifyConnection,
} from "./actions";
import type { UtmifyTokenTestResult } from "@/lib/utmify";

type Product = { id: string; name: string; active: boolean };

export function UtmifyForm({
  defaults,
  products,
}: {
  defaults?: {
    apiToken?: string;
    platform?: string;
    active?: boolean;
    enabledProductIds?: string[];
  };
  products: Product[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  // Teste de conexão (valida os tokens atuais do form, antes mesmo de salvar)
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<UtmifyTokenTestResult[] | null>(
    null,
  );
  const [testError, setTestError] = useState<string | null>(null);

  async function onTest() {
    setTesting(true);
    setTestResults(null);
    setTestError(null);
    try {
      const clean = tokens.map((t) => t.trim()).filter((t) => t.length > 0);
      const r = await testUtmifyConnection(clean);
      if (!r.ok) setTestError(r.error);
      else setTestResults(r.results);
    } catch {
      setTestError("Não foi possível testar agora. Tente novamente.");
    } finally {
      setTesting(false);
    }
  }

  // MÚLTIPLAS UTMify: o apiToken guardado é 1 token por linha. Aqui vira uma
  // lista editável (adicionar/remover contas).
  const initialTokens = (defaults?.apiToken ?? "")
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const [tokens, setTokens] = useState<string[]>(
    initialTokens.length > 0 ? initialTokens : [""],
  );
  function updateToken(i: number, val: string) {
    setTokens((arr) => arr.map((t, idx) => (idx === i ? val : t)));
  }
  function addToken() {
    setTokens((arr) => [...arr, ""]);
  }
  function removeToken(i: number) {
    setTokens((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));
  }

  // Modo: "all" (vazio = envia todos) ou "selected" (lista específica)
  const initialIds = defaults?.enabledProductIds ?? [];
  const [mode, setMode] = useState<"all" | "selected">(
    initialIds.length === 0 ? "all" : "selected",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialIds),
  );

  function toggleProduct(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const fd = new FormData(e.currentTarget);
    // se modo "all", não envia productIds → server salva enabledProductIds vazio
    if (mode === "selected") {
      selectedIds.forEach((id) => fd.append("productIds", id));
    }
    startTransition(async () => {
      const r = await saveUtmifyConfig(fd);
      if (!r.ok) setError(r.error ?? "Erro");
      else {
        setOk(true);
        router.refresh();
      }
    });
  }

  function onRemove() {
    if (!confirm("Remover integração UTMify? As vendas pararão de ser enviadas."))
      return;
    startTransition(async () => {
      await removeUtmifyConfig();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label>Credenciais de API (x-api-token)</Label>
        <p className="mb-2 mt-0.5 text-[11px] text-zinc-500">
          Você pode integrar mais de uma UTMify — cada venda é enviada pra{" "}
          <strong className="text-zinc-300">todas</strong> as contas listadas.
        </p>
        <div className="space-y-2">
          {tokens.map((tok, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                name="apiToken"
                type="password"
                autoComplete="off"
                value={tok}
                onChange={(e) => updateToken(i, e.target.value)}
                placeholder={
                  i === 0
                    ? "Cole seu token da UTMify aqui"
                    : "Token de outra conta UTMify"
                }
              />
              {tokens.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeToken(i)}
                  title="Remover esta UTMify"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-zinc-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addToken}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-cyan-400/40 hover:bg-white/[0.04] hover:text-white"
          >
            <Plus className="size-3.5" /> Adicionar outra UTMify
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/[0.06] px-3 py-1.5 text-xs font-medium text-cyan-300 transition hover:bg-cyan-400/[0.12] disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plug className="size-3.5" />
            )}
            {testing ? "Testando…" : "Testar conexão"}
          </button>
        </div>

        {testError && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <AlertCircle className="size-4 shrink-0 text-red-400" />
            <span>{testError}</span>
          </div>
        )}
        {testResults && (
          <div className="mt-2 space-y-1.5">
            {testResults.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                  r.ok
                    ? "border-cyan-400/30 bg-cyan-400/[0.06] text-cyan-200"
                    : "border-red-500/30 bg-red-500/10 text-red-200"
                }`}
              >
                {r.ok ? (
                  <CheckCircle2 className="size-4 shrink-0 text-cyan-400" />
                ) : (
                  <AlertCircle className="size-4 shrink-0 text-red-400" />
                )}
                <span>
                  <strong className="font-mono">Token {r.tokenSuffix}</strong> —{" "}
                  {r.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="platform">Nome da plataforma (aparece no dashboard UTMify)</Label>
        <Input
          id="platform"
          name="platform"
          defaultValue={defaults?.platform ?? "Trilho"}
          placeholder="Trilho"
        />
      </div>

      <div className="flex items-center gap-3">
        <input
          id="active"
          name="active"
          type="checkbox"
          defaultChecked={defaults?.active ?? true}
          className="size-4 rounded border-white/15 bg-white/[0.05] text-cyan-400 focus:ring-cyan-400/30"
        />
        <Label htmlFor="active" className="mb-0">
          Envio ativo
        </Label>
      </div>

      <div className="border-t border-white/[0.06] pt-5">
        <Label>Quais produtos enviam para UTMify?</Label>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              mode === "all"
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white"
            }`}
          >
            Todos os produtos
          </button>
          <button
            type="button"
            onClick={() => setMode("selected")}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              mode === "selected"
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white"
            }`}
          >
            Selecionar produtos
          </button>
        </div>

        {mode === "selected" && (
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5 max-h-72 overflow-y-auto">
            {products.length === 0 ? (
              <p className="py-4 text-center text-xs text-zinc-500">
                Você ainda não tem produtos.
              </p>
            ) : (
              products.map((p) => {
                const checked = selectedIds.has(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProduct(p.id)}
                      className="size-4 rounded border-white/15 bg-white/[0.05] text-cyan-400 focus:ring-cyan-400/30"
                    />
                    <span className="flex-1 text-sm text-zinc-200">{p.name}</span>
                    {!p.active && (
                      <span className="rounded-full bg-yellow-400/15 px-1.5 py-0.5 text-[10px] text-yellow-200">
                        Pausado
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        )}

        {mode === "selected" && (
          <p className="mt-1.5 text-[11px] text-zinc-500">
            {selectedIds.size === 0
              ? "Nenhum selecionado — nenhum produto enviará."
              : `${selectedIds.size} produto${selectedIds.size > 1 ? "s" : ""} selecionado${selectedIds.size > 1 ? "s" : ""}.`}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-300">
          Configuração salva.
        </div>
      )}

      <div className="flex justify-between">
        {defaults?.apiToken && (
          <Button
            type="button"
            variant="ghost"
            onClick={onRemove}
            disabled={isPending}
          >
            Remover integração
          </Button>
        )}
        <Button type="submit" loading={isPending} className="ml-auto">
          Salvar
        </Button>
      </div>
    </form>
  );
}
