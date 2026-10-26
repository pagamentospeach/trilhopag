"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminWrite } from "@/lib/admin-auth";

const AdInput = z.object({
  platform: z.enum(["facebook", "tiktok"]),
  title: z.string().min(2).max(200),
  brand: z.string().max(120).optional().nullable(),
  niche: z.string().min(2).max(80),
  angle: z.string().min(2).max(80),
  mediaType: z.enum(["video", "image", "carousel"]),
  mediaUrl: z.string().url().optional().nullable().or(z.literal("")),
  thumbnailUrl: z.string().url().optional().nullable().or(z.literal("")),
  hookText: z.string().max(500).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  cta: z.string().max(80).optional().nullable(),
  estimatedSpend: z.string().max(40).optional().nullable(),
  daysRunning: z.coerce.number().int().min(0).max(2000).optional().nullable(),
  country: z.string().max(8).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional().default([]),
  language: z.string().max(8).default("pt"),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
});

function parseTagsCsv(input: FormDataEntryValue | null): string[] {
  if (!input) return [];
  return String(input)
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 20);
}

function parseFromFormData(fd: FormData) {
  return AdInput.safeParse({
    platform: fd.get("platform"),
    title: fd.get("title"),
    brand: (fd.get("brand") as string) || null,
    niche: fd.get("niche"),
    angle: fd.get("angle"),
    mediaType: fd.get("mediaType"),
    mediaUrl: (fd.get("mediaUrl") as string) || null,
    thumbnailUrl: (fd.get("thumbnailUrl") as string) || null,
    hookText: (fd.get("hookText") as string) || null,
    description: (fd.get("description") as string) || null,
    cta: (fd.get("cta") as string) || null,
    estimatedSpend: (fd.get("estimatedSpend") as string) || null,
    daysRunning: fd.get("daysRunning") || null,
    country: (fd.get("country") as string) || null,
    tags: parseTagsCsv(fd.get("tags")),
    language: (fd.get("language") as string) || "pt",
    featured: fd.get("featured") === "on",
    active: fd.get("active") !== "off",
  });
}

export async function createAdAction(fd: FormData) {
  const a = await requireAdminWrite();
  if (!a) return { ok: false as const, error: "unauthorized" };

  const parsed = parseFromFormData(fd);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const d = parsed.data;

  const created = await prisma.spyingAd.create({
    data: {
      platform: d.platform,
      title: d.title,
      brand: d.brand || null,
      niche: d.niche,
      angle: d.angle,
      mediaType: d.mediaType,
      mediaUrl: d.mediaUrl || null,
      thumbnailUrl: d.thumbnailUrl || null,
      hookText: d.hookText || null,
      description: d.description || null,
      cta: d.cta || null,
      estimatedSpend: d.estimatedSpend || null,
      daysRunning: d.daysRunning ?? null,
      country: d.country || null,
      tags: d.tags ?? [],
      language: d.language,
      featured: d.featured,
      active: d.active,
    },
  });
  revalidatePath("/admin01/espionagem");
  revalidatePath("/dashboard/espionagem");
  return { ok: true as const, id: created.id };
}

export async function updateAdAction(id: string, fd: FormData) {
  const a = await requireAdminWrite();
  if (!a) return { ok: false as const, error: "unauthorized" };
  if (!id) return { ok: false as const, error: "missing_id" };

  const parsed = parseFromFormData(fd);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const d = parsed.data;

  await prisma.spyingAd.update({
    where: { id },
    data: {
      platform: d.platform,
      title: d.title,
      brand: d.brand || null,
      niche: d.niche,
      angle: d.angle,
      mediaType: d.mediaType,
      mediaUrl: d.mediaUrl || null,
      thumbnailUrl: d.thumbnailUrl || null,
      hookText: d.hookText || null,
      description: d.description || null,
      cta: d.cta || null,
      estimatedSpend: d.estimatedSpend || null,
      daysRunning: d.daysRunning ?? null,
      country: d.country || null,
      tags: d.tags ?? [],
      language: d.language,
      featured: d.featured,
      active: d.active,
    },
  });
  revalidatePath("/admin01/espionagem");
  revalidatePath("/dashboard/espionagem");
  return { ok: true as const };
}

export async function deleteAdAction(id: string) {
  const a = await requireAdminWrite();
  if (!a) return { ok: false as const, error: "unauthorized" };
  if (!id) return { ok: false as const, error: "missing_id" };
  await prisma.spyingAd.delete({ where: { id } });
  revalidatePath("/admin01/espionagem");
  revalidatePath("/dashboard/espionagem");
  return { ok: true as const };
}

export async function toggleAdActiveAction(id: string) {
  const a = await requireAdminWrite();
  if (!a) return { ok: false as const, error: "unauthorized" };
  if (!id) return { ok: false as const, error: "missing_id" };
  const cur = await prisma.spyingAd.findUnique({
    where: { id },
    select: { active: true },
  });
  if (!cur) return { ok: false as const, error: "not_found" };
  await prisma.spyingAd.update({
    where: { id },
    data: { active: !cur.active },
  });
  revalidatePath("/admin01/espionagem");
  revalidatePath("/dashboard/espionagem");
  return { ok: true as const, active: !cur.active };
}
