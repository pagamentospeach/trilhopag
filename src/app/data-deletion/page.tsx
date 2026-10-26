export const metadata = {
  title: "Exclusão de dados — Trilho Pagamentos",
  description:
    "Como solicitar a exclusão dos seus dados na plataforma Trilho Pagamentos.",
};

export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-zinc-200">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        Exclusão de dados do usuário
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Última atualização: 16 de julho de 2026
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white">
            1. Como pedir a exclusão dos seus dados
          </h2>
          <p className="mt-2">
            Se você conectou sua conta do Facebook (Meta), TikTok, Google ou
            Kwai ao Trilho e quer que a gente <strong>apague todos os
            dados</strong> associados à sua conta, siga um dos caminhos abaixo.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">
            2. Pela sua conta Trilho (recomendado)
          </h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>
              Entre em{" "}
              <a
                href="https://trilhopag.com/login"
                className="text-cyan-400 hover:text-cyan-300"
              >
                trilhopag.com/login
              </a>
            </li>
            <li>
              Vá em <strong>Dashboard → Tracking → Contas de anúncio</strong>
            </li>
            <li>
              Clique em <strong>Desconectar</strong> ao lado da conta Meta /
              TikTok / Google / Kwai que você quer remover
            </li>
            <li>
              A desconexão apaga <strong>imediatamente</strong> o access token,
              o vínculo com a conta de anúncio, campanhas sincronizadas e
              histórico de insights.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">
            3. Pedido de exclusão total da conta
          </h2>
          <p className="mt-2">
            Se você quer <strong>apagar toda a sua conta Trilho</strong>
            (incluindo dados de vendas, saques, produtos e integrações), envie
            um email para{" "}
            <a
              href="mailto:privacidade@trilhopag.com"
              className="text-cyan-400 hover:text-cyan-300"
            >
              privacidade@trilhopag.com
            </a>{" "}
            com:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Assunto: <strong>Exclusão de dados</strong></li>
            <li>Email cadastrado na sua conta Trilho</li>
            <li>Confirmação de que quer a remoção completa</li>
          </ul>
          <p className="mt-2 text-zinc-400">
            Respondemos em até <strong>48h úteis</strong>. A exclusão é
            executada em até <strong>7 dias</strong> após confirmação (prazo
            regulamentar). Dados fiscais/financeiros exigidos por lei ficam
            arquivados pelo período legal antes da eliminação definitiva.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">
            4. O que é apagado
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Access tokens do Meta / TikTok / Google / Kwai</li>
            <li>Vínculo com contas de anúncio (BM/Business Center)</li>
            <li>Campanhas, adgroups e ads sincronizados</li>
            <li>Insights de performance</li>
            <li>Pixels de tracking configurados</li>
            <li>Dados de cliente coletados via checkout (email, telefone, CPF)</li>
            <li>Histórico de transações (após período legal exigido pela CVM)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">
            5. Direitos LGPD
          </h2>
          <p className="mt-2">
            Além da exclusão, você tem direito a{" "}
            <strong>acessar, corrigir, portar e revogar consentimento</strong>{" "}
            dos seus dados. Consulte nossa{" "}
            <a
              href="/privacy"
              className="text-cyan-400 hover:text-cyan-300"
            >
              Política de Privacidade
            </a>{" "}
            pro detalhamento completo.
          </p>
        </section>
      </div>
    </main>
  );
}
