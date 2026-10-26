/**
 * Integracao com a Vercel REST API pra registrar dominios proprios dos
 * sellers automaticamente. Sem isso, mesmo com DNS configurado CERTO,
 * Vercel retorna 404 "Domain not configured" pra qualquer request.
 *
 * Setup necessario (env vars):
 *  - VERCEL_TOKEN — token com escopo `projects:domains` (ou owner).
 *    Cria em https://vercel.com/account/tokens
 *  - VERCEL_PROJECT_ID — default = projeto Pro atual (trilhopag).
 *  - VERCEL_TEAM_ID — default = time Pro atual (trilho-pag).
 *
 * Quando o token NAO esta configurado, as funcoes retornam
 * { ok: true, skipped: true } pra nao quebrar o fluxo — o seller ve
 * o erro de DNS na hora de verificar (porque o dominio nunca vai dar
 * verified de fato sem isso). Admin precisa setar o token pra a feature
 * funcionar end-to-end.
 *
 * Docs: https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain-to-a-project
 */

const VERCEL_API = "https://api.vercel.com";
// Projeto/time Pro do Trilho Pagamentos.
// Dominios de seller registram AQUI, no projeto que serve o trilhopag.com.
const DEFAULT_PROJECT_ID = "prj_fACaJTiAuHsE8oPKJw66I22MIWzk";
const DEFAULT_TEAM_ID = "team_50UEHKbxkfDtLxmDfFdvQkwo";

function getConfig() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID || DEFAULT_TEAM_ID;
  return { token, projectId, teamId };
}

function teamQuery(teamId: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

type VercelResult<T> =
  | { ok: true; data: T; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string; statusCode?: number };

/**
 * Adiciona o dominio ao projeto Vercel. Vercel cria certificado SSL
 * automaticamente quando o DNS estiver correto.
 *
 * Idempotente: se o dominio ja existe no projeto, retorna sucesso
 * silenciosamente (Vercel responde 409 conflict — tratamos como ok).
 */
export async function addDomainToVercel(
  domain: string,
): Promise<VercelResult<{ name: string; verified: boolean }>> {
  const { token, projectId, teamId } = getConfig();
  if (!token) {
    return {
      ok: true,
      skipped: true,
      reason: "VERCEL_TOKEN nao configurado — pulando registro automatico",
    };
  }
  try {
    const res = await fetch(
      `${VERCEL_API}/v10/projects/${projectId}/domains${teamQuery(teamId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: domain }),
        // Timeout de 10s — Vercel raramente leva mais que isso.
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status === 409) {
      // Ja existe no projeto — idempotente.
      return {
        ok: true,
        data: { name: domain, verified: true },
      };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let parsed: { error?: { message?: string; code?: string } } = {};
      try {
        parsed = JSON.parse(body);
      } catch {}
      const msg =
        parsed.error?.message ||
        `Vercel API ${res.status}: ${body.slice(0, 200)}`;
      return { ok: false, error: msg, statusCode: res.status };
    }
    const data = (await res.json()) as {
      name: string;
      verified: boolean;
    };
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return { ok: false, error: msg };
  }
}

/**
 * Remove o dominio do projeto Vercel. Idempotente — se nao existe,
 * retorna sucesso.
 */
export async function removeDomainFromVercel(
  domain: string,
): Promise<VercelResult<true>> {
  const { token, projectId, teamId } = getConfig();
  if (!token) {
    return {
      ok: true,
      skipped: true,
      reason: "VERCEL_TOKEN nao configurado — pulando remocao automatica",
    };
  }
  try {
    const res = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/domains/${encodeURIComponent(
        domain,
      )}${teamQuery(teamId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status === 404 || res.ok) {
      // 404 = nao existe, tratamos como ok (idempotente)
      return { ok: true, data: true };
    }
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error: `Vercel API ${res.status}: ${body.slice(0, 200)}`,
      statusCode: res.status,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return { ok: false, error: msg };
  }
}

/**
 * Status do dominio no projeto Vercel (verificado? aguardando DNS?).
 * Util pra mostrar pro seller o estado real depois que registramos.
 */
export async function getDomainStatusFromVercel(
  domain: string,
): Promise<
  VercelResult<{
    name: string;
    verified: boolean;
    verification?: Array<{ type: string; domain: string; value: string }>;
  }>
> {
  const { token, projectId, teamId } = getConfig();
  if (!token) {
    return {
      ok: true,
      skipped: true,
      reason: "VERCEL_TOKEN nao configurado",
    };
  }
  try {
    const res = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/domains/${encodeURIComponent(
        domain,
      )}${teamQuery(teamId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      return {
        ok: false,
        error: `Vercel API ${res.status}`,
        statusCode: res.status,
      };
    }
    const data = (await res.json()) as {
      name: string;
      verified: boolean;
      verification?: Array<{ type: string; domain: string; value: string }>;
    };
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return { ok: false, error: msg };
  }
}

/**
 * ID do deployment de PRODUÇÃO mais recente que está READY.
 * O deploy gitSource só re-aliasa o domínio primário (trilhopag.com)
 * automaticamente — os domínios próprios dos sellers ficam presos num deploy
 * velho. Pegamos o deployment atual aqui pra re-apontar cada domínio.
 */
export async function getLatestProductionDeploymentId(): Promise<string | null> {
  const { token, projectId, teamId } = getConfig();
  if (!token) return null;
  try {
    const res = await fetch(
      `${VERCEL_API}/v6/deployments?projectId=${encodeURIComponent(
        projectId,
      )}&target=production&limit=20${
        teamId ? `&teamId=${encodeURIComponent(teamId)}` : ""
      }`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      deployments?: Array<{
        uid?: string;
        id?: string;
        readyState?: string;
        state?: string;
      }>;
    };
    const ready = (data.deployments || []).find(
      (d) => (d.readyState || d.state) === "READY",
    );
    return ready?.uid || ready?.id || null;
  } catch {
    return null;
  }
}

/**
 * Aponta (alias) um deployment pra um domínio. Idempotente: se o domínio já
 * aponta pro deployment, a Vercel responde `not_modified` (tratamos como ok).
 * Códigos de "ainda não dá": cert_missing / domain_not_verified / forbidden —
 * o domínio precisa terminar a verificação/SSL antes (o cron re-tenta sozinho).
 */
export async function aliasDeploymentToDomain(
  deploymentId: string,
  domain: string,
): Promise<{ ok: boolean; code?: string }> {
  const { token, teamId } = getConfig();
  if (!token) return { ok: false, code: "no_token" };
  try {
    const res = await fetch(
      `${VERCEL_API}/v2/deployments/${encodeURIComponent(
        deploymentId,
      )}/aliases${teamQuery(teamId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ alias: domain }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as {
      error?: { code?: string };
    };
    const code = data?.error?.code || `http_${res.status}`;
    if (code === "not_modified") return { ok: true, code };
    return { ok: false, code };
  } catch (e) {
    return { ok: false, code: e instanceof Error ? e.message : "error" };
  }
}

/**
 * Força a Vercel a RE-CHECAR a verificação de posse do domínio (o `_vercel`
 * TXT). Quando o seller adiciona o TXT, isto faz a Vercel confirmar na hora —
 * sem esperar a re-checagem automática dela. Retorna verified=true se já passou.
 */
export async function verifyProjectDomain(
  domain: string,
): Promise<{ ok: boolean; verified: boolean }> {
  const { token, projectId, teamId } = getConfig();
  if (!token) return { ok: false, verified: false };
  try {
    const res = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/domains/${encodeURIComponent(
        domain,
      )}/verify${teamQuery(teamId)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return { ok: false, verified: false };
    const data = (await res.json().catch(() => ({}))) as { verified?: boolean };
    return { ok: true, verified: !!data?.verified };
  } catch {
    return { ok: false, verified: false };
  }
}

/** True quando o admin configurou VERCEL_TOKEN — feature funciona end-to-end. */
export function isVercelApiConfigured(): boolean {
  return !!process.env.VERCEL_TOKEN;
}
