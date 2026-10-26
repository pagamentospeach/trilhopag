import { Reveal, SectionHeading } from "./reveal";

const STEPS = [
  {
    n: "01",
    title: "Crie sua conta",
    text: "Cadastro em poucos minutos, sem mensalidade nem taxa de setup.",
  },
  {
    n: "02",
    title: "Configure seu produto",
    text: "Cadastre a oferta e personalize o checkout do seu jeito.",
  },
  {
    n: "03",
    title: "Comece a vender",
    text: "Compartilhe o link ou integre pela API e acompanhe tudo no painel.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-t border-slate-100 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <SectionHeading title="Começar é simples." />

        <div className="relative mt-14">
          {/* Trilho ligando os passos: horizontal no desktop, vertical no mobile. */}
          <div
            aria-hidden
            className="absolute left-[15px] top-4 bottom-4 w-px bg-brand/30 md:inset-x-0 md:left-0 md:bottom-auto md:top-[15px] md:h-px md:w-auto"
          />
          <ol className="relative grid gap-10 md:grid-cols-3 md:gap-12">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08}>
                <li className="flex gap-5 md:block">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-brand bg-white font-mono text-[11px] font-semibold text-ink">
                    {s.n}
                  </span>
                  <div className="md:mt-5">
                    <h3 className="text-lg font-semibold tracking-tight text-ink">
                      {s.title}
                    </h3>
                    <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-slate-500">
                      {s.text}
                    </p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
