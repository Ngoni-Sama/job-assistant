import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/seo";

/** /robots.txt — production is crawlable; Vercel dev/preview deployments are not. */
export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // API routes and the admin portal have nothing for search engines. Signed-in
      // pages are crawlable but carry a noindex tag, so they never show in results.
      disallow: ["/api/", "/admin"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
