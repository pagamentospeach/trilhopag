"use client";

/**
 * Gerenciador de Order Bumps (múltiplos) + Opções de Frete (múltiplas)
 * pro checkout. UI moderna, drag-and-drop não obrigatório (lista simples
 * + reorder via setas se necessário). Permite criar/editar/deletar.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  Loader2,
  Package,
  Truck,
  Image as ImageIcon,
  CheckCircle,
} from "lucide-react";
import { formatBRL } from "@/lib/utils";
import { FileUpload } from "@/components/file-upload";
import {
  createOrderBump,
  updateOrderBump,
  deleteOrderBump,
  createShippingOption,
  updateShippingOption,
  deleteShippingOption,
} from "@/app/dashboard/checkouts/bump-shipping-actions";

export type OrderBumpItem = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  originalPriceCents: number | null;
  active: boolean;
  productId: string | null;
};

export type ShippingItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  estimatedTime: string | null;
  isDefault: boolean;
  active: boolean;
};

export function BumpsShippingManager({
  checkoutId,
  bumps,
  shipping,
}: {
  checkoutId: string;
  bumps: OrderBumpItem[];
  shipping: ShippingItem[];
}) {
  return (
    <div className="space-y-6">
      <BumpsSection checkoutId={checkoutId} initialBumps={bumps} />
      <ShippingSection checkoutId={checkoutId} initialOptions={shipping} />
    </div>
  );
}

/* ============ ORDER BUMPS ============ */

function BumpsSection({
  checkoutId,
  initialBumps,
}: {
  checkoutId: string;
  initialBumps: OrderBumpItem[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <Package className="size-4 text-cyan-400" />
            Order Bumps
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            Ofertas adicionais que aparecem no checkout. Crie quantas quiser —
            o cliente marca as que quer adicionar à compra.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-cyan-300"
        >
          <Plus className="size-3.5" /> Novo bump
        </button>
      </div>

      {initialBumps.length === 0 && !creating ? (
        <div className="rounded-xl border border-dashed border-white/[0.06] bg-black/20 p-6 text-center text-xs text-zinc-500">
          Nenhum order bump ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {initialBumps.map((b) => (
            <BumpRow
              key={b.id}
              bump={b}
              onSaved={() => router.refresh()}
            />
          ))}
        </div>
      )}

      {creating && (
        <BumpEditor
          checkoutId={checkoutId}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function BumpRow({
  bump,
  onSaved,
}: {
  bump: OrderBumpItem;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`Deletar o bump "${bump.title}"?`)) return;
    startTransition(async () => {
      const r = await deleteOrderBump(bump.id);
      if (r.ok) onSaved();
      else alert(r.error);
    });
  }

  if (editing) {
    return (
      <BumpEditor
        existing={bump}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onSaved();
        }}
      />
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3 flex items-center gap-3">
      <div className="size-14 shrink-0 rounded-lg bg-white/[0.04] overflow-hidden flex items-center justify-center">
        {bump.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bump.imageUrl}
            alt={bump.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon className="size-5 text-zinc-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{bump.title}</p>
        {bump.description && (
          <p className="text-[11px] text-zinc-500 truncate">{bump.description}</p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm font-bold text-cyan-300 tabular-nums">
            {formatBRL(bump.priceCents)}
          </span>
          {bump.originalPriceCents != null && bump.originalPriceCents > bump.priceCents && (
            <span className="text-[11px] text-zinc-500 line-through">
              {formatBRL(bump.originalPriceCents)}
            </span>
          )}
          {!bump.active && (
            <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] text-red-300">
              inativo
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
          title="Editar"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="rounded-full bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20"
          title="Deletar"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function BumpEditor({
  checkoutId,
  existing,
  onCancel,
  onSaved,
}: {
  checkoutId?: string;
  existing?: OrderBumpItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? "");
  const [priceCents, setPriceCents] = useState(
    existing ? (existing.priceCents / 100).toFixed(2) : "",
  );
  const [originalPriceCents, setOriginalPriceCents] = useState(
    existing?.originalPriceCents != null
      ? (existing.originalPriceCents / 100).toFixed(2)
      : "",
  );
  const [active, setActive] = useState(existing?.active ?? true);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    const price = Math.round(parseFloat(priceCents) * 100);
    if (isNaN(price) || price < 0) {
      setErr("Preço inválido");
      return;
    }
    const orig = originalPriceCents.trim()
      ? Math.round(parseFloat(originalPriceCents) * 100)
      : null;

    startTransition(async () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        imageUrl: imageUrl.trim() || null,
        priceCents: price,
        originalPriceCents: orig,
        productId: existing?.productId ?? null,
      };
      const res = existing
        ? await updateOrderBump(existing.id, { ...payload, active })
        : await createOrderBump(checkoutId!, payload);
      if (res.ok) onSaved();
      else setErr(res.error);
    });
  }

  return (
    <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.03] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-cyan-300">
          {existing ? "Editar bump" : "Novo bump"}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1 text-zinc-400 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-3">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
            Imagem
          </p>
          <FileUpload
            purpose="checkout-bump"
            currentUrl={imageUrl || null}
            accept="image/*"
            onUploaded={(r) => setImageUrl(r.url)}
            onCleared={() => setImageUrl("")}
            label="Enviar imagem"
            helper="JPG, PNG, WEBP — máx. 10MB"
          />
        </div>
        <div className="space-y-2">
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Título
            </p>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder='Ex: "Acelere seus resultados com o Curso Avançado"'
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Descrição (opcional)
            </p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Detalhes que ajudam a vender"
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-xs text-white resize-y"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
            Preço (R$)
          </p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceCents}
            onChange={(e) => setPriceCents(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white tabular-nums"
          />
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
            Preço &ldquo;de&rdquo; (riscado, opcional)
          </p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={originalPriceCents}
            onChange={(e) => setOriginalPriceCents(e.target.value)}
            placeholder="—"
            className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white tabular-nums"
          />
        </div>
      </div>

      {existing && (
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-4 rounded accent-cyan-400"
          />
          Ativo
        </label>
      )}

      {err && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {err}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05] hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          Salvar bump
        </button>
      </div>
    </div>
  );
}

/* ============ SHIPPING OPTIONS ============ */

function ShippingSection({
  checkoutId,
  initialOptions,
}: {
  checkoutId: string;
  initialOptions: ShippingItem[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <Truck className="size-4 text-blue-300" />
            Opções de Frete
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            Configure quantas opções de frete quiser. O cliente escolhe uma —
            o valor é somado ao total. Pra produtos digitais, deixe vazio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-blue-300"
        >
          <Plus className="size-3.5" /> Nova opção
        </button>
      </div>

      {initialOptions.length === 0 && !creating ? (
        <div className="rounded-xl border border-dashed border-white/[0.06] bg-black/20 p-6 text-center text-xs text-zinc-500">
          Nenhuma opção de frete configurada (produto digital).
        </div>
      ) : (
        <div className="space-y-2">
          {initialOptions.map((s) => (
            <ShippingRow
              key={s.id}
              opt={s}
              onSaved={() => router.refresh()}
            />
          ))}
        </div>
      )}

      {creating && (
        <ShippingEditor
          checkoutId={checkoutId}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function ShippingRow({
  opt,
  onSaved,
}: {
  opt: ShippingItem;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`Deletar a opção "${opt.name}"?`)) return;
    startTransition(async () => {
      const r = await deleteShippingOption(opt.id);
      if (r.ok) onSaved();
      else alert(r.error);
    });
  }

  if (editing) {
    return (
      <ShippingEditor
        existing={opt}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onSaved();
        }}
      />
    );
  }

  return (
    <div
      className={`rounded-xl border p-3 flex items-center gap-3 ${
        opt.isDefault
          ? "border-blue-400/30 bg-blue-400/[0.04]"
          : "border-white/[0.08] bg-black/30"
      }`}
    >
      <div className="size-12 shrink-0 rounded-lg bg-white/[0.04] overflow-hidden flex items-center justify-center">
        {opt.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={opt.imageUrl}
            alt={opt.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Truck className="size-4 text-zinc-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white truncate">{opt.name}</p>
          {opt.isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-400/15 px-1.5 py-0.5 text-[9px] text-blue-300">
              <CheckCircle className="size-2.5" />
              padrão
            </span>
          )}
          {opt.estimatedTime && (
            <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-zinc-300">
              {opt.estimatedTime}
            </span>
          )}
        </div>
        {opt.description && (
          <p className="text-[11px] text-zinc-500 truncate">{opt.description}</p>
        )}
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-blue-300 tabular-nums">
          {opt.priceCents === 0 ? "Grátis" : formatBRL(opt.priceCents)}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
          title="Editar"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="rounded-full bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20"
          title="Deletar"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function ShippingEditor({
  checkoutId,
  existing,
  onCancel,
  onSaved,
}: {
  checkoutId?: string;
  existing?: ShippingItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? "");
  const [priceCents, setPriceCents] = useState(
    existing ? (existing.priceCents / 100).toFixed(2) : "",
  );
  const [estimatedTime, setEstimatedTime] = useState(
    existing?.estimatedTime ?? "",
  );
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
  const [active, setActive] = useState(existing?.active ?? true);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    const price = Math.round(parseFloat(priceCents || "0") * 100);
    if (isNaN(price) || price < 0) {
      setErr("Preço inválido");
      return;
    }
    startTransition(async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        imageUrl: imageUrl.trim() || null,
        priceCents: price,
        estimatedTime: estimatedTime.trim() || null,
        isDefault,
      };
      const res = existing
        ? await updateShippingOption(existing.id, { ...payload, active })
        : await createShippingOption(checkoutId!, payload);
      if (res.ok) onSaved();
      else setErr(res.error);
    });
  }

  return (
    <div className="rounded-xl border border-blue-400/20 bg-blue-400/[0.03] p-4 space-y-3 mt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-blue-300">
          {existing ? "Editar opção" : "Nova opção de frete"}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1 text-zinc-400 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-3">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
            Logo/Imagem
          </p>
          <FileUpload
            purpose="checkout-bump"
            currentUrl={imageUrl || null}
            accept="image/*"
            onUploaded={(r) => setImageUrl(r.url)}
            onCleared={() => setImageUrl("")}
            label="Enviar imagem"
            helper="JPG, PNG, WEBP — máx. 10MB"
          />
        </div>
        <div className="space-y-2">
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Nome
            </p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder='Ex: "Sedex 24h", "Logística econômica"'
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Descrição
            </p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Detalhes da entrega (regiões atendidas, observações…)"
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-xs text-white resize-y"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
            Preço (R$) · 0 = grátis
          </p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceCents}
            onChange={(e) => setPriceCents(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white tabular-nums"
          />
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
            Prazo (ex: &ldquo;3-5 dias úteis&rdquo;)
          </p>
          <input
            type="text"
            value={estimatedTime}
            onChange={(e) => setEstimatedTime(e.target.value)}
            maxLength={80}
            placeholder="—"
            className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="size-4 rounded accent-blue-400"
          />
          Marcar como padrão
        </label>
        {existing && (
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="size-4 rounded accent-blue-400"
            />
            Ativo
          </label>
        )}
      </div>

      {err && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {err}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05] hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-blue-300 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          Salvar opção
        </button>
      </div>
    </div>
  );
}
