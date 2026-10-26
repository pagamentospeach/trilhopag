import Link from "next/link";
import { Ban, MessageCircle } from "lucide-react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ContaBloqueadaPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { blocked: true, blockReason: true, email: true },
      })
    : null;

  if (!user?.blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-8 text-zinc-100">
        <div className="text-center">
          <p>Sua conta está ativa.</p>
          <Link href="/dashboard" className="text-cyan-400 underline">
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-red-950/40 to-black p-4 text-zinc-100">
      <div className="w-full max-w-md rounded-3xl border border-red-500/40 bg-gradient-to-br from-zinc-900 to-black p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-full bg-red-500/20 ring-2 ring-red-500/40">
            <Ban className="size-7 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Conta bloqueada</h1>
            <p className="text-xs text-zinc-400">{user.email}</p>
          </div>
        </div>

        <div className="mt-6 space-y-3 text-sm text-zinc-300">
          <p>
            Sua conta foi bloqueada por um administrador. Você não pode acessar
            o dashboard, fazer saques, criar produtos ou realizar transações até
            que essa situação seja revisada.
          </p>
          {user.blockReason && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              <strong>Motivo:</strong> {user.blockReason}
            </div>
          )}
        </div>

        <Link
          href="https://wa.me/5511977700227?text=Minha%20conta%20foi%20bloqueada%20-%20gostaria%20de%20entender%20o%20motivo"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-base font-bold text-white hover:bg-emerald-400"
        >
          <MessageCircle className="size-5" />
          Falar com suporte
        </Link>

        <Link
          href="/api/auth/sign-out"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.02] px-6 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.06]"
        >
          Sair
        </Link>
      </div>
    </div>
  );
}
