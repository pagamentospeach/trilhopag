import { FileText, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { resolveDisplayFeesByMode } from "@/lib/mode-defaults";
import { DocumentActions } from "./document-actions";
import { toOpsMode } from "@/lib/ops-modes";

const DOC_LABELS: Record<string, string> = {
  doc_front: "Documento (frente)",
  doc_back: "Documento (verso)",
  selfie: "Selfie com documento",
  contract_social: "Contrato social",
  proof_of_address: "Comprovante de endereço",
};

export default async function AdminDocumentsPage() {
  // Notificações de auditoria pendentes (KYC já aprovado automaticamente,
  // mas ainda não passou pela revisão humana)
  const notifications = await prisma.adminNotification.findMany({
    where: { type: "kyc_pending_audit", resolved: false },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const userIds = notifications
    .map((n) => n.targetUserId)
    .filter((x): x is string => !!x);

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      email: true,
      name: true,
      cpfCnpj: true,
      kycStatus: true,
      personType: true,
      blocked: true,
      createdAt: true,
      // Modo de adquirente atual — admin pode mover já no modal de aprovação
      pixOpsMode: true,
      // Taxas atuais — admin pode ajustar inline ao confirmar KYC
      feePercent: true,
      feeFixedCents: true,
      cardFeePercent: true,
      cardFeeFixedCents: true,
      kycDocuments: {
        select: {
          id: true,
          type: true,
          url: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  // Taxas REAIS por modo (black/white/hot) de cada seller pendente — exibidas
  // no modal de aprovação como referência dos outros modos (sem a fachada).
  const feesByUser = Object.fromEntries(
    await Promise.all(
      users.map(
        async (u) =>
          [u.id, await resolveDisplayFeesByMode(u.id, { apparent: false })] as const,
      ),
    ),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
          <FileText className="size-6 text-amber-400" /> Auditoria de Documentos
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Sellers aprovados automaticamente. Aprove pra liberar permanentemente
          ou rejeite pra bloquear e pedir reenvio.
        </p>
      </header>

      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-12 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-400" />
          <p className="mt-4 text-base font-medium text-white">Tudo em dia!</p>
          <p className="mt-1 text-sm text-zinc-400">
            Nenhum documento aguardando auditoria.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {notifications.map((n) => {
            const u = n.targetUserId ? userMap[n.targetUserId] : undefined;
            if (!u) return null;
            return (
              <div
                key={n.id}
                className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.02] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-white">{u.email}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        <CheckCircle2 className="size-3" /> Aprovado auto
                      </span>
                      {u.blocked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">
                          Bloqueado
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {u.name ?? "—"} · {u.personType} · {u.cpfCnpj ?? "(sem CPF)"}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      Enviado em{" "}
                      {new Date(n.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <DocumentActions
                    userId={u.id}
                    notificationId={n.id}
                    pixOpsMode={toOpsMode(u.pixOpsMode)}
                    currentFees={{
                      feePercent: u.feePercent,
                      feeFixedCents: u.feeFixedCents,
                      cardFeePercent: u.cardFeePercent,
                      cardFeeFixedCents: u.cardFeeFixedCents,
                    }}
                    modeFees={feesByUser[u.id]}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {u.kycDocuments.map((d) => (
                    <a
                      key={d.id}
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group rounded-xl border border-white/[0.08] bg-black/30 p-3 hover:border-amber-400/40"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-white">
                          {DOC_LABELS[d.type] ?? d.type}
                        </span>
                        <ExternalLink className="size-3 text-zinc-500 group-hover:text-amber-400" />
                      </div>
                    </a>
                  ))}
                  {u.kycDocuments.length === 0 && (
                    <div className="col-span-full flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3 text-xs text-red-300">
                      <AlertCircle className="size-4" />
                      Sem documentos anexados (status inconsistente)
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
