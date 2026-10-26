"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Ban, RotateCcw } from "lucide-react";
import {
  adminSetProductRejected,
  adminSetCheckoutRejected,
} from "../../../actions";

/**
 * Botão de REJEITAR / REVERTER (anti-fraude) por produto ou checkout. Rejeitar
 * pede um motivo (mostrado pro seller). Produto rejeitado derruba todos os
 * checkouts dele; checkout rejeitado derruba só ele.
 */
export function RejectControls({
  kind,
  id,
  rejected,
  reason,
}: {
  kind: "product" | "checkout";
  id: string;
  rejected: boolean;
  reason: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run(next: boolean) {
    let r = reason ?? "";
    if (next) {
      const input = window.prompt(
        kind === "product"
          ? "Motivo da reprovação do PRODUTO (aparece pro seller; derruba TODOS os checkouts dele):"
          : "Motivo da reprovação do CHECKOUT (aparece pro seller):",
        "Reprovado pela auditoria.",
      );
      if (input === null) return;
      r = input;
    } else if (!confirm("Reverter a reprovação? Volta ao ar na hora.")) {
      return;
    }
    start(async () => {
      const res =
        kind === "product"
          ? await adminSetProductRejected(id, next, r)
          : await adminSetCheckoutRejected(id, next, r);
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }
  return rejected ? (
    <button
      type="button"
      onClick={() => run(false)}
      disabled={pending}
      title={reason ? `Motivo: ${reason}` : undefined}
      className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold uppercase text-cyan-300 hover:bg-cyan-400/20 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <RotateCcw className="size-3" />
      )}
      reverter
    </button>
  ) : (
    <button
      type="button"
      onClick={() => run(true)}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-red-300 hover:bg-red-500/20 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Ban className="size-3" />
      )}
      rejeitar
    </button>
  );
}
