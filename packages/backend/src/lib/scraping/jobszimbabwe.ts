import type { JobListing } from "../../types";
import { parseExpiry } from "../utils/date";
import { fetchHtml, firstGroup, hash, text } from "./shared";

/**
 * Scrapes jobszimbabwe.co.zw (a WordPress "JobMonster" theme).
 *
 * Card markup (verified 2026-09-02):
 *   <h3 class="loop-item-title"><a href="URL" title="…">TITLE</a></h3>
 *   <span class="job-type">…<span>Full Time</span></span>
 *   <span class="job-location">…<a><em>Harare</em></a></span>
 *   <time class="entry-date" datetime="2026-09-02T…">
 */
/**
 * Scrape jobszimbabwe across multiple pages. WordPress paginates via
 * `.../page/N/`; the pagination bar exposes a very high max (hundreds of post
 * pages), so we cap with `maxPages` to stay respectful and bounded.
 */
export async function scrapeJobsZimbabwe(
  startUrl: string,
  maxPages = 5,
): Promise<JobListing[]> {
  const firstHtml = await fetchHtml(startUrl);
  const lastPage = Math.min(detectMaxPage(firstHtml), maxPages);

  const all = parseJobsZimbabwe(firstHtml);
  const base = pageBase(startUrl);
  for (let page = 2; page <= lastPage; page++) {
    try {
      all.push(...parseJobsZimbabwe(await fetchHtml(`${base}page/${page}/`)));
    } catch (err) {
      console.error(`jobszimbabwe page ${page} failed`, err);
      break; // stop paging on first failure
    }
  }
  return all;
}

/** Highest `/page/N/` referenced in the pagination bar; default 1. */
function detectMaxPage(html: string): number {
  let max = 1;
  const re = /\/page\/(\d+)\//gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) max = Math.max(max, Number(m[1]));
  return max;
}

/** Origin + path with a guaranteed trailing slash, ready to append `page/N/`. */
function pageBase(url: string): string {
  const u = new URL(url);
  const path = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
  return `${u.origin}${path}`;
}

export function parseJobsZimbabwe(html: string): JobListing[] {
  const jobs: JobListing[] = [];
  // Each listing is anchored by its title heading; slice from one title to the next.
  const titleRe = /<h3[^>]*class="[^"]*loop-item-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const matches = [...html.matchAll(titleRe)];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const href = m[1];
    const title = text(m[2]);
    if (!title) continue;

    // Bound the card to the text between this title and the next one.
    const start = m.index ?? 0;
    const end = matches[i + 1]?.index ?? html.length;
    const block = html.slice(start, end);

    // The <time datetime> is the POSTED date, not expiry — never treat it as
    // expiry. Only an explicit closing date counts (undated jobs are kept).
    const posted = firstGroup(block, /<time[^>]*datetime="([^"]+)"/i);
    const closing = text(
      firstGroup(block, /class="[^"]*job-date__closing[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/i),
    );

    jobs.push({
      id: `jz-${hash(href || title)}`,
      title,
      company: companyFromTitle(title),
      location:
        text(firstGroup(block, /class="[^"]*job-location[^"]*"[\s\S]*?<em>([\s\S]*?)<\/em>/i)) ||
        "Zimbabwe",
      postedDate:
        text(firstGroup(block, /class="[^"]*job-date-ago[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/i)) ||
        parseExpiry(posted) ||
        "",
      expiryDate: parseExpiry(closing),
      jobType:
        text(firstGroup(block, /class="[^"]*job-type[^"]*"[\s\S]*?<span>([\s\S]*?)<\/span>/i)) ||
        undefined,
      description: "",
      requirements: [],
      applyLink: href,
      source: "jobszimbabwe.co.zw",
    });
  }
  return jobs;
}

/** Titles are often "ROLE – Company"; take the tail after an en/em/hyphen dash. */
function companyFromTitle(title: string): string {
  const m = title.match(/\s[–—-]\s(.+)$/);
  return m ? m[1].trim() : "N/A";
}
