import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AuthCard, AuthHeader } from "@/components/auth/ui";
import { OnboardingDocsForm } from "./form";

export const metadata = {
  title: "Documentos — Trilho",
};

/**
 * Continuação do cadastro pra quem NÃO passou pelo formulário do /signup.
 *
 * 08/08/2026 (davi): "essa tela ainda ta aparecendo apos terminar o register,
 * TA ERRADO! precisa ser tudo num fluxo só" — o cadastro por email agora
 * coleta endereço e documentos junto, e sai daqui com kycStatus=approved. Ou
 * seja: quem se cadastra por email NUNCA cai nesta página.
 *
 * Sobram dois caminhos, e o principal é o social:
 *   1. conta criada via Google/GitHub — o provedor entrega nome, email e o
 *      email já confirmado, mas não tem como saber CPF, WhatsApp, endereço nem
 *      documento. É esta tela que completa o resto, nos mesmos passos do
 *      /signup.
 *   2. reenvio depois de um KYC rejeitado pelo compliance.
 */
export default async function OnboardingDocsPage() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      kycStatus: true,
      kycRejectionReason: true,
      cpfCnpj: true,
      phone: true,
      personType: true,
      address: {
        select: {
          zipcode: true,
          street: true,
          number: true,
          city: true,
          state: true,
        },
      },
      kycDocuments: { select: { type: true, url: true } },
    },
  });
  if (!user) redirect("/login");

  if (
    user.kycStatus === "approved" ||
    user.kycStatus === "under_review" ||
    user.kycStatus === "in_review"
  ) {
    redirect("/dashboard");
  }

  const docsByType = Object.fromEntries(
    user.kycDocuments.map((d) => [d.type, d.url]),
  ) as Record<string, string>;

  const firstName = (user.name ?? "").trim().split(/\s+/)[0];

  return (
    <div className="w-full max-w-xl">
      <AuthHeader
        title={firstName ? `Falta pouco, ${firstName}` : "Termine seu cadastro"}
        subtitle="Seu login já está pronto. Agora precisamos dos dados que só você tem — em três passos curtos."
      />

      {user.kycStatus === "rejected" && user.kycRejectionReason ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-semibold">Seus documentos foram rejeitados</p>
          <p className="mt-1">{user.kycRejectionReason}</p>
        </div>
      ) : null}

      <AuthCard className="mt-7">
        <OnboardingDocsForm
          initial={{
            cpfCnpj: user.cpfCnpj ?? "",
            phone: user.phone ?? "",
            personType: user.personType,
            zipcode: user.address?.zipcode ?? "",
            street: user.address?.street ?? "",
            number: user.address?.number ?? "",
            city: user.address?.city ?? "",
            state: user.address?.state ?? "",
            docFrontUrl: docsByType.doc_front ?? "",
            docBackUrl: docsByType.doc_back ?? "",
            selfieUrl: docsByType.selfie ?? "",
            contratoSocialUrl: docsByType.contrato_social ?? "",
          }}
        />
      </AuthCard>
    </div>
  );
}
