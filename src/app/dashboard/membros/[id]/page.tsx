import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { MemberAreaEditor } from "./client";

export default async function MemberAreaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;

  const area = await prisma.memberArea.findFirst({
    where: { id, userId },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
      courses: {
        orderBy: { sortOrder: "asc" },
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
                  contentUrl: true,
                  durationSec: true,
                  sortOrder: true,
                  dripDay: true,
                },
              },
            },
          },
        },
      },
      productAccess: {
        include: { product: { select: { id: true, name: true, slug: true } } },
      },
      _count: { select: { members: true } },
    },
  });

  if (!area) notFound();

  const allProducts = await prisma.product.findMany({
    where: { userId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <MemberAreaEditor
      area={{
        id: area.id,
        slug: area.slug,
        name: area.name,
        description: area.description,
        logoUrl: area.logoUrl,
        primaryColor: area.primaryColor,
        accentColor: area.accentColor,
        backgroundColor: area.backgroundColor,
        heroImageUrl: area.heroImageUrl,
        heroTagline: area.heroTagline,
        customDomain: area.customDomain,
        requireLogin: area.requireLogin,
        active: area.active,
        memberCount: area._count.members,
      }}
      categories={area.categories.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
      }))}
      courses={area.courses.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        thumbnailUrl: c.thumbnailUrl,
        bannerUrl: c.bannerUrl,
        categoryId: c.categoryId,
        dripDay: c.dripDay,
        sortOrder: c.sortOrder,
        modules: c.modules.map((m) => ({
          id: m.id,
          title: m.title,
          sortOrder: m.sortOrder,
          lessons: m.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            type: l.type,
            contentUrl: l.contentUrl,
            durationSec: l.durationSec,
            dripDay: l.dripDay,
            sortOrder: l.sortOrder,
          })),
        })),
      }))}
      linkedProducts={area.productAccess.map((pa) => pa.product)}
      allProducts={allProducts}
    />
  );
}
