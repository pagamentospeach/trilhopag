import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { prisma } from "./prisma";
import { bootstrapSignupFromCookies } from "./signup-bootstrap";
import { validateSafeName } from "./security/safe-input";
import { isDisposableEmail } from "./security/disposable-emails";
import { LIGHT_THEME_KEY } from "./theme-mode";

/**
 * Origens confiaveis pro better-auth (lista de hosts que podem chamar
 * /api/auth/*). Sem isto, better-auth retorna "Invalid origin" quando
 * o request vem de dominio diferente do BETTER_AUTH_URL.
 *
 * Cobre:
 *  - trilhopag.com (primario, Cloudflare)
 *  - trilhopag.vercel.app (preview Vercel)
 *  - localhost:3000 + localhost:3001 (dev local)
 */
const TRUSTED_ORIGINS = [
  "https://trilhopag.com",
  "https://www.trilhopag.com",
  "https://trilhopag.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

/**
 * Login social (OAuth) — cada provider só é registrado quando as credenciais
 * existem no ambiente. Antes de criar o app no console do provider, ele
 * simplesmente não entra na config (nada quebra; o botão avisa que ainda não
 * está ativo). Depois de setar as envs na Vercel e redeployar, funciona.
 *
 * Redirect URIs que precisam estar cadastradas:
 *   https://trilhopag.com/api/auth/callback/google
 *   https://trilhopag.com/api/auth/callback/github
 *   http://localhost:3000/api/auth/callback/{google,github}   (dev)
 */
const googleEnabled =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
const githubEnabled =
  !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET;

const socialProviders = {
  ...(googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          // Sempre deixa o usuário escolher a conta Google (evita logar
          // direto na conta errada quando há várias logadas no navegador).
          prompt: "select_account" as const,
        },
      }
    : {}),
  ...(githubEnabled
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID as string,
          clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
          // Sem `user:email` o GitHub não devolve o email de quem o mantém
          // privado, e o better-auth não consegue criar/vincular a conta.
          scope: ["user:email"],
        },
      }
    : {}),
};

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: TRUSTED_ORIGINS,
  ...(Object.keys(socialProviders).length > 0 ? { socialProviders } : {}),
  // Vincula o login social a uma conta já existente com o MESMO email (os dois
  // providers entregam email verificado), em vez de criar conta duplicada.
  // Assim quem já tinha conta por email/senha entra pelo social também.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github"],
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    autoSignIn: true,
    // 24/07/2026 (davi): 'Seller reclamando que nao ta conseguindo trocar a
    // senha da conta dele pq o email nao chega'. Reativado o envio de reset
    // que estava no-op desde 17/07 (politica de 'so 2 emails' relaxada pra
    // incluir reset). Usa mesma infra Resend do resto.
    sendResetPassword: async ({ user, url }) => {
      try {
        const { sendEmail } = await import("./email");
        const displayName = (user as { name?: string | null }).name?.trim() || "";
        const greeting = displayName ? `Olá, ${displayName}!` : "Olá!";
        const html = `
          <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:auto;color:#1a1a1a;padding:24px">
            <h2 style="color:#0a0a0a;margin-top:0">Redefina sua senha</h2>
            <p style="line-height:1.5">${greeting}</p>
            <p style="line-height:1.5">Recebemos um pedido pra redefinir a senha da sua conta Trilho. Clique no botão abaixo pra criar uma senha nova:</p>
            <div style="margin:32px 0;text-align:center">
              <a href="${url}" style="display:inline-block;background:#22d3ee;color:#000;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:700;text-decoration:none">
                Redefinir senha
              </a>
            </div>
            <p style="color:#666;font-size:13px;line-height:1.5">
              Ou copie e cole no navegador:<br/>
              <span style="word-break:break-all;color:#333">${url}</span>
            </p>
            <p style="color:#666;font-size:13px;line-height:1.5">
              O link expira em <strong>1 hora</strong>. Se você não pediu isso, ignore este email — sua conta continua segura.
            </p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
            <p style="color:#999;font-size:12px">Trilho · Recuperação de senha</p>
          </div>
        `;
        const text = `Redefina sua senha Trilho:\n\n${url}\n\nO link expira em 1 hora. Se voce nao pediu, ignore este email.`;
        const r = await sendEmail({
          to: user.email,
          subject: "Redefinir senha — Trilho",
          html,
          text,
        });
        if (!r.ok) {
          console.error("[auth:sendResetPassword] falha envio:", r.error);
        }
      } catch (e) {
        console.error("[auth:sendResetPassword] excecao:", e);
      }
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  user: {
    additionalFields: {
      cpfCnpj: { type: "string", required: false, input: true },
      phone: { type: "string", required: false, input: true },
    },
  },
  advanced: {
    cookiePrefix: "trilho",
  },
  // ⚠️ RATE LIMIT — corrige outage de cadastro/login (jun/2026).
  //
  // O better-auth, SEM config, aplica uma "special rule" embutida que limita
  // /sign-up e /sign-in a APENAS 3 requisições por 10s POR IP. Isso derruba
  // sellers legítimos em massa porque o público do Trilho vem quase todo de:
  //   - OPERADORA MÓVEL com CGNAT (Vivo/Claro/TIM) → centenas de usuários
  //     compartilham 1 mesmo IP público → estouram o 3/10s coletivamente;
  //   - NAVEGADOR IN-APP (Instagram/TikTok/Facebook) e Wi-Fi compartilhado.
  // Em pico de tráfego (campanha de ads) vários sellers no mesmo IP colidem e
  // recebem 429 "Too many requests" → "não dá pra criar conta" = dinheiro perdido.
  //
  // A defesa anti-bot REAL do cadastro não depende disto: o /api/signup/validate
  // já exige captcha matemático + honeypot + timing antes de criar a conta. Aqui
  // só afrouxamos o limite-IP pra não punir IP compartilhado legítimo. Mantemos
  // um teto generoso (100/min) que ainda freia abuso óbvio. Storage segue em
  // memória (default) — por instância serverless, naturalmente tolerante.
  rateLimit: {
    enabled: true,
    customRules: {
      "/sign-up/**": { window: 60, max: 100 },
      "/sign-in/**": { window: 60, max: 100 },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // BAN HARD: conta com blocked=true NAO consegue criar sessao → login
        // falha com 403. Combinado com a invalidacao de sessoes no momento do
        // ban (admin), o seller fica 100% trancado pra fora (o site nem abre).
        // Fail-open no erro de DB pra um hiccup nao trancar todo mundo.
        before: async (session) => {
          const u = await prisma.user
            .findUnique({
              where: { id: session.userId },
              select: { blocked: true },
            })
            .catch(() => null);
          if (u?.blocked) {
            throw new APIError("FORBIDDEN", {
              message: "Conta bloqueada pelo administrador.",
            });
          }
          return { data: session };
        },
      },
    },
    user: {
      create: {
        // XSS defense (16/07/2026): pentester registrou seller com o `name`
        // sendo um `<script>` inteiro tentando escalar pra admin. React em
        // JSX escapa `{u.name}`, mas o nome apareceria BRUTO em:
        //   - templates de email (server-side render como HTML)
        //   - PDFs, CSVs de export
        //   - qualquer futuro `dangerouslySetInnerHTML`
        // Rejeitamos na porta: nome com `<`, `>`, javascript:, event handler,
        // ou control char não passa. Todo signup (email, Google OAuth) cai
        // aqui. TAMBÉM checa blocklist de emails banidos por fraude (pra
        // cobrir Google OAuth que não passa por /api/signup/validate).
        before: async (data) => {
          const nameCheck = validateSafeName(data.name);
          if (!nameCheck.ok) {
            console.warn("[auth-hook] blocked signup with unsafe name", {
              email: data.email,
              reason: nameCheck.reason,
              nameFirst80: String(data.name ?? "").slice(0, 80),
            });
            throw new APIError("BAD_REQUEST", {
              message: nameCheck.reason,
            });
          }

          // OWNED-DOMAIN GUARD: rejeita signup com email do próprio domínio
          // (impersonacao do tipo admin@trilhopag.com). Ninguém legítimo se
          // cadastra com nosso dominio — esses são pra email server interno,
          // não signup público.
          const emailLower = String(data.email ?? "").toLowerCase();
          const emailDomain = emailLower.split("@")[1] ?? "";
          const OWNED_DOMAINS = [
            "trilhopag.com",
            "trilhopag.local",
          ];
          if (OWNED_DOMAINS.includes(emailDomain)) {
            console.warn("[auth-hook] blocked signup: owned domain impersonation", {
              email: emailLower,
            });
            throw new APIError("FORBIDDEN", {
              message: "Cadastro não permitido com esse email.",
            });
          }

          // Disposable email guard (cobre Google OAuth também — se alguém
          // conseguir criar um alias tipo user@mailinator.com no Google
          // Workspace e logar via SSO, ainda cai aqui)
          if (isDisposableEmail(emailLower)) {
            console.warn("[auth-hook] blocked signup: disposable email", {
              email: emailLower,
            });
            throw new APIError("FORBIDDEN", {
              message: "Cadastro não permitido com email temporário. Use um email pessoal permanente.",
            });
          }

          // Blocklist check — email banido
          try {
            const blockNote = await prisma.adminNotification.findFirst({
              where: { type: "banned_identifiers" },
              orderBy: { createdAt: "desc" },
              select: { payload: true },
            });
            const payload =
              (blockNote?.payload as {
                emails?: string[];
                emailDomains?: string[];
              } | null) ?? null;
            if (payload) {
              const banned = new Set(
                (payload.emails ?? []).map((e) => e.toLowerCase()),
              );
              const domain = emailLower.split("@")[1] ?? "";
              const bannedDomains = new Set(
                (payload.emailDomains ?? []).map((d) => d.toLowerCase()),
              );
              const normalizedLocal =
                emailLower.split("@")[0]?.split("+")[0] ?? "";
              const normalizedEmail = `${normalizedLocal}@${domain}`;
              if (
                banned.has(emailLower) ||
                banned.has(normalizedEmail) ||
                bannedDomains.has(domain)
              ) {
                console.warn("[auth-hook] blocked signup: email in blocklist", {
                  email: emailLower,
                });
                throw new APIError("FORBIDDEN", {
                  message: "Cadastro não permitido.",
                });
              }
            }
          } catch (e) {
            if (e instanceof APIError) throw e;
            // Fail-open no erro de DB pra não trancar signup legítimo
            console.error("[auth-hook] blocklist check failed:", e);
          }
          return { data };
        },
        after: async (user, context) => {
          // Garante que toda conta nova já nasce com UserSettings + tema
          // setado. Sem isso, o registro só seria criado lazy quando o seller
          // mudasse alguma config — e poderia herdar tema diferente se o
          // default do schema mudasse no futuro.
          //
          // 08/08/2026 (davi): "Deixa o tema white padrao quando alguem cria a
          // conta na platforma". Conta nova nasce em `daylight`; quem já tinha
          // escolhido midnight continua no escuro (o upsert só escreve no
          // create).
          try {
            await prisma.userSettings.upsert({
              where: { userId: user.id },
              create: {
                userId: user.id,
                theme: LIGHT_THEME_KEY,
                bgPattern: "grid",
              },
              update: {},
            });
          } catch (e) {
            console.error("[auth-hook] failed to seed UserSettings", { userId: user.id, e });
          }

          // Aplica taxas-padrão (PlatformDefaults) + attach-referral pelo
          // cookie tp_ref. Isto roda pra TODO signup, mas é essencial pro
          // fluxo Google/OAuth — que não passa pelos endpoints
          // /api/signup/{complete-profile,attach-referral} (esses são só do
          // cadastro por email). Sem isto, seller via Google ficava com as
          // taxas estáticas do schema e ignorava quem o indicou. Idempotente
          // e não lança. Passa o header Cookie da request (fonte confiável do
          // tp_ref no callback OAuth).
          const cookieHeader =
            (context as { headers?: Headers } | undefined)?.headers?.get(
              "cookie",
            ) ?? null;
          await bootstrapSignupFromCookies(user.id, cookieHeader);
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
