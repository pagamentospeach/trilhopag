"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { dismissMyWarning } from "./warning-actions";

/** Banner de avisos do admin na dashboard do seller (dispensável). */
export function SellerWarningsBanner({
  warnings,
}: {
  warnings: { id: string; message: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = warnings.filter((w) => !hidden.has(w.id));
  if (visible.length === 0) return null;
  function dismiss(id: string) {
    setHidden((s) => new Set(s).add(id));
    startTransition(async () => {
      await dismissMyWarning(id);
      router.refresh();
    });
  }
  return (
    <div className="space-y-2">
      {visible.map((w) => (
        <div
          key={w.id}
          className="flex items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/[0.08] px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <p className="flex-1 whitespace-pre-wrap text-sm text-amber-100">
            {w.message}
          </p>
          <button
            type="button"
            onClick={() => dismiss(w.id)}
            disabled={pending}
            title="Dispensar aviso"
            className="shrink-0 text-amber-300/70 hover:text-amber-100 disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
