/**
 * Monitor de saúde 24/7 dos bots de funil do Telegram.
 *
 * POR QUE ISSO EXISTE
 * -------------------
 * 30/07/2026, seller: "O bot simplesmente parou de funcionar." Ele mandou 16
 * /start e não veio NADA. O dashboard, enquanto isso, exibia um selo verde
 * dizendo "Bot rodando · /start já funciona". O bot estava morto havia dias.
 *
 * O defeito daquele caso (cooldown de /start que nunca expirava) já foi
 * corrigido. Mas o problema DE FUNDO não foi o cooldown — foi que o bot
 * morreu e ninguém ficou sabendo. A única forma de descobrir era o seller
 * testar na mão e reclamar. Qualquer outro defeito da lista abaixo teria
 * dado exatamente o mesmo sintoma: silêncio.
 *
 * Daí este módulo. Ele responde, sem depender de ninguém mandar /start:
 * "esse bot responderia agora se um cliente chegasse?" — e, quando a
 * resposta é não, CONSERTA o que dá pra consertar sozinho e avisa o seller
 * do resto.
 *
 * O QUE MATA UM BOT EM SILÊNCIO (e o que fazemos)
 * -----------------------------------------------
 *   no_token      sem token do Telegram                → avisa
 *   bad_token     token revogado no BotFather          → avisa
 *   no_webhook    webhook nunca registrado             → CONSERTA (setWebhook)
 *   wrong_webhook aponta pra URL velha/errada          → CONSERTA (setWebhook)
 *   webhook_stuck updates empilhando (endpoint 4xx/5xx)→ CONSERTA + avisa se grave
 *   no_funnel     nenhum funil ativo                   → avisa
 *   empty_graph   funil ativo mas sem nenhum bloco     → avisa
 *   no_start      grafo sem bloco inicial alcançável   → avisa
 *   owner_blocked conta do dono bloqueada              → só registra (é admin)
 *
 * `wrong_webhook` é o caso mais traiçoeiro e o mais provável de reincidir:
 * basta trocar de domínio, restaurar um backup, ou o seller registrar o
 * mesmo token em outra ferramenta que o webhook aponta pra outro lugar e o
 * bot fica mudo pra sempre, sem erro nenhum em lugar nenhum. O Telegram
 * aceita UM webhook por token — quem registrou por último ganha.
 *
 * NÃO mexemos em bot desligado de propósito (`active: false` ou
 * `funnelRuntimeEnabled: false`): isso é escolha do seller, não defeito.
 */
import { prisma } from "./prisma";
import { deriveTelegramWebhookSecret } from "./security/webhook-verify";
import { validateFunnelGraph } from "./bot-funnel-runtime";

/** Updates empilhados a partir de onde vale gritar (e não só consertar). */
const PENDING_HARD = 50;
/** Re-avisa o seller do MESMO defeito no máximo a cada 6h. */
export const HEALTH_REALERT_MS = 6 * 3600_000;
/** Timeout por chamada na API do Telegram — cron não pode ficar pendurado. */
const TG_TIMEOUT_MS = 8000;

export type BotHealthIssue =
  | "no_token"
  | "bad_token"
  | "no_webhook"
  | "wrong_webhook"
  | "webhook_stuck"
  | "no_funnel"
  | "empty_graph"
  | "no_start"
  | "owner_blocked";

export type BotHealthStatus = "ok" | "repaired" | "broken";

export type BotHealthReport = {
  botId: string;
  name: string;
  userId: string;
  status: BotHealthStatus;
  issue: BotHealthIssue | null;
  /** Texto em português, escrito pro seller — vai pro dashboard e pro push. */
  detail: string | null;
  /** O que o monitor consertou sozinho nesta rodada. */
  repaired: string[];
};

/**
 * URL única do webhook. Fonte da verdade — `registerTelegramWebhook` (action
 * do dashboard) e o monitor importam DAQUI. Se as duas montassem a string
 * separadamente, uma mudança de domínio faria o monitor achar que todo
 * webhook está errado e re-registrar em loop pra sempre.
 */
export function telegramWebhookUrl(botId: string): string {
  return `https://trilhopag.com/api/bots/telegram/webhook?b=${botId}`;
}

async function tg<T>(
  token: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; result?: T; description?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TG_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      ...(body
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
      signal: ctrl.signal,
    });
    return (await res.json()) as { ok: boolean; result?: T; description?: string };
  } catch (e) {
    return { ok: false, description: (e as Error)?.message ?? "network error" };
  } finally {
    clearTimeout(t);
  }
}

/**
 * (Re)registra o webhook no Telegram. Mesmo payload da action do dashboard —
 * inclusive o `secret_token`, sem o qual o nosso handler devolve 401 e o
 * Telegram empilha updates até desistir.
 */
export async function setTelegramWebhook(
  botToken: string,
  botId: string,
): Promise<{ ok: boolean; error?: string }> {
  const secretToken = deriveTelegramWebhookSecret(botId);
  const r = await tg(botToken, "setWebhook", {
    url: telegramWebhookUrl(botId),
    ...(secretToken ? { secret_token: secretToken } : {}),
    allowed_updates: ["message", "callback_query", "poll_answer"],
  });
  return r.ok ? { ok: true } : { ok: false, error: r.description };
}

type WebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_message?: string;
  last_error_date?: number;
};

export type HealthBot = {
  id: string;
  name: string;
  userId: string;
  type: string;
  botToken: string | null;
  active: boolean;
  funnelRuntimeEnabled: boolean;
  /** Veredito da rodada anterior — usado pra não brigar por webhook. */
  healthIssue?: string | null;
  user: { blocked: boolean };
};

/**
 * Confere um bot e conserta o que der. NÃO grava no banco nem notifica —
 * quem faz isso é `runBotHealthCheck`, pra esta função continuar chamável de
 * qualquer lugar (inclusive de um botão "verificar agora" no dashboard).
 */
export async function checkAndRepairBot(
  bot: HealthBot,
  opts: { dryRun?: boolean } = {},
): Promise<BotHealthReport> {
  const repaired: string[] = [];
  // dryRun: só diagnostica, não mexe no webhook de ninguém. Usado pelos
  // scripts de auditoria antes de deixar o cron agir em produção.
  const repair = async (token: string, id: string) =>
    opts.dryRun ? { ok: true as const } : await setTelegramWebhook(token, id);
  const base = { botId: bot.id, name: bot.name, userId: bot.userId };
  const broken = (issue: BotHealthIssue, detail: string): BotHealthReport => ({
    ...base,
    status: "broken",
    issue,
    detail,
    repaired,
  });

  if (bot.user.blocked) {
    return broken("owner_blocked", "A conta dona deste bot está bloqueada.");
  }
  if (!bot.botToken) {
    return broken(
      "no_token",
      "O bot está sem token do Telegram. Cole o token do @BotFather nas configurações do bot.",
    );
  }

  /* ---- 1. o funil tem o que responder? ------------------------------ */
  // Checado ANTES do Telegram: não adianta ter webhook perfeito se o /start
  // chega e o runtime não acha bloco nenhum pra executar.
  const funnel = await prisma.funnel.findFirst({
    where: { kind: "bot", botId: bot.id, active: true },
    select: { graph: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!funnel) {
    return broken(
      "no_funnel",
      "Nenhum funil ativo neste bot. Abra o funil e clique em Ativar.",
    );
  }
  const graphCheck = validateFunnelGraph(funnel.graph);
  if (!graphCheck.ok) {
    return graphCheck.issue === "empty_graph"
      ? broken(
          "empty_graph",
          "O funil está ativo mas sem nenhum bloco — o bot não tem o que responder.",
        )
      : broken(
          "no_start",
          "O funil não tem um bloco inicial válido. Ligue o /start a um bloco de mensagem.",
        );
  }

  /* ---- 2. o token ainda vale? --------------------------------------- */
  const me = await tg<{ username?: string }>(bot.botToken, "getMe");
  if (!me.ok) {
    return broken(
      "bad_token",
      `O Telegram recusou o token deste bot (${me.description ?? "sem detalhe"}). ` +
        "Provavelmente ele foi revogado no @BotFather — gere outro e cole nas configurações.",
    );
  }

  /* ---- 3. o Telegram está entregando os updates? --------------------- */
  const info = await tg<WebhookInfo>(bot.botToken, "getWebhookInfo");
  if (!info.ok) {
    return broken(
      "bad_token",
      `Não consegui consultar o webhook deste bot (${info.description ?? "sem detalhe"}).`,
    );
  }
  const w = info.result ?? {};
  const expected = telegramWebhookUrl(bot.id);
  const current = w.url ?? "";
  const pending = Number(w.pending_update_count ?? 0);

  if (current !== expected) {
    // Sem webhook (ou apontando pra outro lugar) o Telegram nem tenta nos
    // entregar o /start. É o defeito mais comum e o mais fácil de consertar.
    const issue: BotHealthIssue = current ? "wrong_webhook" : "no_webhook";

    // Webhook apontando pra um domínio que não é nosso = o MESMO token está
    // registrado em outra plataforma. O Telegram só aceita um webhook por
    // token: quem registrar por último ganha.
    //
    // Se já tentamos consertar na rodada passada e o webhook voltou pra lá,
    // tem um cron do outro lado nos desfazendo. Insistir criaria um cabo de
    // guerra a cada 10min — e com o webhook trocando de dono o tempo todo o
    // bot ficaria quebrado nas DUAS plataformas, que é pior do que estar
    // quebrado numa só. Então paramos de puxar e explicamos pro seller, que
    // é o único que pode decidir onde o bot deve viver.
    const foreignHost =
      current && !current.startsWith("https://trilhopag.com/")
        ? (() => {
            try {
              return new URL(current).host;
            } catch {
              return current;
            }
          })()
        : null;
    if (foreignHost && bot.healthIssue === "wrong_webhook") {
      return broken(
        "wrong_webhook",
        `Este bot está registrado em outra plataforma (${foreignHost}) e ela reassume o ` +
          `webhook toda vez que religamos. O Telegram só permite um destino por token — ` +
          `escolha onde o bot deve rodar: desligue-o lá pra usar aqui, ou desative-o aqui.`,
      );
    }

    const r = await repair(bot.botToken, bot.id);
    if (!r.ok) {
      return broken(
        issue,
        `O bot está sem webhook válido e não consegui religar automaticamente (${r.error ?? "erro desconhecido"}).`,
      );
    }
    repaired.push(current ? `webhook corrigido (estava em ${current})` : "webhook registrado");
    return { ...base, status: "repaired", issue, detail: null, repaired };
  }

  if (pending > 0 && w.last_error_message) {
    // URL certa mas o Telegram está apanhando ao entregar. Causa clássica:
    // secret_token dessincronizado → nosso handler devolve 401 em tudo.
    // Re-registrar realinha o secret e a fila drena sozinha.
    const r = await repair(bot.botToken, bot.id);
    if (r.ok) repaired.push(`webhook re-registrado (${pending} updates parados)`);
    if (pending >= PENDING_HARD) {
      return {
        ...base,
        status: "broken",
        issue: "webhook_stuck",
        detail:
          `${pending} mensagens estão presas na fila do Telegram sem serem entregues ` +
          `(último erro: ${w.last_error_message}). Já tentei religar o webhook.`,
        repaired,
      };
    }
    return { ...base, status: "repaired", issue: "webhook_stuck", detail: null, repaired };
  }

  return { ...base, status: "ok", issue: null, detail: null, repaired };
}

/**
 * Destrava conversas cujo cooldown automático de /start já venceu.
 *
 * O runtime já destrava sozinho quando o cliente manda o próximo /start —
 * mas aí o cliente precisa insistir. Varrendo aqui, o chat volta ao normal
 * antes de alguém tentar de novo, e o dashboard para de mostrar "bloqueado"
 * pra quem já cumpriu o castigo. Bloqueio MANUAL do seller nunca é tocado.
 */
export async function sweepExpiredAutoBlocks(): Promise<number> {
  const r = await prisma.botConversation.updateMany({
    where: {
      blocked: true,
      blockedReason: { startsWith: "abuse:" },
      OR: [
        { startWindowStartedAt: null },
        { startWindowStartedAt: { lte: new Date(Date.now() - 3600_000) } },
      ],
    },
    data: {
      blocked: false,
      blockedReason: null,
      startCount1h: 0,
      startWindowStartedAt: null,
    },
  });
  return r.count;
}

/**
 * Passa por todos os bots que DEVERIAM estar no ar, conserta, grava o
 * resultado e avisa o seller do que ficou quebrado.
 *
 * Só notifica em `broken` — o que o monitor consertou sozinho não vira push
 * (o seller não precisa acordar às 3h pra saber que um webhook se
 * realinhou). E o mesmo defeito só re-notifica a cada HEALTH_REALERT_MS,
 * pra um bot quebrado não virar 144 pushes por dia.
 */
export async function runBotHealthCheck(
  opts: { notify?: boolean; botId?: string; dryRun?: boolean } = {},
) {
  const notify = opts.notify !== false && !opts.dryRun;
  const bots = await prisma.saleBot.findMany({
    where: {
      type: "telegram",
      active: true,
      funnelRuntimeEnabled: true,
      botToken: { not: null },
      // Escopo opcional: verificar UM bot (botão "verificar agora" no
      // painel, e os probes — que não podem sair mexendo no webhook dos
      // bots reais dos sellers).
      ...(opts.botId ? { id: opts.botId } : {}),
    },
    select: {
      id: true,
      name: true,
      userId: true,
      type: true,
      botToken: true,
      active: true,
      funnelRuntimeEnabled: true,
      healthIssue: true,
      healthAlertedAt: true,
      user: { select: { blocked: true } },
    },
  });

  let ok = 0;
  let repaired = 0;
  let broken = 0;
  let alerted = 0;
  const reports: BotHealthReport[] = [];

  for (const bot of bots) {
    try {
      const rep = await checkAndRepairBot(bot, { dryRun: opts.dryRun });
      reports.push(rep);
      if (rep.status === "ok") ok++;
      else if (rep.status === "repaired") repaired++;
      else broken++;

      // Só re-avisa se o defeito é novo ou se já passou da janela.
      const issueChanged = bot.healthIssue !== rep.issue;
      const cooled =
        !bot.healthAlertedAt ||
        Date.now() - bot.healthAlertedAt.getTime() > HEALTH_REALERT_MS;
      const shouldAlert =
        notify &&
        rep.status === "broken" &&
        rep.issue !== "owner_blocked" &&
        (issueChanged || cooled);

      if (shouldAlert) {
        try {
          const { sendPushToUser } = await import("./push");
          await sendPushToUser(bot.userId, {
            title: `⚠️ O bot "${bot.name}" não está respondendo`,
            body: rep.detail ?? "Abra o painel pra ver o que aconteceu.",
            url: `/dashboard/bots/${bot.id}/funil`,
            kind: "generic",
          });
          alerted++;
        } catch (e) {
          console.error(`[bot-health] push falhou (bot ${bot.id}):`, e);
        }
      }

      if (!opts.dryRun) {
        await prisma.saleBot.update({
          where: { id: bot.id },
          data: {
            healthStatus: rep.status,
            healthIssue: rep.issue,
            healthDetail: rep.detail,
            healthCheckedAt: new Date(),
            ...(shouldAlert ? { healthAlertedAt: new Date() } : {}),
          },
        });
      }

      if (rep.repaired.length > 0) {
        console.warn(`[bot-health] bot ${bot.id} consertado: ${rep.repaired.join("; ")}`);
      }
      if (rep.status === "broken") {
        console.warn(`[bot-health] bot ${bot.id} QUEBRADO (${rep.issue}): ${rep.detail}`);
      }
    } catch (e) {
      // Um bot com problema não pode derrubar a varredura dos outros.
      console.error(`[bot-health] erro checando bot ${bot.id}:`, e);
    }
  }

  return { checked: bots.length, ok, repaired, broken, alerted, reports };
}
