/**
 * AES-256-GCM helpers for encrypting sensitive at-rest tokens
 * (Meta access tokens, etc).
 *
 * Format do output: "v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>"
 *
 * Key: APP_ENCRYPTION_KEY no env (base64 de 32 bytes).
 */
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("APP_ENCRYPTION_KEY env var não está configurada.");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `APP_ENCRYPTION_KEY tem tamanho inválido (${buf.length} bytes; esperado ${KEY_BYTES}).`,
    );
  }
  return buf;
}

export function encryptString(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptString(payload: string): string {
  if (!payload.startsWith("v1:")) {
    throw new Error("Formato de payload inválido.");
  }
  const [, ivB64, authTagB64, dataB64] = payload.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}
