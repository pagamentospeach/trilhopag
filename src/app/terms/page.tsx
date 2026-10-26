export const metadata = {
  title: "Termos de Uso — Trilho Pagamentos",
  description: "Termos e condições de uso da plataforma Trilho Pagamentos.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-zinc-200">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        Termos de Uso
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Última atualização: 24 de maio de 2026
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white">
            1. Aceitação dos termos
          </h2>
          <p className="mt-2">
            Ao criar conta no Trilho (trilhopag.com) você concorda com
            estes termos. Caso não concorde, encerre o uso e exclua sua conta.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">2. O serviço</h2>
          <p className="mt-2">
            Trilho Pagamentos é um gateway de pagamentos brasileiro focado em PIX, com
            ferramentas de checkout, rastreamento de UTMs, integração com
            plataformas de anúncio e gerenciamento de campanhas.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">
            3. Responsabilidade do seller
          </h2>
          <ul className="mt-2 list-disc pl-6 space-y-1">
            <li>
              Você é responsável pelos produtos/serviços que vende e pelo
              cumprimento da legislação aplicável (PROCON, tributos, etc).
            </li>
            <li>
              Não é permitido vender produtos ilegais, falsificados ou
              proibidos por bandeiras de cartão / PIX.
            </li>
            <li>
              Você é responsável pelo conteúdo das suas campanhas de anúncio e
              pelo cumprimento das políticas das plataformas (Meta, TikTok,
              Google).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">
            4. Taxas e repasses
          </h2>
          <p className="mt-2">
            As taxas vigentes são informadas no painel do seller. Pagamentos
            confirmados são creditados no seu saldo conforme prazo do PSP
            (geralmente D+0 a D+2 pra PIX).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">
            5. Integrações com terceiros
          </h2>
          <p className="mt-2">
            Ao conectar contas de plataformas externas (Meta Ads, TikTok,
            Google), você autoriza o Trilho a ler dados e executar ações que
            você explicitamente solicitar (pausar, ativar, ajustar orçamentos)
            via API delas. Você pode revogar o acesso a qualquer momento.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">
            6. Suspensão e encerramento
          </h2>
          <p className="mt-2">
            Reservamo-nos o direito de suspender contas envolvidas em
            atividades fraudulentas, chargebacks excessivos ou violação destes
            termos. Você pode encerrar sua conta a qualquer momento.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">7. Limitação</h2>
          <p className="mt-2">
            O Trilho é fornecido &ldquo;como está&rdquo;. Não nos
            responsabilizamos por perdas indiretas decorrentes de indisponibilidade
            de PSPs ou plataformas terceiras integradas.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">8. Contato</h2>
          <p className="mt-2">
            <a
              href="mailto:juridico@trilhopag.com"
              className="text-cyan-400 underline"
            >
              juridico@trilhopag.com
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
