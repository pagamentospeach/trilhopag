import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatBRL } from "@/lib/utils";
import { resolveUpsellChoice } from "@/lib/upsell-ab";
import { UpsellOffer } from "./upsell-offer";
import { PurchasePixelFire } from "@/components/checkout-templates/purchase-pixel";

export const dynamic = "force-dynamic";

export default async function ObrigadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tx?: string }>;
}) {
  const { slug } = await params;
  const { tx: txId } = await searchParams;

  // Mesma política do checkout: nada renderiza no domínio do gateway. A página
  // de obrigado só é alcançada no domínio do seller (pós-pagamento). Acesso
  // direto via trilhopag.com → 404.
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  if (host === "trilhopag.com" || host === "www.trilhopag.com") {
    notFound();
  }

  const checkout = await prisma.checkout.findUnique({
    where: { slug },
    include: { product: true, user: { select: { name: true } } },
  });
  if (!checkout) notFound();

  // Carrega a transação ANTES do redirect — o roteamento condicional precisa
  // de método/valor/UF, e a atribuição precisa do estado atual.
  const tx = txId
    ? await prisma.transaction.findFirst({
        where: { id: txId, checkoutId: checkout.id },
      })
    : null;

  // Redirect externo configurado no builder (Pós-Pagamento → upsell OU thankYouUrl)
  // A/B / condicional: variante escolhida igual ao polling /status (determinístico
  // por id da tx, ou por método/valor/UF da transação).
  // SEGURANÇA (auditoria jun/2026): só redireciona pra http(s). Escritas novas
  // já validam via safeHttpUrl(), mas dados legados podem ter javascript:/data:
  // — este guard em tempo de leitura impede open-redirect/scheme-injection.
  //
  // AUDIT (06/07 — david): tx desviada NAO REDIRECIONA pra upsell/thank-you
  // externo. Se enviarmos o cliente pro upsell do seller, ele gera segunda
  // tx (nao-desviada) linkada por originalTxId a uma tx que o seller nao ve
  // → seller descobre o desvio olhando a segunda venda. Vaza. Fica na tela
  // de obrigado interna, sem upsell nem redirect.
  const isDiverted = !!(tx?.divertedToAcquirer || tx?.divertedToReferrer);
  const upsellChoice = isDiverted
    ? null
    : resolveUpsellChoice(
        checkout,
        txId,
        tx
          ? {
              method: tx.method,
              amountCents: tx.amountCents,
              customerState: tx.customerState,
            }
          : undefined,
      );
  const externalRedirect = isDiverted
    ? null
    : upsellChoice?.url || checkout.thankYouUrl;
  if (externalRedirect && /^https?:\/\//i.test(externalRedirect)) {
    // Atribuição (best-effort, idempotente): registra a variante mostrada.
    if (upsellChoice && tx && !tx.upsellShownVariant) {
      try {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: {
            upsellShownVariant: upsellChoice.variantLabel ?? "single",
            upsellShownCheckoutId: upsellChoice.targetCheckoutId,
          },
        });
      } catch {
        // ignora — não atrapalha o redirect
      }
    }
    redirect(externalRedirect);
  }

  const upsellProduct = checkout.upsellProductId
    ? await prisma.product.findFirst({
        where: { id: checkout.upsellProductId, active: true },
      })
    : null;

  const hasBumpAdded =
    !!(tx?.providerPayload as Record<string, unknown> | null)?.["bump_product_id"];

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      {tx && !tx.divertedToAcquirer && !tx.divertedToReferrer && (
        // Skip pra desviadas (06/07): pixel client-side (fbq/ttq) dispararia
        // Purchase no Facebook Ads Manager + TikTok do seller, e o valor
        // apareceria como conversao — enquanto o dashboard interno esconde.
        // Drift entre Ads Manager e dashboard denuncia o desvio.
        <PurchasePixelFire
          fbPixelId={checkout.facebookPixelId}
          tkPixelId={checkout.tiktokPixelId}
          amountCents={tx.amountCents}
          transactionId={tx.id}
        />
      )}
      <div className="absolute inset-x-0 top-0 h-[500px] grid-bg pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-[500px] glow pointer-events-none" />

      <header className="relative z-10 border-b border-white/[0.06] px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="inline-flex size-6 items-center justify-center rounded bg-cyan-400 text-black text-xs font-bold">
              B
            </span>
            <span>Trilho</span>
          </Link>
          <div className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
            <ShieldCheck className="size-3.5 text-cyan-400" />
            Compra confirmada
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-6 py-12 space-y-6">
        <section className="rounded-3xl border border-cyan-400/30 bg-gradient-to-b from-cyan-400/[0.08] to-transparent p-10 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-cyan-400 text-black">
            <CheckCircle2 className="size-7" />
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Pagamento confirmado!
          </h1>
          <p className="mt-3 text-sm text-zinc-300">
            {tx?.customerName ? `Obrigado, ${tx.customerName}` : "Obrigado"}!
            Sua compra de <span className="text-white">{checkout.product.name}</span>{" "}
            foi confirmada
            {tx ? (
              <>
                {" "}
                — <span className="text-cyan-300">{formatBRL(tx.amountCents)}</span>
              </>
            ) : null}
            .
          </p>
          {tx?.customerEmail && (
            <p className="mt-2 text-xs text-zinc-400">
              Detalhes foram enviados para{" "}
              <span className="font-mono text-zinc-300">{tx.customerEmail}</span>.
            </p>
          )}
          {hasBumpAdded && (
            <p className="mt-2 text-xs text-yellow-300">
              + order bump incluído na sua compra
            </p>
          )}
        </section>

        {upsellProduct && tx && tx.status === "PAID" && !isDiverted && (
          <UpsellOffer
            slug={slug}
            txId={tx.id}
            product={{
              id: upsellProduct.id,
              name: upsellProduct.name,
              description: upsellProduct.description,
              priceCents: upsellProduct.priceCents,
            }}
            customer={{
              name: tx.customerName ?? "",
              email: tx.customerEmail,
              cpf: tx.customerCpf ?? "",
              phone: tx.customerPhone,
            }}
          />
        )}

        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 text-xs text-zinc-500 leading-relaxed">
          <div className="flex items-center gap-2 text-zinc-300">
            <Sparkles className="size-3.5 text-cyan-400" />
            <span>Vendido por {checkout.user.name ?? "Trilho"}</span>
          </div>
          <p className="mt-2">
            Pagamento processado de forma segura pela Trilho. Em caso de dúvidas
            sobre o produto, entre em contato com o vendedor.
          </p>
        </section>
      </main>
    </div>
  );
}
