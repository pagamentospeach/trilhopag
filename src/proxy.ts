import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import {
  CHECKOUT_HOST,
  MAIN_HOST,
  PLATFORM_ALIAS_HOSTS,
  isInternalGatewayHost,
} from "./lib/checkout-url";
import { AUTHORIZED_VERCEL_PROJECT_ID } from "./lib/security/deployment-guard";
import { GATE_COOKIE, isGateTokenValid } from "./lib/admin-gate";

const TP_VID = "tp_vid";

/* ============== SECURITY: honey endpoints + UA filter + path traversal ============== */

const HONEYPOTS = new Set([
  "/.env",
  "/.env.local",
  "/.env.production",
  "/.git/config",
  "/.git/HEAD",
  "/wp-login.php",
  "/wp-config.php",
  "/wordpress",
  "/phpmyadmin",
  "/pma",
  "/admin.php",
  "/administrator",
  "/_profiler/phpinfo",
  "/phpinfo.php",
  "/server-status",
  "/server-info",
  "/web.config",
  "/.aws/credentials",
  "/.ssh/id_rsa",
  "/config.json",
  "/.docker/config.json",
  "/actuator",
  "/actuator/env",
  "/actuator/health",
  "/.htpasswd",
  "/.DS_Store",
]);

const BAD_METHODS = new Set(["TRACE", "CONNECT", "DEBUG", "TRACK"]);

const BAD_USER_AGENTS = [
  "nikto",
  "sqlmap",
  "nessus",
  "openvas",
  "acunetix",
  "havij",
  "metasploit",
  "burpcollaborator",
  "nuclei",
  "ffuf",
  "gobuster",
  "dirbuster",
  "wfuzz",
  "wpscan",
  "masscan",
  "zgrab",
];

function isHoneypot(p: string): boolean {
  if (HONEYPOTS.has(p)) return true;
  return (
    p.startsWith("/wp-") ||
    p.startsWith("/.git/") ||
    p.startsWith("/.env") ||
    p.startsWith("/.aws/") ||
    p.startsWith("/.ssh/")
  );
}

function isPathTraversal(p: string): boolean {
  const decoded = (() => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  })();
  return /\.\.[/\\]/.test(decoded) || /%2e%2e/i.test(p);
}

function isBadUserAgent(ua: string): boolean {
  const lower = ua.toLowerCase();
  return BAD_USER_AGENTS.some((bad) => lower.includes(bad));
}

function genVid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ============== PROXY (Next 16 middleware) ============== */

export async function proxy(request: NextRequest) {
  // `search` entra junto por causa do redirect de login lá embaixo, que
  // precisa preservar a query pra não matar deep-link (ver o comentário lá).
  const { pathname, search } = request.nextUrl;
  const method = request.method.toUpperCase();
  const ua = request.headers.get("user-agent") ?? "";

  // SECURITY LAYER 0a: DEPLOYMENT LOCK (*.vercel.app de outro projeto)
  if (process.env.NODE_ENV === "production") {
    const hostForLock =
      (request.headers.get("host") ?? "").trim().toLowerCase().split(":")[0];
    if (hostForLock.endsWith(".vercel.app")) {
      const currentProjectId = process.env.VERCEL_PROJECT_ID ?? "";
      if (currentProjectId !== AUTHORIZED_VERCEL_PROJECT_ID) {
        return new NextResponse("Not Found", { status: 404 });
      }
    }
  }

  // SECURITY LAYER 0b: CUSTOM DOMAIN SCOPE LOCK (05/07/2026)
  // Custom domains dos sellers (CustomDomain.status=verified) devem servir
  // APENAS checkout/cloaker/membros — nao a plataforma inteira. Sem esta
  // regra, o dominio de um seller serviria /dashboard, /admin01, /login e
  // a landing page, o que faz a plataforma inteira parecer acessivel a
  // partir de um dominio de terceiro.
  //
  // Politica: se o host NAO e apex oficial NEM *.vercel.app, tratamos
  // como custom domain de seller — so libera:
  //   - /c/*, /cl/*, /m/*    (checkout, cloaker, membros)
  //   - /api/checkouts/*     (endpoints do checkout)
  //   - /api/transactions/*/copy | /screen  (endpoints publicos da tx)
  //   - /_next/*             (assets estaticos)
  //   - /icon.png, favicon, robots, sitemap, manifest, .well-known
  //   - /api/webhooks/*, /api/cron/*   (delegam host check interno)
  // Qualquer outro path → 404. Efetivo: /dashboard, /admin01, /login etc
  // deixam de existir em custom domain.
  const OFFICIAL_APEX = new Set([
    "trilhopag.com",
    "www.trilhopag.com",
  ]);
  const hostForScope =
    (request.headers.get("host") ?? "").trim().toLowerCase().split(":")[0];
  const isOfficialHost =
    OFFICIAL_APEX.has(hostForScope) ||
    hostForScope.endsWith(".vercel.app") ||
    PLATFORM_ALIAS_HOSTS.has(hostForScope) ||
    // Sem isto o dev local cai no ramo de "custom domain de seller" e todo
    // path fora de checkout responde 404. Restrito a fora de producao para
    // que um Host: localhost forjado nao contorne o scope lock.
    (process.env.NODE_ENV !== "production" &&
      (hostForScope === "localhost" || hostForScope === "127.0.0.1"));
  if (!isOfficialHost) {
    // Custom domain (ou host arbitrario) — so paths de checkout publico.
    const isPublicCheckoutPath =
      pathname.startsWith("/c/") ||
      pathname.startsWith("/cl/") ||
      pathname.startsWith("/m/") ||
      pathname.startsWith("/api/checkouts/") ||
      pathname.startsWith("/api/transactions/") ||
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/api/webhooks/") ||
      pathname.startsWith("/api/cron/") ||
      pathname.startsWith("/.well-known/") ||
      pathname === "/favicon.ico" ||
      pathname === "/icon.png" ||
      pathname === "/apple-icon.png" ||
      pathname === "/robots.txt" ||
      pathname === "/sitemap.xml" ||
      pathname === "/manifest.json" ||
      pathname === "/logo.svg";
    if (!isPublicCheckoutPath) {
      // Log resumido pra tracking + 404 silencioso.
      return new NextResponse("Not Found", { status: 404 });
    }
  }

  // SECURITY LAYER 1: bad methods (TRACE/CONNECT/etc)
  if (BAD_METHODS.has(method)) {
    return new NextResponse("Method Not Allowed", { status: 405 });
  }

  // SECURITY LAYER 2: path traversal
  if (isPathTraversal(pathname)) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // SECURITY LAYER 3: honeypot endpoints (404 silencioso)
  if (isHoneypot(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // SECURITY LAYER 4: bad UAs (scanners conhecidos)
  if (ua && isBadUserAgent(ua)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // SECURITY LAYER 5: PORTA DO ADMIN (08/08/2026, davi)
  // "ao abrir /admin01 vem uma tela de erro como se a pagina nao existisse
  //  (…) se clicar 3 vezes no icone de erro essa pagina de erro some. Faça
  //  isso de forma que ninguem consiga ver nada da pagina até passar dessa
  //  mini task de segurança!"
  //
  // O "não ver NADA" é justamente o motivo de a porta morar aqui e não num
  // overlay de client: o proxy roda antes do roteamento, então o request nem
  // encosta no admin — não existe markup do painel escondido no view-source.
  //
  // Sem o cookie da porta, /admin01/* é REESCRITO (não redirecionado — a URL
  // continua /admin01) pra mesmíssima tela de 404 que qualquer slug
  // inexistente do domínio recebe, com status 404 de verdade. Pra um scanner,
  // /admin01 é indistinguível de /asdasd.
  //
  // Camuflagem, não autenticação: passar da porta só leva pro login normal.
  if (pathname === "/admin01" || pathname.startsWith("/admin01/")) {
    const gated = await isGateTokenValid(
      request.cookies.get(GATE_COOKIE)?.value,
    );
    if (!gated) {
      const url = request.nextUrl.clone();
      url.pathname = "/nao-encontrado";
      // O flag das 3 batidas vai por HEADER, não por query string. Com
      // `?g=1` na URL o payload RSC vazava `admin01?g=1` no HTML — e um
      // 404 de verdade nunca teria query nenhuma, o que denunciava que ali
      // existe uma porta. Header não aparece no payload.
      const headers = new Headers(request.headers);
      headers.set("x-tp-gate", "1");
      return NextResponse.rewrite(url, { status: 404, request: { headers } });
    }
  }

  // === ALIAS REDIRECT: dominio alias → MAIN_HOST ===
  // Quando alguem acessa um dominio ALIAS, redireciona pro MAIN_HOST oficial
  // preservando path + query. 308 (permanent) pra ajudar cache + search
  // engines a atualizarem. Hoje PLATFORM_ALIAS_HOSTS esta vazio (dominio
  // unico), entao este bloco fica inerte ate alguem cadastrar um alias.
  //
  // ⚠️ CRITICAL: NUNCA redirecionar endpoints de API v1 pra dominios
  // diferentes. Motivo: TODOS os clientes HTTP sérios (Axios, node-fetch,
  // requests, curl, PHP) STRIPAM o header `Authorization` em redirects
  // cross-origin — RFC 7231 e política default de segurança. O seller que
  // integrou com um alias teria a request redirecionada e a lib dele NÃO
  // reenviaria o Authorization → 401 "Invalid API key". Por isso /api/v1/*,
  // /api/webhooks/* e /api/cron/* servem DIRETO nos aliases (sem redirect).
  // O host header importa zero pra estas rotas.
  const requestHostRaw = request.headers.get("host") ?? "";
  const requestHostLc = requestHostRaw.toLowerCase().split(":")[0];
  const isAliasRedirectPath =
    !pathname.startsWith("/api/webhooks/") &&
    !pathname.startsWith("/api/cron/") &&
    // NUNCA redireciona API v1 — Authorization: Bearer se perde no redirect
    // cross-origin de HTTP clients (Axios/fetch/curl default). Sellers com
    // integração legada em dominio alias continuam recebendo 200 direto.
    !pathname.startsWith("/api/v1/");
  if (
    PLATFORM_ALIAS_HOSTS.has(requestHostLc) &&
    requestHostLc !== MAIN_HOST &&
    isAliasRedirectPath
  ) {
    const targetUrl = new URL(request.url);
    targetUrl.host = MAIN_HOST;
    targetUrl.protocol = "https:";
    return NextResponse.redirect(targetUrl, 308);
  }

  // === BRAND PROTECTION: trilhopag.com/c/* → CHECKOUT_HOST/c/* ===
  // Checkouts publicos NAO devem servir do dominio principal — denuncias
  // fraudulentas de concorrentes podem derrubar trilhopag.com inteiro.
  //
  // Default policy: redirect SO acontece quando explicitamente ligado via
  // env FORCE_CHECKOUT_HOST_REDIRECT="1". Sem o env, deixa o page.tsx
  // (server component) resolver host via pool de AdminCheckoutDomain
  // dinamicamente — assim quando o dominio de checkout cai (DNS quebrado,
  // parking page, registro expirado), o admin so precisa desativar o entry
  // no pool e tudo cai pro trilhopag.com sozinho.
  const requestHost = request.headers.get("host") ?? "";
  const forceRedirect =
    process.env.FORCE_CHECKOUT_HOST_REDIRECT === "1";
  const isCheckoutPath =
    pathname.startsWith("/c/") || pathname.startsWith("/cl/");
  // ANTI-LOOP: nao redireciona se o CHECKOUT_HOST ja eh o proprio
  // request host (acontece quando CHECKOUT_HOST="trilhopag.com" —
  // que tambem esta em INTERNAL_GATEWAY_HOSTS). Sem isso, com FORCE=1
  // teriamos redirect loop infinito.
  const wouldLoop =
    CHECKOUT_HOST.toLowerCase() === requestHost.toLowerCase().split(":")[0];
  if (
    forceRedirect &&
    !wouldLoop &&
    isCheckoutPath &&
    isInternalGatewayHost(requestHost)
  ) {
    const targetUrl = new URL(request.url);
    targetUrl.host = CHECKOUT_HOST;
    targetUrl.protocol = "https:";
    return NextResponse.redirect(targetUrl, 308);
  }

  // === AUTH redirect logic ===
  const isDashboard = pathname.startsWith("/dashboard");

  const sessionCookie = getSessionCookie(request, { cookiePrefix: "trilho" });

  if (isDashboard && !sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    // `pathname + search`, não só `pathname`. 08/08/2026: o push de venda paga
    // manda o seller pra /dashboard/vendas?highlight=<id>. Quando a sessão já
    // expirou — que é o caso COMUM de quem abre notificação horas depois — ele
    // passava por aqui e o `?highlight=` era descartado antes de chegar no
    // login. Fazia o deep-link morrer exatamente pra quem mais precisava dele,
    // e de um jeito que não dá pra reproduzir logado.
    //
    // O destino continua sendo sempre um caminho interno: a URL é construída
    // a partir do `pathname` do request, nunca de algo que o visitante
    // escreveu, então isto não vira open redirect.
    loginUrl.searchParams.set("from", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // /login e /signup NÃO redirecionam quem já tem cookie de sessão.
  //
  // 08/08/2026 (davi): "Quando eu entro na pagina de comecar agora parece que
  // eu ja vou direto para /onboarding/documentos via cookies, TIRA ISSO, ao
  // clicar ali deveria ir pra pagina de registro SEMPRE (mesmo se ja tiver
  // conta). Mesma coisa ao clicar no botao de entrar".
  //
  // O que acontecia: /signup mandava pro /dashboard, o /dashboard via o KYC
  // pendente e mandava pro /onboarding/documentos. Dois saltos, e quem clicou
  // em "Começar agora" nunca via o cadastro. Pior no caso comum de máquina
  // compartilhada ou de quem quer abrir uma segunda conta: o botão
  // simplesmente não fazia o que dizia.
  //
  // Sair da sessão não é problema: quem já está logado e cai no /login só
  // precisa enviar o formulário de novo, e o /signup criando conta nova já
  // troca a sessão. As telas de dentro continuam protegidas pela guarda de
  // /dashboard logo acima.

  const res = NextResponse.next();

  // Visitor ID cookie for public checkout tracking (must be set in proxy/middleware,
  // not in Server Components — Next 16 throws on cookies().set() inside pages).
  if (!request.cookies.get(TP_VID)?.value) {
    res.cookies.set(TP_VID, genVid(), {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }

  // X-Request-ID pra correlação de logs (frontend ↔ backend)
  res.headers.set("X-Request-ID", crypto.randomUUID());

  return res;
}

export const config = {
  matcher: [
    // Roda em TUDO exceto assets estáticos. Necessário pra honeypot endpoints
    // funcionarem (eles vivem fora de /dashboard, /login, etc).
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
