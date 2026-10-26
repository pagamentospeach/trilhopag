import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MemberLoginClient } from "./client";

export default async function MemberLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const area = await prisma.memberArea.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      primaryColor: true,
      heroImageUrl: true,
      backgroundColor: true,
    },
  });
  if (!area || !area) notFound();

  return <MemberLoginClient area={area} />;
}
