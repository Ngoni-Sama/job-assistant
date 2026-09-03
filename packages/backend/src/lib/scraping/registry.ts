import type { JobListing } from "../../types";
import { scrapeVacancyMail } from "./vacancymail";
import { scrapeJobsZimbabwe } from "./jobszimbabwe";

type Scraper = (url: string) => Promise<JobListing[]>;

/** Hostname (without www.) → site-specific scraper. */
const SCRAPERS: Record<string, Scraper> = {
  "vacancymail.co.zw": scrapeVacancyMail,
  "jobszimbabwe.co.zw": scrapeJobsZimbabwe,
};

/** Sources seeded for a brand-new deployment. */
export const DEFAULT_SOURCES = [
  { url: "https://vacancymail.co.zw/jobs/", label: "VacancyMail", enabled: true },
  { url: "https://jobszimbabwe.co.zw/", label: "Jobs Zimbabwe", enabled: true },
];

/** Whether we have a parser for a given URL's host. */
export function isSupported(url: string): boolean {
  return !!resolveScraper(url);
}

/** Scrape a single configured source URL, routed by hostname. */
export async function scrapeSource(url: string): Promise<JobListing[]> {
  const scraper = resolveScraper(url);
  if (!scraper) {
    console.warn(`No scraper registered for ${url} — skipping`);
    return [];
  }
  return scraper(url);
}

function resolveScraper(url: string): Scraper | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
  return SCRAPERS[host];
}
