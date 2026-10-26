"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCoproducer } from "./actions";

export function CoproducerForm({
  productId,
  maxSplit,
}: {
  productId: string;
  maxSplit: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await addCoproducer(productId, fd);
      if (!r.ok) setError(r.error);
      else {
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  if (maxSplit <= 0) {
    return (
      <p className="text-sm text-yellow-300">
        Não há mais % disponível pra dividir (todos os 100% já estão alocados).
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_100px_auto] sm:items-end">
      <div>
        <Label htmlFor="cp-email">Email</Label>
        <Input
          id="cp-email"
          name="email"
          type="email"
          required
          placeholder="coprodutor@email.com"
        />
      </div>
      <div>
        <Label htmlFor="cp-name">Nome (opcional)</Label>
        <Input id="cp-name" name="name" placeholder="Nome do coprodutor" />
      </div>
      <div>
        <Label htmlFor="cp-split">Split %</Label>
        <Input
          id="cp-split"
          name="splitPercent"
          type="number"
          step="0.01"
          min="0.01"
          max={maxSplit}
          required
          placeholder={`Max ${maxSplit.toFixed(2)}`}
        />
      </div>
      <Button type="submit" loading={isPending}>
        Adicionar
      </Button>
      {error && (
        <p className="sm:col-span-4 text-xs text-red-300">{error}</p>
      )}
    </form>
  );
}
