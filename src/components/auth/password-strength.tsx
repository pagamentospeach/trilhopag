"use client";

import { Check, X } from "lucide-react";

/**
 * Medidor de força de senha do cadastro.
 *
 * 08/08/2026 (davi): "na parte da senha, bota algo indicando senha fraca ou
 * forte".
 *
 * Duas coisas separadas de propósito:
 *  - as REGRAS (`rules`) são o que bloqueia o botão. São objetivas e a pessoa
 *    vê qual falta.
 *  - a FORÇA (`score`) é conselho, não trava. Senha pode passar nas regras e
 *    ainda ser ruim ("Senha123"), e mentir dizendo que está ótima é pior do
 *    que não dizer nada.
 *
 * O score não usa biblioteca: zxcvbn são ~800kB no bundle de uma tela que a
 * pessoa vê uma vez na vida. A heurística abaixo pega o que importa no mundo
 * real — tamanho acima de tudo, variedade depois, e desconto pros padrões que
 * todo mundo tenta (sequência de teclado, repetição, o próprio nome/email).
 */

export type PasswordRule = { label: string; ok: boolean };

export function passwordRules(password: string): PasswordRule[] {
  return [
    { label: "Pelo menos 8 caracteres", ok: password.length >= 8 },
    { label: "Uma letra maiúscula", ok: /[A-Z]/.test(password) },
    { label: "Uma letra minúscula", ok: /[a-z]/.test(password) },
    { label: "Um número", ok: /[0-9]/.test(password) },
  ];
}

/** Sequências que aparecem em quase todo vazamento de senha. */
const COMMON = [
  "senha", "password", "123456", "12345678", "qwerty", "abc123", "admin",
  "trilho", "trilhopag", "iloveyou", "111111", "000000", "letmein", "welcome",
];

export type Strength = {
  /** 0 a 4. */
  score: number;
  label: string;
  /** Classe Tailwind da barra e do texto. */
  barClass: string;
  textClass: string;
};

export function passwordStrength(password: string, context: string[] = []): Strength {
  if (!password) {
    return { score: 0, label: "", barClass: "bg-slate-200", textClass: "text-slate-400" };
  }

  const lower = password.toLowerCase();
  let points = 0;

  // Tamanho é o fator que mais importa — cada faixa vale um ponto.
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;

  // Variedade: três ou mais famílias de caractere valem um ponto.
  const families = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length;
  if (families >= 3) points += 1;
  if (families === 4) points += 1;

  // --- descontos ---

  // Está na lista de sempre, ou é o nome/email da própria pessoa.
  const leaked =
    COMMON.some((c) => lower.includes(c)) ||
    context
      .map((c) => c.toLowerCase().trim())
      .filter((c) => c.length >= 4)
      .some((c) => lower.includes(c) || c.includes(lower));
  if (leaked) points -= 2;

  // Um caractere só repetido (aaaaaa), ou sequência de teclado/contagem.
  if (/^(.)\1+$/.test(password)) points -= 2;
  if (/(abc|bcd|cde|def|123|234|345|456|567|678|789|qwe|wer|ert|asd)/.test(lower)) {
    points -= 1;
  }

  const score = Math.max(0, Math.min(4, points));
  const table: Record<number, Omit<Strength, "score">> = {
    0: { label: "Muito fraca", barClass: "bg-red-500", textClass: "text-red-600" },
    1: { label: "Fraca", barClass: "bg-red-500", textClass: "text-red-600" },
    2: { label: "Média", barClass: "bg-amber-500", textClass: "text-amber-600" },
    3: { label: "Forte", barClass: "bg-emerald-500", textClass: "text-emerald-600" },
    4: { label: "Muito forte", barClass: "bg-emerald-600", textClass: "text-emerald-700" },
  };
  return { score, ...table[score] };
}

export function PasswordStrengthMeter({
  password,
  context = [],
}: {
  password: string;
  /** Nome e email — senha que contém eles não é senha. */
  context?: string[];
}) {
  const rules = passwordRules(password);
  const s = passwordStrength(password, context);

  if (!password) {
    return (
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {rules.map((r) => (
          <RuleItem key={r.label} rule={{ ...r, ok: false }} idle />
        ))}
      </ul>
    );
  }

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < Math.max(1, s.score) ? s.barClass : "bg-slate-200"
              }`}
            />
          ))}
        </div>
        <span className={`w-24 shrink-0 text-right text-xs font-semibold ${s.textClass}`}>
          {s.label}
        </span>
      </div>
      {/* aria-live: quem usa leitor de tela ouve a força mudar sem ter que
          caçar o indicador. */}
      <p className="sr-only" aria-live="polite">
        Força da senha: {s.label}
      </p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {rules.map((r) => (
          <RuleItem key={r.label} rule={r} />
        ))}
      </ul>
    </div>
  );
}

function RuleItem({ rule, idle }: { rule: PasswordRule; idle?: boolean }) {
  return (
    <li
      className={`flex items-center gap-1.5 text-xs ${
        idle ? "text-slate-400" : rule.ok ? "text-emerald-600" : "text-slate-500"
      }`}
    >
      {rule.ok ? (
        <Check className="size-3.5 shrink-0" />
      ) : (
        <X className={`size-3.5 shrink-0 ${idle ? "text-slate-300" : "text-slate-300"}`} />
      )}
      {rule.label}
    </li>
  );
}
