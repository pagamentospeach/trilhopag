"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireUserId, requireSessionUserId } from "@/lib/auth-helpers";
import { generateSecret, buildOtpAuthUrl, verifyTotp } from "@/lib/totp";
import { validateSafeName } from "@/lib/security/safe-input";
import { LIGHT_THEME_KEY } from "@/lib/theme-mode";

/* -------------------- Perfil básico -------------------- */

const ProfileInput = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  cpfCnpj: z.string().trim().max(40).optional().nullable(),
  personType: z.enum(["PF", "PJ"]).optional().nullable(),
});

export async function saveProfile(formData: FormData) {
  const userId = await requireUserId();
  const parsed = ProfileInput.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || null,
    cpfCnpj: formData.get("cpfCnpj") || null,
    personType: formData.get("personType") || null,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // XSS defense (16/07/2026): bloqueia HTML/JS no nome antes de gravar.
  // Detalhes em src/lib/security/safe-input.ts. Também é enforçado no
  // hook de user.create do BetterAuth pra pegar signup — aqui pega EDIT.
  const nameCheck = validateSafeName(parsed.data.name);
  if (!nameCheck.ok) {
    return {
      ok: false as const,
      error: nameCheck.reason,
      fieldErrors: { name: [nameCheck.reason] },
    };
  }

  // Auto-detect personType pelo cpfCnpj se não veio explícito
  const digits = (parsed.data.cpfCnpj || "").replace(/\D/g, "");
  const autoType: "PF" | "PJ" = digits.length === 14 ? "PJ" : "PF";
  const personType = parsed.data.personType ?? autoType;

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      cpfCnpj: parsed.data.cpfCnpj || null,
      personType,
    },
  });
  revalidatePath("/dashboard/perfil");
  return { ok: true as const };
}

/* -------------------- Identidade (displayName + avatar) -------------------- */

const IdentityInput = z.object({
  displayName: z.string().trim().max(60).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable().or(z.literal("")),
});

export async function saveIdentity(formData: FormData) {
  const userId = await requireUserId();
  const parsed = IdentityInput.safeParse({
    displayName: formData.get("displayName") || null,
    avatarUrl: formData.get("avatarUrl") || null,
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Dados inválidos." };
  }
  // XSS defense: displayName aparece na sidebar, avatar, notifs push. Rejeita
  // HTML/JS igual o `name`.
  if (parsed.data.displayName) {
    const check = validateSafeName(parsed.data.displayName);
    if (!check.ok) {
      return { ok: false as const, error: check.reason };
    }
  }
  const settingsExisting = await prisma.userSettings.findUnique({
    where: { userId },
  });
  if (settingsExisting) {
    await prisma.userSettings.update({
      where: { userId },
      data: {
        displayName: parsed.data.displayName?.trim() || null,
        avatarUrl: parsed.data.avatarUrl?.trim() || null,
      },
    });
  } else {
    await prisma.userSettings.create({
      data: {
        userId,
        // 08/08/2026 (davi): white é o padrão. Este create só roda pra conta
        // que ainda não tinha UserSettings, então não sobrescreve escolha.
        theme: LIGHT_THEME_KEY,
        bgPattern: "grid",
        displayName: parsed.data.displayName?.trim() || null,
        avatarUrl: parsed.data.avatarUrl?.trim() || null,
      },
    });
  }
  revalidatePath("/dashboard/perfil");
  revalidatePath("/dashboard", "layout");
  return { ok: true as const };
}

/* -------------------- Endereço -------------------- */

const AddressInput = z.object({
  zipcode: z.string().trim().min(8, "CEP inválido").max(20),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(160).optional().nullable(),
  neighborhood: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(40),
  country: z.string().trim().max(40).optional().nullable(),
});

export async function saveAddress(formData: FormData) {
  const userId = await requireUserId();
  const parsed = AddressInput.safeParse({
    zipcode: formData.get("zipcode"),
    street: formData.get("street"),
    number: formData.get("number"),
    complement: formData.get("complement") || null,
    neighborhood: formData.get("neighborhood"),
    city: formData.get("city"),
    state: formData.get("state"),
    country: formData.get("country") || "BR",
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  await prisma.address.upsert({
    where: { userId },
    create: {
      userId,
      zipcode: parsed.data.zipcode,
      street: parsed.data.street,
      number: parsed.data.number,
      complement: parsed.data.complement || null,
      neighborhood: parsed.data.neighborhood,
      city: parsed.data.city,
      state: parsed.data.state,
      country: parsed.data.country || "BR",
    },
    update: {
      zipcode: parsed.data.zipcode,
      street: parsed.data.street,
      number: parsed.data.number,
      complement: parsed.data.complement || null,
      neighborhood: parsed.data.neighborhood,
      city: parsed.data.city,
      state: parsed.data.state,
      country: parsed.data.country || "BR",
    },
  });
  revalidatePath("/dashboard/perfil");
  return { ok: true as const };
}

/* -------------------- Conta bancária / Pix -------------------- */

const BankInput = z.object({
  bankName: z.string().trim().max(120).optional().nullable(),
  bankCode: z.string().trim().max(20).optional().nullable(),
  agency: z.string().trim().max(20).optional().nullable(),
  agencyDigit: z.string().trim().max(5).optional().nullable(),
  account: z.string().trim().max(40).optional().nullable(),
  accountDigit: z.string().trim().max(5).optional().nullable(),
  accountType: z.enum(["corrente", "poupanca", "pagamento"]).optional().nullable(),
  pixKey: z.string().trim().max(200).optional().nullable(),
  pixKeyType: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).optional().nullable(),
  holderName: z.string().trim().max(160).optional().nullable(),
  holderDocument: z.string().trim().max(40).optional().nullable(),
});

export async function saveBankAccount(formData: FormData) {
  const userId = await requireUserId();
  const raw = {
    bankName: (formData.get("bankName") as string) || null,
    bankCode: (formData.get("bankCode") as string) || null,
    agency: (formData.get("agency") as string) || null,
    agencyDigit: (formData.get("agencyDigit") as string) || null,
    account: (formData.get("account") as string) || null,
    accountDigit: (formData.get("accountDigit") as string) || null,
    accountType: (formData.get("accountType") as string) || null,
    pixKey: (formData.get("pixKey") as string) || null,
    pixKeyType: (formData.get("pixKeyType") as string) || null,
    holderName: (formData.get("holderName") as string) || null,
    holderDocument: (formData.get("holderDocument") as string) || null,
  };
  const parsed = BankInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  await prisma.bankAccount.upsert({
    where: { userId },
    create: { userId, ...data },
    update: { ...data },
  });
  revalidatePath("/dashboard/perfil");
  return { ok: true as const };
}

/* -------------------- KYC / Comprovantes -------------------- */

const KycInput = z.object({
  type: z.enum(["doc_front", "doc_back", "selfie", "contract_social"]),
  url: z.string().url("URL inválida"),
});

export async function saveKycDocument(formData: FormData) {
  const userId = await requireUserId();
  const parsed = KycInput.safeParse({
    type: formData.get("type"),
    url: formData.get("url"),
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  await prisma.kycDocument.upsert({
    where: { userId_type: { userId, type: parsed.data.type } },
    create: {
      userId,
      type: parsed.data.type,
      url: parsed.data.url,
      status: "pending",
    },
    update: {
      url: parsed.data.url,
      status: "pending",
      rejectionReason: null,
    },
  });

  // Primeiro envio (not_started): aprova na hora e avisa o admin pra auditar
  // depois — o seller ja pode usar tudo.
  //
  // ⚠️ SELLER REJEITADO NAO SE RE-APROVA. Encontrado em 12/08/2026 comparando
  // com a BravoPay, que fechou o mesmo furo la (54168fd, davi 08/08: "o
  // cadastro nao vai mais ser automatico").
  //
  // O que acontecia: compliance rejeitava um seller, ele reenviava os mesmos
  // documentos por esta tela e o codigo devolvia `approved` — desfazendo a
  // decisao do admin em silencio, sem ninguem ficar sabendo. Quem foi barrado
  // por fraude tinha um botao de se desbloquear.
  //
  // Agora o reenvio de quem esta rejeitado SO gera a notificacao. O status
  // continua `rejected` ate um humano olhar.
  const docs = await prisma.kycDocument.findMany({
    where: { userId },
    select: { type: true },
  });
  const hasFront = docs.some((d) => d.type === "doc_front");
  const hasSelfie = docs.some((d) => d.type === "selfie");
  if (hasFront && hasSelfie) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true, email: true, name: true },
    });
    if (u && (u.kycStatus === "not_started" || u.kycStatus === "rejected")) {
      const eraRejeitado = u.kycStatus === "rejected";
      if (!eraRejeitado) {
        await prisma.user.update({
          where: { id: userId },
          data: { kycStatus: "approved", kycRejectionReason: null },
        });
      }
      await prisma.adminNotification.create({
        data: {
          type: "kyc_pending_audit",
          targetUserId: userId,
          message: eraRejeitado
            ? `Seller REJEITADO reenviou documentos: ${u.email}. Continua bloqueado ate voce decidir.`
            : `Novos documentos enviados por ${u.email}. Auditoria pendente.`,
          payload: { userEmail: u.email, userName: u.name, eraRejeitado },
        },
      });
    }
  }

  revalidatePath("/dashboard/perfil");
  return { ok: true as const };
}

export async function deleteKycDocument(type: string) {
  const userId = await requireUserId();
  const allowed = ["doc_front", "doc_back", "selfie", "contract_social"];
  if (!allowed.includes(type)) return { ok: false as const, error: "Tipo inválido." };
  await prisma.kycDocument.deleteMany({ where: { userId, type } });
  revalidatePath("/dashboard/perfil");
  return { ok: true as const };
}

/* -------------------- 2FA (TOTP) -------------------- */

export async function startTwoFactorSetup() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user) return { ok: false as const, error: "Usuário não encontrado." };

  const secret = generateSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: secret, twoFactorEnabled: false },
  });

  const otpauth = buildOtpAuthUrl({
    secretBase32: secret,
    accountLabel: user.email,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 280 });

  return { ok: true as const, secret, otpauth, qrDataUrl };
}

export async function confirmTwoFactorSetup(code: string) {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true },
  });
  if (!user?.twoFactorSecret) {
    return {
      ok: false as const,
      error: "Inicie o setup primeiro (gere o QR).",
    };
  }
  const ok = verifyTotp({ secretBase32: user.twoFactorSecret, code });
  if (!ok) {
    return { ok: false as const, error: "Código inválido. Tente novamente." };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true },
  });
  revalidatePath("/dashboard/perfil");
  return { ok: true as const };
}

export async function disableTwoFactor(code: string) {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    revalidatePath("/dashboard/perfil");
    return { ok: true as const };
  }
  const ok = verifyTotp({ secretBase32: user.twoFactorSecret, code });
  if (!ok) {
    return {
      ok: false as const,
      error: "Código inválido. Digite o código atual do seu app pra desativar.",
    };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });
  revalidatePath("/dashboard/perfil");
  return { ok: true as const };
}

/* -------------------- Reenviar email de verificação -------------------- */

export async function resendVerificationEmail() {
  const userId = await requireSessionUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  });
  if (!user) return { ok: false as const, error: "Usuário não encontrado." };
  if (user.emailVerified) {
    return { ok: false as const, error: "Email já verificado." };
  }

  try {
    await auth.api.sendVerificationEmail({
      headers: await headers(),
      body: { email: user.email },
    });
    return { ok: true as const };
  } catch (e) {
    console.error("[resendVerificationEmail]", e);
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao enviar.",
    };
  }
}
