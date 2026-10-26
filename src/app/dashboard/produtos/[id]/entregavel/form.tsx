"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveDeliverable } from "./actions";

/**
 * 23/07/2026 (davi): "Deixa o entregavel SOMENTE via email mesmo, tira esse
 * negocio de Tipo de entrega". Removi o seletor de kind (memberArea/url/text)
 * — na pratica todo mundo usava "url" (link enviado por email) mesmo.
 *
 * 29/07/2026 (davi): "Na aba entregavel, tira isso de URL do entregavel,
 * deixa somente o email pos compra!" — campo URL removido do form. Agora o
 * seller cola o link diretamente no corpo do email (mais direto, sem duas
 * caixas pra a mesma coisa). Backend/DB mantem contentUrl por retro-compat
 * (produtos antigos que ja tinham URL continuam com o valor gravado; hidden
 * input abaixo re-envia o defaults.contentUrl no submit pra nao apagar).
 */
export function DeliverableForm({
  productId,
  defaults,
}: {
  productId: string;
  defaults: {
    contentUrl: string;
    emailSubject: string;
    emailBody: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await saveDeliverable(productId, fd);
      if (!r.ok) setError(r.error);
      else {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Hidden inputs — kind fixo em "url" (23/07/2026) e contentUrl
          re-enviando o valor legado (29/07/2026) pra nao zerar produtos
          antigos que ja tinham URL gravada. */}
      <input type="hidden" name="kind" value="url" />
      <input type="hidden" name="contentUrl" value={defaults.contentUrl} />

      <div>
        <p className="text-sm font-medium text-white">Email pós-compra</p>
        <p className="mt-1 text-xs text-zinc-500">
          Personalize o assunto e o corpo do email que o cliente recebe assim
          que a compra confirma. Cole aqui o link do seu produto (Drive,
          Telegram VIP, área de membros, etc).
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="emailSubject">Assunto</Label>
            <Input
              id="emailSubject"
              name="emailSubject"
              defaultValue={defaults.emailSubject}
              placeholder="Seu acesso ao produto chegou!"
            />
          </div>
          <div>
            <Label htmlFor="emailBody">Corpo do email</Label>
            <Textarea
              id="emailBody"
              name="emailBody"
              rows={7}
              defaultValue={defaults.emailBody}
              placeholder="Olá {{nome}}, seu acesso está em: https://..."
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Variáveis:{" "}
              <code className="text-zinc-400">{"{{nome}}"}</code>{" "}
              <code className="text-zinc-400">{"{{produto}}"}</code>
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        {saved && (
          <span className="self-center text-xs text-cyan-300">✓ Salvo</span>
        )}
        <Button type="submit" loading={isPending}>
          Salvar entregável
        </Button>
      </div>
    </form>
  );
}
