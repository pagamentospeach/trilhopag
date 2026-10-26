"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { adminRequestKycResend } from "../../../actions";

/**
 * Botão de "solicitar reenvio" de KYC. `type` omitido = reenvio INTEGRAL
 * (todos os documentos). Marca o(s) doc(s) como rejeitado e reabre o
 * kycStatus do seller pra ele reenviar.
 */
export function KycResendButton({
  userId,
  type,
  label,
  all,
}: {
  userId: string;
  type?: string;
  label?: string;
  all?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run() {
    if (
      !confirm(
        all
          ? "Solicitar reenvio de TODOS os documentos? O seller fica como KYC rejeitado e precisa reenviar tudo."
          : `Solicitar reenvio de "${label ?? type}"? O documento fica rejeitado pro seller reenviar.`,
      )
    )
      return;
    start(async () => {
      const r = await adminRequestKycResend(userId, type);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className={
        all
          ? "inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
          : "inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/[0.08] disabled:opacity-50"
      }
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <RotateCcw className="size-3" />
      )}
      {all ? "Solicitar reenvio de todos" : "reenviar"}
    </button>
  );
}
