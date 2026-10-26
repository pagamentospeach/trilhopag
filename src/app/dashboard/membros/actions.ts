"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { uniqueSlug } from "@/lib/slugify";

export async function createMemberArea(input: { name: string }) {
  const userId = await requireUserId();
  if (!input.name?.trim()) return { ok: false as const, error: "Nome inválido" };
  const slug = await uniqueSlug(input.name, async (s) =>
    prisma.memberArea.findUnique({ where: { slug: s }, select: { id: true } }),
  );
  const m = await prisma.memberArea.create({
    data: { userId, name: input.name.trim(), slug },
  });
  revalidatePath("/dashboard/membros");
  return { ok: true as const, id: m.id, slug: m.slug };
}

const UpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  heroImageUrl: z.string().url().nullable().optional(),
  heroTagline: z.string().nullable().optional(),
  customDomain: z.string().nullable().optional(),
  requireLogin: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function updateMemberArea(input: z.infer<typeof UpdateSchema>) {
  const userId = await requireUserId();
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };
  const { id, ...data } = parsed.data;
  const m = await prisma.memberArea.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!m) return { ok: false as const, error: "Área não encontrada" };
  await prisma.memberArea.update({ where: { id }, data });
  revalidatePath("/dashboard/membros");
  revalidatePath(`/dashboard/membros/${id}`);
  return { ok: true as const };
}

export async function deleteMemberArea(id: string) {
  const userId = await requireUserId();
  const m = await prisma.memberArea.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!m) return { ok: false as const, error: "Área não encontrada" };
  await prisma.memberArea.delete({ where: { id } });
  revalidatePath("/dashboard/membros");
  return { ok: true as const };
}

/* ============ CATEGORIES ============ */

export async function createCategory(memberAreaId: string, name: string) {
  const userId = await requireUserId();
  const m = await prisma.memberArea.findFirst({
    where: { id: memberAreaId, userId },
    select: { id: true },
  });
  if (!m) return { ok: false as const, error: "Área não encontrada" };
  const max = await prisma.memberCategory.aggregate({
    where: { memberAreaId },
    _max: { sortOrder: true },
  });
  const c = await prisma.memberCategory.create({
    data: {
      memberAreaId,
      name,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/dashboard/membros/${memberAreaId}`);
  return { ok: true as const, id: c.id };
}

export async function deleteCategory(id: string) {
  const userId = await requireUserId();
  const cat = await prisma.memberCategory.findFirst({
    where: { id, memberArea: { userId } },
    select: { id: true, memberAreaId: true },
  });
  if (!cat) return { ok: false as const, error: "Categoria não encontrada" };
  await prisma.memberCategory.delete({ where: { id } });
  revalidatePath(`/dashboard/membros/${cat.memberAreaId}`);
  return { ok: true as const };
}

/* ============ COURSES ============ */

const CourseSchema = z.object({
  memberAreaId: z.string(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  dripDay: z.number().int().min(0).optional(),
});

export async function createCourse(input: z.infer<typeof CourseSchema>) {
  const userId = await requireUserId();
  const parsed = CourseSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };
  const m = await prisma.memberArea.findFirst({
    where: { id: parsed.data.memberAreaId, userId },
    select: { id: true },
  });
  if (!m) return { ok: false as const, error: "Área não encontrada" };
  const max = await prisma.memberCourse.aggregate({
    where: { memberAreaId: parsed.data.memberAreaId },
    _max: { sortOrder: true },
  });
  const c = await prisma.memberCourse.create({
    data: {
      memberAreaId: parsed.data.memberAreaId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      thumbnailUrl: parsed.data.thumbnailUrl ?? null,
      bannerUrl: parsed.data.bannerUrl ?? null,
      categoryId: parsed.data.categoryId ?? null,
      dripDay: parsed.data.dripDay ?? 0,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/dashboard/membros/${parsed.data.memberAreaId}`);
  return { ok: true as const, id: c.id };
}

export async function updateCourse(id: string, data: Partial<z.infer<typeof CourseSchema>>) {
  const userId = await requireUserId();
  const c = await prisma.memberCourse.findFirst({
    where: { id, memberArea: { userId } },
    select: { id: true, memberAreaId: true },
  });
  if (!c) return { ok: false as const, error: "Curso não encontrado" };
  const { memberAreaId: _ma, ...rest } = data;
  await prisma.memberCourse.update({ where: { id }, data: rest });
  revalidatePath(`/dashboard/membros/${c.memberAreaId}`);
  return { ok: true as const };
}

export async function deleteCourse(id: string) {
  const userId = await requireUserId();
  const c = await prisma.memberCourse.findFirst({
    where: { id, memberArea: { userId } },
    select: { id: true, memberAreaId: true },
  });
  if (!c) return { ok: false as const, error: "Curso não encontrado" };
  await prisma.memberCourse.delete({ where: { id } });
  revalidatePath(`/dashboard/membros/${c.memberAreaId}`);
  return { ok: true as const };
}

/* ============ MODULES & LESSONS ============ */

export async function createModule(courseId: string, title: string) {
  const userId = await requireUserId();
  const c = await prisma.memberCourse.findFirst({
    where: { id: courseId, memberArea: { userId } },
    select: { id: true, memberAreaId: true },
  });
  if (!c) return { ok: false as const, error: "Curso não encontrado" };
  const max = await prisma.memberModule.aggregate({
    where: { courseId },
    _max: { sortOrder: true },
  });
  const m = await prisma.memberModule.create({
    data: { courseId, title, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  revalidatePath(`/dashboard/membros/${c.memberAreaId}`);
  return { ok: true as const, id: m.id };
}

export async function deleteModule(id: string) {
  const userId = await requireUserId();
  const m = await prisma.memberModule.findFirst({
    where: { id, course: { memberArea: { userId } } },
    select: { id: true, course: { select: { memberAreaId: true } } },
  });
  if (!m) return { ok: false as const, error: "Módulo não encontrado" };
  await prisma.memberModule.delete({ where: { id } });
  revalidatePath(`/dashboard/membros/${m.course.memberAreaId}`);
  return { ok: true as const };
}

const LessonSchema = z.object({
  moduleId: z.string(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  type: z.enum(["video", "text", "audio", "pdf", "embed"]).default("video"),
  contentUrl: z.string().nullable().optional(),
  contentHtml: z.string().nullable().optional(),
  durationSec: z.number().int().nullable().optional(),
  dripDay: z.number().int().nullable().optional(),
});

export async function createLesson(input: z.infer<typeof LessonSchema>) {
  const userId = await requireUserId();
  const parsed = LessonSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };
  const m = await prisma.memberModule.findFirst({
    where: { id: parsed.data.moduleId, course: { memberArea: { userId } } },
    select: { id: true, course: { select: { memberAreaId: true } } },
  });
  if (!m) return { ok: false as const, error: "Módulo não encontrado" };
  const max = await prisma.memberLesson.aggregate({
    where: { moduleId: parsed.data.moduleId },
    _max: { sortOrder: true },
  });
  // XSS prevention: sanitiza HTML user-input antes de gravar
  const { sanitizeHtml } = await import("@/lib/security/sanitize");
  const safeHtml = parsed.data.contentHtml
    ? sanitizeHtml(parsed.data.contentHtml, "rich")
    : null;

  const l = await prisma.memberLesson.create({
    data: {
      moduleId: parsed.data.moduleId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      type: parsed.data.type,
      contentUrl: parsed.data.contentUrl ?? null,
      contentHtml: safeHtml,
      durationSec: parsed.data.durationSec ?? null,
      dripDay: parsed.data.dripDay ?? null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/dashboard/membros/${m.course.memberAreaId}`);
  return { ok: true as const, id: l.id };
}

export async function updateLesson(id: string, data: Partial<z.infer<typeof LessonSchema>>) {
  const userId = await requireUserId();
  const l = await prisma.memberLesson.findFirst({
    where: { id, module: { course: { memberArea: { userId } } } },
    select: { id: true, module: { select: { course: { select: { memberAreaId: true } } } } },
  });
  if (!l) return { ok: false as const, error: "Aula não encontrada" };
  const { moduleId: _m, ...rest } = data;
  // XSS prevention: sanitiza contentHtml se foi alterado
  if (rest.contentHtml !== undefined) {
    const { sanitizeHtml } = await import("@/lib/security/sanitize");
    rest.contentHtml = rest.contentHtml
      ? sanitizeHtml(rest.contentHtml, "rich")
      : null;
  }
  await prisma.memberLesson.update({ where: { id }, data: rest });
  revalidatePath(`/dashboard/membros/${l.module.course.memberAreaId}`);
  return { ok: true as const };
}

export async function deleteLesson(id: string) {
  const userId = await requireUserId();
  const l = await prisma.memberLesson.findFirst({
    where: { id, module: { course: { memberArea: { userId } } } },
    select: {
      id: true,
      module: { select: { course: { select: { memberAreaId: true } } } },
    },
  });
  if (!l) return { ok: false as const, error: "Aula não encontrada" };
  await prisma.memberLesson.delete({ where: { id } });
  revalidatePath(`/dashboard/membros/${l.module.course.memberAreaId}`);
  return { ok: true as const };
}

/* ============ PRODUCT ACCESS ============ */

export async function linkProductToMemberArea(memberAreaId: string, productId: string) {
  const userId = await requireUserId();
  const [m, p] = await Promise.all([
    prisma.memberArea.findFirst({ where: { id: memberAreaId, userId }, select: { id: true } }),
    prisma.product.findFirst({ where: { id: productId, userId }, select: { id: true } }),
  ]);
  if (!m || !p) return { ok: false as const, error: "Não encontrado" };
  await prisma.memberAreaProduct.upsert({
    where: { memberAreaId_productId: { memberAreaId, productId } },
    create: { memberAreaId, productId },
    update: {},
  });
  revalidatePath(`/dashboard/membros/${memberAreaId}`);
  return { ok: true as const };
}

export async function unlinkProductFromMemberArea(memberAreaId: string, productId: string) {
  const userId = await requireUserId();
  const m = await prisma.memberArea.findFirst({
    where: { id: memberAreaId, userId },
    select: { id: true },
  });
  if (!m) return { ok: false as const, error: "Não encontrado" };
  await prisma.memberAreaProduct
    .delete({
      where: { memberAreaId_productId: { memberAreaId, productId } },
    })
    .catch(() => {});
  revalidatePath(`/dashboard/membros/${memberAreaId}`);
  return { ok: true as const };
}
