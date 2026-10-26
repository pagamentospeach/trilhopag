import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";

export function CTAFinal() {
  return (
    <section className="px-6 pb-24 sm:px-10 sm:pb-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-ink px-8 py-20 sm:px-16 sm:py-28">
            <RailAccent />
            <div className="relative max-w-xl">
              <h2 className="text-balance text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-white min-[420px]:text-3xl sm:text-[2.75rem]">
                Coloque seu negócio
                <br />
                <span className="text-brand">nos trilhos.</span>
              </h2>
              <p className="mt-5 text-[17px] leading-relaxed text-white/60">
                Crie sua conta e receba sua primeira venda hoje.
              </p>
              <Link
                href="/signup"
                className="group mt-9 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3.5 text-[15px] font-semibold text-ink transition hover:brightness-105"
              >
                Criar minha conta
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            {/* SLOT VOLT — mascote entra aqui quando existir um render 3D oficial. */}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function RailAccent() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute bottom-16 right-0 h-px w-1/3 bg-gradient-to-l from-brand/60 to-transparent" />
      <div className="absolute bottom-16 right-0 h-px w-1/3 translate-y-[7px] bg-gradient-to-l from-brand/25 to-transparent" />
    </div>
  );
}
