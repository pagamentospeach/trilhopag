import Link from "next/link";

export default function CheckoutNotFound() {
  return (
    <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center px-6">
      <div className="absolute inset-x-0 top-0 h-[400px] grid-bg pointer-events-none" />
      <div className="text-center relative z-10">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          Checkout não encontrado
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Essa página não está mais disponível.
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          O link pode estar errado ou o vendedor desativou este checkout.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2 text-sm font-medium text-black hover:bg-cyan-300 transition"
        >
          Voltar para o site
        </Link>
      </div>
    </div>
  );
}
