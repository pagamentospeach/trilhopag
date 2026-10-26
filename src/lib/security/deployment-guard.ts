/**
 * DEPLOYMENT GUARD (05/07/2026) — protege contra clone da plataforma.
 *
 * Motivacao: impedir que alguem copie o codigo e suba num dominio
 * proprio. Este guard adiciona camadas de validacao que travam
 * o gateway se detectar que NAO esta rodando na conta Vercel autorizada.
 *
 * Camadas (todas rodam em cascata; qualquer uma nega → bloqueia):
 *   1. Vercel PROJECT ID  → tem que ser o nosso
 *   2. Vercel TEAM ID     → tem que ser o time correto
 *   3. Host header        → precisa estar no allowlist (apex + custom domains)
 *
 * Em DEV (NODE_ENV != production), tudo passa — pra rodar local sem drama.
 *
 * ATENCAO: os IDs sao CONSTANTES DE CODIGO — bake-in intencional. Um atacante
 * que tenha o repo pode simplesmente trocar as strings. Mas duas coisas
 * dificultam: (a) precisa se dar ao trabalho de saber ONDE trocar; (b) usamos
 * os IDs em varias camadas independentes (dispatcher/admin/saque). Trocar em
 * um lugar quebra outro. Combinado com middleware de host, formam um
 * defense-in-depth — nao e blindagem absoluta, mas eleva o custo do clone.
 */

// IDs do projeto Vercel do Trilho Pagamentos (team trilho-pag).
// Se um dia trocar de conta/projeto, atualizar aqui + em src/middleware.ts.
export const AUTHORIZED_VERCEL_PROJECT_ID =
  "prj_fACaJTiAuHsE8oPKJw66I22MIWzk";
export const AUTHORIZED_VERCEL_TEAM_ID = "team_50UEHKbxkfDtLxmDfFdvQkwo";

// Hosts oficiais do gateway. Custom domains dos sellers sao validados
// dinamicamente contra o banco (tabela CustomDomain com status="verified").
export const AUTHORIZED_APEX_HOSTS: readonly string[] = [
  "trilhopag.com",
  "www.trilhopag.com",
];

export class DeploymentUnauthorizedError extends Error {
  constructor(reason: string) {
    super(`Deployment nao autorizado: ${reason}`);
    this.name = "DeploymentUnauthorizedError";
  }
}

/**
 * Valida que estamos rodando NA CONTA VERCEL AUTORIZADA. Chame nos hot
 * paths financeiros (dispatcher, admin, saque, tx create).
 *
 * Em dev (NODE_ENV != "production"), retorna sem checar.
 */
export function assertAuthorizedDeployment(): void {
  if (process.env.NODE_ENV !== "production") return;
  const projectId = process.env.VERCEL_PROJECT_ID ?? "";
  const teamId =
    process.env.VERCEL_TEAM_ID ??
    process.env.VERCEL_ORG_ID ??
    "";
  if (projectId !== AUTHORIZED_VERCEL_PROJECT_ID) {
    throw new DeploymentUnauthorizedError(
      `project_id mismatch (got=${projectId.slice(0, 12)}…)`,
    );
  }
  if (teamId !== AUTHORIZED_VERCEL_TEAM_ID) {
    throw new DeploymentUnauthorizedError(
      `team_id mismatch (got=${teamId.slice(0, 12)}…)`,
    );
  }
}

/** Versao boolean pra usar em UI/logs sem crash. */
export function isAuthorizedDeployment(): boolean {
  try {
    assertAuthorizedDeployment();
    return true;
  } catch {
    return false;
  }
}

/**
 * Boolean helper pro middleware/rotas que precisam decidir sem throw.
 * Aceita o host (sem porta) e diz se e um apex ou um preview do PROJETO
 * autorizado (.vercel.app com o project_id certo). NAO checa custom
 * domain — isso e responsabilidade do middleware (que consulta o DB).
 */
export function isAuthorizedApexHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (AUTHORIZED_APEX_HOSTS.includes(h)) return true;
  if (h.endsWith(".vercel.app")) {
    // Preview URLs SO passam se o deployment for do projeto certo.
    const projectId = process.env.VERCEL_PROJECT_ID ?? "";
    return projectId === AUTHORIZED_VERCEL_PROJECT_ID;
  }
  return false;
}
