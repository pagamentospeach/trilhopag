import { NextResponse } from "next/server";
import { promises as dns } from "node:dns";
import { prisma } from "@/lib/prisma";
import {
  addDomainToVercel,
  isVercelApiConfigured,
  getLatestProductionDeploymentId,
  aliasDeploymentToDomain,
  getDomainStatusFromVercel,
  verifyProjectDomain,
} from "@/lib/vercel-api";
import { domainServesTrilho } from "@/lib/domain-health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron auto-sync de CustomDomain — roda a cada 5 minutos.
 *
 * TRÊS FASES:
 *
 * FASE 1 (validação pending/failed → verified):
 *  Pra cada CustomDomain NOT verified, checa DNS + TXT + health. Se tudo
 *  OK, marca verified.
 *
 * FASE 2 (health check periódico dos verified + useCheckout=true):  ⭐ NOVO
 *  22/07/2026 (davi: "isso nao pode acontecer! Arrume isso para nunca mais
 *  acontecer com mais ninguem" — caso do seller-j@exemplo.com com
 *  pagueaqui.fun ficou verified mas DNS morto):
 *
 *   - Faz DNS lookup ATIVO (resolve4 + resolveCname) a cada execução
 *   - Se DNS não resolve (nameserver parked, apex vazio) → DERRUBA imediato
 *   - Se resolve pra IP não-Vercel (seller apontou pra outro projeto) → DERRUBA
 *   - Se resolve pra Vercel mas /cl/__trilho_health falha 3x seguidas →
 *     DERRUBA (tolerância pra SSL provisionando / falha transitória)
 *
 *  Streak de falhas é mantido no proprio errorMessage (prefixo [hstreak:N])
 *  pra evitar coluna nova. Zera quando volta a servir.
 *
 * FASE 3 (auto-alias self-healing):
 *  Aponta cada domínio verified+useCheckout pro deploy de produção mais
 *  recente. Sem isto, código novo (redirect de upsell) não chega no domínio
 *  próprio do seller.
 */

const VERCEL_IPS = ["76.76.21.21"];
const VERCEL_CNAMES = [
  "cname.vercel-dns.com",
];
/** Nameservers de estacionamento comuns — quando o domain aponta pra esses,
 *  é sinal claro de "comprou e nunca configurou". */
const PARKING_NS_INDICATORS = [
  "dns-parking.com",
  "sedoparking.com",
  "parkingcrew.net",
  "bodis.com",
  "hostinger.com", // hostinger vem "ns1/ns2.dns-parking.com" mas checo por safety
];
const HEALTH_FAIL_THRESHOLD = 3; // ~15min (3 crons de 5min) antes de derrubar

/** Extrai o streak atual de falhas de health de errorMessage. */
function parseHealthStreak(msg: string | null): number {
  if (!msg) return 0;
  const m = /^\[hstreak:(\d+)\]/.exec(msg);
  return m ? Number(m[1]) : 0;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isVercelApiConfigured()) {
    return NextResponse.json({
      ok: false,
      reason: "VERCEL_TOKEN nao configurado — cron skip",
    });
  }

  const now = new Date();
  const fourMinAgo = new Date(now.getTime() - 4 * 60 * 1000);

  // ═════════════════════════════════════════════════════════════════════
  // FASE 1 — validação pending/failed → verified
  // ═════════════════════════════════════════════════════════════════════
  const domains = await prisma.customDomain.findMany({
    where: {
      status: { not: "verified" },
      OR: [{ lastCheckAt: null }, { lastCheckAt: { lt: fourMinAgo } }],
    },
    take: 30,
    orderBy: { lastCheckAt: { sort: "asc", nulls: "first" } },
  });

  let verified = 0;
  let stillPending = 0;
  let failed = 0;
  const results: Array<{ domain: string; outcome: string }> = [];

  for (const d of domains) {
    try {
      // 1. DNS check — procura o TXT em DOIS hosts: no próprio domínio (apex /
      // legado) E em _trilhopag-verify.<domínio> (subdomínio, onde o TXT precisa
      // ficar SEPARADO do CNAME — senão a Hostinger recusa "dois hosts iguais").
      const txtRecords = await dns.resolveTxt(d.domain).catch(() => []);
      const txtRecordsVerify = await dns
        .resolveTxt(`_trilhopag-verify.${d.domain}`)
        .catch(() => []);
      const expectedTxt = `trilhopag-verify=${d.verifyToken}`;
      const txtOk = [...txtRecords, ...txtRecordsVerify].some((arr) =>
        arr.join("").includes(expectedTxt),
      );

      const aRecords = await dns.resolve4(d.domain).catch(() => []);
      const cnames = await dns.resolveCname(d.domain).catch(() => []);
      const aOk = aRecords.some((ip) => VERCEL_IPS.includes(ip));
      const cnameOk = cnames.some((c) =>
        VERCEL_CNAMES.some((v) => c.endsWith(v)),
      );

      if (!txtOk || (!aOk && !cnameOk)) {
        let errorMessage: string;
        if (!txtOk && !aOk && !cnameOk) {
          errorMessage = `Configure no DNS: TXT "${expectedTxt}" (em subdomínio, host "_trilhopag-verify.<sub>", separado do CNAME) + A 76.76.21.21 (apex) ou CNAME cname.vercel-dns.com (subdomínio). Espere propagar 5-30min.`;
        } else if (!txtOk) {
          errorMessage = `TXT de verificação não encontrado. Em SUBDOMÍNIO use o host "_trilhopag-verify.<sub>" (NÃO o mesmo host do CNAME). Valor: ${expectedTxt}`;
        } else {
          errorMessage = `TXT OK mas DNS nao aponta pra Vercel. Configure A 76.76.21.21 (atual: ${aRecords.join(",") || "—"}).`;
        }
        await prisma.customDomain.update({
          where: { id: d.id },
          data: {
            status: txtOk || aOk || cnameOk ? "failed" : "pending",
            errorMessage,
            lastCheckAt: now,
          },
        });
        stillPending++;
        results.push({ domain: d.domain, outcome: "dns_not_ready" });
        continue;
      }

      // 2. DNS OK — registra na Vercel
      const vres = await addDomainToVercel(d.domain);
      if (!vres.ok) {
        await prisma.customDomain.update({
          where: { id: d.id },
          data: {
            status: "failed",
            errorMessage: `DNS OK mas falhou registro Vercel: ${vres.error}`,
            lastCheckAt: now,
          },
        });
        failed++;
        results.push({ domain: d.domain, outcome: "vercel_error" });
        continue;
      }

      // 3. LIVE CHECK — confirma que o domínio SERVE Trilho (não outra hospedagem)
      const servesTrilho = await domainServesTrilho(d.domain, 1);
      if (!servesTrilho) {
        await prisma.customDomain.update({
          where: { id: d.id },
          data: {
            status: "failed",
            errorMessage:
              `DNS OK mas ${d.domain} não responde como Trilho — provável que esteja apontado pra outra hospedagem/Vercel sua (ex: sua loja). ` +
              `Remova o domínio do outro projeto, OU aguarde o SSL provisionar (~2min). Vai re-tentar automaticamente.`,
            lastCheckAt: now,
          },
        });
        stillPending++;
        results.push({ domain: d.domain, outcome: "not_serving_trilho" });
        continue;
      }

      // 4. Tudo OK → verified
      await prisma.customDomain.update({
        where: { id: d.id },
        data: {
          status: "verified",
          verifiedAt: now,
          errorMessage: null,
          lastCheckAt: now,
        },
      });
      verified++;
      results.push({ domain: d.domain, outcome: "verified" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      console.error(
        `[cron/sync-custom-domains] erro processando ${d.domain}:`,
        msg,
      );
      failed++;
      results.push({ domain: d.domain, outcome: `error: ${msg}` });
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // FASE 2 — HEALTH CHECK dos verified+useCheckout=true  ⭐ CRÍTICO
  // (Pega "verificou uma vez e o DNS quebrou depois" — que é o caso do
  //  seller Rodrigo, e potencialmente de outros no futuro. Cron ativo
  //  a cada 5min. Streak de 3 falhas antes de derrubar pra evitar flap.)
  // ═════════════════════════════════════════════════════════════════════
  const healthResults: Array<{
    domain: string;
    outcome: "still_healthy" | "recovered" | "downed" | "warning" | "skipped";
    reason?: string;
    streak?: number;
  }> = [];

  const healthyBatch = await prisma.customDomain.findMany({
    where: { status: "verified", useCheckout: true },
    select: {
      id: true,
      domain: true,
      errorMessage: true,
    },
    take: 100, // ~500 domains por dia (100 × 5cron × 24h) — mais que suficiente
    orderBy: { lastCheckAt: { sort: "asc", nulls: "first" } },
  });

  for (const d of healthyBatch) {
    try {
      const streak = parseHealthStreak(d.errorMessage);

      // 2.1) DNS resolve? — se totalmente vazio, é morto (parked ou removido)
      const aRecs = await dns.resolve4(d.domain).catch(() => []);
      const cnRecs = await dns.resolveCname(d.domain).catch(() => []);
      const nsRecs = await dns.resolveNs(d.domain).catch(() => []);
      const dnsResolves = aRecs.length > 0 || cnRecs.length > 0;
      const parkedNs = nsRecs.some((ns) =>
        PARKING_NS_INDICATORS.some((p) => ns.toLowerCase().includes(p)),
      );

      if (!dnsResolves) {
        // DNS totalmente vazio — derruba IMEDIATO (não precisa streak)
        const msg = parkedNs
          ? `DNS do dominio nao esta configurado — os nameservers apontam pra estacionamento (${nsRecs.slice(0, 2).join(", ")}). ` +
            `No painel do seu registrar (Hostinger/Registro.br/GoDaddy), va em DNS/Zone Editor e adicione: ` +
            `A ${VERCEL_IPS[0]} (host: @) + CNAME cname.vercel-dns.com (host: www). Espere 10-30min propagar.`
          : `DNS do dominio nao resolve mais (nenhum registro A ou CNAME encontrado). Verifique no seu registrar se os registros DNS ainda estao la, ou se o dominio nao expirou.`;
        await prisma.customDomain.update({
          where: { id: d.id },
          data: { status: "failed", errorMessage: msg, lastCheckAt: now },
        });
        healthResults.push({ domain: d.domain, outcome: "downed", reason: "dns_empty" });
        continue;
      }

      // 2.2) DNS resolve mas NÃO pra Vercel? — seller apontou pra outro lugar
      const pointingToVercel =
        aRecs.some((ip) => VERCEL_IPS.includes(ip)) ||
        cnRecs.some((c) =>
          VERCEL_CNAMES.some((v) => c.toLowerCase().endsWith(v.toLowerCase())),
        );
      if (!pointingToVercel) {
        await prisma.customDomain.update({
          where: { id: d.id },
          data: {
            status: "failed",
            errorMessage:
              `DNS aponta pra outro servidor (nao mais pra Vercel/Trilho). ` +
              `IP atual: ${aRecs.join(", ") || "—"}${cnRecs.length ? ` / CNAME: ${cnRecs.join(", ")}` : ""}. ` +
              `Restaure o DNS: A ${VERCEL_IPS[0]} (host: @) ou CNAME cname.vercel-dns.com (subdominio).`,
            lastCheckAt: now,
          },
        });
        healthResults.push({ domain: d.domain, outcome: "downed", reason: "not_vercel" });
        continue;
      }

      // 2.3) DNS aponta pra Vercel — health check no marcador /cl/__trilho_health
      // Se falhar, incrementa streak; derruba só depois de HEALTH_FAIL_THRESHOLD
      // pra evitar flap por SSL provisionando / rede transitória.
      const servesOk = await domainServesTrilho(d.domain, 1);
      if (servesOk) {
        // Voltou / continua saudável — zera streak
        const updates: Record<string, unknown> = { lastCheckAt: now };
        if (streak > 0 || d.errorMessage) updates.errorMessage = null;
        await prisma.customDomain.update({
          where: { id: d.id },
          data: updates,
        });
        healthResults.push({
          domain: d.domain,
          outcome: streak > 0 ? "recovered" : "still_healthy",
        });
        continue;
      }

      // Health falhou — incrementa streak
      const newStreak = streak + 1;
      if (newStreak >= HEALTH_FAIL_THRESHOLD) {
        // 3+ falhas seguidas → derruba
        await prisma.customDomain.update({
          where: { id: d.id },
          data: {
            status: "failed",
            errorMessage:
              `Dominio nao responde como Trilho ha ~${newStreak * 5}min. ` +
              `Provavelmente esta apontado pra outra hospedagem sua, ou o SSL na Vercel expirou. ` +
              `Solucao: cheque no painel de dominios que o registro esta OK e clique "Verificar agora".`,
            lastCheckAt: now,
          },
        });
        healthResults.push({
          domain: d.domain,
          outcome: "downed",
          reason: "health_streak",
          streak: newStreak,
        });
      } else {
        // Ainda tolerando — marca warning (silencioso pro seller)
        await prisma.customDomain.update({
          where: { id: d.id },
          data: {
            errorMessage: `[hstreak:${newStreak}] tentando recuperar automaticamente...`,
            lastCheckAt: now,
          },
        });
        healthResults.push({
          domain: d.domain,
          outcome: "warning",
          streak: newStreak,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      console.error(`[cron/sync-custom-domains] health check ${d.domain}:`, msg);
      healthResults.push({ domain: d.domain, outcome: "skipped", reason: msg });
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // FASE 3 — AUTO-ALIAS (self-healing) do código atual
  // ═════════════════════════════════════════════════════════════════════
  let aliasedOk = 0;
  const aliasBlocked: Array<{ domain: string; code?: string }> = [];
  try {
    const depId = await getLatestProductionDeploymentId();
    const live = await prisma.customDomain.findMany({
      where: { useCheckout: true, status: "verified" }, // só verified (a fase 2 acima já jogou os quebrados pra failed)
      select: { id: true, domain: true, status: true, errorMessage: true },
      take: 100,
    });
    for (const ld of live) {
      const st = await getDomainStatusFromVercel(ld.domain);
      if (!st.ok || !("data" in st)) {
        aliasBlocked.push({
          domain: ld.domain,
          code: st.ok ? "skipped" : st.error,
        });
        continue;
      }
      let vok = st.data.verified;
      if (!vok) {
        const vr = await verifyProjectDomain(ld.domain);
        if (vr.verified) vok = true;
      }
      if (vok) {
        aliasedOk++;
        if (depId) await aliasDeploymentToDomain(depId, ld.domain).catch(() => {});
        continue;
      }
      aliasBlocked.push({ domain: ld.domain, code: "domain_not_verified" });
      const txt = st.data.verification?.[0];
      const msg = txt
        ? `Ação necessária: este domínio está registrado em OUTRA conta Vercel. Adicione no DNS o registro ${txt.type} "${txt.domain}" com o valor "${txt.value}" — depois conecta sozinho em ~5 min.`
        : `Ação necessária: aponte o DNS pra Vercel (A 76.76.21.21) e adicione o TXT de verificação mostrado ao configurar o domínio.`;
      if (ld.errorMessage !== msg) {
        await prisma.customDomain
          .update({
            where: { id: ld.id },
            data: { status: "failed", errorMessage: msg },
          })
          .catch(() => {});
      }
    }
  } catch (e) {
    console.error(
      "[cron/sync-custom-domains] auto-alias falhou:",
      e instanceof Error ? e.message : e,
    );
  }

  return NextResponse.json({
    ok: true,
    fase1_validation: {
      total: domains.length,
      verified,
      stillPending,
      failed,
      results,
    },
    fase2_health: {
      total: healthyBatch.length,
      downed: healthResults.filter((r) => r.outcome === "downed").length,
      recovered: healthResults.filter((r) => r.outcome === "recovered").length,
      warnings: healthResults.filter((r) => r.outcome === "warning").length,
      results: healthResults,
    },
    fase3_alias: { aliasedOk, aliasBlocked },
  });
}
