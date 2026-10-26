"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Eye, EyeOff, Loader2, Star, X } from "lucide-react";
import {
  createAdAction,
  updateAdAction,
  deleteAdAction,
  toggleAdActiveAction,
} from "./actions";

type Ad = {
  id: string;
  platform: string;
  title: string;
  brand: string;
  niche: string;
  angle: string;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string;
  hookText: string;
  description: string;
  cta: string;
  estimatedSpend: string;
  daysRunning: number | null;
  country: string;
  tags: string[];
  language: string;
  featured: boolean;
  active: boolean;
};

export function AdsManager({ ads }: { ads: Ad[] }) {
  const [editing, setEditing] = useState<Ad | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"all" | "facebook" | "tiktok">("all");

  const filtered = ads.filter((a) => tab === "all" || a.platform === tab);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["all", "facebook", "tiktok"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs rounded-full ${
                tab === t
                  ? "bg-white/[0.10] text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "all" ? `Todos (${ads.length})` : t === "facebook" ? `Facebook (${ads.filter((a) => a.platform === "facebook").length})` : `TikTok (${ads.filter((a) => a.platform === "tiktok").length})`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 rounded-full bg-cyan-400 text-black text-xs px-3 py-1.5 font-bold hover:bg-cyan-300"
        >
          <Plus className="size-3.5" /> Novo anúncio
        </button>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-[50px_2fr_120px_120px_100px_140px] gap-2 border-b border-white/[0.06] bg-black/30 px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
          <span></span>
          <span>Título / Hook</span>
          <span>Nicho · Ângulo</span>
          <span>Mídia</span>
          <span>Plataforma</span>
          <span className="text-right">Ações</span>
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-zinc-500">
            Nenhum anúncio cadastrado.
          </p>
        ) : (
          filtered.map((a) => (
            <AdRow
              key={a.id}
              a={a}
              onEdit={() => setEditing(a)}
            />
          ))
        )}
      </div>

      {(editing || creating) && (
        <AdFormModal
          ad={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function AdRow({ a, onEdit }: { a: Ad; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      await toggleAdActiveAction(a.id);
      router.refresh();
    });
  }
  function del() {
    if (!confirm(`Excluir anúncio "${a.title}"? Sem volta.`)) return;
    startTransition(async () => {
      await deleteAdAction(a.id);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-[50px_2fr_120px_120px_100px_140px] gap-2 border-b border-white/[0.03] px-4 py-2 text-xs items-center">
      <div className="size-10 rounded bg-zinc-900 overflow-hidden">
        {a.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-zinc-700 text-[10px]">—</div>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-white truncate">{a.title}</p>
          {a.featured && <Star className="size-3 text-yellow-400 shrink-0" />}
          {!a.active && <span className="text-[9px] text-red-300 bg-red-500/10 px-1 rounded">oculto</span>}
        </div>
        {a.hookText && <p className="text-zinc-500 truncate italic text-[11px]">"{a.hookText}"</p>}
      </div>

      <div className="text-zinc-400 text-[11px]">
        <p>{a.niche}</p>
        <p className="text-zinc-500">{a.angle}</p>
      </div>

      <div className="text-zinc-400 text-[11px]">{a.mediaType}</div>

      <div>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
            a.platform === "facebook"
              ? "bg-blue-500/15 text-blue-300"
              : "bg-pink-500/15 text-pink-300"
          }`}
        >
          {a.platform}
        </span>
      </div>

      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={toggleActive}
          disabled={pending}
          className="rounded-full px-2 py-1 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
          title={a.active ? "Ocultar dos sellers" : "Mostrar pros sellers"}
        >
          {a.active ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full px-2 py-1 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={del}
          disabled={pending}
          className="rounded-full px-2 py-1 text-red-300 hover:bg-red-500/10"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

function AdFormModal({ ad, onClose }: { ad: Ad | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setError(null);
      const r = ad
        ? await updateAdAction(ad.id, fd)
        : await createAdAction(fd);
      if (!r.ok) {
        setError(r.error);
      } else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur p-4">
      <form
        onSubmit={onSubmit}
        className="max-w-3xl w-full max-h-[90vh] overflow-auto rounded-2xl border border-white/[0.10] bg-zinc-950 p-6 space-y-4"
      >
        <header className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">
            {ad ? "Editar anúncio" : "Novo anúncio"}
          </h3>
          <button type="button" onClick={onClose}>
            <X className="size-4 text-zinc-500 hover:text-white" />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Plataforma">
            <select name="platform" required defaultValue={ad?.platform ?? "facebook"} className={inputClass}>
              <option value="facebook">Facebook Ads</option>
              <option value="tiktok">TikTok Ads</option>
            </select>
          </Field>
          <Field label="Tipo de mídia">
            <select name="mediaType" required defaultValue={ad?.mediaType ?? "video"} className={inputClass}>
              <option value="video">Vídeo</option>
              <option value="image">Imagem</option>
              <option value="carousel">Carrossel</option>
            </select>
          </Field>
          <Field label="Título" className="col-span-2">
            <input name="title" required defaultValue={ad?.title ?? ""} className={inputClass} />
          </Field>
          <Field label="Marca / Advertiser">
            <input name="brand" defaultValue={ad?.brand ?? ""} className={inputClass} />
          </Field>
          <Field label="País">
            <input name="country" placeholder="BR" defaultValue={ad?.country ?? "BR"} className={inputClass} />
          </Field>
          <Field label="Nicho">
            <input name="niche" required placeholder="saude, financeiro, ..." defaultValue={ad?.niche ?? ""} className={inputClass} />
          </Field>
          <Field label="Ângulo">
            <input name="angle" required placeholder="medo, prova_social, urgencia, ..." defaultValue={ad?.angle ?? ""} className={inputClass} />
          </Field>
          <Field label="Hook (primeira frase)" className="col-span-2">
            <input name="hookText" defaultValue={ad?.hookText ?? ""} className={inputClass} />
          </Field>
          <Field label="Descrição / Breakdown" className="col-span-2">
            <textarea name="description" rows={4} defaultValue={ad?.description ?? ""} className={inputClass} />
          </Field>
          <Field label="CTA">
            <input name="cta" defaultValue={ad?.cta ?? ""} className={inputClass} />
          </Field>
          <Field label="Spend estimado">
            <input name="estimatedSpend" placeholder="$10k+" defaultValue={ad?.estimatedSpend ?? ""} className={inputClass} />
          </Field>
          <Field label="Dias rodando">
            <input name="daysRunning" type="number" min={0} defaultValue={ad?.daysRunning ?? ""} className={inputClass} />
          </Field>
          <Field label="Idioma">
            <input name="language" defaultValue={ad?.language ?? "pt"} className={inputClass} />
          </Field>
          <Field label="Link do anúncio (Meta Library / TikTok CC)" className="col-span-2">
            <input name="mediaUrl" type="url" defaultValue={ad?.mediaUrl ?? ""} className={inputClass} />
          </Field>
          <Field label="Thumbnail URL" className="col-span-2">
            <input name="thumbnailUrl" type="url" defaultValue={ad?.thumbnailUrl ?? ""} className={inputClass} />
          </Field>
          <Field label="Tags (separadas por vírgula)" className="col-span-2">
            <input name="tags" defaultValue={ad?.tags.join(", ") ?? ""} placeholder="vsl, ugc, shortform" className={inputClass} />
          </Field>
        </div>

        <div className="flex items-center gap-4 pt-2 border-t border-white/[0.05]">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" name="featured" defaultChecked={ad?.featured ?? false} />
            Destacar (top da lista)
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" name="active" defaultChecked={ad?.active ?? true} />
            Ativo (visível pros sellers)
          </label>
        </div>

        {error && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/[0.10] px-4 py-2 text-sm text-zinc-300 hover:bg-white/[0.05]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2 text-sm font-bold text-black hover:bg-cyan-300 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {ad ? "Salvar" : "Criar"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/[0.20]";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}
