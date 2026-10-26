import Link from "next/link";
import {
  ArrowRight,
  Webhook,
  MessageCircle,
  BarChart3,
  Target,
  KeyRound,
  Activity,
  Send,
  Bot,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

export default async function IntegracoesPage() {
  const userId = await requireUserId();
  // 17/07/2026 (davi): API Keys foi movida de aba própria pra tile aqui.
  // Conta chaves ativas (revokedAt = null) pra mostrar status.
  const [
    webhookCount,
    whatsapp,
    utmify,
    pixelCount,
    activeApiKeyCount,
    salesChannelCount,
    botCount,
  ] = await Promise.all([
    prisma.webhook.count({ where: { userId } }),
    prisma.whatsappConfig.findUnique({ where: { userId }, select: { id: true } }),
    prisma.utmifyConfig.findUnique({
      where: { userId },
      select: { id: true, active: true },
    }),
    prisma.trackingPixel.count({
      where: {
        userId,
        productId: null,
        platform: { in: ["FACEBOOK", "TIKTOK"] },
      },
    }),
    prisma.apiKey.count({
      where: { userId, revokedAt: null },
    }),
    // 01/08/2026 (davi): canal de vendas no Telegram.
    prisma.salesChannel.count({ where: { userId, active: true } }),
    // 09/08/2026: bots de funil. Só telegram — o runtime recusa outros tipos,
    // então contar discord aqui inflaria um número que não opera.
    prisma.saleBot.count({ where: { userId, type: "telegram" } }),
  ]);

  // 29/07/2026 (davi 'deixa a aba de integracoes mais bonita, tipo essa do
  // print mas com o nosso estilo'): redesign inspirado no marketplace de
  // conectores do Bananafy — cards grandes com icone colorido, badge de
  // provider, botao de acao explicito e footer com contador de instancias.
  // Paleta trocada de amarelo (Bananafy) pra cyan-400 (Trilho).
  //
  // Cada integracao ganha uma cor propria pra rastreio visual rapido:
  //   API Keys → ciano  (cor primaria da plataforma)
  //   Webhooks → sky   (transporte/eventos)
  //   Pixel    → violet(Meta/TikTok marketing)
  //   UTMify   → amber (analytics)
  //   WhatsApp → emerald (cor da propria marca)
  //
  // `active` decide o estilo do footer: card vazio fica "Nenhuma instalacao
  // ainda" cinza; card com pelo menos 1 config vira badge ciano piscante pra
  // sinalizar que ta operando.
  /**
   * 09/08/2026, seção 14: "Criar uma central de integrações. Categorias:
   * plataformas, ferramentas, automação, CRM, bots, APIs."
   *
   * Eram 6 tiles num grid plano, misturando chave de API com pixel de
   * rastreamento e canal do Telegram. As categorias abaixo são as que
   * DESCREVEM o que existe aqui — não copiei a lista do prompt à risca porque
   * metade dela (CRM, plataformas) não tem nenhum tile pra abrigar, e seção
   * vazia é pior que ausência de seção.
   */
  type Categoria = "Desenvolvedores" | "Rastreamento" | "Canais" | "Bots";

  type Tile = {
    categoria: Categoria;
    href: string;
    icon: typeof Webhook;
    title: string;
    provider: string;
    desc: string;
    accent: {
      bg: string; // fundo do quadrado do icone
      fg: string; // cor do icone
    };
    status: { label: string; active: boolean };
  };

  const tiles: Tile[] = [
    {
      categoria: "Desenvolvedores",
      href: "/dashboard/api-keys",
      icon: KeyRound,
      title: "API Keys",
      provider: "Trilho · Grátis pra usar",
      desc: "Chaves de integração pra usar a API v1 no seu backend.",
      accent: { bg: "bg-cyan-400/10", fg: "text-cyan-300" },
      status: {
        label:
          activeApiKeyCount > 0
            ? `${activeApiKeyCount} chave${activeApiKeyCount > 1 ? "s" : ""} ativa${activeApiKeyCount > 1 ? "s" : ""}`
            : "Nenhuma instalação ainda",
        active: activeApiKeyCount > 0,
      },
    },
    {
      categoria: "Desenvolvedores",
      href: "/dashboard/integracoes/webhooks",
      icon: Webhook,
      title: "Webhooks",
      provider: "Trilho · Grátis pra usar",
      desc: "Receba eventos de transações no seu servidor em tempo real.",
      accent: { bg: "bg-sky-400/10", fg: "text-sky-300" },
      status: {
        label:
          webhookCount > 0
            ? `${webhookCount} webhook${webhookCount > 1 ? "s" : ""} configurado${webhookCount > 1 ? "s" : ""}`
            : "Nenhuma instalação ainda",
        active: webhookCount > 0,
      },
    },
    {
      categoria: "Rastreamento",
      href: "/dashboard/integracoes/pixel",
      icon: Target,
      title: "Pixel Facebook / TikTok",
      provider: "Meta + TikTok · Grátis pra usar",
      desc: "Envia o evento de compra de todas as vendas pro seu Pixel (CAPI).",
      accent: { bg: "bg-violet-400/10", fg: "text-violet-300" },
      status: {
        label:
          pixelCount > 0
            ? `${pixelCount} pixel${pixelCount > 1 ? "s" : ""} conectado${pixelCount > 1 ? "s" : ""}`
            : "Nenhuma instalação ainda",
        active: pixelCount > 0,
      },
    },
    {
      categoria: "Rastreamento",
      href: "/dashboard/integracoes/utmify",
      icon: BarChart3,
      title: "UTMify",
      provider: "UTMify · Grátis pra usar",
      desc: "Envia vendas com UTMs pra sua conta UTMify, por produto.",
      accent: { bg: "bg-amber-400/10", fg: "text-amber-300" },
      status: {
        label: utmify
          ? utmify.active
            ? "Integração ativa"
            : "Configurado (pausado)"
          : "Nenhuma instalação ainda",
        active: !!utmify && utmify.active,
      },
    },
    {
      categoria: "Canais",
      href: "/dashboard/integracoes/canal-vendas",
      icon: Send,
      title: "Canal de vendas (Telegram)",
      provider: "Telegram · Grátis pra usar",
      desc: "Cada venda aprovada vira uma mensagem no seu canal do Telegram.",
      accent: { bg: "bg-cyan-400/10", fg: "text-cyan-300" },
      status: {
        label:
          salesChannelCount > 0
            ? `${salesChannelCount} canal${salesChannelCount > 1 ? "is" : ""} ativo${salesChannelCount > 1 ? "s" : ""}`
            : "Nenhuma instalação ainda",
        active: salesChannelCount > 0,
      },
    },
    {
      categoria: "Canais",
      href: "/dashboard/integracoes/whatsapp",
      icon: MessageCircle,
      title: "WhatsApp",
      provider: "Meta Cloud API · Grátis pra usar",
      desc: "Recuperação de carrinho abandonado via Meta Cloud API.",
      accent: { bg: "bg-emerald-400/10", fg: "text-emerald-300" },
      status: {
        label: whatsapp ? "Conta conectada" : "Nenhuma instalação ainda",
        active: !!whatsapp,
      },
    },
    {
      // 09/08/2026: os bots viviam SÓ no topo da página de Produtos, que é
      // onde a seção 14 diz explicitamente que eles não devem estar. A rota
      // /dashboard/bots já existia e não era listada em lugar nenhum.
      //
      // ⚠️ Só TELEGRAM. O bot de notificação de venda foi removido em
      // 21/07/2026 (davi: 0.7% de cobertura, 66% de falha no Telegram e
      // 0/16 no Discord), e o que sobrou é o bot INTERATIVO de funil — que o
      // runtime aceita apenas em Telegram (`bot-funnel-runtime.ts:2294`
      // recusa qualquer outro tipo). Anunciar Discord aqui seria oferecer
      // algo que nenhum caminho de código executa.
      categoria: "Bots",
      href: "/dashboard/bots",
      icon: Bot,
      title: "Bot de funil (Telegram)",
      provider: "Telegram · Grátis pra usar",
      desc: "Conversa automática no Telegram que leva o lead até a compra.",
      accent: { bg: "bg-sky-400/10", fg: "text-sky-300" },
      status: {
        label:
          botCount > 0
            ? `${botCount} bot${botCount > 1 ? "s" : ""} configurado${botCount > 1 ? "s" : ""}`
            : "Nenhuma instalação ainda",
        active: botCount > 0,
      },
    },
  ];

  const CATEGORIAS: Categoria[] = [
    "Desenvolvedores",
    "Rastreamento",
    "Canais",
    "Bots",
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header em 2 niveis — small-cap kicker + titulo bold grande. Mesma
          hierarquia do print de referencia mas com nossa tipografia. */}
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
          Conexões
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Integrações
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          API keys, webhooks e integrações externas que conversam com a sua
          conta.
        </p>
      </header>

      {CATEGORIAS.map((cat) => {
        const daCategoria = tiles.filter((t) => t.categoria === cat);
        // Categoria sem tile simplesmente não aparece — cabeçalho solto
        // anunciando vazio é ruído.
        if (daCategoria.length === 0) return null;
        return (
          <section key={cat}>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {cat}
            </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {daCategoria.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.title}
              href={t.href}
              className="group relative flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition hover:border-cyan-400/40 hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 sm:p-6"
            >
              {/* Linha topo: icone + titulo + botao acao */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <span
                    className={`inline-flex size-12 shrink-0 items-center justify-center rounded-xl ${t.accent.bg} ${t.accent.fg}`}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-white sm:text-lg">
                      {t.title}
                    </h2>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                      <span
                        className={`inline-flex size-1.5 rounded-full ${
                          t.status.active ? "bg-cyan-400" : "bg-zinc-600"
                        }`}
                      />
                      <span className="truncate">{t.provider}</span>
                    </p>
                  </div>
                </div>
                {/* Botao pill "ABRIR" — imita o "ADD" do print mas com
                    verbo que casa com nosso fluxo (ja tem tela dedicada
                    por integracao, entao "abrir" > "adicionar"). */}
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-cyan-400 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-black transition group-hover:bg-cyan-300">
                  Abrir
                  <ArrowRight className="size-3 transition group-hover:translate-x-0.5" />
                </span>
              </div>

              {/* Descricao curta. min-h fixa alinha os cards visualmente
                  independente do tamanho da desc (1 vs 2 linhas). */}
              <p className="mt-4 min-h-[2.5rem] text-sm leading-relaxed text-zinc-300">
                {t.desc}
              </p>

              {/* Separador + footer com status. Espelha o "Nenhuma instalação
                  ainda" do print — cinza pra vazio, ciano pra ativo. */}
              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <p
                  className={`inline-flex items-center gap-1.5 text-xs ${
                    t.status.active ? "text-cyan-300" : "text-zinc-500"
                  }`}
                >
                  <Activity className="size-3.5" />
                  {t.status.label}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
          </section>
        );
      })}
    </div>
  );
}
