import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decideCloaker } from "@/lib/cloaker";
import { isPlatformHost } from "@/lib/platform-domains";
import { safeFetch } from "@/lib/security/ssrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;

  // HEALTH MARKER: confirma que ESTE host serve a Trilho. Usado pela
  // verificacao de dominio (verifyCustomDomain) pra detectar dominios que
  // apontam pra OUTRA hospedagem/Vercel do seller (o IP 76.76.21.21 eh
  // generico da Vercel, entao DNS sozinho nao prova que serve a Trilho).
  // Responde em qualquer host, sem dado sensivel.
  if (slug === "__trilho_health") {
    return NextResponse.json({ trilhopag_cloaker: true });
  }

  // HARD GUARD: se a request vier via hostname da PLATAFORMA
  // (trilhopag.com etc), retorna 404 imediato. O cloaker SÓ
  // pode rodar via domínio próprio do seller — senão a URL do anúncio
  // queima o domínio do gateway. Isso impede que alguém cole o link no
  // anúncio usando trilhopag.com/cl/<slug>.
  const url = new URL(request.url);
  if (isPlatformHost(url.hostname)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const campaign = await prisma.cloakerCampaign.findUnique({
    where: { slug },
  });

  // Slug não existe ou campanha inativa → 404 silencioso
  if (!campaign || !campaign.active) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Coleta sinais da request
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const userAgent = request.headers.get("user-agent");
  const referer = request.headers.get("referer");
  // Vercel adiciona x-vercel-ip-country automaticamente
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    null;

  // UTMs vêm na própria URL (`url` já foi construído no guard acima)
  const utmSource = url.searchParams.get("utm_source");
  const utmCampaign = url.searchParams.get("utm_campaign");

  const decision = decideCloaker({
    ip,
    userAgent,
    referer,
    country,
    utmSource,
    campaign,
  });

  // Decide URL destino
  const baseUrl = decision.decision === "money" ? campaign.moneyUrl : campaign.whiteUrl;
  // Repassa todos query params originais pra preservar UTMs/click ids
  let finalUrl: string;
  try {
    const target = new URL(baseUrl);
    url.searchParams.forEach((v, k) => {
      if (!target.searchParams.has(k)) target.searchParams.set(k, v);
    });
    finalUrl = target.toString();
  } catch {
    finalUrl = baseUrl;
  }

  // Log assíncrono — não bloqueia o redirect
  prisma.cloakerHit
    .create({
      data: {
        campaignId: campaign.id,
        decision: decision.decision,
        reason: decision.reason,
        ip,
        country,
        userAgent,
        referer,
        utmSource,
        utmCampaign,
      },
    })
    .catch(() => {});

  prisma.cloakerCampaign
    .update({
      where: { id: campaign.id },
      data: {
        totalRequests: { increment: 1 },
        passedToMoney: decision.decision === "money" ? { increment: 1 } : undefined,
        sentToWhite: decision.decision === "white" ? { increment: 1 } : undefined,
      },
    })
    .catch(() => {});

  // Modo: redirect (302) ou rewrite (proxy)
  if (campaign.mode === "rewrite") {
    // ANTI-SSRF: safeFetch RESOLVE o DNS e bloqueia hosts internos/metadata
    // (AWS 169.254.169.254, localhost, RFC1918) — fecha o buraco de
    // DNS-rebinding que o guard só-por-string (isSafeExternalUrl) tinha.
    // Se o URL for interno OU o fetch falhar, cai pro redirect 302 (o
    // browser do user não alcança a rede interna do servidor — seguro).
    try {
      const proxied = await safeFetch(finalUrl, {
        headers: {
          "User-Agent": userAgent ?? "Mozilla/5.0",
          Accept: request.headers.get("accept") ?? "*/*",
        },
        timeoutMs: 8000,
      });
      const body = await proxied.arrayBuffer();
      const contentType = proxied.headers.get("content-type") ?? "text/html";
      return new NextResponse(body, {
        status: proxied.status,
        headers: { "content-type": contentType },
      });
    } catch {
      // SSRF bloqueado OU proxy falhou → redirect 302 (fallback seguro).
      return NextResponse.redirect(finalUrl, 302);
    }
  }

  return NextResponse.redirect(finalUrl, 302);
}
