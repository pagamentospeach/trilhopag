import type { ReactNode } from "react";
import { ArrowDownToLine, Check, Landmark, Lock } from "lucide-react";
import { Reveal } from "./reveal";

export function Product() {
  return (
    <section id="solucoes" className="scroll-mt-20 bg-mist py-24 sm:py-32">
      <div className="mx-auto flex max-w-6xl flex-col gap-24 px-6 sm:gap-32 sm:px-10">
        <ProductRow
          eyebrow="Pix"
          title="Pix que cai e já é seu."
          text="A confirmação chega em segundos e o saldo entra liberado, sem prazo de retenção. O que o cliente pagou hoje você já pode sacar hoje."
          visual={<PixVisual />}
        />
        <ProductRow
          reverse
          eyebrow="Checkout"
          title="Menos etapas. Mais vendas concluídas."
          text="Checkout próprio, hospedado e customizável, com order bump, upsell e recuperação de pagamento. Pix e cartão em uma tela só."
          visual={<CheckoutVisual />}
        />
        <ProductRow
          eyebrow="Operação"
          title="Você entende seu negócio de verdade."
          text="Receita, vendas, ticket médio e saques em um painel único. Saque automático ligado por padrão, direto para sua conta."
          visual={<DashboardVisual />}
        />
      </div>
    </section>
  );
}

function ProductRow({
  eyebrow,
  title,
  text,
  visual,
  reverse,
}: {
  eyebrow: string;
  title: string;
  text: string;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
      <Reveal className={reverse ? "lg:order-2" : undefined}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          {eyebrow}
        </p>
        <h3 className="mt-3 text-balance text-3xl font-semibold leading-[1.12] tracking-tight text-ink sm:text-4xl">
          {title}
        </h3>
        <p className="mt-4 max-w-md text-pretty text-[17px] leading-relaxed text-slate-500">
          {text}
        </p>
      </Reveal>
      <Reveal delay={0.08} className={reverse ? "lg:order-1" : undefined}>
        {visual}
      </Reveal>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_20px_50px_-32px_rgba(7,26,51,0.35)]">
      {children}
    </div>
  );
}

function PixVisual() {
  const steps = [
    { label: "Cobrança gerada", meta: "00:00" },
    { label: "Pagamento recebido", meta: "00:12" },
    { label: "Saldo liberado", meta: "00:12" },
  ];

  return (
    <Panel>
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-medium text-slate-500">Cobrança Pix</p>
        <p className="text-2xl font-semibold tracking-tight text-ink">
          R$ 349,00
        </p>
      </div>

      <ol className="mt-6 space-y-0">
        {steps.map((s, i) => (
          <li key={s.label} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-ink">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              {i < steps.length - 1 ? (
                <span className="w-px flex-1 bg-brand/35" />
              ) : null}
            </div>
            <div className={i < steps.length - 1 ? "pb-6" : ""}>
              <p className="text-[15px] font-medium leading-6 text-ink">
                {s.label}
              </p>
              <p className="font-mono text-[11px] text-slate-400">{s.meta}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-2 flex items-center gap-2 rounded-xl bg-mist px-4 py-3 text-[13px] text-slate-600">
        <ArrowDownToLine className="size-4 text-brand" />
        Disponível para saque imediato
      </div>
    </Panel>
  );
}

function CheckoutVisual() {
  return (
    <Panel>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-brand bg-brand/[0.07] px-3 py-2.5 text-center text-[13px] font-medium text-ink">
          Pix
        </div>
        <div className="rounded-xl border border-slate-200 px-3 py-2.5 text-center text-[13px] font-medium text-slate-400">
          Cartão
        </div>
      </div>

      <div className="mt-5 space-y-2.5">
        <MockField label="E-mail" value="cliente@email.com" />
        <MockField label="CPF" value="000.000.000-00" />
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-brand/50 bg-brand/[0.05] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border-2 border-brand bg-brand">
            <Check className="size-2.5 text-ink" strokeWidth={4} />
          </span>
          <div>
            <p className="text-[13px] font-medium text-ink">
              Adicione o bônus por R$ 47,00
            </p>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Order bump configurável por checkout
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-[13px] text-slate-500">Total</span>
        <span className="text-lg font-semibold tracking-tight text-ink">
          R$ 396,00
        </span>
      </div>

      <div className="mt-4 rounded-full bg-ink py-3 text-center text-[14px] font-medium text-white">
        Finalizar pagamento
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <Lock className="size-3" />
        Ambiente seguro Trilho Pag
      </p>
    </Panel>
  );
}

function MockField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3.5 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-[13px] text-slate-600">{value}</p>
    </div>
  );
}

function DashboardVisual() {
  const bars = [38, 52, 44, 67, 58, 81, 72];

  return (
    <Panel>
      <div className="grid grid-cols-3 gap-4">
        <Metric label="Receita" value="R$ 84.320" />
        <Metric label="Vendas" value="212" />
        <Metric label="Ticket médio" value="R$ 397" />
      </div>

      <div className="mt-7 flex h-32 items-end gap-2">
        {bars.map((h, i) => (
          <div
            key={i}
            style={{ height: `${h}%` }}
            className={`flex-1 rounded-t-md ${
              i === bars.length - 1 ? "bg-brand" : "bg-brand/25"
            }`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-400">
        <span>seg</span>
        <span>dom</span>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-mist text-ink">
            <Landmark className="size-4" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-[13px] font-medium text-ink">Saque automático</p>
            <p className="text-[11px] text-slate-400">Pix para sua conta</p>
          </div>
        </div>
        <span className="rounded-full bg-brand/15 px-2.5 py-1 text-[11px] font-medium text-ink">
          Ativo
        </span>
      </div>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-ink">
        {value}
      </p>
    </div>
  );
}
