import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blog-posts";

const BASE_URL = "https://trilhopag.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    { url: `${BASE_URL}/`, changeFrequency: "weekly" as const, priority: 1.0 },
    { url: `${BASE_URL}/blog`, changeFrequency: "weekly" as const, priority: 0.9 },
    { url: `${BASE_URL}/signup`, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${BASE_URL}/login`, changeFrequency: "monthly" as const, priority: 0.5 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${BASE_URL}/data-deletion`, changeFrequency: "yearly" as const, priority: 0.3 },
  ];

  const blogPages = BLOG_POSTS.map((p) => ({
    url: `${BASE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.updatedAt ?? p.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...blogPages];
}
