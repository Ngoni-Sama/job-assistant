import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/seo";

/**
 * Crawlers that copy whole sites to train AI models or to research competitors.
 * They're turned away (robots.txt is honoured by these bots, not by bad actors).
 * Search engines and AI assistants answering a person's question are still allowed,
 * so VacancyPal keeps showing up in Google and in assistant answers (see /llms.txt).
 */
const BLOCKED_BOTS = [
  // AI model training
  "GPTBot",
  "CCBot",
  "Google-Extended",
  "ClaudeBot",
  "anthropic-ai",
  "Applebot-Extended",
  "Bytespider",
  "meta-externalagent",
  "Amazonbot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
  // SEO / competitor research scrapers
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
  "PetalBot",
];

/** /robots.txt — production is crawlable; Vercel dev/preview deployments are not. */
export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // API routes and the admin portal have nothing for search engines. Signed-in
        // pages are crawlable but carry a noindex tag, so they never show in results.
        disallow: ["/api/", "/admin"],
      },
      { userAgent: BLOCKED_BOTS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
