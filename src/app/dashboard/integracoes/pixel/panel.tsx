"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Plus,
  Info,
  Power,
  Trash2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  createAccountPixel,
  deleteAccountPixel,
  toggleAccountPixel,
} from "./actions";

type Pixel = {
  id: string;
  platform: string;
  pixelId: string;
  capiToken: string | null;
  testEventCode: string | null;
  eventPurchase: boolean;
  eventInitiateCheckout: boolean;
  valueMode: string;
  active: boolean;
};

const PLATFORM_LABEL: Record<string, string> = {
  FACEBOOK: "Pixel do Facebook (Meta)",
  TIKTOK: "Pixel do TikTok",
};

const PLATFORM_DOC: Record<string, string> = {
  FACEBOOK:
    "Pegue o Pixel ID no Events Manager. O Access Token (CAPI) está em Configurações > Conjuntos de dados > Token de acesso.",
  TIKTOK:
    "Pixel ID no TikTok Ads Manager > Events. Access Token em Events > Web Events > API Eventos > Access Token.",
};

export function PixelPanel({ pixels }: { pixels: Pixel[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium text-white">Pixels conectados</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black transition hover:bg-cyan-300"
        >
          <Plus className="size-3.5" /> Conectar pixel
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {pixels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.1] px-5 py-10 text-center">
            <p className="text-sm text-zinc-300">
              Nenhum pixel conectado ainda.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Conecte o pixel do Facebook ou TikTok pra enviar o evento de compra
              de todas as suas vendas automaticamente.
            </p>
          </div>
        ) : (
          pixels.map((p) => <PixelRow key={p.id} pixel={p} />)
        )}
      </div>

      {open && <NewPixelModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function PixelRow({ pixel }: { pixel: Pixel }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm("Desconectar este pixel?")) return;
    startTransition(async () => {
      await deleteAccountPixel(pixel.id);
      router.refresh();
    });
  }
  function onToggle() {
    startTransition(async () => {
      await toggleAccountPixel(pixel.id);
      router.refresh();
    });
  }

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition hover:bg-white/[0.04]">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-cyan-400/15 text-xs font-bold text-cyan-300">
        {pixel.platform[0]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {PLATFORM_LABEL[pixel.platform] ?? pixel.platform}
        </p>
        <p className="truncate font-mono text-xs text-zinc-400">
          {pixel.pixelId}
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {pixel.capiToken ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
            <ShieldCheck className="size-3" /> Conectado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/10 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
            Sem token
          </span>
        )}
        {!pixel.active && (
          <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
            Pausado
          </span>
        )}
      </div>
      <div className="flex shrink-0 gap-1 opacity-60 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={onToggle}
          disabled={isPending}
          className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
          title={pixel.active ? "Pausar" : "Ativar"}
        >
          <Power className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-300"
          title="Desconectar"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function NewPixelModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [platform, setPlatform] = useState("FACEBOOK");
  const [eventPurchase, setEventPurchase] = useState(true);
  const [eventInitiate, setEventInitiate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await createAccountPixel(fd);
      if (!r.ok) setError(r.error);
      else {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h3 className="text-base font-semibold text-white">Conectar pixel</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 overflow-y-auto p-6">
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] px-3 py-2 text-[11px] leading-relaxed text-cyan-100/80">
            Este pixel vale pra <strong>conta inteira</strong>: o evento de compra
            dispara automaticamente em <strong>todas as suas vendas</strong>, de
            qualquer produto.
          </div>

          <div>
            <label className="mb-2 block text-xs text-zinc-400">Plataforma</label>
            <select
              name="platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            >
              <option value="FACEBOOK">Pixel do Facebook (Meta)</option>
              <option value="TIKTOK">Pixel do TikTok</option>
            </select>
            <div className="mt-2 inline-flex items-start gap-1.5 rounded-lg border border-blue-400/20 bg-blue-400/[0.04] px-3 py-2 text-[11px] text-blue-100/80">
              <Info className="mt-0.5 size-3 shrink-0" />
              <span>{PLATFORM_DOC[platform]}</span>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs text-zinc-400">Pixel ID</label>
            <input
              name="pixelId"
              required
              placeholder={
                platform === "FACEBOOK"
                  ? "123456789012345"
                  : "CXXXXXXXXXXXXXXXX"
              }
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs text-zinc-400">
              Access Token (recomendado pra máxima assertividade)
            </label>
            <input
              name="capiToken"
              type="password"
              placeholder={
                platform === "FACEBOOK"
                  ? "EAA..."
                  : "Access Token da Events API"
              }
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              Sem token, os eventos vão só pelo navegador. Com token, enviamos
              também via API server-side — mais assertivo e contorna AdBlockers.
            </p>
          </div>

          {platform === "FACEBOOK" && (
            <div>
              <label className="mb-2 block text-xs text-zinc-400">
                Test Event Code (opcional)
              </label>
              <input
                name="testEventCode"
                placeholder="TEST12345"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              />
              <p className="mt-1 text-[10px] text-zinc-500">
                Pra testar antes de ativar — veja os eventos no Test Events do
                Events Manager.
              </p>
            </div>
          )}

          <div className="border-t border-white/[0.06] pt-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Eventos
            </p>
            <div className="space-y-3">
              <ToggleRow
                label="Disparar no Pagamento Aprovado (Purchase)"
                name="eventPurchase"
                checked={eventPurchase}
                onChange={setEventPurchase}
              />
              <ToggleRow
                label="Disparar na geração de PIX (AddPaymentInfo)"
                name="eventInitiateCheckout"
                checked={eventInitiate}
                onChange={setEventInitiate}
              />
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">
              O <strong className="text-zinc-400">InitiateCheckout</strong> é
              disparado automaticamente pelo pixel do próprio checkout assim que
              o lead abre a página — junto com ViewContent. Não precisa
              configurar nada aqui pra ele funcionar.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs text-zinc-400">
              Valor enviado no evento de compra
            </label>
            <select
              name="valueMode"
              defaultValue="gross"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="gross">Valor Total (Bruto)</option>
              <option value="net">Valor Líquido (após taxas)</option>
            </select>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-5 py-2 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
            >
              {isPending && <Loader2 className="size-3 animate-spin" />}
              Conectar pixel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  name,
  checked,
  onChange,
}: {
  label: string;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <p className="text-sm text-zinc-200">{label}</p>
      <span className="relative inline-flex">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="block h-5 w-9 rounded-full bg-zinc-700 transition peer-checked:bg-cyan-400" />
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
