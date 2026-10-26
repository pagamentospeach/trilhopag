import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

/**
 * 22/07/2026 (davi: "todos os checkouts ficam com o logo e o nome da trilhopag
 * nas paginas do navegador, deixa a imagem do produto e o nome do produto"):
 * o root layout definia title=Trilho + icons=logo Trilho, então TODO
 * checkout público vazava a marca do gateway na aba do browser (título e
 * favicon). Aqui sobrescrevemos por produto — tag no navegador vira o nome
 * do produto do seller + a imagem dele como favicon.
 *
 * Notas:
 *  - `title.absolute` NÃO aplica o template "%s · Trilho" do root
 *  - `icons.icon` explícito ganha da convenção `src/app/icon.png`
 *  - `applicationName` sobrescreve pra impedir "adicionar à tela inicial"
 *    mostrar "Trilho"
 *  - `robots: noindex, nofollow` — checkout não deve ser indexado
 *  - Best-effort: se falhar buscar o produto, mantém o default do root
 *    (o page.tsx dá 404 nesse caso mesmo)
 */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const checkout = await prisma.checkout
    .findUnique({
      where: { slug },
      select: {
        product: { select: { name: true, image: true } },
      },
    })
    .catch(() => null);

  if (!checkout?.product) {
    // Fallback silencioso — deixa o root layout mandar. Page dá 404 mesmo.
    return {
      robots: { index: false, follow: false },
    };
  }

  const name = checkout.product.name.trim() || "Pagamento";
  const image = checkout.product.image ?? null;

  return {
    // absolute = não aplica o template "%s · Trilho" do root
    title: { absolute: name },
    applicationName: name,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: name,
    },
    robots: { index: false, follow: false },
    // Sobrescreve as icon.png/apple-icon.png do App Router com a imagem do
    // produto. Browser cacheia por origem — cada URL de checkout tem seu
    // próprio favicon.
    ...(image
      ? {
          icons: {
            icon: image,
            shortcut: image,
            apple: image,
          },
        }
      : {}),
    openGraph: {
      title: name,
      images: image
        ? [{ url: image, width: 1200, height: 630, alt: name }]
        : undefined,
      type: "website",
      // Não vaza "siteName: Trilho" — quem receber o link vê só o produto
      siteName: name,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: name,
      images: image ? [image] : undefined,
    },
  };
}

/**
 * Layout específico do checkout público.
 *
 * Otimizações de performance:
 * - <link rel="dns-prefetch"> e <preconnect> pra endpoints que serão chamados
 * - viaCEP, mídia (imagens do produto), e PIX provider
 * - Sem JS de tracking aqui (cada checkout injeta o seu próprio)
 */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* DNS prefetch + preconnect — economiza ~150ms no primeiro fetch */}
      <link rel="dns-prefetch" href="https://viacep.com.br" />
      <link rel="preconnect" href="https://viacep.com.br" crossOrigin="anonymous" />
      {children}
    </>
  );
}
