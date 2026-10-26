"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVariant, deleteVariant, updateVariant } from "./actions";
import { centsToBRLInput } from "@/lib/money";

type V = {
  id: string;
  label: string;
  headline: string | null;
  ctaText: string | null;
  priceCentsOverride: number | null;
  weight: number;
  active: boolean;
  visits: number;
  conversions: number;
  createdAt: string;
};

export function VariantsClient({
  checkoutId,
  variants,
}: {
  checkoutId: string;
  variants: V[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<V | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = editing
        ? await updateVariant(editing.id, fd)
        : await createVariant(checkoutId, fd);
      if (r?.ok) {
        setShowForm(false);
        setEditing(null);
        router.refresh();
      } else {
        alert(r?.error ?? "Erro");
      }
    });
  }

  function onDelete(id: string, label: string) {
    if (!confirm(`Excluir variante "${label}"?`)) return;
    startTransition(async () => {
      const r = await deleteVariant(id);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  const totalWeight = variants
    .filter((v) => v.active)
    .reduce((s, v) => s + v.weight, 0);

  return (
    <div className="space-y-4">
      {!showForm && (
        <button
          type="button"
          onClick={() => {
            setShowForm(true);
            setEditing(null);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-black hover:bg-cyan-300 transition"
        >
          <Plus className="size-4" /> Nova variante
        </button>
      )}

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.04] p-6 space-y-4"
        >
          <h2 className="text-sm font-medium text-white">
            {editing ? "Editar variante" : "Nova variante"}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="label">Nome interno</Label>
              <Input
                id="label"
                name="label"
                required
                defaultValue={editing?.label}
                placeholder="Ex: Headline B"
              />
            </div>
            <div>
              <Label htmlFor="weight">Peso (1-100)</Label>
              <Input
                id="weight"
                name="weight"
                type="number"
                min={1}
                max={100}
                defaultValue={editing?.weight ?? 50}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="headline">Headline (override)</Label>
              <Input
                id="headline"
                name="headline"
                defaultValue={editing?.headline ?? ""}
                placeholder="Aproveite enquanto está disponível"
              />
            </div>
            <div>
              <Label htmlFor="ctaText">Texto do botão CTA</Label>
              <Input
                id="ctaText"
                name="ctaText"
                defaultValue={editing?.ctaText ?? ""}
                placeholder="Garantir agora"
              />
            </div>
            <div>
              <Label htmlFor="priceOverride">Preço override (R$)</Label>
              <Input
                id="priceOverride"
                name="priceOverride"
                defaultValue={
                  editing?.priceCentsOverride
                    ? centsToBRLInput(editing.priceCentsOverride)
                    : ""
                }
                placeholder="Deixe vazio pra usar o do produto"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="active"
              name="active"
              type="checkbox"
              defaultChecked={editing?.active ?? true}
              className="size-4 rounded border-white/15 bg-white/[0.05] text-cyan-400 focus:ring-cyan-400/30"
            />
            <Label htmlFor="active" className="mb-0">
              Ativa no A/B test
            </Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={isPending}>
              {editing ? "Salvar" : "Criar variante"}
            </Button>
          </div>
        </form>
      )}

      {variants.length === 0 && !showForm ? (
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-12 text-center text-sm text-zinc-500">
          Nenhuma variante. Sem variante ativa, o checkout usa o produto base.
        </div>
      ) : (
        <div className="space-y-2">
          {variants.map((v) => {
            const share =
              totalWeight > 0 && v.active ? (v.weight / totalWeight) * 100 : 0;
            const cr =
              v.visits > 0 ? ((v.conversions / v.visits) * 100).toFixed(1) : "—";
            return (
              <div
                key={v.id}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white">{v.label}</p>
                      {v.active ? (
                        <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] text-cyan-300">
                          {share.toFixed(0)}% do tráfego
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] text-zinc-400">
                          Inativa
                        </span>
                      )}
                    </div>
                    {v.headline && (
                      <p className="mt-1 text-sm text-zinc-300">{v.headline}</p>
                    )}
                    {(v.ctaText || v.priceCentsOverride) && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {v.ctaText && (
                          <span className="rounded bg-white/[0.05] px-2 py-0.5 font-mono text-zinc-400">
                            CTA: {v.ctaText}
                          </span>
                        )}
                        {v.priceCentsOverride && (
                          <span className="rounded bg-white/[0.05] px-2 py-0.5 font-mono text-cyan-300">
                            Preço: R${" "}
                            {(v.priceCentsOverride / 100).toFixed(2).replace(".", ",")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(v);
                        setShowForm(true);
                      }}
                      className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(v.id, v.label)}
                      disabled={isPending}
                      className="rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-6 text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <BarChart3 className="size-3" /> {v.visits} visitas
                  </div>
                  <div className="text-zinc-400">
                    {v.conversions} conversões
                  </div>
                  <div
                    className={
                      typeof cr === "string" && cr !== "—"
                        ? "text-cyan-300 font-mono"
                        : "text-zinc-500 font-mono"
                    }
                  >
                    CR: {cr}{typeof cr === "string" && cr !== "—" ? "%" : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
