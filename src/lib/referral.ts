import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { MAIN_DOMAIN } from "./checkout-url";

export async function ensureReferralCode(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (u?.referralCode) return u.referralCode;
  const code = await generateUniqueCode();
  await prisma.user.update({
    where: { id: userId },
    data: { referralCode: code },
  });
  return code;
}

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidate = randomBytes(4).toString("base64url").slice(0, 6).toLowerCase();
    const exists = await prisma.user.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return randomBytes(8).toString("base64url").slice(0, 10).toLowerCase();
}

export async function getReferralUrl(userId: string): Promise<string> {
  const code = await ensureReferralCode(userId);
  // MAIN_DOMAIN e nao NEXT_PUBLIC_APP_URL: este link o seller COPIA e MANDA
  // pra outra pessoa. Com a env, um ambiente mal configurado (localhost em
  // dev, URL de preview num deploy) gera um link quebrado que o seller so
  // descobre depois de ja ter divulgado. A constante nao tem esse modo de
  // falha. E o dominio principal mesmo, nao o de checkout: /signup so
  // existe no institucional.
  return `${MAIN_DOMAIN}/signup?ref=${code}`;
}
