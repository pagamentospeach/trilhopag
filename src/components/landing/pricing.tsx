import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal, SectionHeading } from "./reveal";

/** Valores reais dos defaults do schema (User.feePercent / cardFeePercent /
 *  holdMinutes*) e de lib/fees.ts. Se mudarem lá, mudam aqui. */
const RATES = [
  {
    method: "Pix",
    fee: "6,99% + R$ 2,00",
    settlement: "Liberado na hora",
  },
  {
    method: "Cartão de crédito",
    fee: "9,90% + R$ 3,60",
    settlement: "Em 30 dias, com reserva de 10% por 90 dias",
  },
];

const CONDITIONS = [
  ["Mensalidade", "R$ 0,00"],
  ["Taxa de setup", "R$ 0,00"],
  ["Taxa de saque", "R$ 10,00"],
  ["Saque mínimo", "R$ 50,00"],
];

export function Pricing() {
  return (
    <section id="precos" className="scroll-mt-20 bg-mist py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <SectionHeading
          eyebrow="Preços"
          title="Taxas simples. Sem surpresas."
          description="Você paga por venda aprovada. Sem mensalidade, sem contrato de fidelidade e sem taxa escondida."
        />

        <Reveal delay={0.08} className="mt-12">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <dl className="divide-y divide-slate-100">
              {RATES.map((r) => (
                <div
                  key={r.method}
                  className="flex flex-col gap-1 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-8"
                >
                  <dt className="text-[17px] font-semibold tracking-tight text-ink">
                    {r.method}
                  </dt>
                  <dd className="flex flex-col sm:items-end">
                    <span className="text-[17px] font-medium text-ink">
                      {r.fee}
                    </span>
                    <span className="text-[13px] text-slate-500">
                      {r.settlement}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-slate-100 bg-mist/60 px-6 py-6 sm:grid-cols-4 sm:px-8">
              {CONDITIONS.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[12px] uppercase tracking-wider text-slate-400">
                    {label}
                  </dt>
                  <dd className="mt-1 text-[15px] font-medium text-ink">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>

        <Reveal delay={0.14} className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link
            href="/signup"
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-white transition hover:bg-ink/90"
          >
            Começar agora
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <p className="text-[13px] leading-relaxed text-slate-500">
            Taxas padrão para novas contas. Volumes maiores podem ter condições
            específicas — fale com a gente.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
