import { prisma } from "@/lib/prisma";
import { DeliverableForm } from "./form";

/**
 * 23/07/2026 (davi): "Deixa o entregavel SOMENTE via email mesmo". Removi
 * a query de memberAreas + o banner "criar area agora" — a UI ficou focada
 * 100% no unico caso de uso: link enviado por email.
 */
export default async function EntregavelTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deliverable = await prisma.deliverable.findUnique({
    where: { productId: id },
  });
  return (
    <div>
      <h2 className="text-lg font-semibold text-yellow-300">Entregável</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        O que o comprador recebe por email após o pagamento confirmar.
      </p>
      <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <DeliverableForm
          productId={id}
          defaults={{
            contentUrl: deliverable?.contentUrl ?? "",
            emailSubject: deliverable?.emailSubject ?? "",
            emailBody: deliverable?.emailBody ?? "",
          }}
        />
      </div>
    </div>
  );
}
