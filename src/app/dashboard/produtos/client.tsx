"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Folder,
  FolderPlus,
  Package,
  GripVertical,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  Copy,
  LayoutGrid,
  List,
} from "lucide-react";
import { formatBRL } from "@/lib/utils";
import { getCheckoutUrl, CHECKOUT_HOST } from "@/lib/checkout-url";
import { ProductRowActions } from "./row-actions";
import {
  createFolder,
  renameFolder,
  deleteFolder,
  moveProductToFolder,
  reorderProducts,
} from "./folders-actions";

type Product = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  type: string;
  priceCents: number;
  active: boolean;
  folderId: string | null;
  sortOrder: number;
  firstCheckoutSlug: string | null;
  checkoutsCount: number;
  salesCount: number;
  createdAt: string;
};

type FolderItem = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};

const typeLabels: Record<string, string> = {
  DIGITAL: "Digital",
  PHYSICAL: "Físico",
  SUBSCRIPTION: "Assinatura",
  SERVICE: "Serviço",
};
const typeColors: Record<string, string> = {
  DIGITAL: "bg-blue-400/15 text-blue-300",
  PHYSICAL: "bg-amber-400/15 text-amber-300",
  SUBSCRIPTION: "bg-purple-400/15 text-purple-300",
  SERVICE: "bg-teal-400/15 text-teal-300",
};

export function ProductsClient({
  products: initialProducts,
  folders: initialFolders,
  sellerDomain,
}: {
  products: Product[];
  folders: FolderItem[];
  /** Dominio verificado do seller (CustomDomain status=verified, useCheckout=true).
   *  null = sem dominio = produtos INATIVOS (politica jun/2026). */
  sellerDomain: string | null;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  // 29/07/2026 (davi): dois layouts pros produtos — grid (cards quadrados)
  // ou list (linha horizontal, como era antes). Persistido em localStorage
  // pra cada seller lembrar a preferencia entre visitas.
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const saved = typeof window !== "undefined"
      ? window.localStorage.getItem("bp:products-view")
      : null;
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("bp:products-view", viewMode);
    }
  }, [viewMode]);
  const [folders, setFolders] = useState(initialFolders);
  // Sincroniza estado quando o servidor renderiza nova lista (após criar/renomear/deletar pasta)
  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);
  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);
  const [, startTransition] = useTransition();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set([...initialFolders.map((f) => f.id), "__none__"]),
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | "__none__" | null>(
    null,
  );

  function toggleFolder(id: string) {
    setExpandedFolders((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function productsInFolder(folderId: string | null): Product[] {
    return products
      .filter((p) => p.folderId === folderId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /* ============ Drag/drop ============ */
  function onDragStart(productId: string) {
    setDragId(productId);
  }
  function onDragEnd() {
    setDragId(null);
    setDragOverFolder(null);
  }
  function onDropProduct(targetProductId: string) {
    if (!dragId || dragId === targetProductId) return;
    const target = products.find((p) => p.id === targetProductId);
    const source = products.find((p) => p.id === dragId);
    if (!target || !source) return;
    // Move source para o folder do target, e reordena
    const updated = products.map((p) =>
      p.id === source.id ? { ...p, folderId: target.folderId } : p,
    );
    const list = updated
      .filter((p) => p.folderId === target.folderId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const fromIdx = list.findIndex((p) => p.id === source.id);
    const toIdx = list.findIndex((p) => p.id === target.id);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
    }
    // Atribui novos sortOrders dentro deste folder
    const reordered = updated.map((p) => {
      const idx = list.findIndex((x) => x.id === p.id);
      return idx === -1 ? p : { ...p, sortOrder: idx };
    });
    setProducts(reordered);
    persistMoveAndOrder(source.id, target.folderId, list.map((p) => p.id));
  }

  function onDropFolder(folderId: string | null) {
    if (!dragId) return;
    const source = products.find((p) => p.id === dragId);
    if (!source) return;
    // Se já está nessa pasta, ignora
    if (source.folderId === folderId) return;
    const updated = products.map((p) =>
      p.id === source.id ? { ...p, folderId } : p,
    );
    setProducts(updated);
    persistMoveAndOrder(source.id, folderId, null);
  }

  function persistMoveAndOrder(
    productId: string,
    folderId: string | null,
    orderIds: string[] | null,
  ) {
    startTransition(async () => {
      await moveProductToFolder(productId, folderId);
      if (orderIds) await reorderProducts(orderIds);
      router.refresh();
    });
  }

  /* ============ Render ============ */
  const noFolderProducts = productsInFolder(null);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-zinc-500">
          {folders.length} pasta{folders.length !== 1 ? "s" : ""} ·{" "}
          {products.length} produto{products.length !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-2">
          {/* Toggle grid/lista (davi 29/07/2026) */}
          <div className="inline-flex items-center gap-0 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Layout em cards"
              aria-pressed={viewMode === "grid"}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition ${
                viewMode === "grid"
                  ? "bg-yellow-400 text-black font-semibold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="Layout em lista"
              aria-pressed={viewMode === "list"}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition ${
                viewMode === "list"
                  ? "bg-yellow-400 text-black font-semibold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <List className="size-3.5" />
            </button>
          </div>
          <NewFolderButton />
        </div>
      </div>

      {/* Folders */}
      {folders.map((folder) => {
        const items = productsInFolder(folder.id);
        const isExpanded = expandedFolders.has(folder.id);
        const isDropTarget = dragOverFolder === folder.id;
        return (
          <div
            key={folder.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverFolder(folder.id);
            }}
            onDragLeave={() => setDragOverFolder(null)}
            onDrop={() => {
              onDropFolder(folder.id);
              setDragOverFolder(null);
            }}
            className={`rounded-2xl border bg-white/[0.02] overflow-hidden transition ${
              isDropTarget
                ? "border-cyan-400/60 bg-cyan-400/[0.04]"
                : "border-white/[0.08]"
            }`}
          >
            <FolderHeader
              folder={folder}
              count={items.length}
              expanded={isExpanded}
              onToggle={() => toggleFolder(folder.id)}
            />
            {isExpanded && (
              <div className="border-t border-white/[0.04]">
                {items.length === 0 ? (
                  <p className="px-5 py-6 text-center text-xs text-zinc-500">
                    Pasta vazia — arraste produtos pra cá.
                  </p>
                ) : viewMode === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-3">
                    {items.map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        sellerDomain={sellerDomain}
                        onDragStart={() => onDragStart(p.id)}
                        onDragEnd={onDragEnd}
                        onDrop={() => onDropProduct(p.id)}
                        isDragging={dragId === p.id}
                      />
                    ))}
                  </div>
                ) : (
                  items.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      sellerDomain={sellerDomain}
                      onDragStart={() => onDragStart(p.id)}
                      onDragEnd={onDragEnd}
                      onDrop={() => onDropProduct(p.id)}
                      isDragging={dragId === p.id}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Produtos sem pasta */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverFolder("__none__");
        }}
        onDragLeave={() => setDragOverFolder(null)}
        onDrop={() => {
          onDropFolder(null);
          setDragOverFolder(null);
        }}
        className={`rounded-2xl border bg-white/[0.02] overflow-hidden transition ${
          dragOverFolder === "__none__"
            ? "border-cyan-400/60 bg-cyan-400/[0.04]"
            : "border-white/[0.08]"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <p className="text-sm font-medium text-white inline-flex items-center gap-2">
            <Package className="size-4 text-zinc-400" /> Sem pasta
            <span className="text-xs text-zinc-500">({noFolderProducts.length})</span>
          </p>
        </div>
        {noFolderProducts.length === 0 ? (
          <p className="px-5 py-6 text-center text-xs text-zinc-500">
            Todos os produtos estão organizados em pastas. ✨
          </p>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-3">
            {noFolderProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                sellerDomain={sellerDomain}
                onDragStart={() => onDragStart(p.id)}
                onDragEnd={onDragEnd}
                onDrop={() => onDropProduct(p.id)}
                isDragging={dragId === p.id}
              />
            ))}
          </div>
        ) : (
          noFolderProducts.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              sellerDomain={sellerDomain}
              onDragStart={() => onDragStart(p.id)}
              onDragEnd={onDragEnd}
              onDrop={() => onDropProduct(p.id)}
              isDragging={dragId === p.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FolderHeader({
  folder,
  count,
  expanded,
  onToggle,
}: {
  folder: FolderItem;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);

  function save() {
    if (!name.trim()) return;
    startTransition(async () => {
      await renameFolder(folder.id, name);
      setEditing(false);
      router.refresh();
    });
  }
  function handleDelete() {
    if (!confirm(`Apagar a pasta "${folder.name}"? Os produtos ficam, só a pasta vai.`))
      return;
    startTransition(async () => {
      await deleteFolder(folder.id);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
      >
        {expanded ? (
          <ChevronDown className="size-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-zinc-500 shrink-0" />
        )}
        <Folder className="size-4 shrink-0" style={{ color: folder.color }} />
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setEditing(false);
                setName(folder.name);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="rounded border border-cyan-400/40 bg-black/30 px-2 py-1 text-sm text-white"
          />
        ) : (
          <p className="font-medium text-white truncate">{folder.name}</p>
        )}
        <span className="text-xs text-zinc-500 shrink-0">({count})</span>
      </button>
      <div className="flex items-center gap-1">
        {editing ? (
          <>
            <button
              type="button"
              onClick={save}
              className="p-1.5 rounded-md text-cyan-300 hover:bg-white/[0.06]"
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(folder.name);
              }}
              className="p-1.5 rounded-md text-zinc-400 hover:bg-white/[0.06]"
            >
              <X className="size-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-md text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              title="Renomear"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 rounded-md text-zinc-400 hover:bg-red-500/10 hover:text-red-300"
              title="Excluir"
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ProductRow({
  product: p,
  sellerDomain,
  onDragStart,
  onDragEnd,
  onDrop,
  isDragging,
}: {
  product: Product;
  sellerDomain: string | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.stopPropagation();
        onDrop();
      }}
      className={`group grid grid-cols-12 items-center gap-4 border-b border-white/[0.04] px-5 py-3 text-sm last:border-b-0 hover:bg-white/[0.025] transition cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="col-span-5 flex items-center gap-3 min-w-0">
        <GripVertical className="size-4 shrink-0 text-zinc-600 group-hover:text-zinc-400" />
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image}
            alt={p.name}
            className="size-9 shrink-0 rounded-lg border border-white/[0.08] object-cover"
          />
        ) : (
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400">
            <Package className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/produtos/${p.id}`}
              className="truncate font-medium text-white hover:text-cyan-300 transition"
            >
              {p.name}
            </Link>
            <ProductIdBadge productId={p.id} />
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
            <span className="font-mono truncate">/{p.slug}</span>
            {p.firstCheckoutSlug && sellerDomain && (
              <a
                href={getCheckoutUrl(
                  p.firstCheckoutSlug,
                  undefined,
                  sellerDomain,
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 text-zinc-500 hover:text-cyan-300 transition"
                title={`Abrir checkout (${sellerDomain})`}
              >
                <ExternalLink className="size-3" />
              </a>
            )}
            {p.firstCheckoutSlug && !sellerDomain && (
              <Link
                href="/dashboard/dominios"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 hover:bg-amber-500/25"
                title="Conecte um dominio pra ativar este checkout"
              >
                inativo
              </Link>
            )}
          </div>
        </div>
      </div>
      <div className="col-span-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
            typeColors[p.type] ?? "bg-zinc-700/30 text-zinc-300"
          }`}
        >
          {typeLabels[p.type] ?? p.type}
        </span>
      </div>
      <div className="col-span-2 font-mono text-zinc-200 text-xs">
        <span>{formatBRL(p.priceCents)}</span>
        <span className="block text-[9px] text-zinc-500" title="Preço base — cada oferta/checkout pode definir o seu próprio">
          base
        </span>
      </div>
      <div className="col-span-1">
        {p.active ? (
          <span className="inline-flex items-center gap-1 text-xs text-cyan-300">
            <span className="size-1.5 rounded-full bg-cyan-400" /> Ativo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
            <span className="size-1.5 rounded-full bg-zinc-600" />
          </span>
        )}
      </div>
      <div className="col-span-2 flex items-center justify-end">
        <ProductRowActions productId={p.id} productName={p.name} />
      </div>
    </div>
  );
}

/**
 * 29/07/2026 (davi): layout ALTERNATIVO em card quadrado. Mesmas capacidades
 * do ProductRow (drag/drop, link pra edicao, badges) mas em formato de card.
 */
function ProductCard({
  product: p,
  sellerDomain,
  onDragStart,
  onDragEnd,
  onDrop,
  isDragging,
}: {
  product: Product;
  sellerDomain: string | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.stopPropagation();
        onDrop();
      }}
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {/* Imagem */}
      <Link
        href={`/dashboard/produtos/${p.id}`}
        className="block aspect-video w-full overflow-hidden border-b border-white/[0.06] bg-black/40"
      >
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image}
            alt={p.name}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-white/[0.03] to-transparent">
            <Package className="size-8 text-zinc-600" />
          </div>
        )}
      </Link>

      {/* Header linha 1: status + tipo */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="flex items-center gap-1.5">
          {p.active ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-cyan-300">
              <span className="size-1.5 rounded-full bg-cyan-400" /> Ativo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
              <span className="size-1.5 rounded-full bg-zinc-600" /> Pausado
            </span>
          )}
          <span className="text-[10px] text-zinc-600">•</span>
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
              typeColors[p.type] ?? "bg-zinc-700/30 text-zinc-300"
            }`}
          >
            {typeLabels[p.type] ?? p.type}
          </span>
        </div>
        <ProductRowActions productId={p.id} productName={p.name} />
      </div>

      {/* Nome + slug */}
      <div className="px-3 pt-1.5">
        <Link
          href={`/dashboard/produtos/${p.id}`}
          className="line-clamp-2 text-sm font-semibold text-white hover:text-cyan-300 transition"
        >
          {p.name}
        </Link>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
          <span className="font-mono truncate">/{p.slug}</span>
          {p.firstCheckoutSlug && sellerDomain && (
            <a
              href={getCheckoutUrl(p.firstCheckoutSlug, undefined, sellerDomain)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 text-zinc-500 hover:text-cyan-300 transition"
              title={`Abrir checkout (${sellerDomain})`}
            >
              <ExternalLink className="size-3" />
            </a>
          )}
          {p.firstCheckoutSlug && !sellerDomain && (
            <Link
              href="/dashboard/dominios"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 hover:bg-amber-500/25"
              title="Conecte um dominio pra ativar este checkout"
            >
              inativo
            </Link>
          )}
        </div>
      </div>

      {/* Footer: preço + copy ID */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.04] px-3 py-2.5">
        <div>
          <p className="font-mono text-sm font-semibold text-white tabular-nums">
            {formatBRL(p.priceCents)}
          </p>
          <p className="text-[9px] text-zinc-500">preço base</p>
        </div>
        <ProductIdBadge productId={p.id} />
      </div>
    </div>
  );
}

function NewFolderButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function save() {
    if (!name.trim()) {
      setCreating(false);
      return;
    }
    startTransition(async () => {
      await createFolder({ name: name.trim() });
      setCreating(false);
      setName("");
      router.refresh();
    });
  }

  if (!creating) {
    return (
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05]"
      >
        <FolderPlus className="size-3.5" /> Nova pasta
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setCreating(false);
        }}
        autoFocus
        placeholder="Nome da pasta..."
        className="rounded-full border border-cyan-400/40 bg-white/[0.04] px-3 py-1.5 text-xs text-white focus:outline-none w-44"
      />
      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-full bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
      </button>
      <button
        type="button"
        onClick={() => {
          setCreating(false);
          setName("");
        }}
        className="p-1.5 rounded-full text-zinc-400 hover:text-white"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

/**
 * Badge inline com o ID do produto (clicar copia).
 *
 * Sellers usam o productId pra integracoes via API. Antes o ID so
 * aparecia escondido na URL — agora fica visivel ao lado do nome.
 */
function ProductIdBadge({ productId }: { productId: string }) {
  const [copied, setCopied] = useState(false);
  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(productId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback silencioso
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-mono transition ${
        copied
          ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
          : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:border-cyan-400/40 hover:text-cyan-300"
      }`}
      title={copied ? "Copiado!" : `Clique pra copiar ${productId}`}
    >
      {copied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
      <span className="hidden sm:inline">{productId.slice(0, 12)}…</span>
      <span className="sm:hidden">ID</span>
    </button>
  );
}
