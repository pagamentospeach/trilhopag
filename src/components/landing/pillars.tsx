import { CreditCard, GitFork, LineChart, MousePointerClick } from "lucide-react";
import { Reveal, SectionHeading } from "./reveal";

const PILLARS = [
  {
    icon: CreditCard,
    title: "Pagamentos",
    text: "Pix, cartão e recorrência com liberação do Pix na hora.",
  },
  {
    icon: MousePointerClick,
    title: "Conversão",
    text: "Checkout próprio, order bump, upsell e recuperação de venda.",
  },
  {
    icon: GitFork,
    title: "Infraestrutura",
    text: "API, webhooks assinados, split e área de membros.",
  },
  {
    icon: LineChart,
    title: "Inteligência",
    text: "Tracking server-side, métricas e relatórios da operação.",
  },
];

export function Pillars() {
  return (
    <section id="produto" className="scroll-mt-20 border-t border-slate-100 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <SectionHeading
          title={
            <>
              Tudo o que você precisa para
              <br className="hidden sm:block" /> movimentar seus pagamentos.
            </>
          }
        />

        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06}>
              <p.icon className="size-6 text-brand" strokeWidth={1.5} />
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink">
                {p.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
                {p.text}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
