import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { ApiKeysClient } from "./api-keys-client";
import { ApiLogs } from "./logs";
import { AiIntegrationPrompt } from "./ai-prompt";

export default async function ApiKeysPage() {
  const userId = await requireUserId();
  const [keys, ipUsages] = await Promise.all([
    prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    // Últimos 30 IPs por chave — ordenado por lastSeen desc.
    prisma.apiKeyIpUsage.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      take: 200,
    }),
  ]);

  // Agrupa IPs por chave (JSON-safe pra client component).
  const ipsByKey: Record<string, Array<{
    id: string;
    ip: string;
    firstSeenAt: string;
    lastSeenAt: string;
    requestCount: number;
    createdCount: number;
    trusted: boolean;
    alertedAt: string | null;
  }>> = {};
  for (const u of ipUsages) {
    (ipsByKey[u.apiKeyId] ||= []).push({
      id: u.id,
      ip: u.ip,
      firstSeenAt: u.firstSeenAt.toISOString(),
      lastSeenAt: u.lastSeenAt.toISOString(),
      requestCount: u.requestCount,
      createdCount: u.createdCount,
      trusted: u.trusted,
      alertedAt: u.alertedAt?.toISOString() ?? null,
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
        <p className="text-sm text-zinc-400">
          Use estas chaves pra integrar a API do Trilho no seu backend ou
          checkout customizado.{" "}
          <Link href="/docs" className="text-cyan-400 hover:text-cyan-300">
            Ver documentação →
          </Link>
        </p>
      </header>

      <ApiKeysClient
        rows={keys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
          ips: ipsByKey[k.id] ?? [],
        }))}
      />

      {/* 09/08/2026, secao 13: log de requisicao. Server Component proprio —
          uma consulta a mais que nao atrasa o resto da pagina. */}
      <ApiLogs userId={userId} />

      <AiIntegrationPrompt />
    </div>
  );
}
