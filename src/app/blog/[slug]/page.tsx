import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostBySlug, getAllSlugs, BLOG_POSTS } from "@/lib/blog-posts";
import { ArrowLeft } from "lucide-react";

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  const url = `https://trilhopag.com/blog/${post.slug}`;
  return {
    title: `${post.title} | Blog Trilho`,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      authors: [post.author],
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  // Sugere 3 posts relacionados (mesmo tag ou por recência)
  const related = BLOG_POSTS.filter((p) => p.slug !== post.slug)
    .sort((a, b) => {
      const aShared = a.tags.filter((t) => post.tags.includes(t)).length;
      const bShared = b.tags.filter((t) => post.tags.includes(t)).length;
      if (aShared !== bShared) return bShared - aShared;
      return b.publishedAt.localeCompare(a.publishedAt);
    })
    .slice(0, 3);

  // Article schema (JSON-LD) — sinaliza pra Google que é conteúdo editorial
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    author: { "@type": "Organization", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "Trilho Pagamentos",
      logo: { "@type": "ImageObject", url: "https://trilhopag.com/icon.png" },
    },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    mainEntityOfPage: `https://trilhopag.com/blog/${post.slug}`,
    keywords: post.tags.join(", "),
  };

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-cyan-400 transition"
      >
        <ArrowLeft className="size-3.5" />
        Todos os posts
      </Link>

      <header className="mt-6 mb-10">
        <div className="flex items-center gap-2 mb-4">
          {post.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="text-[10px] uppercase tracking-wider text-cyan-300 bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded-full"
            >
              {t}
            </span>
          ))}
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
          {post.title}
        </h1>
        <p className="mt-4 text-lg text-zinc-400 leading-relaxed">
          {post.description}
        </p>
        <div className="mt-6 flex items-center gap-3 text-xs text-zinc-500">
          <span>{post.author}</span>
          <span>·</span>
          <time dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </time>
          <span>·</span>
          <span>{post.readMinutes} min de leitura</span>
        </div>
      </header>

      <div
        className="bp-blog-article max-w-none"
        dangerouslySetInnerHTML={{ __html: post.contentHtml }}
      />

      {/* CTA final — converte leitor do blog em seller */}
      <div className="mt-16 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.05] to-transparent p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-400 font-semibold">
          Coloque em prática
        </p>
        <h3 className="mt-2 text-2xl font-bold text-white">
          Testa o Trilho grátis, sem cartão de crédito
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Cria a conta em 2 minutos e gera seu primeiro PIX ainda hoje.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-cyan-400 hover:bg-cyan-300 px-6 py-2.5 text-sm font-bold text-black transition"
        >
          Criar conta grátis →
        </Link>
      </div>

      {related.length > 0 && (
        <section className="mt-16 pt-10 border-t border-white/[0.06]">
          <h4 className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-semibold mb-4">
            Leia também
          </h4>
          <div className="space-y-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/blog/${r.slug}`}
                className="block rounded-lg border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] px-4 py-3 transition"
              >
                <p className="text-sm font-medium text-white group-hover:text-cyan-300">
                  {r.title}
                </p>
                <p className="mt-1 text-xs text-zinc-500 line-clamp-1">
                  {r.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
