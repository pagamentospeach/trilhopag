/**
 * Multi-acquirer dispatcher. Tenta criar um Pix usando as adquirentes
 * do usuário em ordem de prioridade. Se uma falhar, tenta a próxima.
 *
 * Hoje só suportamos SafePix. Quando adicionarmos outras (Shipay,
 * Paggue, etc.), basta adicionar o handler aqui mapeando pelo code.
 */
import { prisma } from "./prisma";
import { acquirerModesFor, OPS_MODES, type OpsMode } from "./ops-modes";
import {
  createPixCharge as safepixCharge,
  isTransientFetchError,
  type CreatePixOptions,
  type SafePixChargeResult,
  type SafePixCreds,
} from "./providers/safepix";
import { createMPPayment } from "./providers/mercadopago";
import {
  createPixCharge as abacatePayCharge,
  createCardBilling as abacatePayCardBilling,
} from "./providers/abacatepay";
import { createPixCharge as sharkBankingCharge } from "./providers/sharkbanking";
import { createPixCharge as sharkHubCharge } from "./providers/sharkhub";
import { createPixCharge as pluggouCharge } from "./providers/pluggou";
import { createPixCharge as cajuCharge } from "./providers/caju";
import { createPixCharge as pixzyCharge } from "./providers/pixzy";
import {
  createPixCharge as asaasCharge,
  createHostedBilling as asaasHostedBilling,
} from "./providers/asaas";
import { decryptString } from "./crypto";
import {
  exceedsWhitePixLimit,
  WHITE_LIMIT_ERROR_CODE,
  WHITE_LIMIT_MESSAGE,
  WHITE_MODE_MAX_PIX_CENTS,
} from "./pix-limits";
import { parseEmvMerchantName, parseEmvInstitution } from "./pix-emv";
import { runNominalDedupIfEnabled } from "./acquirer-nominal-dedup";
import {
  acquirerDispatchWhere,
  resolveEffectiveSellerEmail,
  type OwnAcquirerPanelMap,
} from "./acquirer-visibility";
import {
  getRunningTestForUser,
  pickTestAcquirer,
  recordTestAttempt,
} from "./acquirer-ab-test";

/**
 * Cache de "user X já tem todas as adquirentes globais sincronizadas"
 * com TTL 60s. Evita 2 queries (Acquirer.findMany + UserAcquirer.findMany)
 * em CADA cobrança PIX. Em pico de milhares/s, isso é o principal vetor
 * de contention no índice único (userId, acquirerId).
 *
 * False positive aceitável: se admin adicionar nova adquirente, demora
 * até 60s pra todos os users gerarem UserAcquirer pra ela. Sem impacto
 * funcional — só atraso na disponibilidade pro user.
 */
const userAcquirerSyncCache = new Map<string, number>();
const SYNC_CACHE_TTL_MS = 60_000;

/**
 * SAÚDE EM MEMÓRIA DAS ADQUIRENTES (jun/2026 — anti-timeout):
 * Map por instância serverless que aprende EM TEMPO REAL quais adquirentes
 * estão "soluçando" (timeout/erro de rede TRANSIENTE) e as REORDENA pro fim
 * do fanout — sem NUNCA removê-las (o fallback exaustivo continua garantido,
 * o PIX SEMPRE tenta gerar).
 *
 * - Falha transiente (timeout/rede): incrementa contador; ao cruzar o limite,
 *   marca "degradada" por um cooldown curto (sai da frente das saudáveis).
 * - Sucesso OU erro determinístico (4xx/credencial): LIMPA na hora (self-heal).
 *   Um 4xx não polui a adquirente — ela está NO AR, só recusou ESTA request.
 *
 * É best-effort POR INSTÂNCIA (cada lambda tem o seu) — não é breaker global.
 * Só REORDENA prioridade; a decisão final continua sendo do fanout paralelo.
 */
type AcquirerHealth = { fails: number; downUntil: number };
const acquirerHealth = new Map<string, AcquirerHealth>();
const HEALTH_FAIL_THRESHOLD = 2; // falhas transientes seguidas p/ degradar
const HEALTH_COOLDOWN_MS = 30_000; // tempo "no banco de reservas"

/** true se a adquirente está em cooldown (degradada) AGORA. */
function isAcquirerDegraded(acquirerId: string): boolean {
  const h = acquirerHealth.get(acquirerId);
  return h !== undefined && h.downUntil > Date.now();
}

/**
 * Alimenta a saúde com o resultado de UMA tentativa de cobrança.
 * `transient` deve ser true só quando o erro é timeout/rede
 * (isTransientFetchError) — não quando é 4xx/credencial.
 */
function recordAcquirerOutcome(
  acquirerId: string,
  ok: boolean,
  transient: boolean,
): void {
  // Sucesso ou falha determinística → cura imediata (sai do radar).
  if (ok || !transient) {
    acquirerHealth.delete(acquirerId);
    return;
  }
  // Falha transiente → acumula; ao cruzar o limite, entra em cooldown.
  const h = acquirerHealth.get(acquirerId) ?? { fails: 0, downUntil: 0 };
  h.fails += 1;
  if (h.fails >= HEALTH_FAIL_THRESHOLD) {
    h.downUntil = Date.now() + HEALTH_COOLDOWN_MS;
  }
  acquirerHealth.set(acquirerId, h);
}

/**
 * Garante que o user tem UserAcquirer pra TODAS as Acquirer globais ativas.
 * Idempotente — se admin cadastra uma nova adquirente depois do user já
 * ter outras, ela vira disponível automaticamente na próxima cobrança.
 *
 * IMPORTANTE: cria com active=true mas pixActive/cardActive=true também,
 * pra que a nova adquirente possa ser tentada imediatamente. O seller
 * pode pausá-la depois pelo /dashboard/adquirentes.
 */
async function ensureUserAcquirerRowsExist(userId: string): Promise<void> {
  // Fast-path: user já sincronizado recentemente
  const cachedAt = userAcquirerSyncCache.get(userId);
  if (cachedAt !== undefined && Date.now() - cachedAt < SYNC_CACHE_TTL_MS) {
    return;
  }

  // Puxa email do seller pra respeitar visibilidade privada (05/07/2026).
  // Antes so criava UA pra globalEnabled=true → adquirente PRIVADA com global=false
  // nunca era autoprovisionada pra sellers autorizados. Fluxo: sem UA, o
  // dispatcher pula a acquirer, e o seller ve "sem processador".
  // Email EFETIVO — sub-account usa email da conta pai (mesmo dono real).
  //
  // PAINEL PROPRIO (19/07/2026, davi): se ligado, unifica as whitelists dos
  // 3 modos (black+white+hot) e cria UA só pra esse conjunto. Assim quando
  // seller trocar de modo, já tem UA pronta pras acquirers do novo modo.
  const [effectiveEmail, seller] = await Promise.all([
    resolveEffectiveSellerEmail(prisma, userId),
    prisma.user
      .findUnique({
        where: { id: userId },
        select: {
          ownAcquirerPanelEnabled: true,
          ownAcquirerPanel: true,
          ownAcquirerPanelPublicModes: true,
        },
      })
      .catch(() => null),
  ]);
  let acqWhere: Record<string, unknown>;
  if (seller?.ownAcquirerPanelEnabled) {
    // Se ALGUM modo estiver marcado como público, o painel geral também vale
    // pro ensureUserAcquirer — precisa criar UA pra TODAS as acquirers visíveis
    // no filtro geral também (senão o modo público ficaria sem UA row).
    // Fazemos OR entre: whitelist (união dos 3 modos) + visibilidade geral
    // (se ao menos 1 modo é público).
    const map = (seller.ownAcquirerPanel as OwnAcquirerPanelMap | null) ?? {};
    const publicModes = seller.ownAcquirerPanelPublicModes ?? [];
    // Percorre OPS_MODES em vez de listar black/white/hot na mão: um modo novo
    // (SAG) entra na união sozinho. Escrito à mão, a whitelist do modo novo
    // seria simplesmente ignorada aqui, sem erro nenhum.
    const unionIds = Array.from(
      new Set(OPS_MODES.flatMap((m) => map[m] ?? [])),
    );
    if (publicModes.length > 0) {
      // Ao menos um modo público → OR whitelist + visibilidade geral.
      // 05/08/2026 (davi): acquirerDispatchWhere agora RESPEITA
      // hiddenFromSellers — escondida nao processa. Vale pro ramo "modo
      // publico"; a whitelist do painel proprio (unionIds) segue explicita,
      // porque ali o admin escolheu a adquirente a dedo pra esse seller.
      acqWhere = {
        OR: [
          { id: { in: unionIds } },
          acquirerDispatchWhere(effectiveEmail),
        ],
      };
    } else {
      acqWhere = { id: { in: unionIds } };
    }
  } else {
    acqWhere = acquirerDispatchWhere(effectiveEmail);
  }
  const [globals, existing] = await Promise.all([
    prisma.acquirer.findMany({
      where: { active: true, ...acqWhere },
      select: { id: true, priority: true, createdAt: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }),
    prisma.userAcquirer.findMany({
      where: { userId },
      select: { acquirerId: true, priority: true, pixPriority: true, cardPriority: true },
    }),
  ]);
  if (globals.length === 0) {
    userAcquirerSyncCache.set(userId, Date.now());
    return;
  }
  const existingIds = new Set(existing.map((e) => e.acquirerId));
  const missing = globals.filter((g) => !existingIds.has(g.id));
  if (missing.length === 0) {
    // Tudo já sincronizado — marca no cache pra pular nos próximos 60s
    userAcquirerSyncCache.set(userId, Date.now());
    return;
  }

  const maxPrio = Math.max(-1, ...existing.map((e) => e.priority));
  const maxPix = Math.max(-1, ...existing.map((e) => e.pixPriority ?? -1));
  const maxCard = Math.max(-1, ...existing.map((e) => e.cardPriority ?? -1));

  await prisma.userAcquirer.createMany({
    data: missing.map((g, i) => ({
      userId,
      acquirerId: g.id,
      priority: maxPrio + 1 + i,
      pixPriority: maxPix + 1 + i,
      cardPriority: maxCard + 1 + i,
      active: true,
      pixActive: true,
      cardActive: true,
    })),
    skipDuplicates: true,
  });
}

/**
 * Atualiza Acquirer.nominalName (e Acquirer.institution) se o que foi extraído
 * do QR for diferente. Pula completamente se a Acquirer.lockNominalName === true
 * (admin travou o nominal pelo painel — quer manter o nome "comercial" fixo).
 *
 * A INSTITUIÇÃO é o PSP por trás da nominal, inferido do domínio do URL dinâmico
 * no código PIX (ex.: "onlyup" de pix.onlyup.com.br). Atualiza junto com o
 * nominal e respeita o mesmo lock (faz parte da identidade comercial da conta).
 */
async function maybeUpdateNominal(
  acquirerId: string,
  qrCode: string,
): Promise<void> {
  const nominal = parseEmvMerchantName(qrCode);
  const institution = parseEmvInstitution(qrCode);
  if (!nominal) return;
  try {
    // O DB eh a FONTE DE VERDADE (sem cache em memoria). Le o estado atual
    // (lookup por PK, barato) pra (a) capturar o nome ANTIGO pro historico e
    // (b) pular cedo quando nao mudou ou esta travado.
    //
    // BUG FIX (jun/2026): antes tinha um cache em memoria
    // (lastNominalByAcquirer) que guardava o ultimo nominal visto. Quando o
    // admin TRAVAVA num nome custom e depois DESTRAVAVA, o cache ainda tinha
    // o nome real -> curto-circuitava o update -> o DB ficava preso no nome
    // travado pra sempre. Sem cache, ao destravar o proximo PIX ja corrige.
    const acq = await prisma.acquirer.findUnique({
      where: { id: acquirerId },
      select: { nominalName: true, institution: true, lockNominalName: true },
    });
    if (!acq) return;
    // lockNominalName=true → admin travou um nome comercial, nunca reescreve
    // (nem nominal nem instituição).
    if (acq.lockNominalName) return;

    const nominalChanged = acq.nominalName !== nominal;
    // Só sobrescreve a instituição quando conseguimos extrair uma (PIX dinâmico).
    // PIX com chave estática (institution=null no QR) NÃO apaga o valor salvo.
    const institutionChanged =
      institution != null && acq.institution !== institution;

    // Nada mudou → no-op (caso comum, sem write).
    if (!nominalChanged && !institutionChanged) return;

    if (nominalChanged) {
      // Compare-and-swap: so atualiza se o nome ainda eh o que lemos (evita
      // duplo-log quando dois PIX concorrentes pegam a mesma troca).
      const data: { nominalName: string; institution?: string } = {
        nominalName: nominal,
      };
      if (institutionChanged) data.institution = institution!;
      const r = await prisma.acquirer.updateMany({
        where: {
          id: acquirerId,
          lockNominalName: false,
          nominalName: acq.nominalName,
        },
        data,
      });
      if (r.count > 0) {
        // Loga a troca pro historico (avisar sellers "nominal X virou Y").
        await prisma.acquirerNominalChange
          .create({
            data: {
              acquirerId,
              oldNominal: acq.nominalName,
              newNominal: nominal,
            },
          })
          .catch((e) =>
            console.error(`[acquirers] nominal history log failed ${acquirerId}:`, e),
          );

        // Otimizacao automatica: se outra adquirente ja usa esse mesmo
        // nominal, esconde a de menor conversao do dia dos sellers e cria
        // notificacao pro admin trocar o nominal la. Fire-and-forget —
        // nao segura o fluxo do PIX. Respeita o flag PlatformFlag
        // "acquirer_nominal_dedup_auto" (default ligado).
        runNominalDedupIfEnabled(acquirerId, nominal).catch((e) =>
          console.error(`[acquirers] nominal dedup failed ${acquirerId}:`, e),
        );
      }
    } else if (institutionChanged) {
      // Só a instituição mudou (nominal igual) — update simples, sem log.
      await prisma.acquirer.updateMany({
        where: { id: acquirerId, lockNominalName: false },
        data: { institution: institution! },
      });
    }
  } catch (e) {
    console.error(`[acquirers] failed to update nominal for ${acquirerId}:`, e);
  }
}

type CreateChargeInput = CreatePixOptions;
type CreateChargeResult = SafePixChargeResult;

type ChargeAttempt = {
  ok: boolean;
  charge?: CreateChargeResult;
  error?: string;
  acquirerId: string;
  acquirerCode: string;
};

type DispatchOptions = {
  userId: string;
  input: CreateChargeInput;
  /**
   * Opcional: se o produto tem override de adquirente habilitado, força
   * o dispatch a usar APENAS aquela adquirente (ignora a ordem global do
   * user em UserAcquirer). Quando não informado, usa o fluxo padrão.
   */
  productId?: string;
  /**
   * Opcional: força uma adquirente ESPECIFICA (por id), ignorando a ordem
   * do user. Usado pela aba Cobranças (seller escolhe a adquirente). Valida
   * active+globalEnabled+supportsPix+mode compativel. Sem fallback (igual
   * ao override por produto). Tem prioridade sobre productId.
   */
  forceAcquirerId?: string;
};

type AcquirerRow = {
  id: string;
  code: string;
  publicKey: string | null;
  secretKeyEnc: string | null;
};

/**
 * Resolve credenciais da adquirente. Publica UMA row de creds pro handler
 * quando a Acquirer tem `secretKeyEnc` gravada.
 *
 * FIX 10/07/2026 (Caju "falha ao gerar pix"): antes exigia AMBOS publicKey
 * E secretKeyEnc. Adquirentes que so tem secretKey (Caju, AbacatePay, alguns
 * modos SharkHub) caiam pra env var e ai falhavam. Agora retornamos creds
 * mesmo quando publicKey e null — o handler decide se precisa ou nao.
 * Sem secretKeyEnc, retorna undefined (fluxo legacy que cai em env var).
 */
function resolveCreds(a: AcquirerRow): SafePixCreds | undefined {
  if (!a.secretKeyEnc) return undefined;
  try {
    return {
      publicKey: a.publicKey ?? "",
      secretKey: decryptString(a.secretKeyEnc),
    };
  } catch (e) {
    console.error(`[acquirers] failed to decrypt ${a.code}:`, e);
    return undefined;
  }
}

/**
 * Adapter Mercado Pago → SafePix-style charge result.
 * MP usa createMPPayment com paymentMethod="pix" e retorna point_of_interaction
 * com qr_code + qr_code_base64. Mapeia pro shape comum.
 */
async function mercadoPagoPixCharge(
  input: CreatePixOptions,
  creds?: SafePixCreds,
): Promise<SafePixChargeResult> {
  if (!creds?.publicKey || !creds?.secretKey) {
    throw new Error("Mercado Pago credentials missing");
  }
  const docType = (input.customer.document.type ?? "cpf").toUpperCase() as
    | "CPF"
    | "CNPJ";
  // Override postback URL: o caller passa o URL do SafePix por default.
  // MP precisa apontar pro nosso /webhooks/mercadopago. Substitui o path.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
  const mpNotificationUrl = `${appUrl}/api/webhooks/mercadopago`;

  const result = await createMPPayment(
    {
      amountCents: input.amountCents,
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        document: input.customer.document.number,
        documentType: docType === "CNPJ" ? "CNPJ" : "CPF",
      },
      paymentMethod: "pix",
      description: input.items[0]?.title?.slice(0, 250),
      externalReference: input.metadata?.transaction_id,
      metadata: input.metadata,
      notificationUrl: mpNotificationUrl,
      // Propaga signal do dispatcher pro race interno do MP (abortar quando
      // outra adquirente vence o fanout paralelo).
      signal: input.signal,
    },
    {
      publicKey: creds.publicKey,
      accessToken: creds.secretKey,
    },
  );

  if (!result.pix?.qrCode) {
    throw new Error(
      `Mercado Pago não retornou QR code (status=${result.status}, detail=${result.statusDetail})`,
    );
  }

  return {
    id: result.id,
    status: result.status,
    qrCode: result.pix.qrCode,
    expiresAt: result.pix.expiresAt ?? null,
    raw: result.raw,
  };
}

const HANDLERS: Record<
  string,
  (input: CreateChargeInput, creds?: SafePixCreds) => Promise<CreateChargeResult>
> = {
  safepix: safepixCharge,
  mercadopago: mercadoPagoPixCharge,
  // AbacatePay pluga DIRETO: o provider já expõe (CreatePixOptions, SafePixCreds)
  // → SafePixChargeResult, sem adapter. A API key vai na secretKey das creds.
  abacatepay: abacatePayCharge,
  // Shark Banking pluga DIRETO (mesmo Basic auth do SafePix). O provider
  // sobrescreve o postbackUrl pro /api/webhooks/sharkbanking internamente.
  sharkbanking: sharkBankingCharge,
  // SharkHub pluga DIRETO (Bearer auth; api-key vai na secretKey). O provider
  // sobrescreve o notificationUrl pro /api/webhooks/sharkhub internamente.
  sharkhub: sharkHubCharge,
  // Pluggou pluga DIRETO (headers X-Public-Key/X-Secret-Key). O provider
  // sobrescreve o postback_url pro /api/webhooks/pluggou internamente.
  pluggou: pluggouCharge,
  // Caju (10/07/2026) — intermediador que agrupa Woovi/Pagar.me/Valana atras
  // de UMA API + sub-keys. secretKey na Acquirer pode ser:
  //   - "caju_apikey_..." (api_key principal, adquirente ativa) → /create-pix
  //   - "subkey_..."      (sub-key com nominal propria)         → /api/subapi
  // Auto-deteccao pelo prefix. Webhook em /api/webhooks/caju.
  caju: cajuCharge,
  // Pixzy (22/07/2026) — Bearer token unico. Sobrescreve webhook_url pro
  // /api/webhooks/pixzy internamente. Min charge R$5. Fee 3% + R$1 por
  // venda / R$5 por saque (config no painel Pixzy, nao no nosso lado).
  pixzy: pixzyCharge,
  // Asaas pluga DIRETO (header `access_token`; a chave inteira, com o `$`,
  // vai na secretKey). Unica que precisa de 3 chamadas pra montar o PIX —
  // ver o cabecalho do provider.
  asaas: asaasCharge,
  // Quando outras adquirentes baseadas em SafePix forem cadastradas (ex: "safepix-2"),
  // o lookup acontece via prefix match abaixo.
};

/**
 * Normaliza o code da adquirente (ex "safepix-1", "pluggou-black") pro
 * "family name" que os webhooks usam pra achar a tx via
 * `Transaction.provider`. SEM esse mapping, tx roteada por adquirente com
 * sufixo (safepix-2) ou nome composto (pluggou-black) fica orfa: o webhook
 * filtra `provider: "safepix"` exato → nunca acha → tx trava PENDING pra
 * sempre mesmo apos o cliente pagar. Bug historico de jul/2026 com Pluggou
 * — antes cada callsite tinha o if/else duplicado e novos providers eram
 * esquecidos. Centralizado aqui.
 */
export function normalizeAcquirerCodeToProvider(code: string): string {
  if (code.startsWith("mercadopago")) return "mercadopago";
  if (code.startsWith("safepix")) return "safepix";
  if (code.startsWith("abacatepay")) return "abacatepay";
  if (code.startsWith("sharkbanking")) return "sharkbanking";
  if (code.startsWith("sharkhub")) return "sharkhub";
  if (code.startsWith("pluggou")) return "pluggou";
  if (code.startsWith("caju")) return "caju";
  if (code.startsWith("pixzy")) return "pixzy";
  if (code.startsWith("asaas")) return "asaas";
  return code;
}

export function getHandler(code: string) {
  if (HANDLERS[code]) return HANDLERS[code];
  // Suporte a múltiplas contas: code "safepix-1", "mercadopago-2",
  // "caju-woovi", "caju-pagarme-3", "pixzy-2", etc.
  if (code.startsWith("safepix")) return HANDLERS.safepix;
  if (code.startsWith("mercadopago")) return HANDLERS.mercadopago;
  if (code.startsWith("abacatepay")) return HANDLERS.abacatepay;
  if (code.startsWith("sharkbanking")) return HANDLERS.sharkbanking;
  if (code.startsWith("sharkhub")) return HANDLERS.sharkhub;
  if (code.startsWith("pluggou")) return HANDLERS.pluggou;
  if (code.startsWith("caju")) return HANDLERS.caju;
  if (code.startsWith("pixzy")) return HANDLERS.pixzy;
  if (code.startsWith("asaas")) return HANDLERS.asaas;
  return null;
}

export async function dispatchPixCharge({
  userId,
  input,
  productId,
  forceAcquirerId,
}: DispatchOptions): Promise<{
  ok: boolean;
  charge?: CreateChargeResult;
  acquirerId?: string;
  acquirerCode?: string;
  attempts: ChargeAttempt[];
  finalError?: string;
}> {
  // DEPLOYMENT LOCK (05/07/2026): bloqueia geracao de PIX se estivermos
  // rodando fora da conta Vercel autorizada (clone). Falha silenciosa
  // com mensagem generica pra nao entregar o motivo real.
  const { assertAuthorizedDeployment } = await import(
    "./security/deployment-guard"
  );
  try {
    assertAuthorizedDeployment();
  } catch {
    return {
      ok: false,
      attempts: [],
      finalError: "Serviço indisponível. Tente novamente em alguns minutos.",
    };
  }

  // Estratégia de seleção:
  //
  // 0. OVERRIDE por PRODUTO: se Product.acquirerOverrideEnabled=true e tem
  //    acquirerOverrideId definido, usa SÓ aquela adquirente (skip do user
  //    ordering). Pensado pra seller ter X produto rodando em SafePix e Y
  //    em Paggue (ex), sem mexer na ordem global.
  //
  // 1. CADA SELLER manda na ordem das próprias adquirentes via a página
  //    /dashboard/adquirentes (drag-and-drop). A primeira (pixPriority=0)
  //    é a principal; se falhar, tenta a próxima; e assim por diante.
  //
  // 2. UserAcquirer.pixPriority é o source-of-truth pra PIX (UserAcquirer.priority
  //    fica como fallback legado).
  //
  // 3. Filtro por modo BLACK/WHITE: User.pixOpsMode define se o seller opera
  //    em BLACK (sem MED) ou WHITE (com MED). As adquirentes têm seu próprio
  //    mode (Acquirer.mode) e só rodam transações do MESMO mode do user.
  //
  // 4. Se o seller não tem NENHUMA UserAcquirer ativa, faz lazy bootstrap
  //    criando UserAcquirer pra TODAS as adquirentes globais ativas, na
  //    ordem da Acquirer.priority global (admin define o default).

  // Pega user mode + produto override em paralelo. Erro em qualquer um
  // vira default — never-fail.
  const [user, product] = await Promise.all([
    prisma.user
      .findUnique({
        where: { id: userId },
        select: {
          pixOpsMode: true,
          forbiddenOpsModes: true,
          lockedPixAcquirerByMode: true,
          email: true,
          feePercent: true,
          feeFixedCents: true,
          feesByMode: true,
          ownAcquirerPanelEnabled: true,
          ownAcquirerPanel: true,
          ownAcquirerPanelPublicModes: true,
        },
      })
      .catch(() => null),
    productId
      ? prisma.product
          .findUnique({
            where: { id: productId },
            select: {
              acquirerOverrideEnabled: true,
              acquirerOverrideId: true,
            },
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  // AUTO-SWITCH (19/07/2026, davi) usa `let` pra permitir troca pra black
  // quando o modo atual fica sem adquirente.
  let userMode = user?.pixOpsMode ?? "black";

  // TETO WHITE R$1.000 (01/08/2026, davi) — GATE DE ULTIMA LINHA.
  // O gate "de verdade" roda nos pontos de entrada (checkout, upsell, API v1),
  // ANTES de criar a Transaction, pra o cliente receber erro na hora. Aqui e
  // so a rede de seguranca pra caminho novo que esqueca de chamar o helper
  // (ex: assinatura recorrente). O cron pending-charge-retry reconhece este
  // finalError como DEFINITIVO e marca FAILED sem gastar os 20 retries.
  // Nao viola a never-fail policy: never-fail e sobre INDISPONIBILIDADE
  // (adquirente fora do ar), nao sobre regra de negocio.
  if (exceedsWhitePixLimit(userMode, input.amountCents)) {
    console.warn(
      `[dispatchPixCharge] TETO WHITE — user=${userId} amount=${input.amountCents} max=${WHITE_MODE_MAX_PIX_CENTS}`,
    );
    return {
      ok: false,
      attempts: [],
      finalError: `${WHITE_LIMIT_ERROR_CODE}: ${WHITE_LIMIT_MESSAGE}`,
    };
  }
  // Filtro de visibilidade de acquirer — email EFETIVO (sub-account herda pai).
  // PAINEL PROPRIO (19/07/2026, davi): se seller tem painel próprio ativado,
  // ignora filtro público/privado e usa APENAS a whitelist configurada pelo
  // admin em /admin01/users/[id]. Modo sem entradas → zero adquirentes visíveis.
  // Per-mode public: modos em publicModes caem no filtro geral mesmo com painel.
  const effectiveEmail = (await resolveEffectiveSellerEmail(prisma, userId).catch(() => null)) ?? "";
  const { acquirerOwnPanelWhere } = await import("./acquirer-visibility");
  const ownWhere = acquirerOwnPanelWhere(
    user?.ownAcquirerPanelEnabled ?? false,
    user?.ownAcquirerPanel as import("./acquirer-visibility").OwnAcquirerPanelMap | null,
    userMode,
    user?.ownAcquirerPanelPublicModes ?? [],
  );
  // 05/08/2026 (davi): "quando a adquirente ta escondida, nao pode ser gerado
  // nenhum pix nela! so nas que tao mostrando pro seller! O fallback so
  // funciona pra adquirentes visiveis pro seller!"
  // acquirerDispatchWhere agora delega pro filtro de UI — o fanout inteiro
  // (inclusive o fallback exaustivo mais abaixo) so enxerga adquirente que o
  // seller consegue ver e desligar. Reverte o comportamento de 28/07.
  const acqVisWhere = ownWhere ?? acquirerDispatchWhere(effectiveEmail);

  // NEVER-FAIL POLICY (08/07/2026, david: "tira tudo de segurança que pode
  // fazer um pix nao ser gerado"):
  //   - GATE de TAXA MINIMA REMOVIDO. Se seller ta com fee ruim, PIX ainda
  //     gera. Alerta admin ja avisa em /api/admin/alerts (fee-violations).
  //   - GATE de forbiddenOpsModes REMOVIDO. Mesmo se admin bloqueou um modo,
  //     GERA. Admin retorna e ajusta depois se precisar.
  // Justificativa: cliente NUNCA pode ficar sem PIX. Prejuizo por taxa baixa
  // eh problema de CONFIG do seller — nao do cliente. Admin ve e resolve.

  // FORCE por id (aba Cobranças): seller escolheu a adquirente. Valida que
  // ela eh elegivel (active+globalEnabled+supportsPix+mode) e usa SO ela,
  // sem fallback. Tem prioridade sobre o override por produto.
  //
  // RESPEITA o UserAcquirer.pixActive=true (06/07/2026): se o seller pausou
  // essa adquirente no /dashboard/adquirentes, mesmo forcando via cobranca
  // avulsa NAO gera PIX nela. "Pausada = 100% sem funcionar".
  if (forceAcquirerId) {
    // BOOTSTRAP-FIRST (07/07/2026): garante que UserAcquirer existe pra
    // adquirentes novas ANTES de checar pixActive. Sem isso, quando admin
    // cadastra adquirente nova (ex: Pluggou), a validacao encontrava zero
    // UA row e retornava "Adquirente pausada pelo seller" — enganosa.
    // O bootstrap cria UA com pixActive=true por padrao (seller pausa depois
    // se quiser); assim so bloqueia se de verdade tiver pausado.
    await ensureUserAcquirerRowsExist(userId);
    const forcedUA = await prisma.userAcquirer.findFirst({
      where: { userId, acquirerId: forceAcquirerId, pixActive: true },
      select: { id: true },
    });
    if (!forcedUA) {
      return {
        ok: false,
        attempts: [],
        finalError:
          "Adquirente pausada pelo seller — reative em /dashboard/adquirentes.",
      };
    }
    const forced = await prisma.acquirer.findFirst({
      where: {
        id: forceAcquirerId,
        active: true,
        supportsPix: true,
        // Quem decide a compatibilidade eh ACQUIRER_MODES_FOR (lib/ops-modes).
        // Resumo: black/white pegam "both" como fallback; hot e sag sao
        // categorias EXCLUSIVAS e so usam adquirente marcada pra elas.
        mode: {
          in: acquirerModesFor(userMode),
        },
        ...acqVisWhere,
      },
    });
    if (!forced) {
      return {
        ok: false,
        attempts: [],
        finalError:
          "Adquirente escolhida indisponível (inativa, modo incompatível ou não suporta PIX).",
      };
    }
    const handler = getHandler(forced.code);
    if (!handler) {
      return {
        ok: false,
        attempts: [],
        finalError: `Adquirente ${forced.code} sem handler implementado.`,
      };
    }
    const creds = resolveCreds(forced as AcquirerRow);
    try {
      const charge = await handler(input, creds);
      if (charge.qrCode) {
        maybeUpdateNominal(forced.id, charge.qrCode).catch(() => {});
      }
      return {
        ok: true,
        charge,
        acquirerId: forced.id,
        acquirerCode: forced.code,
        attempts: [
          { ok: true, charge, acquirerId: forced.id, acquirerCode: forced.code },
        ],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return {
        ok: false,
        attempts: [
          { ok: false, acquirerId: forced.id, acquirerCode: forced.code, error: msg },
        ],
        finalError: `Adquirente ${forced.code} falhou: ${msg}`,
      };
    }
  }

  // ====== TRAVA > OVERRIDE DE PRODUTO (02/08/2026, davi) ======
  // "arruma isso para todos os sellers, mesmo erro pro caio oliveira
  //  bitencourt. Arruma para todo mundo!"
  //
  // O override por produto rodava ANTES da trava e dava `return` direto —
  // a trava NUNCA era consultada. Assinatura na producao: transacoes com
  // `acquirer_attempts = 1` numa adquirente que nao e a travada (so 1 handler
  // chamado = ninguem tentou a travada antes). Conferido em 02/08:
  //
  //   seller-d@exemplo.com  trava safepix-4     -> sharkhub-3/sharkhub-6
  //   seller-e@exemplo.com  trava safepix-2     -> pluggou-hot 27/27
  //   seller-g@exemplo.com  trava pluggou-white -> safepix-7 19x
  //
  // A trava e a promessa mais forte da UI ("gera SO nesta adquirente. Cai
  // pras outras so se ela falhar") e e global do seller; o override e uma
  // config por produto, mais antiga. Trava ganha.
  //
  // O `forceAcquirerId` (cobranca avulsa) continua ACIMA da trava — la o
  // seller escolhe a adquirente na hora, pra aquela cobranca especifica.
  //
  // So vale se a travada estiver REALMENTE elegivel. Tem trava podre em
  // producao (otaviocolello aponta pra um acquirer id que nem existe mais,
  // varios sellers sem UserAcquirer row). Trava invalida nao pode derrubar
  // o override — cairia no fanout e mudaria o roteamento de quem ta ok.
  //
  // A query so roda quando ha override E trava — no caminho comum, custo 0.
  const rawLockedAcquirerId =
    (user?.lockedPixAcquirerByMode as Record<string, string | null> | null)?.[
      userMode
    ] ?? null;

  let lockBeatsOverride = false;
  if (
    rawLockedAcquirerId &&
    product?.acquirerOverrideEnabled &&
    product.acquirerOverrideId &&
    product.acquirerOverrideId !== rawLockedAcquirerId
  ) {
    await ensureUserAcquirerRowsExist(userId);
    const lockedUA = await prisma.userAcquirer.findFirst({
      where: {
        userId,
        acquirerId: rawLockedAcquirerId,
        pixActive: true,
        acquirer: {
          active: true,
          supportsPix: true,
          mode: {
            in: acquirerModesFor(userMode),
          },
          ...acqVisWhere,
        },
      },
      select: { acquirer: { select: { code: true } } },
    });
    if (lockedUA) {
      lockBeatsOverride = true;
      console.warn(
        `[dispatchPixCharge] override de produto IGNORADO — seller travou ` +
          `${lockedUA.acquirer.code} no modo ${userMode}. user=${userId} ` +
          `product=${productId ?? "?"}`,
      );
    }
  }

  // OVERRIDE: produto força adquirente específica.
  // Respeita UserAcquirer.pixActive (06/07/2026): mesmo com override do
  // produto, se seller pausou a adquirente, cai no fallback normal (que
  // ja filtra pixActive=true).
  // 29/07/2026: se o override FALHA (ex: sharkhub 422 amount exceeds max),
  // cai no fallback (guarda a falha nesta variavel pra incluir em attempts[]).
  let overrideFailure: ChargeAttempt | null = null;
  if (
    !lockBeatsOverride &&
    product?.acquirerOverrideEnabled &&
    product.acquirerOverrideId
  ) {
    // Idem force: garante bootstrap antes do check de pausada.
    await ensureUserAcquirerRowsExist(userId);
    const overrideUA = await prisma.userAcquirer.findFirst({
      where: {
        userId,
        acquirerId: product.acquirerOverrideId,
        pixActive: true,
      },
      select: { id: true },
    });
    const override = overrideUA
      ? await prisma.acquirer.findFirst({
          where: {
            id: product.acquirerOverrideId,
            active: true,
            supportsPix: true,
            mode: {
          in: acquirerModesFor(userMode),
        },
            ...acqVisWhere,
          },
        })
      : null;
    if (override) {
      const handler = getHandler(override.code);
      if (handler) {
        const creds = resolveCreds(override as AcquirerRow);
        try {
          const charge = await handler(input, creds);
          if (charge.qrCode) {
            maybeUpdateNominal(override.id, charge.qrCode).catch(() => {});
          }
          return {
            ok: true,
            charge,
            acquirerId: override.id,
            acquirerCode: override.code,
            attempts: [
              {
                ok: true,
                charge,
                acquirerId: override.id,
                acquirerCode: override.code,
              },
            ],
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          // 29/07/2026 (davi 'Dando erro para gerar pix, da uma olhada!' —
          // sharkhub-3 override retornando 422 'Amount exceeds the maximum
          // allowed' pra tx acima do limite da conta):
          //
          // ANTES: override falhou → return erro final (comentario original
          // dizia 'nao fazemos fallback automatico intencionalmente'). Mas
          // isso trava o cliente na tela 'Gerando QR' pra sempre — pior UX
          // possivel. Melhor gerar numa outra adquirente do que nao gerar.
          //
          // AGORA: registra a tentativa falha em attempts[] e CAI pro fluxo
          // normal de fanout abaixo (que respeita pixPriority do seller e
          // tenta as outras). Se todas falharem, o error final ainda inclui
          // o do override no historico pra auditoria.
          console.warn(
            `[dispatchPixCharge] override ${override.code} falhou (${msg}) — caindo pro fanout normal user=${userId}`,
          );
          // NAO retorna — deixa o fluxo continuar. A tentativa falha vai ser
          // registrada em attempts[] pelo loop principal, mas ja registro
          // aqui pra manter historico se todas fallharem depois.
          // Como attempts eh escopo do fluxo principal (declarado abaixo),
          // adiciono via variavel externa. Uso um marker temporario:
          overrideFailure = {
            ok: false as const,
            acquirerId: override.id,
            acquirerCode: override.code,
            error: msg,
          };
        }
      }
      // Handler não existe — cai pro fluxo normal abaixo (defensivo)
    }
    // Override inválido (deletado, modo incompatível, etc) — cai no fluxo normal
  }

  // GARANTE que TODAS as adquirentes globais ativas têm UserAcquirer pro user.
  // Antes só fazia bootstrap quando user.length===0 — agora se o admin cadastra
  // uma nova adquirente, todos os users ganham a row automaticamente na próxima
  // cobrança, sem precisar bootstrap manual.
  await ensureUserAcquirerRowsExist(userId);

  const userAcquirers = await prisma.userAcquirer.findMany({
    where: {
      userId,
      // NÃO filtra UserAcquirer.active (legacy): o cascade de desativar a
      // adquirente setava active=false e NUNCA restaurava no re-ativar, então
      // a PRIMÁRIA do seller sumia do dispatch mesmo com pixActive=true (bug
      // jun/2026: 48 configs afetadas, vendas caíam pra fallback). O flag
      // por-método (pixActive) é o source-of-truth — é o que o toggle do UI seta.
      pixActive: true,
      acquirer: {
        active: true,
        supportsPix: true,
        // Quem decide a compatibilidade eh ACQUIRER_MODES_FOR (lib/ops-modes).
        // Resumo: black/white pegam "both" como fallback; hot e sag sao
        // categorias EXCLUSIVAS e so usam adquirente marcada pra elas.
        mode: {
          in: acquirerModesFor(userMode),
        },
        ...acqVisWhere,
      },
    },
    orderBy: [{ pixPriority: "asc" }, { priority: "asc" }],
    include: { acquirer: true },
  });

  if (userAcquirers.length === 0) {
    // AUTO-SWITCH PRA BLACK (19/07/2026, davi): antes de retornar erro
    // "sem adquirente" — que faria o cliente NÃO PODER PAGAR — tenta
    // trocar o modo pra black. Se black tiver adquirente disponível,
    // a venda vai. Se nem black tiver, aí sim retorna erro.
    try {
      const { autoSwitchModeIfEmpty } = await import("./auto-switch-mode");
      const sw = await autoSwitchModeIfEmpty(userId, "pix");
      if (sw.switched) {
        console.warn(
          `[dispatchPixCharge] auto-switched user=${userId} ${sw.from} → ${sw.to} (0 acquirer no modo original)`,
        );
        // Re-query com o novo modo (agora black).
        const retryAcquirers = await prisma.userAcquirer.findMany({
          where: {
            userId,
            pixActive: true,
            acquirer: {
              active: true,
              supportsPix: true,
              mode: { in: ["black", "both"] },
              ...acqVisWhere,
            },
          },
          orderBy: [{ pixPriority: "asc" }, { priority: "asc" }],
          include: { acquirer: true },
        });
        if (retryAcquirers.length > 0) {
          // Substitui pra o restante do fluxo continuar como se sempre
          // tivesse sido black. `userMode` local vira "black" pra o
          // check de lockedAcquirerId e outros pontos abaixo.
          userAcquirers.push(...retryAcquirers);
          userMode = "black";
        }
      }
    } catch (e) {
      console.error("[dispatchPixCharge] auto-switch attempt failed:", e);
    }
  }

  if (userAcquirers.length === 0) {
    // ALERTA CRITICO: usuario tem 0 adquirentes elegiveis. Quase certeza
    // que eh problema de config — todas as user-acquirers do mode certo
    // estao com pixActive=false, OU todas as Acquirer globais do mode
    // estao com globalEnabled=false, OU o ensureUserAcquirerRowsExist
    // teve falha silenciosa. Loga com detalhes pra diagnostico.
    console.error(
      `[dispatchPixCharge] EMPTY user_acquirers for user=${userId} mode=${userMode}. ` +
        `tx vai dar FAILED — verifique config em /dashboard/adquirentes ` +
        `e /admin01/acquirers (globalEnabled deve ser true + supportsPix=true).`,
    );
    return {
      ok: false,
      attempts: [],
      finalError: `Nenhuma adquirente ${userMode.toUpperCase()} disponível. Verifique sua configuração em Adquirentes.`,
    };
  }

  // PARALLEL SPECULATIVE FANOUT (jun/2026 — solução pra timeouts em produção):
  //
  // Em vez de cascata SEQUENCIAL (que esperava 8-15s POR TENTATIVA quando uma
  // adquirente travava na rede), dispara as TOP-N=3 adquirentes em PARALELO com
  // Promise.any. Quem responde primeiro VENCE; as outras são CANCELADAS via
  // AbortController (signal propagado pros providers). Se TODAS as N da batch
  // falham, parte pro próximo batch (cascata de batches paralelos) — fallback
  // EXAUSTIVO garante "PIX nunca falha".
  //
  // Vantagens:
  //   • p50 = melhor tempo entre N (não pior); típico ~1s.
  //   • p99 limitado a max(timeout_provider) + 1 batch extra ≈ 7-14s, NÃO 30-60s.
  //   • Trabalho perdido mínimo: PSPs criam PIX sem custo se não pago; expira.
  //
  // Por que N=4:
  //   • 5 SharkHub + safepix + abacatepay + sharkbanking + mercadopago = ~9.
  //   • Mantém ordering do seller (pixPriority), agora REORDENADO por saúde:
  //     adquirentes degradadas vão pro fim (mas continuam no fallback).
  //
  // 08/07/2026 (david: "quanto antes o pix for gerado melhor"): N=4 -> N=8
  // pra que TODAS as adquirentes eligiveis de um seller mediano (2-6) sejam
  // atacadas SIMULTANEAMENTE no 1o batch. Quem devolve primeiro vence — as
  // outras sao abortadas via AbortController. PSP nao paga PIX gerado nao
  // pago (expira sem custo). Speed absoluta.
  const FANOUT_BATCH = 8;
  const attempts: ChargeAttempt[] = [];
  // 29/07/2026: se o override do produto falhou acima, ja inclui a tentativa
  // aqui pra que apareca no historico + no finalError se todas fallharem.
  if (overrideFailure) attempts.push(overrideFailure);
  // Filtra a adquirente do override do pool de fallback (nao re-tenta a
  // mesma que ja falhou — economiza request e evita duplicata no painel PSP).
  const overrideFailedAcqId = overrideFailure?.acquirerId ?? null;

  // Pré-resolve handlers e creds pra evitar trabalho redundante dentro da
  // batch (sai do hot-path do Promise.any).
  const eligible: Array<{
    ua: (typeof userAcquirers)[number];
    handler: NonNullable<ReturnType<typeof getHandler>>;
    creds: ReturnType<typeof resolveCreds>;
  }> = [];
  for (const ua of userAcquirers) {
    if (ua.acquirer.id === overrideFailedAcqId) continue; // ja falhou acima
    const handler = getHandler(ua.acquirer.code);
    if (!handler) {
      attempts.push({
        ok: false,
        acquirerId: ua.acquirer.id,
        acquirerCode: ua.acquirer.code,
        error: `Handler não implementado: ${ua.acquirer.code}`,
      });
      continue;
    }
    eligible.push({ ua, handler, creds: resolveCreds(ua.acquirer as AcquirerRow) });
  }

  // SAÚDE-AWARE (jun/2026): joga as adquirentes DEGRADADAS (timeout/rede
  // recente) pro FIM da fila, SEM remover nenhuma — fallback exaustivo intacto,
  // a lista NUNCA esvazia. Array.prototype.sort é ESTÁVEL: a ordem de
  // pixPriority é preservada entre as saudáveis e entre as degradadas. Resultado:
  // o 1º batch tende a ser 100% saudável → p50 ainda menor, menos timeouts.
  eligible.sort((a, b) => {
    const da = isAcquirerDegraded(a.ua.acquirer.id) ? 1 : 0;
    const db = isAcquirerDegraded(b.ua.acquirer.id) ? 1 : 0;
    return da - db;
  });

  // TRAVA POR MODO (jun/2026): se o seller TRAVOU uma adquirente nominal pro
  // modo atual (User.lockedPixAcquirerByMode[userMode]), ela vira um BATCH SOLO
  // no TOPO do plano — o PIX é gerado SÓ nela, com prioridade MÁXIMA (timeout +
  // AbortController próprios, igual a qualquer batch de 1). Só cai pro fanout
  // das demais (fallback exaustivo) se a travada FALHAR. Se a travada não
  // estiver elegível (desativada / modo incompatível / sem handler), o
  // findIndex dá -1 e caímos no fanout normal — a trava NUNCA bloqueia a
  // geração. Sobrepõe o reorder por saúde de propósito (lock = vontade explícita
  // do seller > heurística de saúde), mas a travada continua alimentando a
  // saúde em memória normalmente.
  //
  // 02/08/2026: lido la em cima (rawLockedAcquirerId), antes do override por
  // produto — a trava precisa ser conhecida ANTES pra poder vencer o override.
  // Reusado aqui pra os dois pontos nao poderem divergir.
  //
  // Nota sobre o auto-switch pra black (linha ~930): ele mexe em `userMode`
  // DEPOIS desta leitura. Nao gera inconsistencia — o auto-switch so dispara
  // com 0 adquirentes elegiveis no modo original, e nesse cenario a travada
  // desse modo tambem nao existe, entao o findIndex abaixo da -1 de qualquer
  // jeito e caimos no fanout black normal.
  const lockedAcquirerId = rawLockedAcquirerId;

  // Monta o PLANO de batches. Com trava elegível: [[travada], ...fanout(resto)].
  // Sem trava: fanout normal de FANOUT_BATCH em FANOUT_BATCH.
  //
  // 24/07/2026 (davi: 'Muito seller reclamando que mesmo botando a pagarme
  // como primeiro nas adquirentes ta gerando na rapid pag'). Fanout paralelo
  // ignora ordem: 8 adquirentes vao em paralelo, a mais rapida ganha. Fix:
  // primeira da lista (pixPriority=0) SEMPRE vira batch SOLO no topo COM
  // TIMEOUT de PRIORITY_SOLO_TIMEOUT_MS (3s). Se responder em 3s, respeitou a
  // ordem do seller. Se demorar mais que isso, aborta e cai pro fanout normal
  // do resto — evita penalizar latencia quando a primeira ta ruim.
  const isCaju = (e: (typeof eligible)[number]) =>
    e.ua.acquirer.code.startsWith("caju");

  // ====== TIMEOUT DA CAJU EM BATCH SOLO (02/08/2026, davi) ======
  // "Seller enzoazzi76 ta com a pagarme travada e ta gerando em outras"
  //
  // A Caju roda em Render e responde em 8-12s. Medido em producao 02/08 nas
  // duas sub-keys Pagar.me: 8.4s / 8.8s / 9.4s / 11.3s — TODAS acima do
  // default de 8s do provider. Resultado: a travada estourava o timeout
  // SEMPRE, caia pro fanout, e a sharkhub (rapida) ganhava a corrida. Em 72h
  // a caju-pagarme-3 travada nao venceu UMA vez.
  //
  // Pior: o PIX que a Caju criou depois do nosso abort virava orfao no painel
  // dela — o "pix duplicado" de ontem tem a mesma raiz.
  //
  // Fix: batch SOLO com Caju (travada ou primeira-da-ordem) ganha timeout de
  // 15s. So vale pro solo — no fanout paralelo ela perde a corrida de
  // qualquer jeito e o budget de POSTs ja limita o estrago.
  const CAJU_SOLO_TIMEOUT_MS = 15_000;

  const batchPlan: Array<{
    items: typeof eligible;
    /** timeout em ms pra este batch (Promise.race abort se estourar) */
    timeoutMs?: number;
    /** timeout passado PRO PROVIDER (override do default dele). */
    perCallTimeoutMs?: number;
  }> = [];
  const lockedIdx = lockedAcquirerId
    ? eligible.findIndex((e) => e.ua.acquirer.id === lockedAcquirerId)
    : -1;

  // ====== TRAVA MORTA: AVISA EM VEZ DE VAZAR CALADO (05/08/2026, davi) ======
  // "np pagamentos nao ta gerando pro seller mesmo estando em primeiro!"
  //
  // Quando a travada nao esta em `eligible`, o lockedIdx da -1 e o dispatch
  // cai no fanout SEM DIZER NADA. O seller (e o admin) continuam vendo a
  // adquirente marcada como travada na UI enquanto 100% das vendas saem em
  // outra. Sintoma perfeito de "esta em primeiro mas nao gera".
  //
  // Ficou critico HOJE: ao fazer `hiddenFromSellers` bloquear roteamento
  // (commit 2c3b635, pedido do davi de manha), toda trava apontando pra uma
  // adquirente ESCONDIDA virou trava morta de uma vez. Medido em 06/08:
  //   seller-c@exemplo.com  trava safepix-7       (escondida)  0/6
  //   seller-m@exemplo.com  trava sharkhub-donate (escondida)  1/13
  //   seller-h@exemplo.com  trava pluggou-black2  (escondida)  4/5
  //   seller-o@exemplo.com  trava id inexistente  (podre)      26/31
  //
  // Nao da pra "consertar" roteando na escondida — a regra de hoje e explicita
  // ("se o seller nao ve, nao roda"). O que da pra consertar e o SILENCIO:
  // loga e abre AdminNotification pro admin desesconder a adquirente ou
  // limpar a trava. Best-effort, nunca bloqueia a geracao do PIX.
  if (lockedAcquirerId && lockedIdx < 0) {
    const motivo = await prisma.acquirer
      .findUnique({
        where: { id: lockedAcquirerId },
        select: {
          code: true,
          active: true,
          globalEnabled: true,
          hiddenFromSellers: true,
          supportsPix: true,
          mode: true,
        },
      })
      .catch(() => null);
    const causa = !motivo
      ? "adquirente nao existe mais (trava podre)"
      : motivo.hiddenFromSellers
        ? "adquirente ESCONDIDA (hiddenFromSellers=true) — escondida nao roteia"
        : !motivo.globalEnabled
          ? "globalEnabled=false"
          : !motivo.active
            ? "active=false"
            : !motivo.supportsPix
              ? "nao suporta PIX"
              : `modo incompativel (adquirente=${motivo.mode}, seller=${userMode}) ou UserAcquirer.pixActive=false`;
    console.error(
      `[dispatchPixCharge] TRAVA MORTA user=${userId} mode=${userMode} ` +
        `travada=${motivo?.code ?? lockedAcquirerId} — ${causa}. ` +
        `Caindo no fanout (${eligible.map((e) => e.ua.acquirer.code).join(",")}).`,
    );
    // Dedup por (tipo, user) nas ultimas 12h — nao floodar o painel do admin
    // num seller de alto volume.
    prisma.adminNotification
      .findFirst({
        where: {
          type: "acquirer_lock_dead",
          targetUserId: userId,
          createdAt: { gte: new Date(Date.now() - 12 * 3600 * 1000) },
        },
        select: { id: true },
      })
      .then((ja) => {
        if (ja) return null;
        return prisma.adminNotification.create({
          data: {
            type: "acquirer_lock_dead",
            targetUserId: userId,
            message:
              `Trava de adquirente MORTA — ${user?.email ?? userId} travou ` +
              `${motivo?.code ?? lockedAcquirerId} no modo ${userMode}, mas ela nao roteia: ` +
              `${causa}. As vendas estao saindo em outra adquirente sem o seller saber.`,
            payload: {
              user_id: userId,
              user_email: user?.email ?? null,
              mode: userMode,
              locked_acquirer_id: lockedAcquirerId,
              locked_acquirer_code: motivo?.code ?? null,
              cause: causa,
              fallback_pool: eligible.map((e) => e.ua.acquirer.code),
            } as never,
          },
        });
      })
      .catch(() => {});
  }

  let fanoutPool = eligible;
  if (lockedIdx >= 0) {
    // TRAVADA: o seller escolheu ESSA adquirente. Se for Caju, da o tempo que
    // ela precisa (15s) — senao a trava nunca funciona.
    const locked = eligible[lockedIdx];
    batchPlan.push({
      items: [locked],
      ...(isCaju(locked) ? { perCallTimeoutMs: CAJU_SOLO_TIMEOUT_MS } : {}),
    });
    fanoutPool = eligible.filter((_, i) => i !== lockedIdx);

    // IRMAS DO MESMO NOMINAL: se a travada for Caju, as outras sub-keys que
    // caem no MESMO nominal (caju-pagarme-3 e caju-pagarme-2 sao as duas
    // "PAGAR.ME S.A.") viram batch SOLO logo depois — ANTES do fanout geral.
    // Sem isso a irma ia pro fanout paralelo e perdia a corrida pra sharkhub
    // (300ms vs 9s da Caju): o seller travava Pagar.me e o PIX saia na
    // sharkhub. Com o solo, a trava vale pro NOMINAL, nao so pra sub-key.
    if (isCaju(locked)) {
      const nominal = locked.ua.acquirer.nominalName?.trim().toLowerCase();
      if (nominal) {
        const irmas = fanoutPool.filter(
          (e) =>
            isCaju(e) &&
            e.ua.acquirer.nominalName?.trim().toLowerCase() === nominal,
        );
        for (const irma of irmas) {
          batchPlan.push({
            items: [irma],
            perCallTimeoutMs: CAJU_SOLO_TIMEOUT_MS,
          });
        }
        fanoutPool = fanoutPool.filter((e) => !irmas.includes(e));
      }
    }
  } else if (fanoutPool.length >= 2) {
    // Sem trava explicita + tem pelo menos 2 elegiveis → primeira da fila
    // vira batch solo com timeout curto (respeitar ordem sem travar).
    // Caju precisa de 15s pra responder — com os 3s padrao a primeira-da-ordem
    // Caju era abort garantido (e PIX orfao no painel dela).
    const primary = fanoutPool[0];
    const primaryIsCaju = isCaju(primary);
    batchPlan.push({
      items: [primary],
      timeoutMs: primaryIsCaju ? CAJU_SOLO_TIMEOUT_MS : 3000,
      ...(primaryIsCaju ? { perCallTimeoutMs: CAJU_SOLO_TIMEOUT_MS } : {}),
    });
    fanoutPool = fanoutPool.slice(1);
  }

  // ============ TESTE A/B DE ADQUIRENTES (17/07/2026, davi) ============
  // Se o seller tem um teste running que inclui alguma adquirente elegível
  // AINDA sem bater target, força ela como batch solo (round-robin: a com
  // menos attempts vence). Isso faz o teste balancear as tentativas entre
  // as adquirentes do teste, ignorando a prioridade normal do fanout.
  //
  // Vem DEPOIS do locked (locked = preferência explícita > teste) e ANTES
  // do fanout normal. Se falhar, cai pro fallback exaustivo.
  //
  // Coletamos aqui os IDs de adquirentes que fazem parte do teste running
  // (pra depois, ao winner, sabermos se devemos incrementar `results` no
  // AcquirerTest). Se não houver teste, fica vazio (no-op).
  let testAcquirerIdsInPlay: Set<string> = new Set();
  try {
    const runningTest = await getRunningTestForUser(userId);
    if (runningTest) {
      testAcquirerIdsInPlay = new Set(runningTest.acquirerIds);
      const eligibleIdsForPick = fanoutPool.map((e) => e.ua.acquirer.id);
      const pickedId = pickTestAcquirer(runningTest, eligibleIdsForPick);
      if (pickedId) {
        const pickedIdx = fanoutPool.findIndex(
          (e) => e.ua.acquirer.id === pickedId,
        );
        if (pickedIdx >= 0) {
          batchPlan.push({ items: [fanoutPool[pickedIdx]] });
          fanoutPool = fanoutPool.filter((_, i) => i !== pickedIdx);
        }
      }
    }
  } catch (e) {
    console.error("[dispatchPixCharge] getRunningTest failed (ignoring):", e);
  }

  // ============ ANTI-QUADRUPLICACAO CAJU (10/07/2026, david) ============
  // "os pix gerados na caju estao chegando quadriplicados, ARRUMA ISSO!"
  //
  // Todas as sub-keys Caju (caju, caju-woovi, caju-pagarme-*, caju-valana,
  // caju-woovi-2) apontam pra MESMA conta backend deles. Disparar N sub-keys
  // em paralelo cria N PIX distintos no painel Caju — o cliente que so ve o
  // vencedor no Trilho, mas o painel deles fica poluido com 4-5x cada tx.
  //
  // Solucao: em CADA batch do fanout paralelo, permitir NO MAXIMO 1 Caju.
  // Cajus extras viram batches SOLO subsequentes (retries se a primeira
  // Caju falhar). Non-Cajus mantem paralelismo normal — nao perde speed.
  //
  // Ex: seller thiago tem 5 Cajus + 1 pluggou-white:
  //   Antes:  batch=[caju3,caju2,caju,cajuw2,cajuv,pluggou] → 5 PIX no painel Caju
  //   Depois: batch=[caju3,pluggou] + [caju2] + [caju] + [cajuw2] + [cajuv]
  //           → so 1 PIX no painel Caju por request (a que vencer o primeiro batch)
  //
  // Se a Caju do primeiro batch falhar, o proximo batch tenta outra Caju
  // (solo) — o comportamento de fallback exaustivo continua intacto.
  /**
   * Essa falha da Caju provavelmente DEIXOU um PIX orfao no painel dela?
   *
   *  - "Caju 4xx: ..." → ela respondeu recusando (limite de valor, CPF em
   *    blacklist, sub-key invalida). Recusou ANTES de criar. Painel limpo.
   *  - "Caju credentials missing" → nem chegou a sair POST.
   *  - abort / timeout / rede / 5xx / "resposta incompleta" → o POST chegou
   *    la e o PIX provavelmente nasceu. Conta como poluicao do painel.
   */
  const cajuFailureLikelyCreatedPix = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    if (/^Caju credentials missing/i.test(msg)) return false;
    const m = /^Caju (\d{3}):/.exec(msg);
    if (m) return Number(m[1]) >= 500;
    return true;
  };
  const cajus = fanoutPool.filter(isCaju);
  const nonCajus = fanoutPool.filter((e) => !isCaju(e));

  if (cajus.length === 0) {
    // Sem Caju — fanout normal.
    for (let s = 0; s < nonCajus.length; s += FANOUT_BATCH) {
      batchPlan.push({ items: nonCajus.slice(s, s + FANOUT_BATCH) });
    }
  } else {
    // Intercala: 1 Caju por batch + (FANOUT_BATCH-1) non-Cajus.
    const cajusQueue = [...cajus];
    for (let s = 0; s < nonCajus.length; s += FANOUT_BATCH - 1) {
      const batch = nonCajus.slice(s, s + (FANOUT_BATCH - 1));
      const caju = cajusQueue.shift();
      if (caju) batch.push(caju);
      if (batch.length > 0) batchPlan.push({ items: batch });
    }
    // Cajus restantes (mais Cajus que non-Cajus) → batches SOLO subsequentes.
    for (const c of cajusQueue) batchPlan.push({ items: [c] });
  }

  // ====== BUDGET DE POSTs NA CAJU POR DISPATCH (01/08/2026, davi) ======
  // "to achando que ta sendo gerado pix duplicado na caju!"
  //
  // O anti-quadruplicacao acima so limita 1 Caju POR BATCH — nao limita o
  // TOTAL. Quem tem 5 sub-keys Caju ativas, num dispatch que falha geral,
  // manda POST pras 5. E o retry do plano inteiro (MAX_FULL_RETRIES=8)
  // multiplica: 5 x 8 = ate 40 POSTs na Caju numa UNICA venda. Medido em
  // producao: tx com 137 tentativas (8 retries x 28 adquirentes + 1).
  //
  // O ponto critico: quando a gente ABORTA (controller.abort(), timeout de
  // 8s do provider, ou priority_batch_timeout de 3s), o abort mata SO o
  // fetch local. O POST ja chegou no backend da Caju e ela CRIA o PIX do
  // mesmo jeito. Ela roda em Render (cold start ja medido em ~15s), entao
  // estourar o timeout e comum. Resultado: PIX orfao no painel dela pra
  // cada sub-key tentada — o "duplicado" que o davi ta vendo.
  //
  // Fix: 1 POST na Caju por dispatch. Gastou, as outras Cajus somem das
  // batches seguintes (as non-Caju continuam normais, sem perder fallback).
  //
  // Excecao: recusa LIMPA da Caju (4xx — limite de valor, CPF invalido,
  // credencial) nao cria PIX nenhum, entao devolve o budget e a proxima
  // sub-key pode tentar. So abort/timeout/5xx queimam o budget.
  // Excecao da TRAVA (02/08/2026): se o seller travou uma Caju, ele quer
  // AQUELE nominal. Se a travada falhar, a sub-key irma (caju-pagarme-3 ->
  // caju-pagarme-2, mesmo "PAGAR.ME S.A.") tem que poder assumir — senao a
  // venda vaza pra sharkhub/pixzy e a trava vira enfeite. Budget 2 nesse caso.
  const lockedIsCaju = lockedIdx >= 0 && isCaju(eligible[lockedIdx]);
  const CAJU_MAX_POSTS_PER_DISPATCH = lockedIsCaju ? 2 : 1;
  let cajuPostsUsed = 0;

  // RETRY DO PLANO INTEIRO (08/07/2026, david: "quanto antes o pix for gerado
  // melhor"). Agora: 8 retries rapidos com backoff MENOR — tenta muito, sem
  // esperar muito. Total ~4s no pior caso. Cron pending-charge-retry pega
  // o que sobrar. Prioridade absoluta: SPEED + generation.
  const MAX_FULL_RETRIES = 8;
  const RETRY_BACKOFFS_MS = [0, 100, 200, 350, 600, 900, 1200, 1500]; // total ~4.8s
  for (let retry = 0; retry < MAX_FULL_RETRIES; retry++) {
    if (retry > 0) {
      const wait = RETRY_BACKOFFS_MS[retry] ?? 2000;
      await new Promise<void>((r) => setTimeout(r, wait));
      console.warn(
        `[dispatchPixCharge] retry ${retry}/${MAX_FULL_RETRIES - 1} apos ${wait}ms — user=${userId} mode=${userMode}`,
      );
    }
  // Processa cada batch do plano (1ª = travada solo, se houver; depois fanout
  // paralelo de FANOUT_BATCH adquirentes).
  for (const batchEntry of batchPlan) {
    // BUDGET CAJU: gastou o POST desta venda, tira as Cajus das batches
    // seguintes. As non-Caju seguem normalmente — fallback intacto.
    const budgetLeft = cajuPostsUsed < CAJU_MAX_POSTS_PER_DISPATCH;
    let batch = batchEntry.items;
    if (!budgetLeft) {
      const semCaju = batchEntry.items.filter((e) => !isCaju(e));
      if (semCaju.length !== batchEntry.items.length) {
        const cortadas = batchEntry.items
          .filter(isCaju)
          .map((e) => e.ua.acquirer.code)
          .join(",");
        console.warn(
          `[dispatchPixCharge] budget Caju gasto (${cajuPostsUsed}/${CAJU_MAX_POSTS_PER_DISPATCH}) — pulando ${cortadas} pra nao duplicar PIX no painel. user=${userId}`,
        );
      }
      batch = semCaju;
    }
    const batchTimeoutMs = batchEntry.timeoutMs;
    if (batch.length === 0) continue;

    // Toda Caju que entra na corrida ja conta como POST no backend deles —
    // mesmo que a gente aborte 1ms depois, o PIX nasce la do mesmo jeito.
    // Debitado ANTES da corrida; devolvido abaixo se a recusa for limpa.
    for (const e of batch) if (isCaju(e)) cajuPostsUsed++;

    // 1 AbortController por adquirente do batch. Quando uma VENCE, abortamos
    // as outras IMEDIATAMENTE — o provider recebe o signal e mata o fetch.
    const controllers = batch.map(() => new AbortController());

    const racers = batch.map((entry, i) =>
      entry
        .handler(
          {
            ...input,
            signal: controllers[i].signal,
            // Batch solo da travada/primeira-da-ordem manda o timeout dela;
            // no fanout normal fica o default de cada provider.
            ...(batchEntry.perCallTimeoutMs
              ? { timeoutMs: batchEntry.perCallTimeoutMs }
              : {}),
          },
          entry.creds,
        )
        .then(
          (charge) => ({ ok: true as const, charge, entry, idx: i }),
          (err) => ({ ok: false as const, err, entry, idx: i }),
        ),
    );

    // Promise.any rejeita SÓ se TODAS falharem. Aqui usamos uma versão
    // customizada que aguarda a 1ª SUCESSO ou todas as falhas — assim
    // capturamos o erro DETERMINÍSTICO (4xx/credencial) sem esperar o
    // timeout INTEIRO dos demais.
    //
    // 24/07/2026 (davi: 'primeiro na ordem seja respeitado'): batches com
    // timeoutMs param TUDO ao estourar o tempo — se ninguem venceu ate la,
    // aborta os controllers e cai pro proximo batch. Assim a "primary solo"
    // nao trava a request por 15s se a primeira for lenta.
    let winner: { charge: CreateChargeResult; entry: typeof batch[number] } | null = null;
    const failures: Array<{ err: unknown; entry: typeof batch[number] }> = [];

    await new Promise<void>((resolveAll) => {
      let settled = 0;
      let done = false;
      const timeoutId = batchTimeoutMs
        ? setTimeout(() => {
            if (done) return;
            done = true;
            // Aborta todos os racers em andamento — vira "failure" pra batch
            // e o loop segue pro proximo batch.
            for (const c of controllers) c.abort();
            for (const entry of batch) {
              failures.push({
                err: new Error(`priority_batch_timeout_${batchTimeoutMs}ms`),
                entry,
              });
            }
            resolveAll();
          }, batchTimeoutMs)
        : null;
      for (const r of racers) {
        r.then((result) => {
          if (done) return;
          settled++;
          if (result.ok) {
            winner = { charge: result.charge, entry: result.entry };
            done = true;
            if (timeoutId) clearTimeout(timeoutId);
            // CANCELA OS DEMAIS imediatamente — economiza CPU/network nos
            // PSPs perdedores. Não aborta o vencedor (já completou).
            for (let i = 0; i < controllers.length; i++) {
              if (i !== result.idx) controllers[i].abort();
            }
            resolveAll();
            return;
          }
          failures.push({ err: result.err, entry: result.entry });
          if (settled === racers.length) {
            done = true;
            if (timeoutId) clearTimeout(timeoutId);
            resolveAll();
          }
        });
      }
    });

    // Registra falhas da batch no histórico (ordering preservado) e alimenta
    // a saúde em memória. Só timeout/rede (transiente) degrada a adquirente;
    // 4xx/credencial NÃO (ela está no ar, só recusou esta request).
    for (const f of failures) {
      // Recusa LIMPA da Caju (4xx) nao criou PIX — devolve o budget pra
      // proxima sub-key poder tentar. Abort/timeout/5xx nao devolvem.
      if (isCaju(f.entry) && !cajuFailureLikelyCreatedPix(f.err)) {
        cajuPostsUsed = Math.max(0, cajuPostsUsed - 1);
      }
      attempts.push({
        ok: false,
        acquirerId: f.entry.ua.acquirer.id,
        acquirerCode: f.entry.ua.acquirer.code,
        error: f.err instanceof Error ? f.err.message : "unknown",
      });
      recordAcquirerOutcome(
        f.entry.ua.acquirer.id,
        false,
        isTransientFetchError(f.err),
      );
    }

    if (winner) {
      // Anota a tentativa vencedora.
      const w = winner as { charge: CreateChargeResult; entry: typeof batch[number] };
      // Self-heal: vencedora volta a ser "saudável" imediatamente.
      recordAcquirerOutcome(w.entry.ua.acquirer.id, true, false);
      attempts.push({
        ok: true,
        charge: w.charge,
        acquirerId: w.entry.ua.acquirer.id,
        acquirerCode: w.entry.ua.acquirer.code,
      });
      // Fire-and-forget: contador + nominal refresh.
      prisma.userAcquirer
        .update({
          where: { id: w.entry.ua.id },
          data: { totalAttempts: { increment: 1 } },
        })
        .catch(() => {});
      // A/B TEST: incrementa attempts se essa adquirente faz parte do teste
      // running — mesmo que tenha vencido "naturalmente" pelo fanout (não
      // apenas quando escolhida via pickTestAcquirer). Best-effort.
      if (testAcquirerIdsInPlay.has(w.entry.ua.acquirer.id)) {
        recordTestAttempt(userId, w.entry.ua.acquirer.id).catch(() => {});
      }
      if (w.charge.qrCode) {
        maybeUpdateNominal(w.entry.ua.acquirer.id, w.charge.qrCode).catch(() => {});
      }
      return {
        ok: true,
        charge: w.charge,
        acquirerId: w.entry.ua.acquirer.id,
        acquirerCode: w.entry.ua.acquirer.code,
        attempts,
      };
    }

    // Batch inteira falhou — tenta a próxima.
  }
  // Todos os batches do plano falharam — vai pro proximo retry (backoff).
  } // <-- fim do MAX_FULL_RETRIES

  console.error(
    `[dispatchPixCharge] TODAS as ${MAX_FULL_RETRIES} tentativas falharam — user=${userId} mode=${userMode} attempts=${attempts.length}`,
  );
  return {
    ok: false,
    attempts,
    finalError: attempts[attempts.length - 1]?.error || "Todas as adquirentes falharam.",
  };
}

/* ============ CARD / WALLETS DISPATCH ============ */

import {
  createStripePayment,
  type StripeCreds,
  type StripePaymentMethod,
} from "./providers/stripe";

export type CardChargeMethod =
  | "card"
  // 11/08/2026 (davi): "adcione uma opcao para boleto tambem nos checkouts".
  // Boleto entra por AQUI e nao por um dispatcher proprio porque o caminho e
  // identico ao do cartao hospedado: a adquirente devolve uma URL e o cliente
  // termina o pagamento fora do nosso dominio. O que muda e so o billingType
  // pedido e o prazo de vencimento.
  | "boleto"
  | "apple_pay"
  | "google_pay";

type CardDispatchOptions = {
  userId: string;
  productId?: string;
  amountCents: number;
  currency: string; // ISO 4217 (BRL, USD, EUR)
  customer: {
    name: string;
    email: string;
    country?: string;
    phone?: string;
    /**
     * CPF/CNPJ, so digitos. 11/08/2026: entrou por causa do BOLETO — a Asaas
     * recusa com "necessario preencher o CPF ou CNPJ do cliente". O checkout
     * ja coletava esse dado, mas ele parava aqui e nunca chegava na
     * adquirente. Cartao nao exige, entao ninguem tinha notado.
     */
    document?: string | null;
  };
  method: CardChargeMethod;
  description?: string;
  statementDescriptor?: string;
  metadata?: Record<string, string>;
  returnUrl: string;
};

type CardDispatchResult = {
  ok: boolean;
  /** Stripe PaymentIntent ID (pi_...) ou MP payment ID */
  paymentId?: string;
  /** Client secret pra confirmar no frontend (Stripe Elements) */
  clientSecret?: string;
  /**
   * URL de checkout HOSPEDADO (AbacatePay billing) — o frontend redireciona
   * o browser pra cá em vez de usar Stripe Elements inline. Mutuamente
   * exclusivo com clientSecret.
   */
  redirectUrl?: string;
  acquirerId?: string;
  acquirerCode?: string;
  attempts: ChargeAttempt[];
  finalError?: string;
};

/**
 * Resolve creds do Stripe a partir da Acquirer.row. Stripe usa publicKey
 * (publishable) + secretKeyEnc (sk_...) + metadataEnc.webhookSecret.
 */
function resolveStripeCreds(a: {
  publicKey: string | null;
  secretKeyEnc: string | null;
  metadataEnc: string | null;
}): StripeCreds | undefined {
  if (!a.publicKey || !a.secretKeyEnc) return undefined;
  try {
    let webhookSecret: string | undefined;
    if (a.metadataEnc) {
      try {
        const meta = JSON.parse(decryptString(a.metadataEnc)) as {
          webhookSecret?: string;
        };
        webhookSecret = meta.webhookSecret;
      } catch {
        // metadata pode não ser JSON válido — segue sem webhook secret
      }
    }
    return {
      publishableKey: a.publicKey,
      secretKey: decryptString(a.secretKeyEnc),
      webhookSecret,
    };
  } catch (e) {
    console.error("[acquirers] failed to decrypt stripe creds:", e);
    return undefined;
  }
}

/**
 * Dispatch de cobrança em cartão/wallet (não PIX). Filtra adquirentes
 * por mode + capability (supportsCard, supportsApplePay, etc) e tenta
 * em ordem de pixPriority (reaproveita o mesmo ordering — sem priority
 * separada por wallet pra começo).
 *
 * Hoje só Stripe está implementado pra esses métodos. MP card é roadmap
 * (Bricks no frontend gera card token, mas o pipeline é diferente).
 */
export async function dispatchCardCharge(
  opts: CardDispatchOptions,
): Promise<CardDispatchResult> {
  const { userId, productId, method } = opts;

  // DEPLOYMENT LOCK (05/07/2026): igual PIX, bloqueia se clone.
  const { assertAuthorizedDeployment } = await import(
    "./security/deployment-guard"
  );
  try {
    assertAuthorizedDeployment();
  } catch {
    return {
      ok: false,
      attempts: [],
      finalError: "Serviço indisponível. Tente novamente em alguns minutos.",
    };
  }

  // Pega o mode do user + override de produto (mesma lógica do PIX)
  // IMPORTANTE: pra cartão usa-se cardOpsMode (default white), NÃO pixOpsMode.
  // Quando seller liga cardOpsMode=black, só rola em adquirentes black que
  // suportem cartão (ex: Stripe black com fee 35% + R$10).
  const [user, product] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        cardOpsMode: true,
        forbiddenOpsModes: true,
        email: true,
        ownAcquirerPanelEnabled: true,
        ownAcquirerPanel: true,
        ownAcquirerPanelPublicModes: true,
      },
    }),
    productId
      ? prisma.product.findUnique({
          where: { id: productId },
          select: {
            acquirerOverrideEnabled: true,
            acquirerOverrideId: true,
          },
        })
      : Promise.resolve(null),
  ]);
  // AUTO-SWITCH (19/07/2026, davi): `let` pra permitir troca pra black.
  let userMode = user?.cardOpsMode ?? "white";
  // Email EFETIVO (sub-account herda pai).
  const effectiveEmailCard = await resolveEffectiveSellerEmail(prisma, userId);
  // PAINEL PROPRIO (19/07/2026, davi): mesma lógica do PIX pro cartão.
  const { acquirerOwnPanelWhere: ownCard } = await import(
    "./acquirer-visibility"
  );
  const ownCardWhere = ownCard(
    user?.ownAcquirerPanelEnabled ?? false,
    user?.ownAcquirerPanel as
      | import("./acquirer-visibility").OwnAcquirerPanelMap
      | null,
    userMode,
    user?.ownAcquirerPanelPublicModes ?? [],
  );
  // 05/08/2026 (davi): mesma regra do PIX — adquirente escondida NAO processa.
  // Mantido no mesmo helper de proposito: "escondida = fora do roteamento"
  // vale pra cartao tambem, senao o cartao vira a brecha que o PIX fechou.
  const acqVisWhere = ownCardWhere ?? acquirerDispatchWhere(effectiveEmailCard);

  // GATE: se o admin proibiu o modo de CARTÃO atual do seller, recusa a
  // cobrança (barreira final — impossível rodar cartão num modo bloqueado).
  if ((user?.forbiddenOpsModes ?? []).includes(userMode)) {
    return {
      ok: false,
      attempts: [],
      finalError:
        "Modo de adquirente indisponível para esta conta. Fale com o suporte.",
    };
  }

  // Mapeia method → flag de suporte na Acquirer table
  const capabilityFlag: Record<CardChargeMethod, string> = {
    card: "supportsCard",
    boleto: "supportsBoleto",
    apple_pay: "supportsApplePay",
    google_pay: "supportsGooglePay",
  };
  const flag = capabilityFlag[method];

  // OVERRIDE por produto (mesma lógica do PIX, adaptada).
  // Respeita UserAcquirer.cardActive (06/07/2026): se seller pausou a
  // adquirente pra cartao, override do produto tb cai no fallback normal.
  if (product?.acquirerOverrideEnabled && product.acquirerOverrideId) {
    const overrideUA = await prisma.userAcquirer.findFirst({
      where: {
        userId,
        acquirerId: product.acquirerOverrideId,
        cardActive: true,
      },
      select: { id: true },
    });
    const override = overrideUA
      ? await prisma.acquirer.findFirst({
          where: {
            id: product.acquirerOverrideId,
            active: true,
            mode: {
          in: acquirerModesFor(userMode),
        },
            [flag]: true,
            ...acqVisWhere,
          } as never,
        })
      : null;
    if (override) {
      return await tryAcquirer(override, opts, userMode);
    }
  }

  // Garante que novas adquirentes globais já tenham UserAcquirer pro user
  await ensureUserAcquirerRowsExist(userId);

  // Busca adquirentes do user que suportam o método na ordem dele
  const userAcquirers = await prisma.userAcquirer.findMany({
    where: {
      userId,
      // Idem PIX: NÃO filtra UserAcquirer.active (legacy) — cardActive manda.
      cardActive: true,
      acquirer: {
        active: true,
        // Quem decide a compatibilidade eh ACQUIRER_MODES_FOR (lib/ops-modes).
        // Resumo: black/white pegam "both" como fallback; hot e sag sao
        // categorias EXCLUSIVAS e so usam adquirente marcada pra elas.
        mode: {
          in: acquirerModesFor(userMode),
        },
        [flag]: true,
        ...acqVisWhere,
      } as never,
    },
    orderBy: [{ cardPriority: "asc" }, { priority: "asc" }],
    include: { acquirer: true },
  });

  if (userAcquirers.length === 0) {
    // AUTO-SWITCH PRA BLACK (19/07/2026, davi) — mesmo mecanismo do PIX.
    try {
      const { autoSwitchModeIfEmpty } = await import("./auto-switch-mode");
      const sw = await autoSwitchModeIfEmpty(userId, "card");
      if (sw.switched) {
        console.warn(
          `[dispatchCardCharge] auto-switched user=${userId} ${sw.from} → ${sw.to} (0 acquirer no modo original, method=${method})`,
        );
        const retry = await prisma.userAcquirer.findMany({
          where: {
            userId,
            cardActive: true,
            acquirer: {
              active: true,
              mode: { in: ["black", "both"] },
              [flag]: true,
              ...acqVisWhere,
            } as never,
          },
          orderBy: [{ cardPriority: "asc" }, { priority: "asc" }],
          include: { acquirer: true },
        });
        if (retry.length > 0) {
          userAcquirers.push(...retry);
          userMode = "black";
        }
      }
    } catch (e) {
      console.error("[dispatchCardCharge] auto-switch attempt failed:", e);
    }
  }

  if (userAcquirers.length === 0) {
    return {
      ok: false,
      attempts: [],
      finalError: `Nenhuma adquirente disponível para ${method} no modo ${userMode.toUpperCase()}.`,
    };
  }

  const attempts: ChargeAttempt[] = [];
  for (const ua of userAcquirers) {
    const result = await tryAcquirer(ua.acquirer, opts, userMode);
    if (result.ok) return result;
    attempts.push(...result.attempts);
  }

  return {
    ok: false,
    attempts,
    finalError:
      attempts[attempts.length - 1]?.error ?? "Todas as adquirentes falharam.",
  };
}

/**
 * Tenta uma adquirente específica. Hoje só Stripe está implementado pra
 * card/wallets.
 */
async function tryAcquirer(
  acquirer: {
    id: string;
    code: string;
    publicKey: string | null;
    secretKeyEnc: string | null;
    metadataEnc: string | null;
  },
  opts: CardDispatchOptions,
  _userMode: string,
): Promise<CardDispatchResult> {
  // Asaas: cartão e boleto via PÁGINA HOSPEDADA (`invoiceUrl`) — mesmo
  // desenho da AbacatePay logo abaixo, o frontend só redireciona.
  // 11/08/2026. Apple/Google Pay não entram: a Asaas não expõe API pra eles,
  // e prometer na tela o que a adquirente não faz é o padrão que já custou
  // caro aqui (o 2FA de saque, o escopo de API).
  if (acquirer.code.startsWith("asaas")) {
    if (opts.method !== "card" && opts.method !== "boleto") {
      return {
        ok: false,
        attempts: [
          {
            ok: false,
            acquirerId: acquirer.id,
            acquirerCode: acquirer.code,
            error: `Asaas não suporta ${opts.method}.`,
          },
        ],
        finalError: `Asaas não suporta ${opts.method}.`,
      };
    }
    const creds = resolveCreds(acquirer as AcquirerRow);
    if (!creds?.secretKey) {
      return {
        ok: false,
        attempts: [
          {
            ok: false,
            acquirerId: acquirer.id,
            acquirerCode: acquirer.code,
            error: "Asaas credentials missing.",
          },
        ],
        finalError: "Asaas credentials missing.",
      };
    }
    try {
      const billing = await asaasHostedBilling(
        {
          amountCents: opts.amountCents,
          billingType: opts.method === "boleto" ? "BOLETO" : "CREDIT_CARD",
          description: opts.description ?? "Pagamento",
          externalRef: opts.metadata?.transaction_id ?? "",
          customer: {
            name: opts.customer.name,
            email: opts.customer.email,
            phone: opts.customer.phone,
            document: { number: opts.customer.document ?? null },
          },
        },
        creds,
      );
      return {
        ok: true,
        paymentId: billing.id,
        redirectUrl: billing.url,
        acquirerId: acquirer.id,
        acquirerCode: acquirer.code,
        attempts: [
          { ok: true, acquirerId: acquirer.id, acquirerCode: acquirer.code },
        ],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return {
        ok: false,
        attempts: [
          {
            ok: false,
            acquirerId: acquirer.id,
            acquirerCode: acquirer.code,
            error: msg,
          },
        ],
        finalError: msg,
      };
    }
  }

  // AbacatePay: cartão via BILLING hospedado (retorna uma URL de checkout —
  // o frontend redireciona o cliente). Só método "card" (a AbacatePay não
  // oferece Apple/Google Pay).
  if (acquirer.code.startsWith("abacatepay")) {
    if (opts.method !== "card") {
      return {
        ok: false,
        attempts: [
          {
            ok: false,
            acquirerId: acquirer.id,
            acquirerCode: acquirer.code,
            error: `AbacatePay não suporta ${opts.method}.`,
          },
        ],
        finalError: `AbacatePay não suporta ${opts.method}.`,
      };
    }
    const creds = resolveCreds(acquirer as AcquirerRow);
    if (!creds?.secretKey) {
      return {
        ok: false,
        attempts: [
          {
            ok: false,
            acquirerId: acquirer.id,
            acquirerCode: acquirer.code,
            error: "AbacatePay credentials missing.",
          },
        ],
        finalError: "AbacatePay credentials missing.",
      };
    }
    try {
      const billing = await abacatePayCardBilling(
        {
          amountCents: opts.amountCents,
          description: opts.description ?? "Pagamento",
          externalRef: opts.metadata?.transaction_id ?? "",
          returnUrl: opts.returnUrl,
          completionUrl: opts.returnUrl,
          customer: {
            name: opts.customer.name,
            email: opts.customer.email,
            phone: opts.customer.phone,
          },
        },
        creds,
      );
      return {
        ok: true,
        paymentId: billing.id,
        redirectUrl: billing.url,
        acquirerId: acquirer.id,
        acquirerCode: acquirer.code,
        attempts: [
          { ok: true, acquirerId: acquirer.id, acquirerCode: acquirer.code },
        ],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return {
        ok: false,
        attempts: [
          {
            ok: false,
            acquirerId: acquirer.id,
            acquirerCode: acquirer.code,
            error: msg,
          },
        ],
        finalError: msg,
      };
    }
  }

  // Por enquanto, só Stripe — quando MP/Adyen forem adicionados, dispatch
  // por code
  if (
    acquirer.code === "stripe" ||
    acquirer.code.startsWith("stripe")
  ) {
    const creds = resolveStripeCreds(acquirer);
    if (!creds) {
      return {
        ok: false,
        attempts: [
          {
            ok: false,
            acquirerId: acquirer.id,
            acquirerCode: acquirer.code,
            error: "Stripe credentials missing or invalid.",
          },
        ],
        finalError: "Stripe credentials missing.",
      };
    }
    try {
      // Mapeia method interno → Stripe payment method
      const stripeMethod: StripePaymentMethod =
        opts.method === "card"
          ? "card"
          : opts.method === "apple_pay"
            ? "apple_pay"
            : "google_pay";

      const result = await createStripePayment(
        {
          amountCents: opts.amountCents,
          currency: opts.currency,
          customer: opts.customer,
          paymentMethod: stripeMethod,
          description: opts.description,
          statementDescriptor: opts.statementDescriptor,
          metadata: opts.metadata,
          returnUrl: opts.returnUrl,
        },
        creds,
      );

      return {
        ok: true,
        paymentId: result.id,
        clientSecret: result.clientSecret,
        acquirerId: acquirer.id,
        acquirerCode: acquirer.code,
        attempts: [
          {
            ok: true,
            acquirerId: acquirer.id,
            acquirerCode: acquirer.code,
          },
        ],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return {
        ok: false,
        attempts: [
          {
            ok: false,
            acquirerId: acquirer.id,
            acquirerCode: acquirer.code,
            error: msg,
          },
        ],
        finalError: msg,
      };
    }
  }

  // Outras adquirentes ainda não implementadas
  return {
    ok: false,
    attempts: [
      {
        ok: false,
        acquirerId: acquirer.id,
        acquirerCode: acquirer.code,
        error: `Handler ${opts.method} não implementado: ${acquirer.code}`,
      },
    ],
    finalError: `${acquirer.code} não suporta ${opts.method} ainda.`,
  };
}

/**
 * Resolve a lista de adquirentes candidatas pra VERIFICACAO via API num
 * webhook, ordenadas com a ORIGINADORA da tx primeiro.
 *
 * Por que existe: webhooks (MP, Stripe) precisam das creds da conta que
 * CRIOU a cobranca pra confirmar status / validar assinatura. Antes os
 * handlers faziam `findFirst({code: "mercadopago"})` (match exato + conta
 * arbitraria). Com multiplas contas (mercadopago-2, stripe-black, etc) isso
 * pegava a conta ERRADA → getStatus 404 → tx travava em PENDING.
 *
 * Agora: pega TODAS as contas do prefixo (startsWith), poe a originadora
 * (providerPayload.acquirer_id) na frente, e o caller tenta uma a uma.
 *
 * @param codePrefix "mercadopago" | "stripe" | "safepix" | "abacatepay"
 * @param acquirerId id da adquirente originadora (de providerPayload.acquirer_id)
 * @param extra      filtros opcionais (ex: { mode: "white" } pra internal purchases)
 */
export async function resolveWebhookAcquirers(
  codePrefix: string,
  acquirerId?: string | null,
  extra?: { mode?: string },
): Promise<
  Array<{
    id: string;
    code: string;
    publicKey: string | null;
    secretKeyEnc: string | null;
    metadataEnc: string | null;
    mode: string | null;
  }>
> {
  const acqs = await prisma.acquirer.findMany({
    where: {
      code: { startsWith: codePrefix },
      active: true,
      publicKey: { not: null },
      secretKeyEnc: { not: null },
      ...(extra?.mode ? { mode: extra.mode } : {}),
    },
    select: {
      id: true,
      code: true,
      publicKey: true,
      secretKeyEnc: true,
      metadataEnc: true,
      mode: true,
    },
  });
  // Originadora primeiro (mais provavel de ser a conta certa).
  acqs.sort((a, b) => {
    if (a.id === acquirerId) return -1;
    if (b.id === acquirerId) return 1;
    return 0;
  });
  return acqs;
}

/**
 * ADMIN-ONLY: gera um PIX direto numa adquirente ESPECIFICA (bypassa o
 * ordering por seller do dispatchPixCharge). Usado no painel
 * /admin01/acquirers pra:
 *   - DEPOSITAR dinheiro no gateway (admin gera + paga o PIX → cai na conta
 *     PSP daquela adquirente, aumentando o saldo real dela).
 *   - TESTAR o NOMINAL (nome do recebedor) que vai aparecer no QR daquela
 *     conta, sem precisar criar venda/checkout.
 *
 * NAO cria Transaction — eh uma cobranca avulsa. Se o PIX for pago, o webhook
 * do PSP cai em "unknown_transaction" (no-op) — nao credita saldo de seller.
 */
export async function adminChargePixOnAcquirer(opts: {
  acquirerId: string;
  amountCents: number;
  customer?: { name?: string | null; email?: string | null; cpf?: string | null };
  /**
   * Timeout do fetch da cobrança (ms). Admin NÃO é o fanout do checkout — aqui
   * a gente PRECISA que a conta responda (mesmo lenta, ~8s). Default 25s. As
   * contas SafePix lentas estavam estourando o default antigo de 5s.
   */
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  charge?: CreateChargeResult;
  acquirerCode?: string;
  nominalName?: string | null;
  error?: string;
}> {
  const acq = await prisma.acquirer.findUnique({
    where: { id: opts.acquirerId },
  });
  if (!acq) return { ok: false, error: "Adquirente nao encontrada." };
  if (!acq.supportsPix) {
    return { ok: false, error: "Esta adquirente nao suporta PIX." };
  }
  const handler = getHandler(acq.code);
  if (!handler) {
    return { ok: false, error: `Handler PIX nao implementado pra "${acq.code}".` };
  }
  const creds = resolveCreds(acq as AcquirerRow);

  // Customer valido (gera CPF/nome/email/phone validos quando nao informado).
  const { ensureValidCustomer } = await import("./fake-customer");
  const c = ensureValidCustomer({
    name: opts.customer?.name ?? undefined,
    email: opts.customer?.email ?? undefined,
    cpf: opts.customer?.cpf ?? undefined,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
  const input: CreateChargeInput = {
    amountCents: opts.amountCents,
    postbackUrl: `${appUrl}/api/webhooks/safepix`,
    customer: {
      name: c.name,
      email: c.email,
      document: {
        number: c.cpf,
        type: c.cpf.length === 14 ? "cnpj" : "cpf",
      },
      phone: c.phone,
    },
    items: [
      {
        title: "Deposito / teste de nominal",
        unit_price: opts.amountCents,
        quantity: 1,
        tangible: false,
      },
    ],
    metadata: { admin_pix: "1", acquirer_id: opts.acquirerId },
    // Timeout generoso: caminho admin precisa de CADA conta, inclusive as
    // lentas (~8s). Default 5s do checkout não serve aqui.
    timeoutMs: opts.timeoutMs ?? 25_000,
  };

  try {
    const charge = await handler(input, creds);
    const nominalName = charge.qrCode
      ? parseEmvMerchantName(charge.qrCode)
      : null;
    return { ok: true, charge, acquirerCode: acq.code, nominalName };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao gerar PIX.",
    };
  }
}

export type NominalRefreshResult = {
  acquirerId: string;
  code: string;
  shortCode: string;
  ok: boolean;
  oldNominal?: string;
  newNominal?: string;
  changed?: boolean;
  locked?: boolean;
  error?: string;
};

/** Tipo minimo de adquirente que o refresh de nominal precisa. */
type NominalRefreshAcq = {
  id: string;
  code: string;
  shortCode: string;
  nominalName: string;
  lockNominalName: boolean;
};

/**
 * Gera 1 PIX numa adquirente, re-parseia o nome do recebedor do QR e
 * (se nao estiver travada) atualiza Acquirer.nominalName + loga o historico.
 * Helper compartilhado por adminRefreshAllNominais (global) e
 * refreshNominalForUserAcquirer (por-adquirente do seller).
 */
async function refreshOneNominal(
  acq: NominalRefreshAcq,
  amt: number,
  maxAttempts = 2,
): Promise<NominalRefreshResult> {
  const base = {
    acquirerId: acq.id,
    code: acq.code,
    shortCode: acq.shortCode,
  };
  // RETRY (jun/2026): o PIX de nominal SEMPRE deve ser gerado. Um timeout
  // ("The operation was aborted due to timeout") ou falha de rede é TRANSIENTE
  // — tentar de novo resolve. Cada cobrança de teste expira sozinha sem
  // pagamento (não cria Transaction), então re-tentar é inofensivo. Já erro de
  // CONFIG (handler ausente, sem suporte a PIX, credencial inválida) não
  // melhora com retry → para na hora.
  let lastError = "sem QR retornado";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await adminChargePixOnAcquirer({
        acquirerId: acq.id,
        amountCents: amt,
      });
      if (res.ok && res.charge?.qrCode) {
        const parsed = res.nominalName ?? null;
        if (acq.lockNominalName) {
          return {
            ...base,
            ok: true,
            oldNominal: acq.nominalName,
            newNominal: parsed ?? acq.nominalName,
            changed: false,
            locked: true,
          };
        }
        // Faz o update + history log (com compare-and-swap interno).
        await maybeUpdateNominal(acq.id, res.charge.qrCode);
        const changed = parsed != null && parsed !== acq.nominalName;
        return {
          ...base,
          ok: true,
          oldNominal: acq.nominalName,
          newNominal: parsed ?? acq.nominalName,
          changed,
        };
      }
      // adminChargePixOnAcquirer engoliu o erro e devolveu ok:false.
      lastError = res.error ?? "sem QR retornado";
      if (!isTransientFetchError(new Error(lastError))) break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "falha ao gerar PIX";
      if (!isTransientFetchError(e)) break;
    }
    // Backoff progressivo (500ms, 1s, …) antes da próxima tentativa.
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return { ...base, ok: false, error: lastError };
}

/**
 * Refresh de nominal de UMA acquirer especifica (05/07/2026).
 * Wrapper leve em torno de refreshOneNominal — carrega os campos que ela
 * espera e chama. Usado pelo botao "Atualizar nominal" em cada linha do
 * /admin01/acquirers.
 */
export async function adminRefreshOneNominal(
  acquirerId: string,
  amountCents = 500,
): Promise<NominalRefreshResult | { acquirerId: string; code: string; shortCode: string; ok: false; error: string }> {
  const amt = Math.max(500, Math.min(5_000_00, Math.floor(amountCents) || 500));
  const acq = await prisma.acquirer.findUnique({
    where: { id: acquirerId },
    select: {
      id: true,
      code: true,
      shortCode: true,
      nominalName: true,
      lockNominalName: true,
      supportsPix: true,
    },
  });
  if (!acq) {
    return {
      acquirerId,
      code: "?",
      shortCode: "?",
      ok: false as const,
      error: "Adquirente não encontrada",
    };
  }
  if (!acq.supportsPix) {
    return {
      acquirerId: acq.id,
      code: acq.code,
      shortCode: acq.shortCode,
      ok: false as const,
      error: "Adquirente não suporta PIX (nada a atualizar)",
    };
  }
  return refreshOneNominal(acq, amt);
}

/**
 * Gera 1 PIX em CADA adquirente que suporta PIX (em paralelo) so pra
 * re-parsear o nome do recebedor (nominal) do QR e ATUALIZAR
 * Acquirer.nominalName via maybeUpdateNominal (que tambem loga o historico
 * de troca). Util pra "atualizar os nomes das nominais de uma vez".
 *
 * NAO cria Transaction — so bate no PSP pra gerar o QR. As cobrancas
 * geradas expiram sozinhas sem pagamento. Adquirentes travadas
 * (lockNominalName) sao puladas no update mas reportadas.
 */
export async function adminRefreshAllNominais(
  amountCents = 500,
): Promise<{ results: NominalRefreshResult[] }> {
  // PISO R$ 5,00 (regra do projeto: NUNCA gerar PIX de nominal com R$ 1,00).
  const amt = Math.max(500, Math.min(5_000_00, Math.floor(amountCents) || 500));
  const acqs = await prisma.acquirer.findMany({
    where: { supportsPix: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      code: true,
      shortCode: true,
      nominalName: true,
      lockNominalName: true,
    },
  });

  // CONCORRÊNCIA LIMITADA + TIMEOUT GENEROSO (jun/2026): antes era Promise.all
  // em TODAS de uma vez com timeout de 5s. As contas SafePix lentas (~8s) davam
  // "aborted due to timeout" (ex: 8 de 15 falhando). O fix REAL é o timeout de
  // 25s no caminho admin (adminChargePixOnAcquirer) — contas lentas agora
  // completam. A concorrência limitada evita re-introduzir burst nos PSPs, e o
  // retry interno cobre soluço de rede. A ordem do array é preservada (índice).
  const CONCURRENCY = 6;
  const results: NominalRefreshResult[] = new Array(acqs.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= acqs.length) return;
      results[i] = await refreshOneNominal(acqs[i], amt);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, acqs.length) }, () => worker()),
  );
  return { results };
}

/**
 * Versao POR-ADQUIRENTE do refresh de nominal pro SELLER. Gera 1 PIX numa
 * adquirente ESPECIFICA que o seller tem (UserAcquirer) e que suporta PIX,
 * re-le o nome do recebedor no QR e atualiza Acquirer.nominalName (que e
 * GLOBAL — o nominal e do PSP, nao por seller; o seller so dispara o refresh
 * na adquirente dele).
 *
 * Valida ownership (UserAcquirer do userId) + supportsPix/globalEnabled/active.
 * NAO cria Transaction — a cobranca gerada expira sozinha sem pagamento.
 */
export async function refreshNominalForUserAcquirer(
  userId: string,
  acquirerId: string,
  amountCents = 500,
): Promise<NominalRefreshResult> {
  // PISO R$ 5,00 (regra do projeto: NUNCA gerar PIX de nominal com R$ 1,00).
  const amt = Math.max(500, Math.min(5_000_00, Math.floor(amountCents) || 500));
  const ua = await prisma.userAcquirer.findFirst({
    where: {
      userId,
      acquirerId,
      // globalEnabled=false eh valido pra ADQUIRENTE PRIVADA (05/07/2026):
      // se o UserAcquirer existe pra este seller (ownership ja validado no
      // ensureUserAcquirers usando acquirerSellerVisibleWhere), ele PODE
      // usar. active/supportsPix continuam obrigatorios.
      acquirer: { supportsPix: true, active: true },
    },
    select: {
      acquirer: {
        select: {
          id: true,
          code: true,
          shortCode: true,
          nominalName: true,
          lockNominalName: true,
        },
      },
    },
  });
  if (!ua) {
    return {
      acquirerId,
      code: "",
      shortCode: "",
      ok: false,
      error: "Adquirente não está na sua lista ou não suporta PIX.",
    };
  }
  return refreshOneNominal(ua.acquirer, amt);
}

/** Chamado pelo webhook quando um Pix é APROVADO — incrementa totalApproved. */
export async function recordAcquirerApproval(acquirerId: string, userId: string) {
  const ua = await prisma.userAcquirer.findFirst({
    where: { userId, acquirerId },
    select: { id: true },
  });
  if (!ua) return;
  await prisma.userAcquirer.update({
    where: { id: ua.id },
    data: { totalApproved: { increment: 1 } },
  });
}
