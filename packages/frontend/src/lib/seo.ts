import type { Metadata } from "next";

/**
 * SEO helpers shared by server pages (metadata, sitemap, JSON-LD) and client
 * components (job links). Nothing here reads browser-only APIs.
 */

export const SITE_NAME = "VacancyPal";

/** Public origin of the production site (server-side only — the env isn't in the browser bundle). */
export const SITE_URL = (process.env.APP_URL || process.env.AUTH_URL || "https://vacancypal.co.zw").replace(/\/+$/, "");

/** Dev/preview deployments on Vercel stay out of search; the nivacity production site is indexable. */
export const INDEXABLE = process.env.VERCEL !== "1";

export const DEFAULT_DESCRIPTION =
  "Find the latest jobs in Zimbabwe, build an ATS-friendly CV, and apply in one swipe — with AI-tailored applications sent from your own Gmail.";

/** "Finance & Accounting" → "finance-accounting". */
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // accents → plain letters
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type JobLike = { id: string; title: string; company?: string; location?: string };

const hasCompany = (c?: string) => !!c && !/^(n\/?a|not specified|unknown|confidential)$/i.test(c.trim());

/** Readable part of a job URL: "recoveries-officer-cbz-bank-harare" (max ~80 chars, cut at a word). */
export function jobSlug(job: JobLike): string {
  const full = slugify([job.title, hasCompany(job.company) ? job.company : "", job.location ?? ""].join(" "));
  if (full.length <= 80) return full || "job";
  return full.slice(0, 80).replace(/-[^-]*$/, "") || "job";
}

/** Canonical job URL: /jobs/<id>/<slug>. The bare /jobs/<id> redirects here. */
export function jobPath(job: JobLike): string {
  return `/jobs/${encodeURIComponent(job.id)}/${jobSlug(job)}`;
}

export const sectorPath = (sector: string) => `/jobs/sector/${slugify(sector)}`;
export const cityPath = (city: string) => `/jobs/location/${slugify(city)}`;

/** "Harare, Zimbabwe" / "harare" / " Harare CBD" → "Harare" (first place name, title case). */
export function cityOf(location?: string): string {
  const first = (location ?? "").split(/[,/|(]/)[0].replace(/\b(cbd|zimbabwe)\b/gi, "").trim();
  if (!first || /^(n\/?a|various|remote|nationwide|any|not specified)$/i.test(first)) return "";
  return first.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export const companyName = (c?: string) => (hasCompany(c) ? c!.trim() : "");

/** Standard metadata for an indexable page: title, description, canonical, share card. */
export function pageMeta({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    // Absolute, so pages under another layout (e.g. /employers/*) still get the suffix.
    title: { absolute: `${title} · ${SITE_NAME}` },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_ZW",
      url: path,
      title: `${title} · ${SITE_NAME}`,
      description,
      images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: `${SITE_NAME} — jobs in Zimbabwe` }],
    },
    twitter: { card: "summary_large_image", title: `${title} · ${SITE_NAME}`, description, images: ["/opengraph-image.png"] },
  };
}

/** Metadata for signed-in-only pages: titled, but kept out of search results. */
export function privateMeta(title: string, path: string): Metadata {
  return {
    title: { absolute: `${title} · ${SITE_NAME}` },
    robots: { index: false, follow: true },
    alternates: { canonical: path },
    openGraph: { url: path, siteName: SITE_NAME, title: `${title} · ${SITE_NAME}` },
  };
}

/** Safe JSON for a <script type="application/ld+json"> tag (no "</script>" breakout). */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Scraped adverts use chat-style markdown (*bold*, _x_, # headings) — drop the markers. */
export function stripMarkdown(text: string): string {
  return text.replace(/[*_#`~]+/g, "").replace(/[ \t]+\n/g, "\n");
}

/** First ~155 characters of plain text, cut at a word. */
export function snippet(text: string, max = 155): string {
  const clean = stripMarkdown(text).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
