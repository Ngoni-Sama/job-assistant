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

/**
 * Split the listing page into per-job cards and extract fields.
 *
 * Card markup (vacancymail, verified 2026-09-02):
 *   <a href="/jobs/..." class="job-listing">
 *     <div class="job-listing-description">
 *       <h3 class="job-listing-title">…</h3>
 *       <h4 class="job-listing-company">…</h4>
 *       <p class="job-listing-text">…</p>
 *     <div class="job-listing-footer"><ul>
 *       <li><i class="icon-material-outline-location-on"></i> Location</li>
 *       <li><i class="icon-material-outline-access-time"></i> Expires dd Mon yyyy</li>
 *       <li><i class="icon-material-outline-business-center"></i> Job type</li>
 *       <li><i class="icon-material-outline-account-balance-wallet"></i> Salary</li>
 */
export function parseListings(html: string): JobListing[] {
  const jobs: JobListing[] = [];
  const cardRegex = /<a[^>]*class="[^"]*\bjob-listing\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html)) !== null) {
    const card = match[0];
    const inner = match[1];

    const href = firstGroup(card, /href="([^"]+)"/i);
    const title = text(firstGroup(inner, /class="[^"]*job-listing-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i));
    if (!title) continue;

    jobs.push({
      id: `vm-${hash(href || title)}`,
      title,
      company:
        text(firstGroup(inner, /class="[^"]*job-listing-company(?!-)[^"]*"[^>]*>([\s\S]*?)<\/h4>/i)) ||
        "N/A",
      location: footerField(inner, "location-on") || "Zimbabwe",
      postedDate: footerField(inner, "access-time"),
      description: text(firstGroup(inner, /class="[^"]*job-listing-text[^"]*"[^>]*>([\s\S]*?)<\/p>/i)),
      requirements: [],
      applyLink: absolute(href),
      source: "vacancymail.co.zw",
    });
  }
  return jobs;
}

/**
 * Extract a footer <li> value identified by its Material icon suffix.
 * Isolates each <li>, finds the one carrying the icon class, and strips tags —
 * more robust than a single anchored regex against the whitespace-heavy markup.
 */
function footerField(inner: string, iconSuffix: string): string {
  const items = inner.match(/<li>[\s\S]*?<\/li>/gi) ?? [];
  for (const li of items) {
    if (li.includes(`icon-material-outline-${iconSuffix}`)) return text(li);
  }
  return "";
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
    .replace(/&#x27;|&#39;|&#8217;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
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
