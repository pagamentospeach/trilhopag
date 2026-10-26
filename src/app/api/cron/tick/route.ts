import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * CRON ORQUESTRADOR ("tick") — roda TODOS os crons sub-diarios numa unica
 * chamada. Existe porque a conta Vercel eh HOBBY, que so permite crons
 * DAILY (1x/dia). Os crons de dinheiro (release-paid-to-seller,
 * release-pending) e integracoes (retry-webhooks, dispatch-utmify) precisam
 * rodar a cada minuto.
 *
 * COMO USAR (escolha 1):
 *  A) Cron externo GRATIS (cron-job.org, EasyCron, GitHub Actions schedule):
 *     aponte 1 cron a cada 1 min pra:
 *       https://trilhopag.com/api/cron/tick?secret=<CRON_SECRET>
 *     Pronto — restaura tempo-real sem pagar nada.
 *
 *  B) Upgrade Vercel Pro: ai pode voltar os crons individuais sub-diarios
 *     no vercel.json (estao todos comentados/daily hoje).
 *
 * SEGURANCA: exige CRON_SECRET via header `Authorization: Bearer <secret>`
 * OU query `?secret=<secret>` (cron-job.org manda query mais facil).
 * Fail-closed se CRON_SECRET nao estiver setado.
 *
 * IDEMPOTENTE: cada sub-cron eh claim-based (updateMany condicional), entao
 * chamadas sobrepostas/duplicadas NAO processam 2x. Seguro chamar a cada min.
 *
 * NAO inclui: process-subscriptions (ja eh daily por design).
 *
 * 06/08/2026 (davi 'nao teremos mais tracker no gateway'): sairam daqui
 * ad-sync, ad-rules, ad-insights e process-mass-campaigns — as rotas foram
 * apagadas junto com o best-tracker.
 */

// Sub-crons rodados a cada tick. Ordem nao importa (rodam em paralelo).
const TICK_CRONS = [
  "release-paid-to-seller", // encerra janela 60s → webhook/push/email/pixel do seller
  "release-pending", // libera saldo retido (holding) pro seller
  "release-retention", // libera retencao de cartao vencida
  "dispatch-utmify", // dispara conversoes pro UTMify
  "retry-webhooks", // reentrega webhooks do seller que falharam
  "fake-refunds", // aplica reembolsos fake vencidos (admin-only)
  "acquirer-health", // circuit breaker de adquirente (opt-in via env)
  "sync-custom-domains", // verifica/registra dominios dos sellers
  "whatsapp-recovery", // recuperacao de carrinho abandonado
] as const;

function getSecret(request: Request, url: URL): string | null {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7);
  return url.searchParams.get("secret");
}

async function runOne(
  origin: string,
  name: string,
  cronSecret: string,
): Promise<{ name: string; ok: boolean; status: number; ms: number; body?: unknown }> {
  const started = Date.now();
  try {
    // Timeout por sub-cron pra um lento nao travar o tick inteiro.
    const res = await fetch(`${origin}/api/cron/${name}`, {
      method: "GET",
      headers: { authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(60_000),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // resposta sem JSON — ignora
    }
    return {
      name,
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      body,
    };
  } catch (e) {
    return {
      name,
      ok: false,
      status: 0,
      ms: Date.now() - started,
      body: { error: e instanceof Error ? e.message : "fetch_failed" },
    };
  }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // fail-closed: sem secret configurado, NUNCA roda (evita abuso).
    return NextResponse.json(
      { error: "cron_secret_not_configured" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const provided = getSecret(request, url);
  if (provided !== cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // origin do proprio deploy — self-fetch funciona em qualquer host.
  const origin = url.origin;

  const results = await Promise.all(
    TICK_CRONS.map((name) => runOne(origin, name, cronSecret)),
  );

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    ran: results.length,
    succeeded: okCount,
    failed: results.length - okCount,
    results,
    ts: new Date().toISOString(),
  });
}
