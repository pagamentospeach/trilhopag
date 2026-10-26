/**
 * Anti-bot MANUAL — substituto do Cloudflare Turnstile.
 *
 * Por que não Turnstile/reCAPTCHA: dependem de JS externo que pode ser
 * bloqueado por CSP, AdBlock, redes corporativas, ou cair (e travar TODO
 * o signup). Inúmeros relatos do user sobre legítimos travados.
 *
 * Como funciona:
 *  1. Cliente faz GET /api/anti-bot/challenge → recebe um alvo ("Clique no
 *     cachorro"), a lista de emojis embaralhada, nonce, expiry, e um TOKEN
 *     HMAC-assinado dessas info.
 *  2. User clica num emoji. Cliente submete o ÍNDICE clicado + token + nonce.
 *  3. Backend verifica HMAC, valida que o índice bate, que não expirou.
 *  4. Adicionalmente:
 *     - HONEYPOT: campo escondido `_hp` deve vir vazio (bots preenchem).
 *     - TIMING: tempo entre carregar o desafio e submeter precisa ser > 1s
 *       (bots respondem em <100ms — humano demora pelo menos 1.5s).
 *
 * NUNCA depende de serviço externo. NUNCA bloqueia user legítimo por bug
 * de network. Falha clara com mensagem útil se algo der errado.
 */
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

// Secret do HMAC do desafio anti-bot. NUNCA usa literal hardcoded em
// produção (seria publicamente conhecido → tokens forjáveis → bypass total).
// Em prod exige ANTI_BOT_SECRET ou APP_ENCRYPTION_KEY (sempre setado);
// fail-closed se faltar. Dev usa um literal só pra não travar local.
function resolveAntiBotSecret(): string {
  const s = process.env.ANTI_BOT_SECRET ?? process.env.APP_ENCRYPTION_KEY;
  if (s) return s;
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-anti-bot-secret-change-me";
  }
  throw new Error(
    "anti-bot: ANTI_BOT_SECRET/APP_ENCRYPTION_KEY ausente em produção",
  );
}
const SECRET = resolveAntiBotSecret();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 min
const MIN_HUMAN_TIME_MS = 1000; // < 1s = bot
const MAX_HUMAN_TIME_MS = CHALLENGE_TTL_MS; // expira em 5 min

/**
 * Emojis usados no desafio. Cada um tem um nome em português que não se
 * confunde com o de nenhum outro da lista — o user precisa achar o certo de
 * primeira, sem ficar em dúvida entre dois parecidos.
 *
 * 08/08/2026 (davi): "troque o jeito de anti-bot, troque por algo mais
 * simples tipo: Selecione o emoji x". Conta de matemática travava gente no
 * celular; clicar num emoji é um toque só.
 */
const EMOJIS: { emoji: string; name: string }[] = [
  { emoji: "🐶", name: "cachorro" },
  { emoji: "🐱", name: "gato" },
  { emoji: "🐝", name: "abelha" },
  { emoji: "🐟", name: "peixe" },
  { emoji: "🚗", name: "carro" },
  { emoji: "✈️", name: "avião" },
  { emoji: "🚲", name: "bicicleta" },
  { emoji: "🍕", name: "pizza" },
  { emoji: "🍌", name: "banana" },
  { emoji: "🍎", name: "maçã" },
  { emoji: "⚽", name: "bola" },
  { emoji: "🎈", name: "balão" },
  { emoji: "❤️", name: "coração" },
  { emoji: "⭐", name: "estrela" },
  { emoji: "🔑", name: "chave" },
  { emoji: "🎸", name: "guitarra" },
  { emoji: "🌻", name: "girassol" },
  { emoji: "🔥", name: "fogo" },
  { emoji: "🎧", name: "fone" },
  { emoji: "🌙", name: "lua" },
];

/** Quantas opções aparecem na grade. */
const OPTION_COUNT = 6;

export type BotChallenge = {
  /** Nome do emoji que o user tem que clicar (ex: "cachorro"). */
  target: string;
  /** Emojis embaralhados pra mostrar na grade. */
  options: string[];
  /** Identificador único do desafio (anti-replay). */
  nonce: string;
  /** Epoch ms quando o desafio expira. */
  expiresAt: number;
  /** Token HMAC que prova que o servidor gerou esse desafio. */
  token: string;
};

/** Gera um desafio fresco. */
export function generateChallenge(): BotChallenge {
  const pool = [...EMOJIS];
  shuffle(pool);
  const picked = pool.slice(0, OPTION_COUNT);
  const correctIndex = Math.floor(Math.random() * picked.length);

  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  // Token incorpora: nonce + índice correto + expiry. O cliente recebe só a
  // grade e o nome do alvo — nunca o índice —, e o backend confirma sem
  // precisar guardar estado.
  const token = sign(`${nonce}|${correctIndex}|${expiresAt}`);

  return {
    target: picked[correctIndex].name,
    options: picked.map((p) => p.emoji),
    nonce,
    expiresAt,
    token,
  };
}

/** Fisher-Yates in-place. */
function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** Verifica resposta do user contra o token assinado. */
export type VerifyInput = {
  /** Índice do emoji que o user clicou na grade. */
  answer: number | string;
  /** Nonce que veio no desafio. */
  nonce: string;
  /** Token HMAC do desafio. */
  token: string;
  /** Epoch ms quando o desafio expira (já veio do generate). */
  expiresAt: number;
  /** Honeypot — deve estar vazio se humano. */
  honeypot?: string;
  /** Quando o desafio foi gerado (pra timing check). */
  challengeIssuedAt?: number;
};

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string; userMessage: string };

export function verifyChallenge(input: VerifyInput): VerifyResult {
  // 1. Honeypot — bot preencheu campo invisível?
  if (input.honeypot && input.honeypot.trim().length > 0) {
    return {
      ok: false,
      reason: "honeypot_filled",
      userMessage: "Verificação falhou. Recarregue a página e tente de novo.",
    };
  }

  // 2. Token expirou?
  const now = Date.now();
  if (input.expiresAt < now) {
    return {
      ok: false,
      reason: "expired",
      userMessage: "Verificação expirou. Resolva o desafio de novo.",
    };
  }

  // 3. Timing — se o user enviou em menos de 1s, é bot
  if (
    input.challengeIssuedAt &&
    now - input.challengeIssuedAt < MIN_HUMAN_TIME_MS
  ) {
    return {
      ok: false,
      reason: "too_fast",
      userMessage: "Aguarde um momento e tente de novo.",
    };
  }

  // 4. Token MUITO velho (passou do TTL desde challengeIssuedAt)
  if (
    input.challengeIssuedAt &&
    now - input.challengeIssuedAt > MAX_HUMAN_TIME_MS
  ) {
    return {
      ok: false,
      reason: "stale",
      userMessage: "Verificação expirou. Resolva o desafio de novo.",
    };
  }

  // 5. Valida HMAC do token (prova que o servidor gerou esse desafio)
  const answerNum = Number(input.answer);
  if (!Number.isFinite(answerNum)) {
    return {
      ok: false,
      reason: "invalid_answer_format",
      userMessage: "Escolha um dos emojis.",
    };
  }
  const expected = sign(`${input.nonce}|${answerNum}|${input.expiresAt}`);
  const a = Buffer.from(input.token, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return {
      ok: false,
      reason: "wrong_answer_or_tampered_token",
      userMessage: "Emoji errado. Tente de novo.",
    };
  }

  return { ok: true };
}

/** HMAC-SHA256 hex. Padrão pra todos os tokens. */
function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}
