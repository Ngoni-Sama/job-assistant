import "server-only";
import { WORKER_BASE } from "@/lib/server/worker";
import type { CreditPack, JobDetailFull, JobListing } from "@/lib/types";

/**
 * Public job data for server-rendered pages (job pages, sector/city pages,
 * sitemap, llms.txt). Cached for 10 minutes; the Worker re-scrapes every few hours.
 */

const REVALIDATE = 600;

export async function fetchJobs(): Promise<JobListing[]> {
  try {
    const res = await fetch(`${WORKER_BASE}/api/jobs`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return [];
    return ((await res.json()) as { jobs?: JobListing[] }).jobs ?? [];
  } catch {
    return [];
  }
}

export type JobPageData = { job: JobListing; detail: JobDetailFull | null; similar: JobListing[] };

/** One job with its detail. `null` = no such job; `undefined` = the API couldn't be reached. */
export async function fetchJob(id: string): Promise<JobPageData | null | undefined> {
  try {
    const res = await fetch(`${WORKER_BASE}/api/job/${encodeURIComponent(id)}`, { next: { revalidate: REVALIDATE } });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    return (await res.json()) as JobPageData;
  } catch {
    return undefined;
  }
}

export async function fetchPricing(): Promise<{ packs: CreditPack[]; costs: Record<string, number>; freeCredits: number } | null> {
  try {
    const [p, s] = await Promise.all(
      ["/api/billing/packs", "/api/site"].map((path) =>
        fetch(`${WORKER_BASE}${path}`, { next: { revalidate: 3600 } }).then((r) => (r.ok ? r.json() : null)),
      ),
    );
    if (!p) return null;
    return {
      packs: (p as { packs: CreditPack[] }).packs ?? [],
      costs: (s as { costs?: Record<string, number> } | null)?.costs ?? {},
      freeCredits: (s as { payments?: { freeCredits?: number } } | null)?.payments?.freeCredits ?? 50,
    };
  } catch {
    return null;
  }
}
