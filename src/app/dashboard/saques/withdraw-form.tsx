"use client";

import { useState, useTransition, useEffect } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import {
  MIN_USDT_CENTS,
  MIN_WITHDRAWAL_CENTS,
  centsLabel,
} from "@/lib/withdrawal-limits";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Zap, Coins, Plus, Trash2, Star, Loader2 } from "lucide-react";
import {
  createWithdrawalAction,
  savePixDestination,
  saveUsdtDestination,
  deletePayoutDestination,
  setDefaultPayoutDestination,
} from "./actions";

type Method = "pix" | "usdt_solana";

type Destination = {
  id: string;
  type: Method;
  label: string;
  pixKey: string | null;
  pixKeyType: string | null;
  walletAddress: string | null;
  isDefault: boolean;
};

export function WithdrawForm({
  balanceCents,
  pixFeeCents,
  destinations,
  twoFactorEnabled,
}: {
  balanceCents: number;
  pixFeeCents: number;
  destinations: Destination[];
  /**
   * Se o seller ativou verificação em duas etapas. Só decide se o CAMPO de
   * código aparece na revisão — quem exige e valida é a server action, que é
   * onde o dinheiro sai. Ver o comentário em saques/actions.ts.
   */
  twoFactorEnabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** Destino em revisão. Não-nulo = diálogo de confirmação aberto. */
  const [revisao, setRevisao] = useState<Destination | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [method, setMethod] = useState<Method>("pix");

  // Auto-preenche valor = saldo INTEIRO (sellers normalmente sacam tudo).
  //
  // FIX CRÍTICO (jun/2026): "Sacar tudo" agora usa o saldo COMPLETO, não
  // saldo - taxa. Política atual: o débito do saldo é o próprio valor do
  // saque (debit = amount) e a taxa sai de DENTRO dele (seller recebe
  // amount - fee). Antes o form subtraía a taxa (resquício do modelo antigo
  // debit = amount + fee) — como o débito é só o amount, sobrava EXATAMENTE
  // o valor da taxa preso no saldo (abaixo do mínimo, intocável). Era isso
  // que parecia "a taxa indo pro saldo do player". Agora o saldo zera e a
  // taxa só desconta do que o seller recebe.
  function defaultAmount(): string {
    return (Math.max(0, balanceCents) / 100).toFixed(2).replace(".", ",");
  }
  const [amount, setAmount] = useState(defaultAmount());

  // Quando troca método, re-preenche com o saldo cheio
  useEffect(() => {
    setAmount(defaultAmount());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, balanceCents, pixFeeCents]);

  // Destinos filtrados por método selecionado
  const filtered = destinations.filter((d) => d.type === method);
  const defaultDest = filtered.find((d) => d.isDefault) ?? filtered[0];
  const [selectedDestId, setSelectedDestId] = useState<string>(
    defaultDest?.id ?? "",
  );
  useEffect(() => {
    const d = destinations
      .filter((x) => x.type === method)
      .find((x) => x.isDefault);
    setSelectedDestId(d?.id ?? destinations.find((x) => x.type === method)?.id ?? "");
  }, [method, destinations]);

  const [addingNew, setAddingNew] = useState(false);

  // Cálculos pra UI
  const amountCents = Math.round(
    Number(amount.replace(/[^\d,]/g, "").replace(",", ".")) * 100,
  );
  const feePreview =
    method === "usdt_solana"
      ? Math.round(amountCents * 0.065) + 1000
      : pixFeeCents;
  const netCents =
    Number.isFinite(amountCents) && amountCents > 0
      ? amountCents - feePreview
      : 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!selectedDestId) {
      setError(
        method === "pix"
          ? "Cadastre uma chave PIX antes de solicitar saque."
          : "Cadastre uma carteira USDT antes de solicitar saque.",
      );
      return;
    }

    const dest = destinations.find((d) => d.id === selectedDestId);
    if (!dest) {
      setError("Destino inválido.");
      return;
    }

    // Validação client-side: não permite sacar mais que saldo.
    // Politica jun/2026: debit = amount (taxa sai de dentro do amount).
    if (amountCents > balanceCents) {
      setError(
        `Você não pode sacar mais que seu saldo disponível. Máximo: R$ ${(
          balanceCents /
          100
        )
          .toFixed(2)
          .replace(".", ",")}`,
      );
      return;
    }

    // 08/08/2026: o submit NÃO envia mais direto. A seção 22 lista "solicitar
    // saque" entre as ações que exigem confirmação, e é a única do painel que
    // manda dinheiro pra fora — um clique errado aqui não tem desfazer.
    // Abre a revisão; quem envia é `enviar()`.
    setTwoFactorCode("");
    setRevisao(dest);
  }

  function enviar() {
    const dest = revisao;
    if (!dest) return;

    const fd = new FormData();
    fd.set("amount", amount);
    fd.set("method", method);
    if (dest.type === "pix") {
      fd.set("pixKey", dest.pixKey ?? "");
      fd.set("pixKeyType", dest.pixKeyType ?? "evp");
    } else {
      fd.set("walletAddress", dest.walletAddress ?? "");
    }
    // Só viaja quando o seller tem 2FA ligado. Quem valida de verdade é a
    // server action — este campo é só o transporte.
    if (twoFactorEnabled) fd.set("twoFactorCode", twoFactorCode);

    startTransition(async () => {
      const r = await createWithdrawalAction(fd);
      if (!r.ok) {
        // O erro fica DENTRO do diálogo: código errado é a hora em que a
        // pessoa mais precisa do campo na frente pra corrigir. Fechar e jogar
        // o aviso lá atrás no formulário obrigaria a refazer tudo.
        setDialogError(r.error);
        return;
      }
      setRevisao(null);
      setDialogError(null);
      toast.sucesso("Saque solicitado. Acompanhe pelo histórico abaixo.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Seletor de método */}
      <div>
        <Label>Método de saque</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            onClick={() => setMethod("pix")}
            className={`group flex items-start gap-3 rounded-xl border-2 p-3 text-left transition ${
              method === "pix"
                ? "border-cyan-400 bg-cyan-400/[0.05]"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
            }`}
          >
            <span
              className={`inline-flex size-9 items-center justify-center rounded-lg ${
                method === "pix"
                  ? "bg-cyan-400/15 text-cyan-300"
                  : "bg-white/[0.04] text-zinc-400"
              }`}
            >
              <Zap className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">PIX</p>
              <p className="text-[11px] text-zinc-500">
                Taxa R$ {(pixFeeCents / 100).toFixed(2).replace(".", ",")} fixo
                · Mín {centsLabel(MIN_WITHDRAWAL_CENTS)}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMethod("usdt_solana")}
            className={`group flex items-start gap-3 rounded-xl border-2 p-3 text-left transition ${
              method === "usdt_solana"
                ? "border-purple-400 bg-purple-400/[0.05]"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
            }`}
          >
            <span
              className={`inline-flex size-9 items-center justify-center rounded-lg ${
                method === "usdt_solana"
                  ? "bg-purple-400/15 text-purple-300"
                  : "bg-white/[0.04] text-zinc-400"
              }`}
            >
              <Coins className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">USDT (Solana)</p>
              <p className="text-[11px] text-zinc-500">
                1% · Mín {centsLabel(MIN_USDT_CENTS)}
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Lista de destinos salvos */}
      <div>
        <div className="flex items-center justify-between">
          <Label>
            {method === "pix" ? "Sua chave PIX" : "Sua carteira USDT"}
          </Label>
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300"
          >
            <Plus className="size-3" /> Cadastrar nova
          </button>
        </div>
        {filtered.length === 0 ? (
          <div className="mt-2 rounded-lg border border-dashed border-white/[0.12] bg-white/[0.02] p-4 text-center text-xs text-zinc-400">
            Nenhuma {method === "pix" ? "chave PIX" : "carteira USDT"}{" "}
            cadastrada ainda. Clique em{" "}
            <strong className="text-cyan-300">Cadastrar nova</strong>.
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {filtered.map((d) => (
              <DestinationCard
                key={d.id}
                d={d}
                selected={d.id === selectedDestId}
                onSelect={() => setSelectedDestId(d.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal cadastrar nova */}
      {addingNew && method === "pix" && (
        <AddPixModal onClose={() => setAddingNew(false)} />
      )}
      {addingNew && method === "usdt_solana" && (
        <AddUsdtModal onClose={() => setAddingNew(false)} />
      )}

      {/* Valor */}
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="amount">
            Valor do saque (R$){" "}
            {/* 08/08/2026: os dois mínimos vêm da constante, não escritos à
                mão. O do PIX dizia "R$ 30,00" enquanto o servidor rejeitava
                abaixo de R$ 50,00 — o seller digitava o valor que a tela
                mandava e levava erro sacando o próprio dinheiro. */}
            {method === "usdt_solana" && (
              <span className="text-[10px] text-purple-300">
                (mín. {centsLabel(MIN_USDT_CENTS)})
              </span>
            )}
            {method === "pix" && (
              <span className="text-[10px] text-zinc-500">
                (mín. {centsLabel(MIN_WITHDRAWAL_CENTS)})
              </span>
            )}
          </Label>
          <button
            type="button"
            onClick={() => setAmount(defaultAmount())}
            className="text-[10px] text-cyan-400 hover:text-cyan-300"
          >
            Sacar tudo
          </button>
        </div>
        <Input
          id="amount"
          name="amount"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={
            method === "usdt_solana"
              ? (MIN_USDT_CENTS / 100).toFixed(2).replace(".", ",")
              : (MIN_WITHDRAWAL_CENTS / 100).toFixed(2).replace(".", ",")
          }
          inputMode="decimal"
        />
        {amountCents > 0 && (
          <p className="mt-1 text-[10px] text-zinc-500">
            Taxa estimada:{" "}
            <span className="font-mono text-zinc-300">
              R$ {(feePreview / 100).toFixed(2).replace(".", ",")}
            </span>{" "}
            · Você recebe:{" "}
            <span className="font-mono text-cyan-300">
              R$ {(netCents / 100).toFixed(2).replace(".", ",")}
              {method === "usdt_solana" && " convertido em USDT"}
            </span>
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!selectedDestId || amountCents <= 0}
        >
          {method === "usdt_solana" ? "Solicitar saque USDT" : "Revisar saque"}
        </Button>
      </div>

      {/* REVISÃO ANTES DE ENVIAR (seção 22). Repete os quatro números que
          importam — valor, destino, taxa e líquido — porque é a última tela
          antes do dinheiro sair, e sair é irreversível. */}
      <ConfirmDialog
        open={!!revisao}
        titulo="Confirmar saque"
        confirmarLabel="Confirmar saque"
        cancelarLabel="Voltar"
        carregando={isPending}
        erro={dialogError}
        onCancelar={() => {
          setRevisao(null);
          setDialogError(null);
        }}
        onConfirmar={enviar}
        descricao={
          <dl className="space-y-1.5">
            <Linha termo="Valor" valor={`R$ ${(amountCents / 100).toFixed(2).replace(".", ",")}`} />
            <Linha
              termo="Taxa"
              valor={`R$ ${(feePreview / 100).toFixed(2).replace(".", ",")}`}
            />
            <Linha
              termo="Você recebe"
              valor={`R$ ${(netCents / 100).toFixed(2).replace(".", ",")}${method === "usdt_solana" ? " em USDT" : ""}`}
              destaque
            />
            <Linha
              termo="Destino"
              valor={
                revisao
                  ? `${revisao.label} · ${revisao.type === "pix" ? (revisao.pixKey ?? "") : (revisao.walletAddress ?? "")}`
                  : ""
              }
            />
          </dl>
        }
      >
        {twoFactorEnabled && (
          <div>
            <Label htmlFor="twoFactorCode">
              Código do app autenticador
            </Label>
            <Input
              id="twoFactorCode"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center font-mono tracking-[0.4em]"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Você ativou verificação em duas etapas, então ela vale aqui.
            </p>
          </div>
        )}
      </ConfirmDialog>
    </form>
  );
}

/** Uma linha do resumo da revisão. */
function Linha({
  termo,
  valor,
  destaque = false,
}: {
  termo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[12px] text-zinc-500">{termo}</dt>
      <dd
        className={`min-w-0 truncate text-right font-mono text-[13px] ${destaque ? "font-semibold text-cyan-300" : "text-zinc-200"}`}
      >
        {valor}
      </dd>
    </div>
  );
}

function DestinationCard({
  d,
  selected,
  onSelect,
}: {
  d: Destination;
  selected: boolean;
  onSelect: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [removendo, setRemovendo] = useState(false);

  // 08/08/2026: era `confirm()` nativo. Remover destino de saque é apagar pra
  // onde o dinheiro vai — o diálogo agora nomeia a chave e diz que o saldo
  // continua intacto, que é a dúvida real de quem hesita em clicar.
  function confirmarRemocao() {
    startTransition(async () => {
      const r = await deletePayoutDestination(d.id);
      setRemovendo(false);
      if (r.ok) {
        toast.sucesso("Destino removido.");
        router.refresh();
      } else {
        toast.erro(r.error);
      }
    });
  }

  function setDefault() {
    startTransition(async () => {
      const r = await setDefaultPayoutDestination(d.id);
      if (r.ok) router.refresh();
      else toast.erro(r.error);
    });
  }

  const displayKey = d.type === "pix" ? d.pixKey : d.walletAddress;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
        selected
          ? "border-cyan-400/60 bg-cyan-400/[0.06]"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
      }`}
    >
      <span
        className={`inline-block size-4 shrink-0 rounded-full border-2 ${
          selected
            ? "border-cyan-400 bg-cyan-400"
            : "border-zinc-500 bg-transparent"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">{d.label}</p>
          {d.isDefault && (
            <span className="rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-cyan-300">
              Padrão
            </span>
          )}
        </div>
        <p className="text-[11px] text-zinc-400 truncate font-mono">
          {d.type === "pix" && `${d.pixKeyType?.toUpperCase()} · `}
          {displayKey}
        </p>
      </div>
      <div className="flex gap-1 shrink-0">
        {!d.isDefault && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              setDefault();
            }}
            className="inline-flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-white/[0.05] hover:text-yellow-300 cursor-pointer"
            title="Tornar padrão"
          >
            {isPending ? <Loader2 className="size-3 animate-spin" /> : <Star className="size-3.5" />}
          </span>
        )}
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            setRemovendo(true);
          }}
          className="inline-flex size-7 items-center justify-center rounded text-zinc-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
          title="Remover"
        >
          <Trash2 className="size-3.5" />
        </span>
      </div>

      <ConfirmDialog
        open={removendo}
        titulo={d.type === "pix" ? "Remover chave PIX?" : "Remover carteira USDT?"}
        descricao={
          <>
            <strong className="text-zinc-200">{d.label}</strong> sai da lista de
            destinos. Seu saldo não muda e saques já solicitados continuam
            normalmente — você só não vai poder escolher este destino de novo
            sem cadastrar outra vez.
          </>
        }
        confirmarLabel="Remover destino"
        destrutivo
        carregando={isPending}
        onCancelar={() => setRemovendo(false)}
        onConfirmar={confirmarRemocao}
      />
    </button>
  );
}

function AddPixModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<"cpf" | "cnpj" | "evp" | "phone" | "email">("cpf");
  const [isDefault, setIsDefault] = useState(true);

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await savePixDestination({
        label: label.trim() || `Chave ${pixKeyType.toUpperCase()}`,
        pixKey: pixKey.trim(),
        pixKeyType,
        isDefault,
      });
      if (r.ok) {
        onClose();
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={() => !isPending && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-white">
          Cadastrar chave PIX
        </h3>
        <div>
          <Label>Apelido (opcional)</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Conta Caixa, Conta principal"
          />
        </div>
        <div>
          <Label>Tipo da chave</Label>
          <Select
            value={pixKeyType}
            onChange={(e) =>
              setPixKeyType(e.target.value as typeof pixKeyType)
            }
          >
            <option value="cpf">CPF</option>
            <option value="cnpj">CNPJ</option>
            <option value="email">Email</option>
            <option value="phone">Telefone</option>
            <option value="evp">Chave aleatória</option>
          </Select>
        </div>
        <div>
          <Label>Chave PIX</Label>
          <Input
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder="Sua chave PIX"
            required
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="size-3.5"
          />
          Definir como chave padrão
        </label>
        {error && (
          <p className="text-xs text-red-300">{error}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending || !pixKey.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
          >
            {isPending && <Loader2 className="size-3 animate-spin" />}
            Salvar chave
          </button>
        </div>
      </div>
    </div>
  );
}

function AddUsdtModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [isDefault, setIsDefault] = useState(true);

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveUsdtDestination({
        label: label.trim() || "Wallet USDT principal",
        walletAddress: walletAddress.trim(),
        isDefault,
      });
      if (r.ok) {
        onClose();
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={() => !isPending && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-white">
          Cadastrar carteira USDT (Solana)
        </h3>
        <div>
          <Label>Apelido (opcional)</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Phantom, Wallet principal"
          />
        </div>
        <div>
          <Label>Endereço Solana</Label>
          <Input
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="Ex: 5tzFkiKscXHK5ZXCGbXbH4LzeKqMyHkRoZRTUKgvBYSh"
            required
            className="font-mono text-xs"
          />
          <p className="mt-1 text-[10px] text-purple-300/80">
            ⚠️ Confira com cuidado. Saques em criptomoeda são irreversíveis.
            Aprovação típica em até 24h.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="size-3.5"
          />
          Definir como carteira padrão
        </label>
        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending || walletAddress.trim().length < 30}
            className="inline-flex items-center gap-1.5 rounded-full bg-purple-400 px-4 py-2 text-xs font-semibold text-black hover:bg-purple-300 disabled:opacity-50"
          >
            {isPending && <Loader2 className="size-3 animate-spin" />}
            Salvar carteira
          </button>
        </div>
      </div>
    </div>
  );
}
