import Link from "next/link";
import { Globe, AlertTriangle } from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { listVerifiedDomainsForFeature } from "@/lib/custom-host";
import { NewCloakerClient } from "./client";

export default async function NewCloakerPage() {
  const userId = await requireUserId();
  const domains = await listVerifiedDomainsForFeature(userId, "useCloaker");

  if (domains.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/[0.06] p-8 text-center">
          <AlertTriangle className="mx-auto size-10 text-amber-300" />
          <h2 className="mt-4 text-xl font-semibold text-amber-100">
            Você precisa de um domínio próprio primeiro
          </h2>
          <p className="mt-2 text-sm text-amber-100/80 max-w-md mx-auto">
            O link do cloaker (<code>/cl/...</code>) precisa ficar num domínio
            seu — nunca no domínio da Trilho. Senão a plataforma de anúncio
            marca o gateway inteiro como suspeito.
          </p>
          <Link
            href="/dashboard/dominios"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-black hover:bg-amber-300"
          >
            <Globe className="size-3.5" /> Cadastrar domínio
          </Link>
        </div>
      </div>
    );
  }

  return <NewCloakerClient domains={domains} />;
}
