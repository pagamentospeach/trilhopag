import { Globe, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";

export type SellerDomain = {
  id: string;
  domain: string;
  status: string;
  usedIn: string[];
  createdAt: Date;
};

/**
 * Domínios próprios DESTE seller (movido da aba global /admin01/domains pro
 * perfil do usuário). Read-only: lista o que o seller cadastrou + status + uso.
 */
export function SellerDomainsCard({ domains }: { domains: SellerDomain[] }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
        <Globe className="size-4 text-cyan-300" />
        <div>
          <h2 className="text-sm font-semibold text-white">
            Domínios próprios do seller
          </h2>
          <p className="text-[11px] text-zinc-500">
            {domains.length} domínio(s) customizado(s) cadastrado(s) por este
            seller.
          </p>
        </div>
      </div>
      {domains.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">
          Nenhum domínio próprio cadastrado.
        </p>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {domains.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <a
                  href={`https://${d.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 truncate font-mono text-white hover:text-cyan-300"
                >
                  {d.domain}
                  <ExternalLink className="size-3 opacity-50" />
                </a>
                <p className="text-[10px] text-zinc-500">
                  {d.usedIn.length ? d.usedIn.join(" · ") : "—"} · cadastrado{" "}
                  {formatDate(d.createdAt)}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  d.status === "verified"
                    ? "bg-cyan-400/15 text-cyan-300"
                    : d.status === "failed"
                      ? "bg-red-500/15 text-red-300"
                      : "bg-yellow-400/15 text-yellow-300"
                }`}
              >
                {d.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
