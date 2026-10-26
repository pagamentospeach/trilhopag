import { Users, Wallet, Link2, Gift } from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getReferralUrl } from "@/lib/referral";
import { formatBRL } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-kit";
import { CopiarLink } from "./copiar-link";

/**
 * INDIQUE E GANHE — 10/08/2026 (davi): "Apaga a aba de minha rede e vamos
 * adicionar uma aba de indique e ganhe 1% - mais simples!".
 *
 * A /dashboard/rede era um console: taxa por indicado, taxa em massa, desvio,
 * defaults de link por modo, filtro de periodo. Treze arquivos pra uma tela
 * que o seller comum abria pra fazer UMA coisa — pegar o link.
 *
 * Aqui sobrou o que ele realmente usa: o link, quantos entraram por ele,
 * quanto ja rendeu. As tres consultas sao contagem e soma, nada por linha.
 *
 * ⚠️ NAO EXISTE BOTAO DE CONFIGURAR NADA. Quem ajusta taxa de indicado agora
 * e o admin, em /admin01/users (o editor foi pra la junto com as actions).
 * Era isso ou manter meia dúzia de modais que o seller nunca abria.
 */
export const dynamic = "force-dynamic";

export default async function IndiqueEGanhe() {
  const userId = await requireUserId();

  const [url, indicados, eu] = await Promise.all([
    getReferralUrl(userId),
    prisma.user.count({ where: { referredByUserId: userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { referralEarningsCents: true },
    }),
  ]);

  const ganho = eu?.referralEarningsCents ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        Icon={Gift}
        titulo="Indique e ganhe"
        descricao="Compartilhe seu link. Quem criar conta por ele fica vinculado a você, e você passa a ganhar sobre o que essa pessoa vender."
      />

      <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">
          <Link2 className="size-3.5" /> Seu link
        </p>
        <CopiarLink url={url} />
        <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-400">
          O vínculo acontece no cadastro. Quem já tem conta na Trilho não entra
          na sua indicação, mesmo abrindo o link.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            <Users className="size-3.5" /> Indicados
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-white">
            {indicados}
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            {indicados === 0
              ? "Ninguém entrou pelo seu link ainda."
              : indicados === 1
                ? "1 conta criada pelo seu link."
                : `${indicados} contas criadas pelo seu link.`}
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            <Wallet className="size-3.5" /> Já rendeu
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-white">
            {formatBRL(ganho)}
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            Acumulado desde sempre. Cai no seu saldo junto com as vendas.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h2 className="text-sm font-medium text-white">Como funciona</h2>
        <ol className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-zinc-400">
          <li className="flex gap-2.5">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-zinc-300">
              1
            </span>
            Você manda o link para quem vai vender na Trilho.
          </li>
          <li className="flex gap-2.5">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-zinc-300">
              2
            </span>
            A pessoa cria a conta por ele e fica vinculada a você para sempre.
          </li>
          <li className="flex gap-2.5">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-zinc-300">
              3
            </span>
            A cada venda aprovada dela, sua parte entra direto no seu saldo. Não
            precisa resgatar nem pedir nada.
          </li>
        </ol>
      </section>
    </div>
  );
}
