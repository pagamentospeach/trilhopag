import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { BotEditor } from "./client";

export default async function BotEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const bot = await prisma.saleBot.findFirst({ where: { id, userId } });
  if (!bot) notFound();

  return (
    <BotEditor
      bot={{
        id: bot.id,
        type: bot.type as "discord" | "telegram",
        name: bot.name,
        botToken: bot.botToken,
        chatId: bot.chatId,
        active: bot.active,
      }}
    />
  );
}
