"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, Copy, Check, Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

type UpsellProduct = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
};

type Customer = {
  name: string;
  email: string;
  cpf: string;
  phone: string | null;
};

type Stage = "offer" | "loading" | "qr" | "paid" | "expired" | "dismissed";

export function UpsellOffer({
  slug,
  txId,
  product,
  customer,
}: {
  slug: string;
  txId: string;
  product: UpsellProduct;
  customer: Customer;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("offer");
  const [pix, setPix] = useState<{
    transaction_id: string;
    copy_paste: string;
    qr_code_image: string | null;
    expires_at: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setError(null);
    setStage("loading");
    const res = await fetch(`/api/checkouts/${slug}/upsell?tx=${txId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.message ?? err.error ?? `Erro ${res.status}`);
      setStage("offer");
      return;
    }
    const data = await res.json();
    setPix(data);
    setStage("qr");
  }

  useEffect(() => {
    if (stage !== "qr" || !pix) return;
    const i = setInterval(async () => {
      try {
        const r = await fetch(
          `/api/transactions/${pix.transaction_id}/status`,
        );
        const d = await r.json();
        if (d.status === "PAID") {
          setStage("paid");
          clearInterval(i);
          router.refresh();
        } else if (d.status === "EXPIRED" || d.status === "FAILED") {
          setStage("expired");
          clearInterval(i);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(i);
  }, [stage, pix, router]);

  async function copyCode() {
    if (!pix?.copy_paste) return;
    await navigator.clipboard.writeText(pix.copy_paste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (stage === "dismissed") return null;

  if (stage === "paid") {
    return (
      <section className="rounded-2xl border border-cyan-400/40 bg-cyan-400/[0.08] p-8 text-center">
        <p className="text-lg font-semibold text-white">
          ✅ Upgrade adicionado!
        </p>
        <p className="mt-2 text-sm text-zinc-300">
          Seu upgrade <span className="text-white">{product.name}</span> foi
          confirmado.
        </p>
      </section>
    );
  }

  if (stage === "qr" && pix) {
    return (
      <section className="rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.04] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="size-5 text-cyan-300" />
            <h3 className="font-medium text-white">Pague seu upgrade</h3>
          </div>
        </div>
        <div className="mt-5 flex justify-center">
          {pix.qr_code_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pix.qr_code_image}
              alt="QR Pix"
              className="size-56 rounded-lg bg-white p-3"
            />
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 p-3">
          <span className="flex-1 font-mono text-[10px] text-zinc-300 break-all line-clamp-2">
            {pix.copy_paste}
          </span>
          <button
            type="button"
            onClick={copyCode}
            className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
          >
            {copied ? (
              <Check className="size-4 text-cyan-400" />
            ) : (
              <Copy className="size-4" />
            )}
          </button>
        </div>
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="size-3 animate-spin" /> Aguardando pagamento...
        </p>
      </section>
    );
  }

  if (stage === "expired") {
    return (
      <section className="rounded-2xl border border-red-400/30 bg-red-400/[0.05] p-6 text-center">
        <p className="text-sm text-red-200">A oferta expirou.</p>
        <button
          type="button"
          onClick={() => setStage("offer")}
          className="mt-3 rounded-full bg-cyan-400 px-5 py-2 text-sm font-medium text-black"
        >
          Tentar de novo
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-yellow-400/30 bg-gradient-to-b from-yellow-400/[0.08] to-yellow-400/[0.02] p-8">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-yellow-400/20 px-3 py-1 text-xs font-medium text-yellow-200">
          <Sparkles className="size-3" /> Oferta especial · só pra você
        </span>
        <button
          type="button"
          onClick={() => setStage("dismissed")}
          className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </button>
      </div>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight">
        Adicione {product.name} por mais{" "}
        <span className="text-cyan-300">
          R$ {(product.priceCents / 100).toFixed(2).replace(".", ",")}
        </span>
      </h2>
      {product.description && (
        <p className="mt-2 text-sm text-zinc-300">{product.description}</p>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        Como {customer.name || "você"}{customer.email ? ` (${customer.email})` : ""} já
        finalizou a compra, é só 1 clique pra adicionar.
      </p>

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStage("dismissed")}
        >
          Não, obrigado
        </Button>
        <Button
          type="button"
          loading={stage === "loading"}
          onClick={accept}
          size="lg"
        >
          Sim, adicionar ao meu pedido
        </Button>
      </div>
    </section>
  );
}
