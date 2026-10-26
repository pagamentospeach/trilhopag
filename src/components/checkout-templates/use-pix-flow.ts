"use client";

import { useCallback, useState } from "react";
import { onFbqReady, onTtqReady } from "./pixel-ready";

export type PixResult = {
  qrCode: string;
  pixCode: string;
  expiresAt?: string | null;
  transactionId: string;
};

export type CustomerData = {
  name: string;
  email: string;
  phone?: string;
  cpf?: string;
  /** Endereco — produtos fisicos / templates com isPhysical=true. */
  cep?: string;
  address?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

export function usePixFlow(
  slug: string,
  utm: Record<string, string | null>,
  variantId?: string,
  // Quando true, mocka PIX direto. Usado pelo builder pra live preview
  // sem gerar cobrança real. Bate com ?preview=1 na URL (compat).
  isPreview?: boolean,
) {
  const [pix, setPix] = useState<PixResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    /**
     * `bumpIds` / `shippingId`: o que o cliente marcou (portado da BravoPay,
     * 11/08/2026).
     *
     * O total COM bump e frete ja era exibido na tela ha tempos, mas nenhum
     * caller mandava a selecao pro servidor — a cobranca saia com o preco do
     * produto puro. Vai como ID; o preco quem decide e o servidor, lendo do
     * banco.
     */
    async (
      customer: CustomerData,
      bumpIds?: string[],
      shippingId?: string | null,
    ) => {
      setLoading(true);
      setError(null);

      // Detecta modo preview (prop OU query string)
      const urlPreview =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("preview") === "1";
      if (isPreview || urlPreview) {
        await new Promise((r) => setTimeout(r, 400));
        const mock: PixResult = {
          qrCode: "PREVIEW",
          pixCode:
            "00020126360014BR.GOV.BCB.PIX0114PREVIEW-MODE-NO-CODE5204000053039865802BR5913TRILHO-DEMO6009SAOPAULO62070503***6304PREV",
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          transactionId: "preview-tx",
        };
        setPix(mock);
        setLoading(false);
        return mock;
      }

      // Monta o body UMA vez (reusado nas 2 tentativas do auto-retry).
      const requestBody = JSON.stringify({
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone || undefined,
          cpf: customer.cpf || undefined,
          // Endereco (produtos fisicos) — backend trim+normaliza CEP
          cep: customer.cep || undefined,
          address: customer.address || undefined,
          number: customer.number || undefined,
          complement: customer.complement || undefined,
          neighborhood: customer.neighborhood || undefined,
          city: customer.city || undefined,
          state: customer.state || undefined,
        },
        utm,
        variant_id: variantId,
        ...(bumpIds && bumpIds.length > 0 ? { bump_ids: bumpIds } : {}),
        ...(shippingId ? { shipping_id: shippingId } : {}),
      });

      // AUTO-RETRY TRANSPARENTE (jun/2026): o PIX SEMPRE deve gerar. Se a 1ª
      // tentativa falhar (rede caiu OU resposta não-OK, ex.: 503 transiente do
      // servidor), espera ~700ms e tenta UMA vez mais — sem o cliente perceber —
      // antes de mostrar erro. De propósito SEM timeout/abort no fetch: cortar
      // um create lento-mas-bem-sucedido criaria PIX DUPLICADO.
      const postPix = () =>
        fetch(`/api/checkouts/${slug}/pix`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });

      let res: Response | null = null;
      let data: Record<string, unknown> | null = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          res = await postPix();
          data = (await res.json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          if (res.ok) break; // sucesso → sai do loop
        } catch {
          res = null; // erro de rede → tenta de novo (se ainda houver tentativa)
        }
        // Backoff curto antes da 2ª (e última) tentativa.
        if (attempt < 2) await new Promise((r) => setTimeout(r, 700));
      }

      // Falhou nas 2 tentativas (rede OU resposta não-OK) → erro amigável.
      if (!res || !res.ok) {
        setError(
          (data?.message as string) ||
            (data?.error as string) ||
            "Erro ao gerar Pix. Tente novamente.",
        );
        setLoading(false);
        return null;
      }

      // API retorna: { transaction_id, copy_paste, qr_code_image, expires_at, ... }
      const result: PixResult = {
        qrCode: (data?.qr_code_image as string) || "",
        pixCode:
          (data?.copy_paste as string) || (data?.qr_code as string) || "",
        expiresAt: (data?.expires_at as string | null | undefined) ?? null,
        transactionId: data?.transaction_id as string,
      };
      setPix(result);
      setLoading(false);

      // PERSISTÊNCIA do txId pendente — pro redirect pós-pagamento sobreviver
      // a RELOAD/KILL da aba. No mobile, pagar o PIX exige sair pro app do
      // banco; ao voltar, iOS/Android frequentemente RECARREGAM a aba (perde
      // estado React + polling) e o cliente cai de volta no formulário, sem
      // nunca ser redirecionado pro upsell. O PixResumeWatcher lê isto no load
      // e retoma o polling/redirect. (preview-tx não persiste.)
      try {
        if (result.transactionId && result.transactionId !== "preview-tx") {
          localStorage.setItem(
            `tp_pix_${slug}`,
            JSON.stringify({ tx: result.transactionId, ts: Date.now() }),
          );
        }
      } catch {
        // localStorage indisponível (modo privado) — segue sem persistência
      }

      // PIXEL: AddPaymentInfo (FB + TikTok), com event_id = transactionId pra
      // DEDUP contra o CAPI server-side.
      //
      // 30/07/2026 (davi 'o pixel nao marca IC quando o lead entra no
      // checkout'): este evento era InitiateCheckout. Estava errado por dois
      // motivos: (a) só disparava DEPOIS do PIX gerado, então quem só abria o
      // checkout nunca virava IC — que é exatamente o que o seller reclamou;
      // (b) agora o IC de verdade sai na ENTRADA (PixelScripts), então manter
      // IC aqui contaria o mesmo lead 2x. AddPaymentInfo é o evento padrão
      // (existe no Meta e no TikTok) pra "preencheu os dados e pediu o
      // pagamento" — que é literalmente o que aconteceu.
      //
      // Espera o pixel existir em vez de checar uma vez: o <Script
      // afterInteractive> pode não ter rodado ainda em conexão lenta.
      try {
        const eventId = result.transactionId;
        // PIX é sempre BRL — não usa a moeda do tema (gringa não usa PIX).
        // A API sempre devolve amount_cents (já com bump/frete somados), então
        // o value do pixel bate com o que o cliente realmente vai pagar.
        const amountCents =
          typeof data?.amount_cents === "number" ? data.amount_cents : 0;
        const params =
          amountCents > 0
            ? { value: Number((amountCents / 100).toFixed(2)), currency: "BRL" }
            : {};
        onFbqReady((fbq) => {
          fbq("track", "AddPaymentInfo", params, { eventID: eventId });
        });
        onTtqReady((ttq) => {
          ttq.track("AddPaymentInfo", params, { event_id: eventId });
        });
      } catch {
        // pixel é best-effort — nunca quebra o checkout
      }
      return result;
    },
    [slug, utm, variantId, isPreview],
  );

  return { pix, loading, error, submit, reset: () => setPix(null) };
}
