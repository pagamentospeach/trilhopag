"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, Trash2 } from "lucide-react";
import { deleteCoupon, toggleCoupon } from "./actions";

export function CouponRowActions({
  couponId,
  code,
  active,
}: {
  couponId: string;
  code: string;
  active: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onToggle() {
    startTransition(async () => {
      await toggleCoupon(couponId);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(`Excluir cupom ${code}?`)) return;
    startTransition(async () => {
      await deleteCoupon(couponId);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
      <button
        type="button"
        onClick={onToggle}
        disabled={isPending}
        className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
        title={active ? "Pausar" : "Ativar"}
      >
        <Power className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending}
        className="rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-300"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
