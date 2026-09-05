import type { JobListing } from "../../types";
import { parseExpiry } from "../utils/date";
import { fetchHtml, firstGroup, hash, text } from "./shared";

const HOST = "https://vacancymail.co.zw";

/**
 * Scrapes job listings from vacancymail.co.zw across multiple pages.
 *
 * Pages are addressed via `?page=N`; the pagination bar exposes the highest
 * page number. We walk from page 1 up to `min(detectedMax, maxPages)` to keep
 * request volume (and Worker subrequests) bounded and the site respected.
 *
 * NOTE: HTML scraping is brittle — selectors are best-effort against the markup
 * verified 2026-09-02 and will need updating if the site changes.
 */
export async function scrapeVacancyMail(
  startUrl: string,
  maxPages = 8,
): Promise<JobListing[]> {
  const base = new URL(startUrl);
  const firstHtml = await fetchHtml(startUrl);

  const detected = detectMaxPage(firstHtml);
  const lastPage = Math.min(detected, maxPages);

  const all = parseListings(firstHtml);
  for (let page = 2; page <= lastPage; page++) {
    base.searchParams.set("page", String(page));
    try {
      all.push(...parseListings(await fetchHtml(base.toString())));
    } catch (err) {
      console.error(`vacancymail page ${page} failed`, err);
      break; // stop paging on the first failure
    }
  }
  return all;
}

/** Read the highest `?page=N` from the pagination bar; default 1. */
export function detectMaxPage(html: string): number {
  let max = 1;
  const re = /[?&]page=(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Split a listing page into per-job cards and extract fields.
 *
 * Card markup (verified 2026-09-02):
 *   <a href="/jobs/..." class="job-listing">
 *     <h3 class="job-listing-title">…</h3>
 *     <h4 class="job-listing-company">…</h4>
 *     <p  class="job-listing-text">…</p>
 *     <div class="job-listing-footer"><ul>
 *       <li><i class="icon-material-outline-location-on"></i> Location</li>
 *       <li><i class="icon-material-outline-access-time"></i> Expires dd Mon yyyy</li>
 *       <li><i class="icon-material-outline-business-center"></i> Job type</li>
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

    const expiryRaw = footerField(inner, "access-time");
    // Logo lives in the card; skip the site's own placeholder logo.
    const logoSrc = firstGroup(inner, /job-listing-company-logo[\s\S]*?<img[^>]*src="([^"]+)"/i);
    const logo = logoSrc && !/vacancymail\.co\.za/i.test(logoSrc) ? absolute(logoSrc) : undefined;
    jobs.push({
      id: `vm-${hash(href || title)}`,
      title,
      company:
        text(firstGroup(inner, /class="[^"]*job-listing-company(?!-)[^"]*"[^>]*>([\s\S]*?)<\/h4>/i)) ||
        "N/A",
      location: footerField(inner, "location-on") || "Zimbabwe",
      postedDate: expiryRaw,
      expiryDate: parseExpiry(expiryRaw),
      jobType: footerField(inner, "business-center") || undefined,
      salary: footerField(inner, "account-balance-wallet") || "TBA",
      logo,
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
 * robust against the markup's heavy whitespace.
 */
function footerField(inner: string, iconSuffix: string): string {
  const items = inner.match(/<li>[\s\S]*?<\/li>/gi) ?? [];
  for (const li of items) {
    if (li.includes(`icon-material-outline-${iconSuffix}`)) return text(li);
  }
  return "";
}

function absolute(href: string): string {
  if (!href) return `${HOST}/jobs/`;
  return href.startsWith("http") ? href : `${HOST}${href}`;
}
