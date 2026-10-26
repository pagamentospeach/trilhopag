import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { LessonPlayer } from "./player";

export const dynamic = "force-dynamic";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;
  const lesson = await prisma.memberLesson.findUnique({
    where: { id: lessonId },
    include: {
      module: {
        include: {
          course: {
            include: {
              memberArea: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  primaryColor: true,
                  backgroundColor: true,
                  requireLogin: true,
                  logoUrl: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!lesson || lesson.module.course.memberArea.slug !== slug) notFound();

  const area = lesson.module.course.memberArea;

  let memberId: string | null = null;
  if (area.requireLogin) {
    const c = await cookies();
    const token = c.get(`tp_m_${area.id}`)?.value;
    if (token) {
      const m = await prisma.member.findFirst({
        where: { loginToken: token, memberAreaId: area.id, blocked: false },
        select: { id: true },
      });
      if (m) memberId = m.id;
    }
    if (!memberId) redirect(`/m/${slug}/login`);
  }

  return (
    <html lang="pt-BR">
      <body style={{ background: area.backgroundColor, color: "#fff", margin: 0, minHeight: "100vh" }}>
        <div style={{ padding: 24 }}>
          <Link
            href={`/m/${slug}/curso/${lesson.module.course.id}`}
            style={{
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              opacity: 0.7,
            }}
          >
            <ChevronLeft style={{ width: 16, height: 16 }} /> Voltar pro curso
          </Link>

          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 11, opacity: 0.5, margin: 0 }}>
              {lesson.module.course.title} → {lesson.module.title}
            </p>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "8px 0 0" }}>
              {lesson.title}
            </h1>
          </div>

          <div style={{ marginTop: 24, maxWidth: 1100, margin: "24px auto 0" }}>
            <LessonPlayer
              lesson={{
                id: lesson.id,
                type: lesson.type,
                contentUrl: lesson.contentUrl,
                contentHtml: lesson.contentHtml,
              }}
              courseId={lesson.module.course.id}
              memberId={memberId}
              primaryColor={area.primaryColor}
            />
            {lesson.description && (
              <p style={{ fontSize: 14, opacity: 0.8, marginTop: 16, lineHeight: 1.6 }}>
                {lesson.description}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
