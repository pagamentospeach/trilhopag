import Link from "next/link";
import { BLOG_POSTS } from "@/lib/blog-posts";

export const metadata = {
  title: "Blog Trilho: pagamento, checkout, PIX e conversão",
  description:
    "Guias e análises práticas sobre gateway de pagamento, PIX, cartão, checkout, anti-fraude e tracking pra sellers brasileiros. Escrito pela equipe do Trilho.",
  alternates: { canonical: "https://trilhopag.com/blog" },
  openGraph: {
    title: "Blog Trilho",
    description: "Insights de pagamento, checkout, PIX e conversão pra sellers no Brasil.",
    type: "website",
    url: "https://trilhopag.com/blog",
  },
  twitter: { card: "summary_large_image", title: "Blog Trilho" },
};

export default function BlogIndexPage() {
  const sorted = [...BLOG_POSTS].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="mb-12">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-400 font-semibold">
          Blog
        </p>
        <h1 className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight text-white">
          Insights pra quem vende online no Brasil
        </h1>
        <p className="mt-3 text-zinc-400 max-w-2xl">
          Guias práticos sobre pagamento, checkout, PIX, cartão, anti-fraude e
          tracking, escritos pela equipe do Trilho a partir de milhões de
          transações processadas.
        </p>
      </div>

      <div className="space-y-4">
        {sorted.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group block rounded-2xl border border-white/[0.06] bg-zinc-950 p-6 hover:border-cyan-400/30 hover:bg-white/[0.02] transition"
          >
            <div className="flex items-center gap-2 mb-2">
              {post.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="text-[10px] uppercase tracking-wider text-zinc-500 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded-full"
                >
                  {t}
                </span>
              ))}
              <span className="text-[10px] text-zinc-600 ml-auto">
                {post.readMinutes} min de leitura
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-white group-hover:text-cyan-300 transition">
              {post.title}
            </h2>
            <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
              {post.description}
            </p>
            <div className="mt-4 flex items-center gap-3 text-xs text-zinc-500">
              <span>{post.author}</span>
              <span>·</span>
              <time dateTime={post.publishedAt}>
                {new Date(post.publishedAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
