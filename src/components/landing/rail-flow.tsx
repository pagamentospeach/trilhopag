import { Fragment } from "react";
import { BarChart3, Banknote, ShoppingBag, User, Zap } from "lucide-react";
import { Reveal, SectionHeading } from "./reveal";

const NODES = [
  { icon: User, label: "Cliente", note: "Chega pela sua campanha" },
  { icon: ShoppingBag, label: "Checkout", note: "Pix ou cartão" },
  { icon: Zap, label: "Trilho", note: "Processa e valida", highlight: true },
  { icon: Banknote, label: "Pagamento", note: "Confirmado e liberado" },
  { icon: BarChart3, label: "Dados e saque", note: "Tracking e conta" },
];

export function RailFlow() {
  return (
    <section className="border-t border-slate-100 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <SectionHeading
          align="center"
          eyebrow="O trilho"
          title="Uma infraestrutura construída para negócios digitais."
          description="Da primeira visita ao dinheiro na sua conta, o caminho é um só — e você enxerga cada etapa dele."
        />

        <Reveal delay={0.1} className="mt-16">
          {/* Desktop: linha contínua horizontal. Mobile: a mesma linha, vertical. */}
          <ol className="flex flex-col items-start gap-0 md:flex-row md:items-start">
            {NODES.map((n, i) => (
              <Fragment key={n.label}>
                <li className="flex shrink-0 flex-row items-center gap-4 md:w-32 md:flex-col md:gap-3 md:text-center">
                  <span
                    className={`flex size-12 shrink-0 items-center justify-center rounded-full border ${
                      n.highlight
                        ? "border-brand bg-brand text-ink"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    <n.icon className="size-5" strokeWidth={1.6} />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold tracking-tight text-ink">
                      {n.label}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug text-slate-500">
                      {n.note}
                    </p>
                  </div>
                </li>
                {i < NODES.length - 1 ? (
                  <li
                    aria-hidden
                    className="ml-6 h-8 w-px bg-gradient-to-b from-brand/50 to-brand/50 md:ml-0 md:mt-6 md:h-px md:w-auto md:flex-1 md:bg-gradient-to-r"
                  />
                ) : null}
              </Fragment>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
