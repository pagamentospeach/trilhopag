import { LandingNav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { Pillars } from "@/components/landing/pillars";
import { Product } from "@/components/landing/product";
import { RailFlow } from "@/components/landing/rail-flow";
import { Infra } from "@/components/landing/infra";
import { Pricing } from "@/components/landing/pricing";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FAQ } from "@/components/landing/faq";
import { CTAFinal } from "@/components/landing/cta-final";
import { LandingFooter } from "@/components/landing/footer";

export const metadata = {
  title: "Trilho Pagamentos — Infraestrutura de pagamentos para o seu negócio",
  description:
    "Pix, cartão, checkout próprio, recorrência, split e API. Pix liberado na hora, sem mensalidade.",
  alternates: { canonical: "https://trilhopag.com/" },
  openGraph: {
    title: "Trilho Pagamentos — O trilho que move seus pagamentos",
    description:
      "Pix, cartão, checkout próprio, recorrência, split e API. Pix liberado na hora, sem mensalidade.",
    type: "website",
    url: "https://trilhopag.com/",
  },
};

export default function Home() {
  return (
    // Tema claro escopado na landing: o <body> do layout e escuro e vale pro
    // dashboard/checkout, entao a inversao mora aqui e nao no root.
    <div className="relative isolate flex flex-1 flex-col overflow-x-clip bg-white text-ink">
      <LandingNav />
      <main className="relative">
        <Hero />
        <Pillars />
        <Product />
        <RailFlow />
        <Infra />
        <Pricing />
        <HowItWorks />
        <FAQ />
        <CTAFinal />
      </main>
      <LandingFooter />
    </div>
  );
}
