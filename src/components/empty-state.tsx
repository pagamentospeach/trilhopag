import Link from "next/link";
import { Plus } from "lucide-react";

export function EmptyState({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-12 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-sm text-zinc-400">{description}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white hover:bg-white/[0.08] transition"
        >
          <Plus className="size-4" /> {cta.label}
        </Link>
      )}
    </div>
  );
}
