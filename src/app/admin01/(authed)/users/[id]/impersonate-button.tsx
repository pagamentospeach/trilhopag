"use client";

import { useTransition, useState } from "react";
import { UserCog, Loader2 } from "lucide-react";
import { adminImpersonateUser } from "../../../actions";

export function ImpersonateButton({
  userId,
  label,
}: {
  userId: string;
  label: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function go() {
    if (
      !confirm(
        `Entrar como "${label}"?\n\nVocê vai navegar o dashboard COMO esse seller (sessão completa de 4h). Um banner vermelho fica no topo e dá pra sair a qualquer momento.`,
      )
    )
      return;
    setErr(null);
    start(async () => {
      const r = await adminImpersonateUser(userId);
      if (r.ok) window.location.href = "/dashboard";
      else setErr(r.error);
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
        title="Abrir o dashboard COMO esse seller (impersonation, 4h, com banner)"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <UserCog className="size-3.5" />
        )}
        Ver como seller
      </button>
      {err && <span className="text-[11px] text-red-300">{err}</span>}
    </div>
  );
}
