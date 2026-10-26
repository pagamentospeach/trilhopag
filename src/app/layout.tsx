import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://trilhopag.com"),
  title: {
    default: "Trilho Pagamentos — O gateway de pagamentos completo",
    template: "%s · Trilho",
  },
  description:
    "Pix, cartão, tracking nativo, IA integrada e player de vídeo. Tudo em um único gateway, sem amarras.",
  manifest: "/manifest.json",
  applicationName: "Trilho Pagamentos",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Trilho",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  // Favicon/ícones vêm das convenções de arquivo do App Router:
  // src/app/icon.png (256x256) e src/app/apple-icon.png (180x180), gerados a
  // partir do logo da Trilho. Antes existia um src/app/favicon.ico do scaffold
  // do create-next-app (logo da Vercel) que o navegador usava na aba — ele foi
  // removido. Sem bloco `icons` manual aqui pra não duplicar links nem carregar
  // o PNG de 1MB como ícone.
  openGraph: {
    title: "Trilho Pagamentos — O gateway de pagamentos completo",
    description:
      "Pix, cartão, tracking nativo, IA integrada e player de vídeo. Tudo em um.",
    url: "https://trilhopag.com",
    siteName: "Trilho Pagamentos",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/trilhopag-logo.png",
        width: 1200,
        height: 630,
        alt: "Trilho Pagamentos",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Trilho",
    description: "O gateway de pagamentos completo.",
    images: ["/trilhopag-logo.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-zinc-100">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
