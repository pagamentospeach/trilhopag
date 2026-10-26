import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft, Play, Lock, CheckCircle2, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string; courseId: string }>;
}) {
  const { slug, courseId } = await params;
  const area = await prisma.memberArea.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      requireLogin: true,
      primaryColor: true,
      backgroundColor: true,
      heroImageUrl: true,
      logoUrl: true,
    },
  });
  if (!area) notFound();

  let memberId: string | null = null;
  let enrolledAt: Date | null = null;
  if (area.requireLogin) {
    const c = await cookies();
    const token = c.get(`tp_m_${area.id}`)?.value;
    if (token) {
      const m = await prisma.member.findFirst({
        where: { loginToken: token, memberAreaId: area.id, blocked: false },
        select: { id: true, enrolledAt: true },
      });
      if (m) {
        memberId = m.id;
        enrolledAt = m.enrolledAt;
      }
    }
    if (!memberId) redirect(`/m/${slug}/login`);
  }

  const course = await prisma.memberCourse.findFirst({
    where: { id: courseId, memberAreaId: area.id },
    include: {
      modules: {
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              type: true,
              durationSec: true,
              dripDay: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });
  if (!course) notFound();

  const daysSinceEnroll = enrolledAt
    ? Math.floor((Date.now() - enrolledAt.getTime()) / 86400000)
    : Infinity;

  // Progress do aluno
  const progress = memberId
    ? await prisma.memberProgress.findMany({
        where: { memberId, courseId },
        select: { lessonId: true, completed: true },
      })
    : [];
  const completedSet = new Set(progress.filter((p) => p.completed).map((p) => p.lessonId));

  const bg = area.backgroundColor;
  const totalLessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);
  const completedCount = completedSet.size;
  const progressPct = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0;

  return (
    <html lang="pt-BR">
      <body style={{ background: bg, color: "#fff", margin: 0, minHeight: "100vh" }}>
        {/* Hero do curso */}
        <div
          style={{
            position: "relative",
            height: 320,
            background: course.bannerUrl
              ? `url(${course.bannerUrl})`
              : `linear-gradient(135deg, ${area.primaryColor}, #555)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 50%, ${bg} 100%)`,
            }}
          />
          <div style={{ position: "absolute", top: 24, left: 24 }}>
            <Link
              href={`/m/${slug}`}
              style={{
                color: "#fff",
                textDecoration: "none",
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                opacity: 0.8,
              }}
            >
              <ChevronLeft style={{ width: 16, height: 16 }} /> Voltar
            </Link>
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 32,
              left: 32,
              right: 32,
              maxWidth: 700,
            }}
          >
            <h1
              style={{
                fontSize: 38,
                fontWeight: 800,
                margin: 0,
                textShadow: "0 4px 24px rgba(0,0,0,0.5)",
              }}
            >
              {course.title}
            </h1>
            {course.description && (
              <p style={{ fontSize: 14, opacity: 0.8, marginTop: 12 }}>
                {course.description}
              </p>
            )}
            {totalLessons > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                  Progresso: {completedCount} / {totalLessons} (
                  {progressPct.toFixed(0)}%)
                </div>
                <div
                  style={{
                    height: 4,
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: 999,
                    overflow: "hidden",
                    maxWidth: 300,
                  }}
                >
                  <div
                    style={{
                      width: `${progressPct}%`,
                      height: "100%",
                      background: area.primaryColor,
                      transition: "width 300ms",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Módulos e aulas */}
        <div style={{ padding: "32px 32px 64px", maxWidth: 900, margin: "0 auto" }}>
          {course.modules.map((m, mIdx) => (
            <div key={m.id} style={{ marginBottom: 32 }}>
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  margin: "0 0 12px",
                  color: area.primaryColor,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                }}
              >
                Módulo {mIdx + 1} — {m.title}
              </h2>
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {m.lessons.map((l, lIdx) => {
                  const lessonDrip = l.dripDay ?? course.dripDay;
                  const locked = lessonDrip > daysSinceEnroll;
                  const completed = completedSet.has(l.id);
                  const daysLeft = lessonDrip - daysSinceEnroll;
                  return (
                    <LessonItem
                      key={l.id}
                      lesson={l}
                      number={lIdx + 1}
                      slug={slug}
                      locked={locked}
                      completed={completed}
                      daysLeft={daysLeft}
                      primaryColor={area.primaryColor}
                    />
                  );
                })}
                {m.lessons.length === 0 && (
                  <p
                    style={{
                      padding: 20,
                      textAlign: "center",
                      fontSize: 12,
                      opacity: 0.5,
                    }}
                  >
                    Nenhuma aula nesse módulo ainda.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </body>
    </html>
  );
}

function LessonItem({
  lesson,
  number,
  slug,
  locked,
  completed,
  daysLeft,
  primaryColor,
}: {
  lesson: {
    id: string;
    title: string;
    type: string;
    durationSec: number | null;
  };
  number: number;
  slug: string;
  locked: boolean;
  completed: boolean;
  daysLeft: number;
  primaryColor: string;
}) {
  const card = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        cursor: locked ? "not-allowed" : "pointer",
        opacity: locked ? 0.6 : 1,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: completed
            ? primaryColor
            : "rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {completed ? (
          <CheckCircle2 style={{ width: 16, height: 16, color: "#000" }} />
        ) : locked ? (
          <Lock style={{ width: 14, height: 14, color: "#fff" }} />
        ) : (
          <Play style={{ width: 14, height: 14, color: "#fff", fill: "#fff" }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "#fff",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {number}. {lesson.title}
        </p>
        {lesson.durationSec && (
          <p style={{ fontSize: 11, opacity: 0.5, margin: "2px 0 0" }}>
            {Math.ceil(lesson.durationSec / 60)} min
          </p>
        )}
      </div>
      {locked && (
        <span
          style={{
            fontSize: 11,
            color: "#fbbf24",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <Clock style={{ width: 11, height: 11 }} />
          em {daysLeft}d
        </span>
      )}
    </div>
  );

  return locked ? (
    card
  ) : (
    <Link
      href={`/m/${slug}/aula/${lesson.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      {card}
    </Link>
  );
}
