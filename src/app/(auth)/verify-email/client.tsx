"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail } from "lucide-react";
import { AuthCard } from "@/components/auth/ui";
import { EmailCodeForm } from "@/components/auth/email-code-form";

/**
 * Casca da rota /verify-email. Toda a lógica do código de 6 dígitos mora em
 * `EmailCodeForm`, que é o MESMO componente usado no último passo do /signup —
 * uma regra só, dois lugares onde ela aparece.
 *
 * Quem já confirmou nunca chega aqui: o page.tsx (servidor) redireciona antes.
 */
export function VerifyEmailClient({
  email,
  alreadySent,
}: {
  email: string;
  alreadySent: boolean;
}) {
  const router = useRouter();

  return (
    <div className="w-full max-w-md">
      <AuthCard>
        <div className="relative inline-flex size-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <span
            aria-hidden
            className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-brand/25"
          />
          <Mail className="size-6" />
        </div>
        <h1 className="mt-5 text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
          Confirme seu email
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
          Falta só isso pra sua conta ficar completa.
        </p>

        <div className="mt-7">
          <EmailCodeForm
            email={email}
            alreadySent={alreadySent}
            onDone={() => {
              // `refresh` antes de navegar: o layout do painel é Server
              // Component e o router guarda o RSC dele em cache. Sem invalidar,
              // a navegação podia reusar a versão renderizada quando a conta
              // ainda estava sem confirmar — e o gate mandava a pessoa de volta
              // pra cá. Era o "mesmo apos verificar ta voltando a aparecer".
              router.refresh();
              router.replace("/dashboard");
            }}
          />
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-slate-500 hover:text-ink">
            Voltar ao login
          </Link>
        </p>
      </AuthCard>
    </div>
  );
}
