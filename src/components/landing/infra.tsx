import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  GitFork,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { Reveal, SectionHeading } from "./reveal";

const CAPABILITIES = [
  {
    icon: Webhook,
    title: "Webhooks assinados",
    text: "HMAC-SHA256 com reentrega automática em caso de falha.",
  },
  {
    icon: RefreshCw,
    title: "Recorrência",
    text: "Assinaturas com cobrança semanal, mensal, trimestral ou anual.",
  },
  {
    icon: GitFork,
    title: "Split",
    text: "Divisão por valor fixo ou percentual entre contas Trilho.",
  },
  {
    icon: BarChart3,
    title: "Tracking server-side",
    text: "Meta CAPI, TikTok, Google Ads, GA4 e Kwai direto do servidor.",
  },
  {
    icon: PlayCircle,
    title: "Área de membros",
    text: "Entrega do conteúdo e acesso liberado após a confirmação.",
  },
  {
    icon: ShieldCheck,
    title: "Proteção antibot",
    text: "Bloqueio de tráfego automatizado e IP de datacenter no checkout.",
  },
];

const SNIPPET = `curl -X POST https://trilhopag.com/api/v1/transactions \\
  -H "Authorization: Bearer tp_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount_cents": 125990,
    "method": "pix",
    "product_id": "prd_...",
    "customer": { "email": "cliente@email.com" }
  }'`;

export function Infra() {
  return (
    <section
      id="desenvolvedores"
      className="scroll-mt-20 border-t border-slate-100 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <SectionHeading
          eyebrow="Desenvolvedores"
          title="Infraestrutura que trabalha nos bastidores."
          description="API REST documentada, chaves por ambiente e eventos assinados. Integre o Trilho ao que você já tem."
        />

        <div className="mt-14 grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* min-w-0: sem isso a coluna do grid e dimensionada pelo max-content
           *  do <pre> e empurra a secao inteira pra fora da tela no mobile. */}
          <Reveal className="min-w-0">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-ink">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-brand/70" />
                <span className="ml-2 font-mono text-[11px] text-white/40">
                  POST /v1/transactions
                </span>
              </div>
              <pre className="overflow-x-auto px-5 py-5 font-mono text-[12px] leading-relaxed text-white/80">
                <code>{SNIPPET}</code>
              </pre>
            </div>
            <Link
              href="/docs"
              className="group mt-5 inline-flex items-center gap-1.5 text-[15px] font-medium text-ink"
            >
              Ver a documentação
              <ArrowRight className="size-4 text-brand transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>

          <div className="grid min-w-0 gap-x-8 gap-y-9 sm:grid-cols-2">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.title} delay={i * 0.05}>
                <c.icon className="size-5 text-brand" strokeWidth={1.5} />
                <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-ink">
                  {c.title}
                </h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
                  {c.text}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
