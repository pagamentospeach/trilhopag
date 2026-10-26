/**
 * Gerador de dados de cliente fake/aleatórios.
 * Quando o cliente não preenche (ou preenche errado) algum campo
 * obrigatório do PSP, geramos um valor válido pra que a transação não
 * trave por validação. O importante é que o Pix seja gerado pra o
 * cliente conseguir pagar — depois, com o webhook de pagamento, a
 * gente confirma a venda.
 */

const FIRST_NAMES = [
  "João", "Maria", "Pedro", "Ana", "Lucas", "Mariana", "Gabriel",
  "Júlia", "Mateus", "Beatriz", "Rafael", "Larissa", "Daniel",
  "Camila", "Felipe", "Carolina", "Bruno", "Amanda", "Diego",
  "Letícia", "Thiago", "Vitória", "André", "Isabela", "Marcos",
  "Fernanda", "Caio", "Natália", "Henrique", "Sofia",
];
const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Ferreira",
  "Rodrigues", "Almeida", "Costa", "Gomes", "Martins", "Araújo",
  "Ribeiro", "Carvalho", "Mendes", "Cardoso", "Castro", "Dias",
  "Barbosa", "Rocha", "Nascimento", "Ramos", "Monteiro", "Moreira",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomFullName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${pick(LAST_NAMES)}`;
}

export function randomEmail(name?: string): string {
  const base = name
    ? name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12)
    : "cliente";
  const suffix = Math.floor(Math.random() * 99999);
  const domains = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com.br"];
  return `${base}${suffix}@${pick(domains)}`;
}

/** Gera celular brasileiro válido: +55 + DDD válido + 9 + 8 dígitos. */
export function randomPhoneBR(): string {
  const ddds = ["11", "21", "31", "41", "47", "51", "61", "71", "81", "85"];
  const ddd = pick(ddds);
  let middle = "";
  for (let i = 0; i < 8; i++) middle += Math.floor(Math.random() * 10);
  return `+55${ddd}9${middle}`;
}

/** Gera CPF válido (com dígitos verificadores corretos). */
export function randomCPF(): string {
  const digits: number[] = [];
  for (let i = 0; i < 9; i++) digits.push(Math.floor(Math.random() * 10));
  digits.push(calcCpfDigit(digits));
  digits.push(calcCpfDigit(digits));
  return digits.join("");
}

function calcCpfDigit(digits: number[]): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += digits[i] * (digits.length + 1 - i);
  }
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** Valida CPF: precisa ter 11 dígitos e dígitos verificadores corretos. */
export function isValidCPF(input: string): boolean {
  const cpf = input.replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false; // 11111111111, 22222222222, etc.
  const digits = cpf.split("").map(Number);
  const d1 = calcCpfDigit(digits.slice(0, 9));
  if (d1 !== digits[9]) return false;
  const d2 = calcCpfDigit(digits.slice(0, 10));
  return d2 === digits[10];
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

export function isValidPhone(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

/**
 * Normaliza telefone BR pra formato E.164 (`+5511987654321`).
 *
 * FIX 17/07/2026 (davi: "Numero de telefone vindo errado mesmo quando o
 * lead bota o numero certo... nennhum ta dando numero valido p chamar n zap"):
 * antes o phone era salvo COM MASCARA (ex: "(11) 99999-9999") — webhooks,
 * WhatsApp automation, wa.me links e CRMs recebiam a string com parênteses/
 * espaços/hífens e não conseguiam discar. Agora normalizamos:
 *
 *   - "(11) 99999-9999"    → "+5511999999999"  (11 dígitos, adiciona +55)
 *   - "11 9999-9999"       → "+551199999999"   (10 dígitos, adiciona +55)
 *   - "+55 11 99999-9999"  → "+5511999999999"  (13 dígitos, mantém +55)
 *   - "5511999999999"      → "+5511999999999"  (13 dígitos com 55, prepend +)
 *
 * Se não conseguir normalizar (ex: número internacional não-BR), retorna
 * a string original — caller decide se aceita ou substitui por fake.
 */
export function normalizePhoneToE164(input: string): string {
  const digits = input.replace(/\D/g, "");
  // Sem dígitos ou algo bizarro fora da faixa BR.
  if (digits.length < 10 || digits.length > 13) return input;
  // Já vem com código país 55 (12 ou 13 dígitos).
  if (
    (digits.length === 13 || digits.length === 12) &&
    digits.startsWith("55")
  ) {
    return `+${digits}`;
  }
  // BR sem código país (10 ou 11 dígitos: DDD + numero). Prepend 55.
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  // Fallback — internacional não-BR ou formato inesperado.
  return `+${digits}`;
}

export function isValidName(input: string): boolean {
  return input.trim().length >= 2;
}

/** Recebe os dados crus do cliente e retorna versões válidas
 *  (preserva o que veio certo, gera fallback pro que vier vazio/errado).
 *
 *  ⚠️ PHONE (10/07/2026, david: "quando tiver numero, é pra gerar naquele
 *  numero (se tiver valido) e mostrar ele na aba vendas"):
 *  - Se seller manda phone NAO-VAZIO, `phone` retornado eh SEMPRE o valor
 *    original (pra aparecer certo na aba de vendas).
 *  - Se o phone nao passar em `isValidPhone` (formato esquisito pro PSP),
 *    `phoneForProvider` recebe um fake — assim o PIX gera sem erro, mas o
 *    seller ve o valor real do cliente no dashboard.
 *  - Se seller manda phone vazio/null, gera fake em AMBOS (mostra na aba
 *    tb — sem esse fake, coluna telefone ficaria em branco).
 */
export function ensureValidCustomer(raw: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  cpf?: string | null;
}): {
  name: string;
  email: string;
  /** Phone pra gravar no Transaction.customerPhone (aparece na aba vendas). */
  phone: string;
  /**
   * Phone pra passar pro provider (SafePix, Pluggou, etc.). Se o phone
   * original passa em isValidPhone, e igual ao `phone`. Senao, e um fake
   * valido — garante que o PSP nao rejeite por phone invalido.
   */
  phoneForProvider: string;
  cpf: string;
  autoFilled: string[]; // lista de campos que foram preenchidos automaticamente
} {
  const autoFilled: string[] = [];

  let name = (raw.name || "").trim();
  if (!isValidName(name)) {
    name = randomFullName();
    autoFilled.push("name");
  }

  let email = (raw.email || "").trim();
  if (!isValidEmail(email)) {
    email = randomEmail(name);
    autoFilled.push("email");
  }

  const rawPhone = (raw.phone || "").trim();
  let phone: string;
  let phoneForProvider: string;
  if (rawPhone === "") {
    // Seller nao mandou phone — fake em ambos.
    phone = randomPhoneBR();
    phoneForProvider = phone;
    autoFilled.push("phone");
  } else if (isValidPhone(rawPhone)) {
    // Seller mandou phone valido — NORMALIZA pra E.164 pra webhook/WhatsApp
    // conseguirem discar (17/07/2026, davi: "nennhum ta dando numero valido
    // p chamar n zap"). "(11) 99999-9999" vira "+5511999999999".
    phone = normalizePhoneToE164(rawPhone);
    phoneForProvider = phone;
  } else {
    // Seller mandou phone mas nao passa no regex (formato esquisito pro PSP).
    // Preserva o valor original em `phone` (pra aba vendas mostrar o que ele
    // mandou), mas usa fake em `phoneForProvider` (pra PIX gerar sem erro).
    phone = rawPhone;
    phoneForProvider = randomPhoneBR();
    // Marca como "provider_phone_faked" — util pra debug/metricas sem misturar
    // com autoFilled (que indica campo NAO preenchido pelo seller).
    autoFilled.push("provider_phone_faked");
  }

  let cpf = (raw.cpf || "").replace(/\D/g, "");
  if (!isValidCPF(cpf)) {
    cpf = randomCPF();
    autoFilled.push("cpf");
  }

  return { name, email, phone, phoneForProvider, cpf, autoFilled };
}
