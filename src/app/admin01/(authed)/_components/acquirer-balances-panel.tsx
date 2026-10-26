import { Wallet, AlertCircle, Clock, Mail } from "lucide-react";
import {
  getAllActiveAcquirerBalances,
  type AcquirerBalanceResult,
} from "@/lib/acquirer-balance";
import { prisma } from "@/lib/prisma";
import { formatBRL, acquirerNominalLabel } from "@/lib/utils";
import {
  OPS_MODE_LABEL,
  OPS_MODES,
  toOpsMode,
  type OpsMode,
} from "@/lib/ops-modes";

/**
 * Painel server-rendered de saldos por adquirente. Usado em
 * /admin01/withdrawals e /admin01/acquirers.
 *
 * Cache TTL = 60s (definido na lib). Reload da pagina re-fetcha so
 * se passou TTL — sem hammer.
 *
 * Layout: <details> colapsado cujo summary mostra SO o total SafePix.
 * Dentro: abas de modo (Todas/Black/White/Hot, filtro CSS-only via :has)
 * + grid compacto de cards por adquirente. O painel auto-atualiza (cache
 * 60s), entao NAO renderiza botoes de "atualizar"/"ajustar" por card.
 */
type CardMode = OpsMode;

/**
 * Normaliza o `Acquirer.mode` pra uma das abas. Os combinados caem na aba do
 * modo "mais baixo" que servem ("both" → Black, "white_hot" → White); modo
 * desconhecido cai em Black.
 */
const TAB_FOR_COMBINED: Record<string, CardMode> = {
  both: "black",
  white_hot: "white",
};

function normalizeMode(mode: string | undefined): CardMode {
  return TAB_FOR_COMBINED[mode ?? ""] ?? toOpsMode(mode);
}

export async function AcquirerBalancesPanel({
  title = "Saldo nas adquirentes",
  description,
}: {
  title?: string;
  description?: string;
}) {
  let balances: AcquirerBalanceResult[];
  let modeById: Map<string, CardMode>;
  try {
    const [bal, allAcqs] = await Promise.all([
      getAllActiveAcquirerBalances(),
      prisma.acquirer.findMany({
        where: { active: true, globalEnabled: true },
        // `mode` adicionado (read-only) so pra alimentar as abas de filtro.
        select: { id: true, mode: true },
      }),
    ]);
    balances = bal;
    modeById = new Map(allAcqs.map((a) => [a.id, normalizeMode(a.mode)]));
  } catch (e) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
        Erro ao buscar saldos: {e instanceof Error ? e.message : "unknown"}
      </div>
    );
  }

  // DEDUP DE CONTA COMPARTILHADA (20/07/2026, davi: "Tem adquirente duplicada
  // ali no saldo total"). Provider prefix (ex: "pluggou") + par (available,
  // pending, currency) identifica saldo compartilhado: quando N Acquirer rows
  // apontam pra MESMA conta backend na PSP (mesmo dono/CNPJ, subkeys diferentes),
  // o balance API do PSP retorna EXATAMENTE o mesmo valor pra todas — só que
  // é a MESMA pool. Sem dedup, o total infla N×.
  //
  // Estratégia: se dois balances do MESMO provider retornam mesmo
  // (available, pending, currency), assumimos que compartilham conta. Chance
  // de false positive = 2 contas legit com centavos-exatos idênticos no mesmo
  // fetch (probabilidade astronomicamente baixa).
  // Também dedupamos por `accountFingerprint` (par publicKey+secretKey igual =
  // mesma cred, mesmo se o valor mudar entre fetches).
  function balanceDedupKey(b: (typeof balances)[number]): string {
    const providerPrefix = b.code.split("-")[0];
    // 22/07/2026 (davi: "tem que puxar o saldo real"): removi dedup por
    // valores identicos + por sharedBalanceGroup (ambos causavam falso
    // positivo quando contas legit coincidiam por acaso). Ficou soh dedup
    // por accountFingerprint (hash publicKey+secretKey) — 100% seguro:
    // marca alias soh quando a MESMA cred foi cadastrada 2x na Acquirer.
    if (b.accountFingerprint)
      return `${providerPrefix}::fp::${b.accountFingerprint}`;
    // Sem fingerprint (creds nao setadas) → key unica por acquirerId,
    // nunca vira alias por acidente.
    return `${providerPrefix}::id::${b.acquirerId}`;
  }

  function dedupSum(list: typeof balances): number {
    const seen = new Set<string>();
    let total = 0;
    for (const b of list) {
      if (!b.supported || b.currency !== "BRL" || b.availableCents === null)
        continue;
      const key = balanceDedupKey(b);
      if (seen.has(key)) continue;
      seen.add(key);
      total += b.availableCents ?? 0;
    }
    return total;
  }

  // Total LIVE em BRL (saldo REAL via API) — soma todas as contas com balance
  // API real em reais. Inclui SafePix, Pluggou, SharkBanking, SharkHub.
  // Stripe é USD (rodapé) e os calculados (MP, supported=false) não entram.
  const liveBrlTotalCents = dedupSum(balances);

  // Subtotal PIX-OUT (safepix + pluggou) — é o que realmente pode sair como
  // saque automático. As demais (sharkbanking/sharkhub) têm balance API mas
  // não fazem PIX-OUT, então ficam "sobrando" no total mas indisponíveis pra
  // pagar saque.
  const pixOutTotalCents = dedupSum(
    balances.filter(
      (b) => b.code.startsWith("safepix") || b.code.startsWith("pluggou"),
    ),
  );

  // Detecta duplicidades pra mostrar warning no header.
  const dupGroups = new Map<string, string[]>();
  for (const b of balances) {
    if (!b.supported || b.currency !== "BRL" || b.availableCents === null)
      continue;
    const key = balanceDedupKey(b);
    if (!dupGroups.has(key)) dupGroups.set(key, []);
    dupGroups.get(key)!.push(b.shortCode ?? b.code);
  }
  const sharedAccountGroups = [...dupGroups.values()].filter(
    (arr) => arr.length > 1,
  );

  // USD (Stripe): mesma regra — só mostra se tiver saldo pra não poluir com $0.00.
  const usdBalances = balances.filter(
    (b) => b.currency === "USD" && hasBalance(b),
  );
  // Cards: API live (supported) + calculados (sem API). USD/sem-dado ficam
  // fora do grid filtravel (rodape). Cada card carrega seu `mode` pro filtro
  // + flag `isSharedAccount` pra marcar visualmente quando o balance dele é
  // compartilhado com outra Acquirer (não conta duas vezes no total).
  const sharedKeys = new Set(
    [...dupGroups.entries()]
      .filter(([, arr]) => arr.length > 1)
      .map(([k]) => k),
  );
  // FILTRO "so mostra com saldo" (21/07/2026, davi: "nao mostra as que tao
  // zeradas, so mostra quando tiver algum saldo, zerada nao mostra ate que
  // tenha saldo disponivel nelas"). Regras:
  //  - available > 0 → mostra
  //  - available < 0 → mostra (saldo negativo dos calculados = importante)
  //  - pending > 0 → mostra (dinheiro chegando)
  //  - error → mostra (falha precisa aparecer)
  //  - tudo 0 (zerada) → esconde
  function hasBalance(b: (typeof balances)[number]): boolean {
    if (b.error) return true;
    const avail = b.availableCents ?? 0;
    const pending = b.pendingCents ?? 0;
    return avail !== 0 || pending > 0;
  }
  const eligibleCards = balances.filter(
    (b) => b.currency !== "USD" && (b.supported || b.calculated),
  );
  const zeroedCount = eligibleCards.filter((b) => !hasBalance(b)).length;
  // 22/07/2026 (davi): pra cada grupo compartilhado, MARCA a primeira conta
  // (menor code, ordering alfabetico) como "primaria" — soh ela conta no total.
  // As outras N-1 aparecem no card OPACAS + label "= mesma conta X" pra deixar
  // OBVIO que nao sao saldos adicionais.
  const groupPrimary = new Map<string, string>(); // dedupKey → primary shortCode
  for (const b of eligibleCards.filter(hasBalance)) {
    const key = balanceDedupKey(b);
    if (sharedKeys.has(key) && !groupPrimary.has(key)) {
      groupPrimary.set(key, b.shortCode ?? b.code);
    }
  }
  const cards = eligibleCards
    .filter(hasBalance)
    .map((b) => {
      const key = balanceDedupKey(b);
      const isShared = sharedKeys.has(key);
      const primary = isShared ? groupPrimary.get(key) : undefined;
      const isPrimaryOfGroup = isShared && primary === (b.shortCode ?? b.code);
      return {
        b,
        mode: modeById.get(b.acquirerId) ?? "black",
        isSharedAccount: isShared,
        // "primary" = a UNICA conta do grupo que reflete o saldo real; as demais
        // sao aliases (mesma pool). primary=true recebe destaque; false fica opaca.
        isSharedPrimary: isPrimaryOfGroup,
        sharedPrimaryLabel: isShared && !isPrimaryOfGroup ? primary : undefined,
      };
    });
  const noData = balances.filter(
    (b) => b.currency !== "USD" && !b.supported && !b.calculated,
  );

  return (
    <details className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <summary className="cursor-pointer select-none list-none border-b border-white/[0.06] bg-black/30 px-5 py-3 flex items-center justify-between gap-3 hover:bg-black/40">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-1.5">
            <span className="text-zinc-500 transition-transform group-open:rotate-90">
              ▸
            </span>
            {title}
          </p>
          {description && (
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {description}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500">
            Total BRL live · todas as contas
          </p>
          <p className="text-xl font-mono font-bold text-cyan-300 tabular-nums">
            {formatBRL(liveBrlTotalCents)}
          </p>
          {pixOutTotalCents !== liveBrlTotalCents && (
            <p className="text-[10px] text-zinc-500 tabular-nums mt-0.5">
              PIX-OUT (safepix+pluggou):{" "}
              <span className="text-zinc-300">{formatBRL(pixOutTotalCents)}</span>
            </p>
          )}
        </div>
      </summary>

      {sharedAccountGroups.length > 0 && (
        <div className="border-b border-amber-400/20 bg-amber-400/[0.05] px-4 py-2 text-[11px]">
          <p className="flex items-start gap-1.5 text-amber-200">
            <AlertCircle className="size-3 mt-0.5 shrink-0" />
            <span>
              <strong>{sharedAccountGroups.length} grupo(s) de conta compartilhada detectado(s):</strong>{" "}
              {sharedAccountGroups
                .map((arr) => `[${arr.join(" + ")}]`)
                .join(", ")}
              . Total acima ja deduplicado — soma apenas UMA vez por grupo (as
              adquirentes têm creds identicas OU retornam o mesmo saldo do
              mesmo provider = mesma conta backend na PSP).
            </span>
          </p>
        </div>
      )}

      {/* Abas de modo (CSS-only): radios escondidos + :has() filtram os cards
          por data-mode. "Todas" pre-selecionado. data-tab="all" mostra todos. */}
      {/* As classes `has-[...]` ficam escritas por extenso DE PROPOSITO: o
          Tailwind varre o codigo como texto, entao nome de classe montado em
          runtime nao gera CSS. Modo novo = mais uma linha aqui. */}
      <div
        className="
          has-[.acqmode-black:checked]:[&_[data-mode]:not([data-mode='black'])]:hidden
          has-[.acqmode-white:checked]:[&_[data-mode]:not([data-mode='white'])]:hidden
          has-[.acqmode-hot:checked]:[&_[data-mode]:not([data-mode='hot'])]:hidden
          has-[.acqmode-sag:checked]:[&_[data-mode]:not([data-mode='sag'])]:hidden
        "
      >
        <div className="flex flex-wrap items-center gap-1 px-3 pt-3">
          <ModeTab value="all" label="Todas" defaultChecked />
          {OPS_MODES.map((m) => (
            <ModeTab key={m} value={m} label={OPS_MODE_LABEL[m]} />
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 p-3">
          {cards.length === 0 ? (
            <p className="col-span-full text-[11px] text-zinc-500 py-2">
              {zeroedCount > 0
                ? `Todas as ${zeroedCount} adquirentes ativas estão zeradas — nada pra mostrar aqui.`
                : "Sem saldo disponível."}
            </p>
          ) : (
            cards.map(({ b, mode, isSharedAccount, isSharedPrimary, sharedPrimaryLabel }) => (
              <BalanceCard
                key={b.acquirerId}
                b={b}
                mode={mode}
                calc={!b.supported && !!b.calculated}
                isSharedAccount={isSharedAccount}
                isSharedPrimary={isSharedPrimary}
                sharedPrimaryLabel={sharedPrimaryLabel}
              />
            ))
          )}
        </div>
        {zeroedCount > 0 && cards.length > 0 && (
          <p className="px-3 pb-2 text-[10px] text-zinc-600">
            +{zeroedCount} adquirente{zeroedCount === 1 ? "" : "s"} zerada{zeroedCount === 1 ? "" : "s"} escondida{zeroedCount === 1 ? "" : "s"} — aparecem quando entrar saldo.
          </p>
        )}
      </div>

      {usdBalances.length > 0 && (
        <div className="border-t border-blue-500/20 bg-blue-500/[0.04] px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-blue-300 font-bold mb-1">
            Stripe (USD) — converte na cotação do saque
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {usdBalances.map((b) => (
              <div key={b.acquirerId} className="text-[11px]">
                <span className="text-zinc-300">{acquirerNominalLabel(b.nominalName, b.institution)}: </span>
                <span className="font-mono text-blue-200">
                  $ {((b.availableCents ?? 0) / 100).toFixed(2)}
                </span>
                {b.pendingCents != null && b.pendingCents > 0 && (
                  <span className="text-zinc-500">
                    {" "}
                    (+ ${(b.pendingCents / 100).toFixed(2)} pendente)
                  </span>
                )}
                {(b.shortCode || b.accountEmail) && (
                  <div className="mt-0.5 flex items-center gap-1 text-[9px] text-zinc-500">
                    {b.shortCode && (
                      <span
                        className="font-mono uppercase bg-white/[0.05] px-1 py-0 rounded shrink-0"
                        title={`Code: ${b.code}`}
                      >
                        {b.shortCode}
                      </span>
                    )}
                    {b.accountEmail && (
                      <span
                        className="inline-flex items-center gap-0.5 min-w-0 truncate"
                        title={b.accountEmail}
                      >
                        <Mail className="size-2.5 shrink-0 opacity-70" />
                        <span className="truncate">{b.accountEmail}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {noData.length > 0 && (
        <div className="border-t border-white/[0.04] px-5 py-2 text-[10px] text-zinc-500">
          Sem saldo disponível:{" "}
          {noData.map((b) => acquirerNominalLabel(b.nominalName ?? b.code, b.institution)).join(", ")}
        </div>
      )}
    </details>
  );
}

function ModeTab({
  value,
  label,
  defaultChecked,
}: {
  value: "all" | CardMode;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name="acqmode"
        defaultChecked={defaultChecked}
        className={`acqmode-${value} peer sr-only`}
      />
      <span className="inline-block rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:text-white peer-checked:border-cyan-400/40 peer-checked:bg-cyan-400/10 peer-checked:text-cyan-200">
        {label}
      </span>
    </label>
  );
}

function BalanceCard({
  b,
  mode,
  calc,
  isSharedAccount,
  isSharedPrimary,
  sharedPrimaryLabel,
}: {
  b: AcquirerBalanceResult;
  mode: CardMode;
  calc?: boolean;
  /** Este card compartilha saldo com outro (não conta duas vezes no total). */
  isSharedAccount?: boolean;
  /** Se compartilhado, esta e a PRIMARIA (mostra saldo cheio). Outras ficam opacas. */
  isSharedPrimary?: boolean;
  /** ShortCode da conta primaria do grupo (mostrado em cards secundarios). */
  sharedPrimaryLabel?: string;
}) {
  // Identificador da conta (shortCode + accountEmail) — mostrado 19/07/2026
  // (davi): "mostre tambem alem da nominal, qual adquirente e qual o email de login".
  const identifierRow = (
    <div className="mt-0.5 flex items-center gap-1 text-[9px] text-zinc-500">
      {b.shortCode && (
        <span
          className="font-mono uppercase bg-white/[0.05] px-1 py-0 rounded shrink-0"
          title={`Code: ${b.code}`}
        >
          {b.shortCode}
        </span>
      )}
      {b.accountEmail && (
        <span className="inline-flex items-center gap-0.5 min-w-0 truncate" title={b.accountEmail}>
          <Mail className="size-2.5 shrink-0 opacity-70" />
          <span className="truncate">{b.accountEmail}</span>
        </span>
      )}
    </div>
  );

  if (b.error) {
    return (
      <div
        data-mode={mode}
        className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-2"
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <AlertCircle className="size-3 text-red-300 shrink-0" />
          <p className="text-[11px] font-bold text-white truncate">
            {acquirerNominalLabel(b.nominalName, b.institution)}
          </p>
        </div>
        {identifierRow}
        <p className="mt-0.5 text-[10px] text-red-300 truncate" title={b.error}>
          {b.error.length > 50 ? b.error.slice(0, 50) + "..." : b.error}
        </p>
      </div>
    );
  }

  // 22/07/2026 (davi: contas Pluggou puxando mesmo saldo): quando eh conta
  // SECUNDARIA de um grupo compartilhado (nao a primaria), fica opaca +
  // valor riscado + label "= <primaria>" pra deixar OBVIO que nao eh saldo
  // adicional. Primaria fica normal.
  const isSharedAlias = isSharedAccount && !isSharedPrimary;
  const borderClass = calc
    ? "border-amber-500/20"
    : isSharedAlias
      ? "border-white/[0.04] opacity-60"
      : "border-white/[0.06]";
  const valueClass = calc
    ? "text-amber-100"
    : isSharedAlias
      ? "text-zinc-400 line-through decoration-zinc-600"
      : "text-cyan-100";
  const iconClass = calc
    ? "text-amber-300"
    : isSharedAlias
      ? "text-zinc-500"
      : "text-cyan-300";

  return (
    <div
      data-mode={mode}
      className={`rounded-lg border ${borderClass} bg-black/30 p-2`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <Wallet className={`size-3 shrink-0 ${iconClass}`} />
        <p className={`text-[11px] font-bold truncate ${isSharedAlias ? "text-zinc-400" : "text-white"}`}>
          {acquirerNominalLabel(b.nominalName, b.institution)}
        </p>
        {isSharedPrimary && (
          <span
            className="ml-auto text-[8px] uppercase tracking-wider bg-amber-500/25 text-amber-200 px-1 rounded font-bold shrink-0"
            title="Este saldo é compartilhado com outras adquirentes do mesmo pool na PSP. Este card mostra o valor REAL — os outros do grupo (opacos) sao aliases."
          >
            🔗 primário
          </span>
        )}
        {isSharedAlias && (
          <span
            className="ml-auto text-[8px] uppercase tracking-wider bg-zinc-700/40 text-zinc-400 px-1 rounded font-bold shrink-0"
            title={`Alias da conta ${sharedPrimaryLabel} — compartilha o mesmo pool na PSP. Nao eh saldo adicional.`}
          >
            = {sharedPrimaryLabel}
          </span>
        )}
        {calc && !isSharedAccount && (
          <span className="ml-auto text-[8px] uppercase tracking-wider bg-amber-500/20 text-amber-200 px-1 rounded font-bold shrink-0">
            est.
          </span>
        )}
      </div>
      {identifierRow}
      <p className={`mt-1 text-base font-mono font-bold ${valueClass} tabular-nums`}>
        {b.currency === "BRL"
          ? formatBRL(b.availableCents ?? 0)
          : `${b.currency} ${((b.availableCents ?? 0) / 100).toFixed(2)}`}
      </p>
      {isSharedAlias && (
        <p className="text-[9px] text-zinc-500 italic mt-0.5">
          mesmo pool de {sharedPrimaryLabel} — não soma no total
        </p>
      )}
      {b.pendingCents != null && b.pendingCents > 0 && (
        <p className="text-[10px] text-zinc-500">
          + {formatBRL(b.pendingCents)} pendente
        </p>
      )}
      {calc && b.calcDetails && (
        <p className="text-[9px] text-zinc-500 mt-0.5">
          {b.calcDetails.paidCount} vendas · {b.calcDetails.refundedCount} refunds
        </p>
      )}
      <p className="text-[9px] text-zinc-600 mt-1 flex items-center gap-1">
        <Clock className="size-2.5 shrink-0" />
        atualizado {formatRelativeTime(b.lastFetched)}
      </p>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s atras`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atras`;
  return `${Math.floor(minutes / 60)}h atras`;
}
