import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * CSP — restritiva mas permite os integradores (Meta, TikTok, Google, Vercel,
 * YouTube, Vimeo, ViaCEP). 'unsafe-inline'/'unsafe-eval' no script-src são
 * exigidos pelo Next App Router em runtime — não dá pra remover sem quebrar.
 *
 * connect-src é estreitado pra evitar exfiltração via fetch ilimitado.
 */
const ContentSecurityPolicy = [
  "default-src 'self'",
  // Scripts: self + integradores ad/analytics + unpkg (ffmpeg.wasm worker) + Cloudflare Turnstile (anti-bot)
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://connect.facebook.net https://www.googletagmanager.com https://www.google-analytics.com https://analytics.tiktok.com https://*.tiktok.com https://*.vercel-scripts.com https://va.vercel-scripts.com https://unpkg.com https://js.stripe.com https://*.stripe.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Imagens: liberadas (uploads + remote produto)
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Connect: APIs próprias + integradores + WS Neon + Cloudflare Turnstile. NÃO usa https: aberto.
  //
  // ⚠️ 24/07/2026 (davi: "o video fica carregando infinitamente") — CAUSA RAIZ
  // de TODAS as tentativas de upload client-side que falharam neste repo.
  // O @vercel/blob v2 mudou a base da API pra `https://vercel.com/api/blob`
  // (era `https://blob.vercel-storage.com` na v0/v1 — esse host aqui embaixo
  // é legado e hoje não recebe nada). Como `vercel.com` não estava no
  // connect-src, TODO upload direto browser→Blob era bloqueado pela CSP: o
  // XHR morria em onerror, o SDK entrava em retry com backoff e a UI ficava
  // "carregando" pra sempre.
  //
  // Isso explica o histórico no header de src/app/api/bturb/upload/route.ts
  // ("trava em carregando", "request was aborted", "0% pra sempre"): as 5
  // tentativas anteriores estavam corretas — a CSP é que barrava. Upload
  // server-side sempre funcionou porque Node não aplica CSP.
  //
  // `*.blob.vercel-storage.com` cobre o subdomínio do store (leitura + PUT
  // direto), mais amplo que só `*.public.` que estava aqui antes.
  "connect-src 'self' https://vercel.com https://blob.vercel-storage.com https://*.blob.vercel-storage.com https://viacep.com.br https://*.facebook.com https://*.facebook.net https://*.tiktok.com https://analytics.tiktok.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.googleapis.com https://*.googleusercontent.com https://*.vercel-insights.com https://*.neon.tech wss://*.neon.tech https://unpkg.com https://api.stripe.com https://*.stripe.com https://api.mercadopago.com https://*.mercadopago.com https://challenges.cloudflare.com",
  "media-src 'self' blob: https:",
  // Iframes: vídeo (YT/Vimeo) + Facebook + Google Tag Manager + Cloudflare Turnstile (challenge iframe)
  "frame-src 'self' https://www.youtube.com https://player.vimeo.com https://www.facebook.com https://td.doubleclick.net https://js.stripe.com https://*.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
  // Workers: ffmpeg.wasm precisa de blob + wasm
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Frame-ancestors 'self' permite o builder iframar /c/[slug]?preview=1
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

/** Headers padrão pra TODAS as rotas. */
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    // IMPORTANTE:
    //  - microphone=(self): necessario pro modo voz do Assistente IA (Jarvis).
    //  - payment=(self): necessario pra Apple Pay / Google Pay via Stripe Elements.
    //  - Demais features sao bloqueadas totalmente (zero exposicao).
    value:
      "camera=(), microphone=(self), geolocation=(), interest-cohort=(), payment=(self), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=(), midi=(), serial=(), hid=(), idle-detection=(), screen-wake-lock=()",
  },
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // Cross-Origin isolation — proteção contra Spectre + vazamento cross-window
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Origin-Agent-Cluster: isola origens em processos separados
  { key: "Origin-Agent-Cluster", value: "?1" },
];

const nextConfig: NextConfig = {
  // Esconde "X-Powered-By: Next.js"
  poweredByHeader: false,

  // Remove console.* em produção (deixa error/warn pra debug)
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },

  // Limita tamanho de payload pra prevenir DoS via body grande
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    /**
     * Tree-shake agressivo de barrel imports. Tira ~30-50% do client
     * bundle de páginas que importam {Icon1, Icon2, ...} de lucide-react
     * sem isso. Aplicado às libs com barrel files grandes.
     */
    optimizePackageImports: [
      "lucide-react",
      "motion",
      "recharts",
      "date-fns",
      "@xyflow/react",
    ],
  },

  /**
   * REDIRECTS de HONEYPOT — todos os paths admin-óbvios apontam pro fake.
   *
   * Attacker que testar via ferramenta de dirbust (ffuf, gobuster) achará
   * qualquer um desses paths e cairá no painel fake `/admin/login`. Ninguém
   * legítimo entra aqui — o admin REAL usa outro path (não commited em código
   * público). Cada hit é logado + auto-blacklist do IP após 5 hits/hora.
   */
  async redirects() {
    const HONEYPOT_TARGETS = [
      "administrator",
      "admin-panel",
      "adminpanel",
      "admin-login",
      "adminlogin",
      "painel",
      "painel-admin",
      "manage",
      "manager",
      "management",
      "control",
      "control-panel",
      "controlpanel",
      "root",
      "sudo",
      "backend",
      "backoffice",
      "back-office",
      "dashboard-admin",
      "wp-admin", // Wordpress fisher
      "cpanel",
      "phpmyadmin",
      "adminer",
    ];
    return HONEYPOT_TARGETS.map((src) => ({
      source: `/${src}`,
      destination: "/admin/login",
      permanent: false,
    })).concat(
      HONEYPOT_TARGETS.map((src) => ({
        source: `/${src}/:path*`,
        destination: "/admin/login",
        permanent: false,
      })),
    );
  },

  /**
   * ⚠️ NÃO tente de novo espelhar a API do Blob num rewrite (`/_blob/*` →
   * `https://vercel.com/api/blob/*`). Foi tentado em 26/07/2026 e NÃO existe
   * combinação que feche — medido em produção:
   *
   *   - a Edge devolve 413 a partir de ~4.4MB de body (4MB passa, 4.4MB não).
   *     O teto de 4.5MB vale pro rewrite igual vale pra Function;
   *   - as partes do multipart do SDK são de 8MB e não são configuráveis;
   *   - montar as partes na mão, menores, também não resolve: o Blob exige o
   *     mínimo de 5MB do S3 ("Your proposed upload is smaller than the
   *     minimum allowed size", testado com 4MB e 3.5MB).
   *
   *   4.5MB de teto contra 5MB de mínimo: não fecha.
   *
   *   E tem um segundo problema, caso alguém insista: a API do Blob responde
   *   `cache-control: public, max-age=86400` e a Edge cacheia o rewrite POR
   *   URL, ignorando método e headers. As três fases do multipart batem na
   *   mesma `/mpu?pathname=…` e só diferem no header `x-mpu-action`, então a
   *   resposta do `create` era servida pras outras duas.
   *
   * O plano B pra quando o browser não alcança `vercel.com` é
   * `/api/dashboard/upload-chunk`: pedaços abaixo do teto + emenda no
   * servidor, sem multipart (é lá que o mínimo de 5MB deixa de existir).
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Admin: cache zero + noindex absoluto + DENY no iframe
        source: "/admin01/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0, private",
          },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/v1/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // Onboarding: sensível, no-cache obrigatório
        source: "/onboarding/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, private" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // Webhooks recebidos NUNCA podem ser iframados nem cacheados
        source: "/api/webhooks/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "default-src 'none'" },
        ],
      },
      {
        // Apple Pay domain verification: a Apple exige text/plain NESSE arquivo
        // específico. Escopado de propósito — antes o text/plain era global em
        // /.well-known/* e quebraria arquivos JSON que EXIGEM application/json
        // (apple-app-site-association → Universal Links iOS; assetlinks.json →
        // App Links Android). Servidos como text/plain, esses validadores falham.
        source: "/.well-known/apple-developer-merchantid-domain-association",
        headers: [{ key: "Content-Type", value: "text/plain" }],
      },
      {
        // Demais .well-known: cache curto + CSP limpa pra validadores externos,
        // SEM forçar Content-Type (o Next infere pela extensão → .json vira
        // application/json corretamente).
        source: "/.well-known/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300" },
          { key: "Content-Security-Policy", value: "default-src 'none'" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
