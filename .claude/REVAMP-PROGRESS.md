# Revamp da dashboard — fila de trabalho
<!-- Gerado pelo auditor. Formato estável: o loop lê as linhas `- [ ]` na ordem. -->
<!-- ATENÇÃO: o repo é alvo móvel. Durante esta auditoria (22:05-22:10) outro agente
     criou /dashboard/assinaturas e adicionou o item na sidebar. Reconfira mtime antes
     de reimplementar algo listado como FALTA. -->
<!-- REGRA DURA HERDADA: renomear rota existente é PROIBIDO. /dashboard/vendas e
     /dashboard/saques estão gravados em email-templates.ts e push.ts e hoje são
     redirects para /dashboard/financeiro. Rota nova é sempre aditiva. -->

Última auditoria: 2026-08-08

## Fila (ordem de execução)








## Contexto do banco (descoberto em 08/08/2026)

O banco de PRODUCAO (`ep-still-surf-axs66fpp`, o mesmo que a Vercel usa) tem
**8 usuarios e ZERO** transacoes, produtos, clientes, assinaturas, saques e
webhooks. O gateway esta pre-operacao.

Consequencias pra esta fila:
- Empty state vale mais que tabela cheia: hoje TODO seller ve a tela vazia.
- Bug de volume (filtro sobre 50 linhas, paginacao) e correto de corrigir mas
  nao estava machucando ninguem ainda.
- Bug de primeiro contato (minimo de saque errado, open redirect no login,
  webhook orfao) e o que morderia no dia 1.
- `.env.production.local` aponta pra OUTRO banco (`ep-aged-river-apwhdgdm`,
  us-east-1) que NAO e o de producao. Arquivo perigoso: qualquer script que
  carregue ele por engano fala com o banco errado.


## Divergencia auditor x instrucao do dono

O item `reembolsos-filtros` pedia separar REFUNDED de CHARGEBACK. NAO foi feito:
o comentario em reembolsos/client.tsx registra pedido EXPLICITO do davi
(23/07/2026) — "Troca chargeback por MED PIX / E reembolso por MED PIX tambem".
Instrucao do dono ganha da sugestao do auditor. Idem o nome do produto, que foi
removido de proposito porque tx de teste vazavam nome interno pro seller.

Regra pro loop: quando a fila contrariar um comentario que cita pedido direto do
davi, o comentario ganha e a divergencia fica registrada aqui — nao se "corrige"
achando que foi descuido.


## Discord: entrada removida, feature nao

09/08/2026. O botao "Bot Discord" no topo de Produtos criava um SaleBot do tipo
discord. A feature que dava sentido a isso — bot NOTIFICADOR de venda — foi
removida pelo davi em 21/07/2026 com dados de uso (0.7% de cobertura em 5000+
vendas, 66% de falha no telegram, 0/16 do discord jamais funcionou). O que
sobrou e o bot INTERATIVO de funil, e `bot-funnel-runtime.ts:2294` recusa
qualquer `type !== "telegram"`.

Ou seja: um bot discord criado hoje nao tem nenhum caminho de codigo que o
execute. Por isso ele NAO virou tile em Integracoes — seria oferecer o que nao
funciona (secao 41). Mas tambem NAO foi apagado (regra 10: nao remover
funcionalidade sem autorizacao): a rota /dashboard/bots, o `?new=discord` e os
bots ja criados continuam intactos.

DECISAO PENDENTE DO DAVI: apagar de vez o suporte a discord, ou implementar o
runtime pra ele.


## Migration aplicada em producao (09/08/2026)

Autorizada pelo davi ("continue ate acabar tudo"). O que foi feito:

1. `prisma migrate diff` ANTES, pra ler o SQL: veio so CREATE TABLE + 2 index +
   1 foreign key. Nenhum ALTER/DROP em tabela existente.
2. `npm run db:push` (passa pelo safe-db-push, que aborta em DROP COLUMN nas
   tabelas de auth).
3. Conferido depois: User segue com 8 linhas e 123 colunas.

Tabela criada: `SellerNotification`.

## Feito
- [x] ID:api-logs | Logs de requisição da API | 09/08/2026 | model novo ApiRequestLog
      onde: /dashboard/api-keys (seção "Últimas chamadas") + cron /api/cron/api-logs-cleanup 04:20
      como: withApiLog() envolve as 13 rotas de /api/v1; AsyncLocalStorage carrega o dono
      da requisição do authenticate() até o finally. Write em after(), nunca bloqueia a
      resposta (política do davi: "a api NUNCA pode falhar").
      NÃO grava corpo de requisição nem de resposta, e descarta a query string: o corpo
      destas rotas é dado de pagamento (nome, e-mail, CPF, valor). Metadado + errorCode
      responde "por que minha chamada foi recusada" sem criar um segundo lugar de vazamento.
      Retenção 30 dias. Testado: 3 escritas, query não vazou, cron apagou só a linha de 31d.

- [x] ID:cobrancas-link-publico | Pagina publica /p/[id] + copiar/abrir/compartilhar | onde: src/app/p/[id]/{page,client}.tsx, cobrancas/client.tsx (LinkPublico). Segue o precedente de /api/transactions/[id]/status (cuid, validacao de formato). NAO expoe nome/email/cpf/telefone do comprador, nem fee/net/providerId/seller. So PIX com copia-e-cola. URL montada com MAIN_DOMAIN e nao window.location.origin — em preview isso geraria link da URL de preview que morre no proximo deploy. Verificado: 404 pra id invalido, zero campo sensivel no HTML. NAO entregue do escopo: vencimento configuravel e campos extras no formulario (expiracao segue fixa em 1h).
- [x] ID:extrato-unificado | Terceira aba com todo movimento em ordem cronologica | onde: lib/extrato.ts + financeiro/{extrato,tabs,page}.tsx. Opcao (b) da fila: VIEW DERIVADA, sem ledger. A coluna 'saldo apos' NAO e exibida em vez de estimada. A taxa da venda virou linha propria (nas outras telas vem embutida no liquido); a do saque NAO, porque sai de dentro do valor debitado e duplicaria. Split de coproducao entra como linha, senao a soma nao fecharia com o saldo. Rotulo 'Extrato' da tabbar mobile agora aponta pra aba de verdade.
- [x] ID:tx-timeline-eventos | Linha do tempo no detalhe da transacao | onde: vendas/timeline.tsx + campos no serializador compartilhado. DERIVADA dos carimbos, NAO log de eventos — tabela nova comecaria vazia e toda venda historica mostraria timeline em branco, alem de exigir insert no caminho critico de pagamento. Cruzar com WebhookDelivery ficou de fora (a entrega e por webhook, nao por transacao; casar exigiria parsear payload). 7 casos testados.
- [x] ID:links-pagamento | Lista transversal de todos os checkouts, com cliques/conversoes reais | onde: src/app/dashboard/links/{page,client}.tsx. NAO criei entidade nova — e uma VISAO sobre Checkout. Conversao usa o mesmo filtro de visibilidade, senao a taxa nao bateria com o Analytics. Aviso de dominio no topo, porque sem ele TODO link da lista esta morto.
- [x] ID:notificacoes-central | Sino virou central de verdade (lista, marcar lida, marcar todas, badge) | onde: model SellerNotification (TABELA NOVA, aplicada em prod), lib/notifications.ts, notificacoes-lista.tsx, topbar.tsx. Emissao SO de dentro de fireSellerSidePaidDispatches e dos pontos de saque — os que ja filtram desvio. `href` externo e recusado no emissor.
- [x] ID:dominios-wizard | Fluxo continuo em 3 passos (nome -> DNS do proprio dominio, com copiar -> verificar com polling -> sucesso) | onde: dominios/wizard.tsx. Polling a 65s porque verifyCustomDomain recusa 2 checagens em <60s. `addCustomDomain` passou a devolver o id (aditivo). Logica apex vs subdominio testada em 7 formatos.
- [x] ID:clientes-filtros | Filtros de periodo e situacao (ativo/inativo/recorrente) + cards do topo rotulados | onde: clientes/{page,filters}.tsx. Periodo e situacao num AND explicito — espalhados como chaves irmas o segundo sobrescrevia o primeiro. Faixa de gasto e CSV ficaram de fora (nao entregues).
- [x] ID:api-keys-escopos | Escopos REAIS (gate em 12 rotas v1) + validade na criacao | onde: src/lib/api-scopes.ts, api-keys/actions.ts, api-keys-client.tsx, src/app/api/v1/**. Correcao a fila: `expiresAt` SEMPRE foi verificado no verifyApiKey — o que faltava era UI pra setar, nao a checagem.
- [x] ID:produtos-metricas | Faturamento, vendas, ticket, aprovacao, conversao e assinaturas por produto | onde: src/lib/product-metrics.ts + produtos/[id]/product-metrics.tsx. DESVIO da fila: NAO criei aba "Visao geral" nova — isso empurraria "Ofertas" (a raiz /produtos/[id]) pra outra URL. Os numeros ficam no topo da tela onde o seller ja cai.
- [x] ID:integracoes-categorias | 4 categorias (Desenvolvedores/Rastreamento/Canais/Bots) + tile de bots que faltava | onde: src/app/dashboard/integracoes/page.tsx
- [x] ID:produtos-mover-bots | Botoes de bot sairam do topo de Produtos | onde: produtos/page.tsx. DISCORD NAO foi pra Integracoes de proposito (ver nota abaixo). Rota e ?new=discord seguem vivos; nada apagado.
- [x] ID:tx-filtro-valor-id | Faixa de valor (no servidor), busca por providerId e copiar ID | onde: src/lib/vendas-query.ts + vendas/client.tsx (reaisParaCents testado em 10 formatos)
- [x] ID:overview-ultimas-transacoes | Itens do LiveFeed clicaveis -> ?highlight= | onde: src/components/dashboard/live-feed.tsx (produto e valor JA existiam; a entrada da fila estava desatualizada nisso)
- [x] ID:webhooks-testar-reenviar | Enviar teste, reenviar entrega (mesmo evt_id) e ver payload/resposta | onde: src/lib/webhooks.ts (redeliverWebhook + sendTestWebhook), webhooks/actions.ts (checagem de dono), [id]/deliveries.tsx
- [x] ID:estados-loading-erro | Skeletons (Skel/SkelHeader/SkelStats/SkelTable) + loading.tsx por rota; spinner raiz aposentado | onde: page-kit.tsx + loading.tsx de dashboard/clientes/assinaturas/analytics/reembolsos/configuracoes. Error boundary ja estava adequado (mensagem humana + digest + detalhe tecnico em accordion), nao mexido.
- [x] ID:configuracoes-hub | Hub de Configuracoes (indice, nao duplica nada) | onde: src/app/dashboard/configuracoes/page.tsx + abas do perfil viraram linkaveis (?tab=)
- [x] ID:reembolsos-filtros | Busca, filtro de periodo e paginacao | onde: src/app/dashboard/reembolsos/client.tsx (PARCIAL de proposito: NAO separei REFUNDED de CHARGEBACK)
- [x] ID:ds-componentes | PageHeader + StatCard + StatusBadge compartilhados | onde: src/components/dashboard/page-kit.tsx (PARCIAL: trocadas as 4 copias que EU criei nesta sessao; 6 copias antigas seguem em rede/perfil/divulgador/dashboard-overview/mobile-home/metricas — nao trocadas porque nao consigo abrir essas telas logado)
- [x] ID:clientes-historico-completo | Assinaturas + aviso de devolucao no detalhe do cliente | onde: src/app/dashboard/clientes/[id]/page.tsx
- [x] ID:toast-confirm | Toast + ConfirmDialog; confirm()/alert() nativos mortos nos pontos de dinheiro e seguranca | onde: src/components/ui/{toast,confirm-dialog}.tsx, api-keys, withdraw-form, dominios
- [x] ID:saque-confirmacao | Revisao antes do saque + 2FA EXIGIDO no servidor | onde: src/app/dashboard/saques/actions.ts (verifyTotp), withdraw-form.tsx (revisao)
- [x] ID:saque-min-seletor | Minimo cravado a mao tambem no seletor de metodo (ACHADO fora da fila) | onde: withdraw-form.tsx:213,238
- [x] ID:analytics | Pagina de Analytics | onde: src/lib/analytics.ts, src/app/dashboard/analytics/{page,analytics-ui,periodo}.tsx
- [x] ID:overview-periodo-90d | 90 dias exposto (no seletor do Analytics; periodToRange ja suportava) | onde: src/app/dashboard/analytics/periodo.tsx
- [x] ID:overview-saldo-receber | Cards Saldo disponivel + A receber | onde: src/components/dashboard/overview-quick.tsx
- [x] ID:overview-atalhos | Faixa de atalhos na Visao Geral | onde: src/components/dashboard/overview-quick.tsx
- [x] ID:onboarding-checklist | Checklist de primeiro acesso (desktop + mobile) | onde: src/components/dashboard/onboarding-checklist.tsx
- [x] ID:contraste-zinc500 | zinc-500 do tema claro passou a cumprir AA sobre card tingido (ACHADO fora da fila) | onde: src/styles/themes.css:60
- [x] ID:tx-filtros-servidor | Filtros de transacao no servidor | onde: src/lib/vendas-query.ts (where+serializer unicos), src/app/api/dashboard/vendas-more/route.ts, src/app/dashboard/vendas/client.tsx:~300, src/app/dashboard/financeiro/page.tsx
- [x] ID:tx-deeplink-highlight | Deep-link `?highlight=` do push | onde: src/app/dashboard/vendas/page.tsx:19 (repassa query), src/app/dashboard/financeiro/page.tsx:44 (busca pontual da tx destacada), src/app/dashboard/vendas/client.tsx:171 (abre o modal), src/proxy.ts:302 (login preserva a query)
- [x] ID:saque-status-minimo | Status REJECTED e mínimo de saque consistente | onde: src/lib/withdrawal-limits.ts (fonte única), src/app/dashboard/saques/withdraw-form.tsx:260, src/app/dashboard/saques/history-list.tsx:63 (REJECTED) e :196 (fallback neutro)
- [x] ID:webhooks-eventos-orfaos | Eventos de webhook órfãos e fantasma | onde: src/lib/webhook-events.ts (catálogo único), src/lib/webhooks.ts:8, src/app/dashboard/integracoes/webhooks/actions.ts:11, src/components/dashboard/webhook-form.tsx:9, src/app/docs/page.tsx:603
- [x] ID:assinaturas | Módulo de Assinaturas | onde: src/app/dashboard/assinaturas/{page,client,actions}.tsx
- [x] ID:login-open-redirect | Open redirect no `?from=` do login (ACHADO fora da fila, não estava no prompt) | onde: src/lib/safe-redirect.ts + src/app/(auth)/login/page.tsx:24

- [x] ID:sidebar-arquitetura | Sidebar limpa, colapsável, com submenus, busca de abas e drawer no mobile | onde: /Users/macbookpro/Downloads/trilhopag/src/components/dashboard/sidebar.tsx:102 (grupos), :481 (drawer mobile), :636 (busca), :731 (animação dos submenus)
- [x] ID:header-minimalista | Header com collapse, olho de privacidade, tema, barra de faturamento, sino e perfil | onde: /Users/macbookpro/Downloads/trilhopag/src/components/dashboard/topbar.tsx:150 (menu), :161 (privacidade), :205 (faturamento), :272 (sino), :290 (perfil)
- [x] ID:tema-claro-escuro | Alternância claro/escuro por `data-theme` com inversão de variáveis | onde: /Users/macbookpro/Downloads/trilhopag/src/lib/theme-mode.ts:22 · /Users/macbookpro/Downloads/trilhopag/src/styles/themes.css · /Users/macbookpro/Downloads/trilhopag/src/lib/use-theme-mode.ts:19
- [x] ID:tipografia | Fonte moderna já em uso (Geist + Geist Mono) | onde: /Users/macbookpro/Downloads/trilhopag/src/app/layout.tsx:2-15
- [x] ID:overview-kpis | 4 KPIs reais com filtros de período, produto, oferta e bot na Visão Geral | onde: /Users/macbookpro/Downloads/trilhopag/src/components/dashboard/dashboard-overview.tsx:91-107 · /Users/macbookpro/Downloads/trilhopag/src/lib/dashboard-metrics.ts:38
- [x] ID:overview-grafico | Gráfico de faturamento elegante, com tema claro/escuro tratado | onde: /Users/macbookpro/Downloads/trilhopag/src/components/dashboard/revenue-chart.tsx:29 (parcial: ver ID:overview-periodo-90d)
- [x] ID:dados-reais | Nenhum número inventado; zeros e empty state honestos | onde: /Users/macbookpro/Downloads/trilhopag/src/lib/dashboard-metrics.ts:263 · /Users/macbookpro/Downloads/trilhopag/src/components/empty-state.tsx:4
- [x] ID:tx-tabela-filtros | Tabela de transações com status, método, período, produto, oferta, busca e comprovante | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/vendas/client.tsx:215-232 e :630-639 (parcial: filtros em memória, ver ID:tx-filtros-servidor)
- [x] ID:tx-detalhe | Detalhe da transação com abas Venda, Cliente e Tracking | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/vendas/client.tsx:998-1000 (parcial: sem timeline, ver ID:tx-timeline-eventos)
- [x] ID:tx-paginacao | Paginação cursor-based no servidor para transações | onde: /Users/macbookpro/Downloads/trilhopag/src/app/api/dashboard/vendas-more/route.ts:66 · /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/vendas/client.tsx:177
- [x] ID:assinaturas | Módulo de Assinaturas com Ativas, MRR, Inadimplentes, Canceladas e cancelamento | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/assinaturas/page.tsx:63 · client.tsx:58 · actions.ts:21 · sidebar.tsx:124 (entregue 08/08 22:06-22:08)
- [x] ID:clientes-lista | Lista de clientes com busca, ordenação, paginação server-side e 4 agregados | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/clientes/page.tsx:91 e :201-207 · filters.tsx:20
- [x] ID:clientes-perfil | Perfil do cliente com total gasto, compras, ticket médio, cliente desde e histórico de compras | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/clientes/[id]/page.tsx:118-202
- [x] ID:financeiro-saldo | Saldo disponível, PIX processando, cartão D+30 e retenção 10%/90d | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/saques/financeiro-hero.tsx:70-124 · /Users/macbookpro/Downloads/trilhopag/src/lib/holding-release.ts:207
- [x] ID:financeiro-previsao | Previsão de recebimentos (calendário de liberação) | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/saques/release-calendar.tsx:14 · /Users/macbookpro/Downloads/trilhopag/src/lib/holding-release.ts:316 (truncado em 50, sem aviso)
- [x] ID:saques-fluxo | Solicitação de saque PIX e USDT, destinos salvos, auto-saque e histórico com filtro e busca | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/saques/withdraw-form.tsx:206 · actions.ts:93-172 · auto-withdraw-config.tsx · history-list.tsx
- [x] ID:adquirentes | Adquirentes com prioridade por método, drag para reordenar, ativar/desativar, travar, fallback, teste A/B e ordem automática | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/adquirentes/client.tsx:283,411,442,457,496,547,979 · actions.ts:119,164,222,248,374,467 · /Users/macbookpro/Downloads/trilhopag/prisma/schema.prisma:1851-1876
- [x] ID:dominios-base | Adicionar, ver registros DNS, copiar, verificar, remover e usos por produto | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/dominios/client.tsx:99,193,283,300 · guide.tsx (reescrito 08/08)
- [x] ID:api-keys-base | Criar, listar, revogar chave; secret exibido uma vez e depois só o prefixo; última utilização | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/api-keys/api-keys-client.tsx:149-185 e :247-257 · /Users/macbookpro/Downloads/trilhopag/src/lib/api-keys.ts:16-22 e :100
- [x] ID:webhooks-base | CRUD de endpoint, seleção de eventos, ativar/desativar, HMAC, anti-SSRF, retry por cron e lista de entregas | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/integracoes/webhooks/actions.ts:26-102 · /Users/macbookpro/Downloads/trilhopag/src/lib/webhooks.ts:23-27 e :92 · /Users/macbookpro/Downloads/trilhopag/src/app/api/cron/retry-webhooks/route.ts:12
- [x] ID:integracoes-base | Central com 6 integrações e status por card | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/integracoes/page.tsx:76-165
- [x] ID:perfil-menu | Menu do usuário e abas Perfil, Comprovantes, Notificações, Taxas, com senha e 2FA | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/perfil/page.tsx:103-112 · security-section.tsx:92-226
- [x] ID:mobile | Home dedicada estilo app de banco, tab bar inferior e sidebar em drawer | onde: /Users/macbookpro/Downloads/trilhopag/src/components/dashboard/mobile-home.tsx · mobile-tabbar.tsx:44-49 · sidebar.tsx:497
- [x] ID:seguranca-isolamento | Isolamento por userId nas queries e nas server actions, adquirente/cobrança/assinatura com userId no where | onde: /Users/macbookpro/Downloads/trilhopag/src/lib/auth-helpers.ts:17 · /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/assinaturas/actions.ts:36 · /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/clientes/[id]/page.tsx:54
- [x] ID:tema-legibilidade-claro | Correção de legibilidade do tema claro | onde: /Users/macbookpro/Downloads/trilhopag/src/styles/themes.css (entregue nesta sessão)
- [x] ID:rede-fix | Correção da /dashboard/rede | onde: /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/rede/page.tsx (entregue nesta sessão)

## Não aplicável

- ID:rotas-em-ingles | Renomear rotas para /dashboard/sales, /customers, /finance etc (seções 32 e 45) | motivo: o próprio prompt manda preservar links; /dashboard/vendas e /dashboard/saques estão em e-mails já enviados e em push, e hoje sobrevivem como redirect. A hierarquia pedida é de menu e já foi aplicada sem tocar em href.
- ID:sidebar-desmembrar-financeiro | Separar Vendas/Transações de Financeiro na sidebar (seção 2) | motivo: o Davi mandou explicitamente fundir Vendas e Financeiro numa aba só em 06/08 ("mas sem perder nenhuma função / filtro"), e a fusão está feita e funcionando. Desfazer contraria instrução direta do dono; a melhoria certa é dentro da aba, não desmembrar.
- ID:cobrancas-cartao-boleto | Cobrança por cartão e boleto (seção 6) | motivo: o fluxo de cobrança avulsa só busca adquirentes com supportsPix e grava method PIX fixo; nenhuma adquirente conectada expõe boleto na UI. O prompt proíbe criar a lógica se o backend não suportar.
- ID:cobrancas-recorrente | Cobrança recorrente avulsa (seção 6) | motivo: recorrência no Trilho nasce de produto configurado como recorrente, via createSubscriptionFromTransaction; cobrança avulsa não tem produto nem ciclo. Seria backend novo duplicando o módulo de Assinaturas.
- ID:assinatura-pausar | Pausar assinatura (seção 9) | motivo: o model Subscription só tem active, past_due, canceled e completed. Um estado paused mudaria o cron de recorrência, que varre por status active. Já registrado no código em /Users/macbookpro/Downloads/trilhopag/src/app/dashboard/assinaturas/actions.ts:15.
- ID:assinatura-historico-cobrancas | Histórico de cobranças por assinatura (seção 9) | motivo: as transações filhas não guardam subscriptionId; casar por e-mail, produto e data seria adivinhação. Vira aplicável só se um campo subscriptionId for adicionado à Transaction.
- ID:integracao-discord | Integração com Discord (seção 14) | motivo: o prompt condiciona a "se Telegram e Discord já existem". Discord não existe em nenhum lugar do código além de um botão em Produtos; não há model, action nem adapter. Confirmar com o Davi se o botão faz algo antes de tratar como integração.
- ID:saldo-bloqueado | Card de "saldo bloqueado" (seção 11) | motivo: não existe campo de bloqueio no schema (nenhum blockedBalance/frozenBalance). O que existe é a retenção de 10% por 90 dias, que já é exibida com o nome certo. Inventar um card zerado seria interface sem lastro.
- ID:secoes-meta | Seções 3, 30, 31, 40, 41, 43 e 44 | motivo: são princípios de UX, regras de conduta e critérios de revisão, não entregáveis. Ficam como filtro de aceite de cada item da fila, não como linha de backlog.
- ID:responsividade-acessibilidade | Seções 26 e 27 como item isolado | motivo: não são entregáveis com começo e fim; viram critério de aceite obrigatório em cada item da fila (mobile testado em 390px, foco de teclado, aria-label, label em campo, erro associado ao campo).

## Parados de propósito — precisam de decisão do dono (09/08/2026)

Não são "não deu tempo". Cada um pede uma decisão que não é minha, e entregar
meio caminho seria pior que não entregar: os três viram promessa falsa na tela.

### equipe-rbac — Equipe e permissões
O `TeamMember` do schema é um esqueleto órfão: tem `email`, não tem relação com
`User`, e `grep teamMember src/` dá zero. O mecanismo real de multiusuário hoje
é subconta por `parentUserId`. Construir RBAC por cima disso significa mexer na
autenticação de um gateway em produção pra entregar uma tela de permissões que
não é checada em lugar nenhum — exatamente o padrão que passei a sessão
consertando (o 2FA de saque e o escopo de API prometiam trava e não travavam).
Pra fazer certo: decidir se convite é por subconta ou por model novo, e passar
a checagem por TODAS as server actions do painel, uma a uma.

### estorno-seller — Estorno pelo próprio seller
Move dinheiro de verdade, via API da adquirente, sem ambiente de teste pra
validar o caminho de erro. Um botão de estorno que erra é dinheiro devolvido
duas vezes ou nenhuma. Precisa primeiro do sandbox (item abaixo).

### api-ambiente-teste — Sandbox da API
Não existe backend de teste: hoje `provider: "test"` só marca transação
fabricada, não simula adquirente. Fazer isso é construir um provider falso que
responde os mesmos formatos — trabalho de backend, não de dashboard.
