"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FileUpload } from "@/components/file-upload";
import type { ActionResult } from "@/app/dashboard/produtos/actions";

type ProductDefaults = {
  id?: string;
  name?: string;
  description?: string | null;
  image?: string | null;
  type?: "DIGITAL" | "PHYSICAL" | "SUBSCRIPTION" | "SERVICE";
  price?: string;
  intervalDays?: number | null;
  active?: boolean;
  slug?: string;
  recurrenceEnabled?: boolean;
  recurrenceInterval?: "weekly" | "monthly" | "quarterly" | "yearly" | null;
  recurrenceTrialDays?: number | null;
  recurrenceMaxBillings?: number | null;
};

export function ProductForm({
  defaults,
  action,
  submitLabel,
}: {
  defaults?: ProductDefaults;
  action: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState(defaults?.type ?? "DIGITAL");
  const [imageUrl, setImageUrl] = useState(defaults?.image ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  // Recorrência (opcional)
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(
    defaults?.recurrenceEnabled ?? false,
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    defaults?.recurrenceInterval ?? "monthly",
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Nome do produto</Label>
          <Input
            id="name"
            name="name"
            defaultValue={defaults?.name}
            required
            placeholder="Ex: Curso de tráfego pago"
          />
          {fieldErrors.name?.[0] && (
            <p className="mt-1 text-xs text-red-300">{fieldErrors.name[0]}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={defaults?.description ?? ""}
            placeholder="O que o cliente vai receber..."
          />
        </div>

        <div>
          <Label htmlFor="type">Tipo</Label>
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="DIGITAL">Digital</option>
            <option value="PHYSICAL">Físico</option>
            <option value="SUBSCRIPTION">Assinatura</option>
            <option value="SERVICE">Serviço</option>
          </Select>
        </div>

        {/* PRODUTO NAO TEM PRECO — preco vive na oferta (Checkout).
            Mesmo produto pode ter varias ofertas com precos diferentes.
            Mantemos campo hidden=0,01 pra schema compat (priceCents Int
            requer valor) — o checkout valida que priceCentsOverride > 0
            antes de aceitar venda. */}
        <input type="hidden" name="price" value={defaults?.price ?? "0,01"} />
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-3 text-[11px] text-blue-200/90 leading-relaxed">
          <strong className="text-blue-300">Sem preço por produto.</strong> O
          preço fica na <strong>oferta</strong> (checkout). Você pode ter
          várias ofertas do mesmo produto com preços diferentes (campanha,
          desconto, A/B test) — configure ao criar cada oferta.
        </div>

        {type === "SUBSCRIPTION" && (
          <div>
            <Label htmlFor="intervalDays">Recorrência (dias)</Label>
            <Input
              id="intervalDays"
              name="intervalDays"
              type="number"
              min="1"
              defaultValue={defaults?.intervalDays ?? 30}
              placeholder="30"
            />
          </div>
        )}

        <div className={type === "SUBSCRIPTION" ? "" : "sm:col-span-2"}>
          <Label>Imagem do produto</Label>
          <input type="hidden" name="image" value={imageUrl} />
          <FileUpload
            purpose="product"
            accept="image/*"
            currentUrl={imageUrl || null}
            onUploaded={(r) => setImageUrl(r.url)}
            onCleared={() => setImageUrl("")}
            label="Enviar imagem do produto"
            helper="JPG, PNG ou WEBP — máx. 10MB"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="slug">Slug (URL amigável)</Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={defaults?.slug ?? ""}
            placeholder="gerado automaticamente do nome"
          />
        </div>

        {/* RECORRÊNCIA — opcional pra qualquer tipo de produto.
            Quando ligada, o sistema cria uma Subscription a cada PIX
            pago e cobra automaticamente o cliente no intervalo escolhido. */}
        <div className="sm:col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="recurrenceEnabled"
              checked={recurrenceEnabled}
              onChange={(e) => setRecurrenceEnabled(e.target.checked)}
              className="mt-0.5 size-4 rounded border-white/15 bg-white/[0.05] text-cyan-400 focus:ring-cyan-400/30"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">
                Ativar cobrança recorrente
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                O cliente é cobrado automaticamente em intervalos definidos.
                Cada cobrança gera um novo PIX. Funciona pra qualquer tipo de
                produto, opcional.
              </p>
            </div>
          </label>

          {recurrenceEnabled && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3 border-t border-white/[0.06] pt-4">
              <div>
                <Label htmlFor="recurrenceInterval">Intervalo</Label>
                <select
                  id="recurrenceInterval"
                  name="recurrenceInterval"
                  value={recurrenceInterval ?? "monthly"}
                  onChange={(e) =>
                    setRecurrenceInterval(
                      e.target.value as
                        | "weekly"
                        | "monthly"
                        | "quarterly"
                        | "yearly",
                    )
                  }
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                >
                  <option value="weekly" className="bg-zinc-900">
                    Semanal
                  </option>
                  <option value="monthly" className="bg-zinc-900">
                    Mensal
                  </option>
                  <option value="quarterly" className="bg-zinc-900">
                    Trimestral
                  </option>
                  <option value="yearly" className="bg-zinc-900">
                    Anual
                  </option>
                </select>
                {fieldErrors.recurrenceInterval?.[0] && (
                  <p className="mt-1 text-xs text-red-300">
                    {fieldErrors.recurrenceInterval[0]}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="recurrenceTrialDays">
                  Trial (dias){" "}
                  <span className="text-[10px] text-zinc-500">opcional</span>
                </Label>
                <Input
                  id="recurrenceTrialDays"
                  name="recurrenceTrialDays"
                  type="number"
                  min="0"
                  max="365"
                  defaultValue={defaults?.recurrenceTrialDays ?? ""}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="recurrenceMaxBillings">
                  Máx. cobranças{" "}
                  <span className="text-[10px] text-zinc-500">opcional</span>
                </Label>
                <Input
                  id="recurrenceMaxBillings"
                  name="recurrenceMaxBillings"
                  type="number"
                  min="1"
                  max="120"
                  defaultValue={defaults?.recurrenceMaxBillings ?? ""}
                  placeholder="∞"
                />
              </div>
            </div>
          )}
        </div>

        <div className="sm:col-span-2 flex items-center gap-3">
          <input
            id="active"
            name="active"
            type="checkbox"
            defaultChecked={defaults?.active ?? true}
            className="size-4 rounded border-white/15 bg-white/[0.05] text-cyan-400 focus:ring-cyan-400/30"
          />
          <Label htmlFor="active" className="mb-0">
            Produto ativo
          </Label>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button type="submit" loading={isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
