import Link from "next/link";
import { PrivateText } from "@/components/dashboard/private-text";

/**
 * AS PEÇAS QUE TODA PÁGINA DO PAINEL REPETE (seção 33 do prompt de revamp:
 * "criar componentes reutilizáveis / não duplicar código").
 *
 * ⚠️ ESTE ARQUIVO NASCE CORRIGINDO UM PROBLEMA QUE EU MESMO PIOREI.
 *
 * 08/08/2026. O painel já tinha SEIS cópias manuais de cartão de métrica
 * (rede, perfil, divulgador, dashboard-overview, mobile-home, métricas de
 * oferta) e 24 páginas repetindo o mesmo `<header><h1>…</h1><p>…</p></header>`.
 *
 * Ao longo desta sessão eu escrevi mais QUATRO cópias — uma em Clientes, uma no
 * detalhe do cliente, uma em Assinaturas e um `Kpi` no Analytics — cada uma com
 * a mesma estrutura e diferenças cosméticas acidentais (uma tinha `sub`, outra
 * `accent`, outra truncava o valor, outra não). Consegui reproduzir o defeito
 * que o prompt manda evitar enquanto implementava o prompt.
 *
 * ESCOPO DELIBERADO: aqui eu troco as QUATRO que eu criei. As seis antigas
 * continuam onde estão, e é decisão, não esquecimento — elas vivem em telas
 * que eu não consigo abrir logado pra conferir (o banco de produção está
 * vazio), e trocar componente visual às cegas em tela que já funciona é
 * arriscar regressão pra ganhar arrumação. Ficam anotadas como pendência.
 *
 * Server Components puros: nada aqui hidrata.
 */

/**
 * Cabeçalho padrão de página: ícone opcional, título, descrição e um espaço
 * pra ação à direita (filtro, botão).
 */
export function PageHeader({
  Icon,
  titulo,
  descricao,
  acao,
}: {
  Icon?: React.ComponentType<{ className?: string }>;
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {Icon && <Icon className="size-5 shrink-0 text-cyan-400" />}
          {titulo}
        </h1>
        {descricao && (
          <p className="mt-1 text-sm text-zinc-400">{descricao}</p>
        )}
      </div>
      {acao}
    </header>
  );
}

/**
 * Cartão de métrica.
 *
 * `money` não é cosmético: liga o `<PrivateText>`, que é o que faz o valor
 * sumir quando o seller aperta o olho do modo privacidade. Valor em dinheiro
 * SEM essa marcação vaza no ônibus — foi por isso que virou prop obrigatória
 * de pensar, e não um detalhe de cada cópia.
 */
export function StatCard({
  Icon,
  label,
  value,
  sub,
  accent,
  money = false,
  href,
}: {
  Icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  /** Classe de cor pro valor. Use pra destacar risco (chargeback, atraso). */
  accent?: string;
  money?: boolean;
  /** Quando presente, o cartão inteiro vira link. */
  href?: string;
}) {
  const conteudo = (
    <>
      <div className="flex items-center gap-2 text-zinc-500">
        {Icon && <Icon className="size-3.5" />}
        <p className="text-[10px] uppercase tracking-wider">{label}</p>
      </div>
      <p
        className={`mt-2 truncate text-xl font-bold leading-tight tabular-nums ${accent ?? "text-white"}`}
      >
        {money ? <PrivateText>{value}</PrivateText> : value}
      </p>
      {sub && <p className="mt-1 truncate text-[10px] leading-snug text-zinc-500">{sub}</p>}
    </>
  );

  const cls =
    "block rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-white/[0.12] hover:bg-white/[0.04]";

  if (href) {
    return (
      <Link href={href} className={cls}>
        {conteudo}
      </Link>
    );
  }
  return <div className={cls}>{conteudo}</div>;
}

/**
 * Selo de status.
 *
 * O mapa vem de fora porque cada domínio tem o seu (transação, saque,
 * assinatura, domínio) e forçar um vocabulário único aqui só criaria
 * traduções erradas. O que este componente garante é o FORMATO: mesmo
 * tamanho, mesmo raio, mesmo peso em toda tela.
 *
 * O fallback mostra o código cru em vez de escolher um rótulo qualquer — foi
 * assim que um saque REJECTED virou "Cancelado" pro seller (ver
 * saques/history-list.tsx).
 */
export function StatusBadge({
  status,
  mapa,
}: {
  status: string;
  mapa: Record<string, { label: string; cls: string }>;
}) {
  const meta = mapa[status] ?? {
    label: status,
    cls: "bg-zinc-700/40 text-zinc-400",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

/* ══════════════════════════ ESQUELETOS ══════════════════════════ */

/**
 * Bloco cinza pulsante. A peça de que os esqueletos abaixo são feitos.
 *
 * 08/08/2026, seção 22: "Skeletons elegantes. Não usar spinner gigante no
 * centro da tela." O painel inteiro tinha UM `loading.tsx` com um spinner
 * centralizado, herdado por todas as 60+ rotas.
 *
 * A diferença não é estética. O spinner diz "espera" e some; o esqueleto diz
 * "vem uma tabela de cinco colunas aqui" e o conteúdo troca de lugar com ele
 * sem a página pular. Numa tela de dinheiro, layout que salta enquanto carrega
 * é o que faz alguém clicar no botão errado.
 *
 * ⚠️ `aria-hidden` e sem texto: pro leitor de tela isto é ruído. Quem anuncia
 * carregamento é a região viva da própria rota, não o desenho.
 */
export function Skel({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-white/[0.06] ${className}`}
    />
  );
}

/** Cabeçalho de página: título largo + linha de descrição. */
export function SkelHeader() {
  return (
    <div className="space-y-2">
      <Skel className="h-7 w-48" />
      <Skel className="h-4 w-72 max-w-full" />
    </div>
  );
}

/** Fileira de cartões de métrica. Mesma grade do StatCard de verdade. */
export function SkelStats({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
        >
          <Skel className="h-2.5 w-16" />
          <Skel className="mt-3 h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

/**
 * Tabela. `linhas` deve bater com o `take` da página de verdade quando ele é
 * pequeno — esqueleto que promete 20 linhas e entrega 3 é pior que não ter.
 */
export function SkelTable({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <div className="border-b border-white/[0.06] px-5 py-3">
        <Skel className="h-2.5 w-32" />
      </div>
      {Array.from({ length: linhas }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-3.5 last:border-b-0"
        >
          <Skel className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Larguras variando: linha toda do mesmo tamanho lê como
                carregando de mentira, não como texto. */}
            <Skel className={`h-3 ${["w-40", "w-52", "w-32", "w-48"][i % 4]}`} />
            <Skel className="h-2.5 w-24" />
          </div>
          <Skel className="h-4 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}
