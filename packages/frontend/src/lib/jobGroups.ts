import type { JobListing } from "./types";
import { SECTORS } from "./sectors";
import { cityOf, slugify } from "./seo";

export type JobGroup = { name: string; slug: string; jobs: JobListing[] };

/** Open jobs per sector (sectors with no jobs are left out; "Other" last). */
export function groupBySector(jobs: JobListing[]): JobGroup[] {
  return SECTORS.map((name) => ({ name, slug: slugify(name), jobs: jobs.filter((j) => j.sector === name) }))
    .filter((g) => g.jobs.length > 0)
    .sort((a, b) => (a.name === "Other" ? 1 : b.name === "Other" ? -1 : b.jobs.length - a.jobs.length));
}

/** Open jobs per town/city, busiest first. Towns with fewer than `min` jobs are left out (thin pages). */
export function groupByCity(jobs: JobListing[], min = 2): JobGroup[] {
  const map = new Map<string, JobGroup>();
  for (const j of jobs) {
    const name = cityOf(j.location);
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;
    const g = map.get(slug) ?? { name, slug, jobs: [] };
    g.jobs.push(j);
    map.set(slug, g);
  }
  return [...map.values()].filter((g) => g.jobs.length >= min).sort((a, b) => b.jobs.length - a.jobs.length);
}

/** Jobs still open today (no deadline counts as open). */
export function openJobs(jobs: JobListing[]): JobListing[] {
  const today = new Date().toISOString().slice(0, 10);
  return jobs.filter((j) => !j.expiryDate || j.expiryDate >= today);
}

/**
 * Just what a job card needs (the card shows two lines of the description).
 * Keeps the server-rendered list pages light — full adverts load on the job page.
 */
export function slimJob(j: JobListing): JobListing {
  const d = j.description ?? "";
  return { ...j, description: d.length > 240 ? `${d.slice(0, 240).replace(/\s+\S*$/, "")}…` : d, requirements: [] };
}
