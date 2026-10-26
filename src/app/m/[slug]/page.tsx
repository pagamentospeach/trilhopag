import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { Play, Lock, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MemberAreaHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const area = await prisma.memberArea.findUnique({
    where: { slug },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
      courses: {
        where: {},
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          thumbnailUrl: true,
          categoryId: true,
          dripDay: true,
        },
      },
    },
  });
  if (!area || !area.active) notFound();

  // Auth opcional via cookie
  let member: { id: string; name: string | null; email: string; enrolledAt: Date } | null = null;
  if (area.requireLogin) {
    const c = await cookies();
    const token = c.get(`tp_m_${area.id}`)?.value;
    if (token) {
      member = await prisma.member.findFirst({
        where: { loginToken: token, memberAreaId: area.id, blocked: false },
        select: { id: true, name: true, email: true, enrolledAt: true },
      });
    }
    if (!member) {
      redirect(`/m/${slug}/login`);
    }
  }

  // Calcula liberação (drip): dias desde enrolledAt
  const daysSinceEnroll = member
    ? Math.floor((Date.now() - new Date(member.enrolledAt).getTime()) / 86400000)
    : Infinity;

  // Agrupa cursos por categoria
  const byCategory = new Map<string | null, typeof area.courses>();
  for (const c of area.courses) {
    const cid = c.categoryId;
    if (!byCategory.has(cid)) byCategory.set(cid, []);
    byCategory.get(cid)!.push(c);
  }

  const bg = area.backgroundColor || "#0a0a0a";

  return (
    <html lang="pt-BR">
      <body
        style={{
          background: bg,
          color: "#fff",
          margin: 0,
          minHeight: "100vh",
        }}
      >
        {/* HERO */}
        <div
          style={{
            height: 360,
            position: "relative",
            background: area.heroImageUrl
              ? `url(${area.heroImageUrl})`
              : `linear-gradient(135deg, ${area.primaryColor}, ${area.accentColor})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 50%, " +
                bg +
                " 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 24,
              left: 24,
              right: 24,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {area.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={area.logoUrl} alt={area.name} style={{ height: 32 }} />
            ) : (
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                {area.name}
              </p>
            )}
            {member && (
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                Olá, {member.name || member.email}
              </span>
            )}
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 32,
              left: 32,
              right: 32,
              maxWidth: 600,
            }}
          >
            <h1
              style={{
                fontSize: 42,
                fontWeight: 800,
                margin: 0,
                lineHeight: 1.05,
                textShadow: "0 4px 24px rgba(0,0,0,0.5)",
              }}
            >
              {area.name}
            </h1>
            {area.heroTagline && (
              <p style={{ fontSize: 16, opacity: 0.85, marginTop: 8 }}>
                {area.heroTagline}
              </p>
            )}
            {area.description && (
              <p style={{ fontSize: 14, opacity: 0.7, marginTop: 12 }}>
                {area.description}
              </p>
            )}
          </div>
        </div>

        {/* Categorias */}
        <div style={{ padding: "0 32px 64px" }}>
          {area.categories.map((cat) => {
            const courses = byCategory.get(cat.id) ?? [];
            if (courses.length === 0) return null;
            return (
              <CategoryRow
                key={cat.id}
                title={cat.name}
                courses={courses}
                slug={area.slug}
                primaryColor={area.primaryColor}
                daysSinceEnroll={daysSinceEnroll}
              />
            );
          })}
          {/* Cursos sem categoria */}
          {byCategory.has(null) && (
            <CategoryRow
              title="Todos os cursos"
              courses={byCategory.get(null) ?? []}
              slug={area.slug}
              primaryColor={area.primaryColor}
              daysSinceEnroll={daysSinceEnroll}
            />
          )}
        </div>
      </body>
    </html>
  );
}

function CategoryRow({
  title,
  courses,
  slug,
  primaryColor,
  daysSinceEnroll,
}: {
  title: string;
  courses: Array<{
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    dripDay: number;
  }>;
  slug: string;
  primaryColor: string;
  daysSinceEnroll: number;
}) {
  return (
    <section style={{ marginTop: 40 }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 16,
          color: "#fff",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
          gap: 16,
        }}
      >
        {courses.map((c) => {
          const locked = c.dripDay > daysSinceEnroll;
          const daysLeft = c.dripDay - daysSinceEnroll;
          const card = (
            <div
              key={c.id}
              style={{
                position: "relative",
                borderRadius: 12,
                overflow: "hidden",
                background: "#1a1a1a",
                cursor: locked ? "not-allowed" : "pointer",
                transition: "transform 200ms",
              }}
            >
              <div
                style={{
                  aspectRatio: "16/9",
                  background: c.thumbnailUrl
                    ? `url(${c.thumbnailUrl})`
                    : `linear-gradient(135deg, ${primaryColor}, #555)`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  position: "relative",
                }}
              >
                {!locked && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.4)",
                      opacity: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "opacity 200ms",
                    }}
                    className="bp-course-overlay"
                  >
                    <Play
                      style={{
                        width: 32,
                        height: 32,
                        color: "#fff",
                        fill: "#fff",
                      }}
                    />
                  </div>
                )}
                {locked && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.7)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Lock style={{ width: 24, height: 24, color: "#fff" }} />
                    <span style={{ fontSize: 11, color: "#fff" }}>
                      Libera em {daysLeft} dia{daysLeft !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ padding: 12 }}>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#fff",
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.title}
                </p>
                {c.description && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "#999",
                      marginTop: 4,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {c.description}
                  </p>
                )}
                {c.dripDay > 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 6,
                      fontSize: 10,
                      color: locked ? "#fbbf24" : "#06b6d4",
                    }}
                  >
                    <Clock style={{ width: 10, height: 10 }} />
                    {locked ? `Liberação em D+${c.dripDay}` : "Liberado"}
                  </span>
                )}
              </div>
            </div>
          );
          return locked ? (
            card
          ) : (
            <Link
              key={c.id}
              href={`/m/${slug}/curso/${c.id}`}
              style={{ textDecoration: "none" }}
            >
              {card}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
