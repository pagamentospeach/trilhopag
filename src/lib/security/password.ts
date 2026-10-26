/**
 * Password hashing — Argon2id como padrão novo + suporte legacy bcrypt.
 *
 * Argon2id é o algoritmo recomendado pelo OWASP / NIST atual.
 * Parâmetros: m=64MB, t=3, p=2 — alta resistência a GPU/ASIC.
 *
 * Hashes legacy bcrypt continuam funcionando — `verifyPassword()` detecta
 * o formato e usa o verificador correto. Na próxima vez que o user logar
 * com senha correta, podemos re-hash automaticamente em Argon2id
 * (helper `shouldRehash`).
 */

import * as argon2 from "argon2";
import bcrypt from "bcryptjs";

const ARGON_PARAMS: argon2.Options = {
  type: argon2.argon2id,
  // 64 MiB memory cost — pesado o suficiente pra GPU mas tolerável no server
  memoryCost: 64 * 1024,
  // 3 passes
  timeCost: 3,
  // 2 threads
  parallelism: 2,
  // 16 bytes salt automático
};

/** Hash novo — sempre Argon2id. */
export async function hashPassword(plaintext: string): Promise<string> {
  if (typeof plaintext !== "string" || plaintext.length < 1) {
    throw new Error("Password vazio");
  }
  if (plaintext.length > 200) {
    throw new Error("Password muito longo (max 200)");
  }
  return argon2.hash(plaintext, ARGON_PARAMS);
}

/**
 * Verifica password contra hash. Detecta automaticamente o formato:
 *  - $argon2id$… → Argon2id verify
 *  - $2a$/$2b$/$2y$… → bcrypt verify
 *  - outro → false (não conhecido)
 */
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  if (!plaintext || !hash) return false;
  try {
    if (hash.startsWith("$argon2")) {
      return await argon2.verify(hash, plaintext);
    }
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
      return await bcrypt.compare(plaintext, hash);
    }
    // Hash desconhecido — fail closed
    return false;
  } catch {
    return false;
  }
}

/**
 * Retorna true se o hash deveria ser migrado pra Argon2id na próxima
 * verificação bem-sucedida.
 */
export function shouldRehash(hash: string): boolean {
  // Migra bcrypt → argon2id
  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    return true;
  }
  // Migra argon2 com parâmetros antigos (se aumentarmos params depois)
  if (hash.startsWith("$argon2")) {
    // Por enquanto, mantém todos os argon2 (já são fortes)
    return false;
  }
  return false;
}
