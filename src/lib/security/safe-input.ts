/**
 * Validadores de input contra XSS stored.
 *
 * Contexto (16/07/2026, davi): pentester registrou seller com o nome:
 *
 *   `<script>(async()=>{ ...tentativa de escalar pra admin... })()</script>`
 *
 * E depois criou produtos com nome/descrição idem, tentando exfiltrar
 * cookies via requestcatcher.com. React em JSX escapa `{v}` automaticamente,
 * mas HTML dentro de nome/descrição:
 *
 *   - Aparece bruto em emails (templates usam template literal `${user.name}`)
 *   - Aparece bruto em PDFs, CSVs de export, notificações push (text/plain
 *     que alguns clients renderizam como HTML)
 *   - Se um admin fizer copy-paste do painel pra outra ferramenta, o payload
 *     viaja
 *   - Se algum dia colocarmos `dangerouslySetInnerHTML` num lugar novo (ex:
 *     rich checkout description), boom.
 *
 * Defesa em profundidade: bloqueamos na entrada. Nome/descrição de conta
 * e produto NUNCA precisam de `<`, `>`, ou tags. Se o seller for legítimo,
 * o nome dele cabe em [letras + números + espaço + acentos + `.-'&,`].
 */

/**
 * Rejeita se o nome contém HTML tags, control chars, ou padrões
 * típicos de payload XSS. Retorna `null` se OK, ou uma msg de erro.
 *
 * Escopo intencionalmente conservador: PERMITE nomes brasileiros normais
 * (com acento, apóstrofo, hífen, & em razão social), REJEITA qualquer
 * coisa que cheire a HTML/JS.
 */
export function validateSafeName(
  raw: string | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (raw == null) return { ok: true };
  const s = String(raw);

  // Comprimento sanidade — nome > 200 chars é sempre payload
  if (s.length > 200) {
    return { ok: false, reason: "Nome muito longo (máx 200 caracteres)." };
  }

  // Control chars (exceto space/tab). Quebras de linha em NOME não fazem
  // sentido e são forte sinal de payload multi-linha.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B-\x1F\x7F]/.test(s)) {
    return { ok: false, reason: "Nome contém caracteres inválidos." };
  }

  // Bloqueia HTML tags e delimitadores. Nenhum nome legítimo tem `<` ou `>`.
  if (/[<>]/.test(s)) {
    return { ok: false, reason: "Nome não pode conter '<' ou '>'." };
  }

  // Bloqueia protocol handlers usados em XSS via atributos
  if (/javascript:|data:|vbscript:/i.test(s)) {
    return { ok: false, reason: "Nome contém padrão inválido." };
  }

  // Bloqueia event handlers HTML (onerror=, onclick=, etc)
  if (/\bon[a-z]{2,}\s*=/i.test(s)) {
    return { ok: false, reason: "Nome contém padrão inválido." };
  }

  // Bloqueia sequências que só aparecem em template injection
  // (Handlebars, Angular, etc — precaução)
  if (/\{\{.*\}\}|\$\{.*\}/.test(s)) {
    return { ok: false, reason: "Nome contém padrão inválido." };
  }

  return { ok: true };
}

/**
 * Versão "descrição" — mais permissiva (aceita quebra de linha, texto longo)
 * mas ainda bloqueia HTML e event handlers. Usada em `product.description`,
 * `product.name` de checkout, campos livres de texto.
 *
 * Se um dia quisermos rich text de verdade em algum campo, usar
 * `sanitizeHtml()` do `sanitize.ts` (DOMPurify) DEPOIS de aceitar o input.
 * Não usar validateSafeText — os dois têm objetivos diferentes: um é
 * defesa de input plain, o outro é sanitização de output rich.
 */
export function validateSafeText(
  raw: string | null | undefined,
  { maxLen = 5000 }: { maxLen?: number } = {},
): { ok: true } | { ok: false; reason: string } {
  if (raw == null) return { ok: true };
  const s = String(raw);

  if (s.length > maxLen) {
    return { ok: false, reason: `Texto muito longo (máx ${maxLen} caracteres).` };
  }

  // Control chars exceto \n, \r, \t
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(s)) {
    return { ok: false, reason: "Texto contém caracteres inválidos." };
  }

  // Bloqueia tags HTML completas com sinal + nome de tag conhecida perigosa
  // (permite `<` isolado num texto tipo "5 < 10" — mas rejeita `<script`,
  // `<img`, `<svg`, etc). O bloqueio total de `<` em descrição seria muito
  // restritivo, então filtramos as tags realmente perigosas.
  if (/<\s*(script|iframe|object|embed|form|input|style|link|meta|svg|img|body|html|base|frame|frameset)\b/i.test(s)) {
    return { ok: false, reason: "Texto não pode conter tags HTML." };
  }

  // Fecha-tag também
  if (/<\/\s*(script|iframe|object|embed|form|input|style|link)/i.test(s)) {
    return { ok: false, reason: "Texto não pode conter tags HTML." };
  }

  // Event handlers (onerror=, onclick=)
  if (/\bon[a-z]{2,}\s*=/i.test(s)) {
    return { ok: false, reason: "Texto contém padrão inválido." };
  }

  // Protocol handlers em href/src
  if (/javascript:|vbscript:/i.test(s)) {
    return { ok: false, reason: "Texto contém padrão inválido." };
  }

  return { ok: true };
}

/**
 * Sanitiza forçando — remove HTML tags via replace. USE SÓ quando não pode
 * rejeitar (ex: migração de dados legados). Prefere `validateSafeName` +
 * `validateSafeText` no ponto de entrada.
 */
export function stripHtmlAggressive(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/data:/gi, "")
    .replace(/\bon[a-z]{2,}\s*=/gi, "")
    .trim();
}
