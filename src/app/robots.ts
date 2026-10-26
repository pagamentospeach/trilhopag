import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/blog", "/blog/*", "/llms.txt"],
        disallow: [
          "/admin",
          "/admin/*",
          "/admin01",
          "/admin01/*",
          "/dashboard",
          "/dashboard/*",
          "/api",
          "/api/*",
          "/onboarding",
          "/onboarding/*",
          "/m/*",
          "/c/*",
          "/verify-email",
          "/reset-password",
          "/conta-bloqueada",
        ],
      },
    ],
    sitemap: "https://trilhopag.com/sitemap.xml",
    host: "https://trilhopag.com",
  };
}
