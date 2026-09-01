import type { JobListing } from "../../types";

/**
 * Scrapes job listings from vacancymail.co.zw.
 *
 * NOTE: HTML scraping is inherently brittle — selectors below are best-effort
 * against the current markup and will need updating if the site changes. Prefer
 * an official API where one exists. Always respect the site's robots.txt / ToS
 * and keep request volume low.
 */
export async function scrapeVacancyMail(url: string): Promise<JobListing[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; JobAssistant/0.1; +https://github.com/Ngoni-Sama/job-assistant)",
    },
  });
  if (!res.ok) {
    throw new Error(`vacancymail returned ${res.status}`);
  }
  const html = await res.text();
  return parseListings(html);
}

/** Split the listing page into per-job cards and extract fields. */
export function parseListings(html: string): JobListing[] {
  const jobs: JobListing[] = [];
  // Listing cards are anchor blocks under the jobs feed.
  const cardRegex = /<a[^>]*class="[^"]*job-listing[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html)) !== null) {
    const card = match[0];
    const inner = match[1];

    const href = firstGroup(card, /href="([^"]+)"/i);
    const title = text(firstGroup(inner, /<h[34][^>]*>([\s\S]*?)<\/h[34]>/i));
    if (!title) continue;

    jobs.push({
      id: `vm-${hash(href || title)}`,
      title,
      company: text(firstGroup(inner, /class="[^"]*job-company[^"]*"[^>]*>([\s\S]*?)</i)) || "N/A",
      location: text(firstGroup(inner, /class="[^"]*location[^"]*"[^>]*>([\s\S]*?)</i)) || "Zimbabwe",
      postedDate: text(firstGroup(inner, /class="[^"]*posted[^"]*"[^>]*>([\s\S]*?)</i)),
      description: text(firstGroup(inner, /<p[^>]*>([\s\S]*?)<\/p>/i)),
      requirements: [],
      applyLink: absolute(href),
      source: "vacancymail.co.zw",
    });
  }
  return jobs;
}

function firstGroup(input: string, re: RegExp): string {
  const m = input.match(re);
  return m ? m[1] : "";
}

/** Strip tags + collapse whitespace + decode a few common entities. */
function text(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function absolute(href: string): string {
  if (!href) return "https://vacancymail.co.zw/jobs/";
  return href.startsWith("http") ? href : `https://vacancymail.co.zw${href}`;
}

/** Small stable hash for deterministic job ids (avoids duplicates across runs). */
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(36);
}
