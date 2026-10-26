export const metadata = {
  title: "Política de Privacidade — Trilho Pagamentos",
  description: "Como tratamos seus dados na plataforma Trilho Pagamentos.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-zinc-200">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        Política de Privacidade
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Última atualização: 24 de maio de 2026
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-white">1. Quem somos</h2>
          <p className="mt-2">
            Trilho Pagamentos é um gateway de pagamentos operado em
            <strong> trilhopag.com</strong>. Este documento descreve como
            coletamos, usamos e protegemos seus dados pessoais e os dados dos
            seus clientes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">
            2. Dados que coletamos
          </h2>
          <p className="mt-2">
            <strong>Do seller:</strong> nome, email, CPF/CNPJ, telefone, dados
            bancários, documentos de identidade (KYC), tokens de integração
            (Meta Ads, TikTok, Google, etc.) sempre criptografados em repouso.
          </p>
          <p className="mt-2">
            <strong>Do cliente final (comprador):</strong> nome, email, CPF,
            telefone, endereço (quando produto físico), IP de origem, UTMs da
            campanha que originou a venda.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">3. Como usamos</h2>
          <ul className="mt-2 list-disc pl-6 space-y-1">
            <li>Processar transações via PSPs (SafePix e outros).</li>
            <li>Calcular taxas, repasses e relatórios fiscais.</li>
            <li>
              Quando você conectar contas de anúncio (Meta, Google, TikTok,
              Kwai), usamos os tokens estritamente pra ler campanhas/insights e
              executar ações que você autorizar (pausar, ativar, ajustar
              orçamento).
            </li>
            <li>
              Não compartilhamos seus dados com terceiros além dos PSPs e
              plataformas necessárias pra prestação do serviço.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">
            4. Segurança dos tokens
          </h2>
          <p className="mt-2">
            Tokens OAuth de plataformas de anúncio são criptografados em
            repouso usando AES-256-GCM. Você pode revogar o acesso a qualquer
            momento em <code>Tracking → Integrações → Desconectar</code> ou
            diretamente no painel da plataforma (Meta Business Settings, etc).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">5. LGPD</h2>
          <p className="mt-2">
            Em conformidade com a Lei Geral de Proteção de Dados (LGPD), você
            pode solicitar acesso, correção ou exclusão dos seus dados em
            qualquer momento entrando em contato pelo email{" "}
            <a
              href="mailto:privacidade@trilhopag.com"
              className="text-cyan-400 underline"
            >
              privacidade@trilhopag.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">
            6. Política de cookies
          </h2>
          <p className="mt-2">
            Usamos cookies essenciais (sessão, autenticação, anti-CSRF) e
            cookies de personalização (preferências de tema). Não usamos
            cookies de terceiros pra publicidade.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">7. Contato</h2>
          <p className="mt-2">
            Dúvidas sobre esta política:{" "}
            <a
              href="mailto:privacidade@trilhopag.com"
              className="text-cyan-400 underline"
            >
              privacidade@trilhopag.com
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
