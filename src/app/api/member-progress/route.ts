import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const Body = z.object({
  memberId: z.string().max(40),
  courseId: z.string().max(40),
  lessonId: z.string().max(40),
  watchedSeconds: z.number().int().min(0).max(86400).optional(),
  completed: z.boolean().optional(),
});

/**
 * Salva progresso de aula do member.
 *
 * SEC: antes aceitava qualquer memberId no body sem validar ownership —
 * qualquer um podia sobrescrever progresso de qualquer member. Agora
 * valida o cookie `tp_m_<memberAreaId>` (loginToken) contra o member
 * que dono daquele progresso.
 */
export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 422 });
  }
  const { memberId, courseId, lessonId, watchedSeconds, completed } = parsed.data;

  // Busca o member + sua memberArea pra saber qual cookie validar
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, memberAreaId: true, loginToken: true },
  });
  if (!member || !member.loginToken) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Confirma que o cookie `tp_m_<memberAreaId>` bate com o loginToken
  // desse member. Sem cookie correto = 401.
  const cookieJar = await cookies();
  const providedToken = cookieJar.get(`tp_m_${member.memberAreaId}`)?.value;
  if (!providedToken || providedToken !== member.loginToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Confirma que a lição pertence ao curso (anti-IDOR também na FK).
  // MemberLesson -> MemberModule -> MemberCourse, então o courseId vem
  // via module.
  const lesson = await prisma.memberLesson.findUnique({
    where: { id: lessonId },
    select: { module: { select: { courseId: true } } },
  });
  if (!lesson || lesson.module.courseId !== courseId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const data: {
    watchedSeconds?: number;
    completed?: boolean;
    completedAt?: Date | null;
  } = {};
  if (watchedSeconds !== undefined) data.watchedSeconds = watchedSeconds;
  if (completed !== undefined) {
    data.completed = completed;
    data.completedAt = completed ? new Date() : null;
  }

  await prisma.memberProgress.upsert({
    where: { memberId_lessonId: { memberId, lessonId } },
    create: {
      memberId,
      courseId,
      lessonId,
      watchedSeconds: watchedSeconds ?? 0,
      completed: completed ?? false,
      completedAt: completed ? new Date() : null,
    },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
