import * as OTPAuth from "otpauth";

const ISSUER = "Trilho";

export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function buildOtpAuthUrl({
  secretBase32,
  accountLabel,
}: {
  secretBase32: string;
  accountLabel: string;
}): string {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountLabel,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.toString();
}

/** Verifica um código TOTP. Aceita ±1 janela (30s) por tolerância de relógio. */
export function verifyTotp({
  secretBase32,
  code,
}: {
  secretBase32: string;
  code: string;
}): boolean {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token: cleaned, window: 1 });
  return delta !== null;
}
