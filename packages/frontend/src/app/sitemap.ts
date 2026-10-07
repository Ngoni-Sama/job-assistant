import type { MetadataRoute } from "next";
import { SITE_URL, jobPath } from "@/lib/seo";
import { fetchJobs } from "@/lib/server/jobs";
import { groupByCity, groupBySector, openJobs } from "@/lib/jobGroups";

// Rebuilt at most once an hour; new jobs arrive every few hours.
export const revalidate = 3600;

/** Public, indexable pages only (signed-in pages are noindex and left out). */
const STATIC: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/jobs", priority: 0.9, changeFrequency: "hourly" },
  { path: "/cv-builder", priority: 0.8, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.7, changeFrequency: "monthly" },
  { path: "/smart-match", priority: 0.6, changeFrequency: "daily" },
  { path: "/employers", priority: 0.6, changeFrequency: "monthly" },
  { path: "/verification", priority: 0.5, changeFrequency: "monthly" },
  { path: "/nearby", priority: 0.5, changeFrequency: "daily" },
  { path: "/archive", priority: 0.4, changeFrequency: "daily" },
  { path: "/how-we-use-gmail", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/delete-account", priority: 0.1, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const jobs = openJobs(await fetchJobs());
  const newest = jobs.reduce<Date | undefined>((d, j) => {
    const t = j.firstSeen ? new Date(j.firstSeen) : undefined;
    return t && (!d || t > d) ? t : d;
  }, undefined);

  return [
    ...STATIC.map((p) => ({
      url: `${SITE_URL}${p.path === "/" ? "" : p.path}`,
      lastModified: p.path === "/jobs" ? (newest ?? now) : now,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    })),
    ...groupBySector(jobs).map((g) => ({
      url: `${SITE_URL}/jobs/sector/${g.slug}`,
      lastModified: newest ?? now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...groupByCity(jobs).map((g) => ({
      url: `${SITE_URL}/jobs/location/${g.slug}`,
      lastModified: newest ?? now,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...jobs.map((j) => ({
      url: `${SITE_URL}${jobPath(j)}`,
      lastModified: j.firstSeen ? new Date(j.firstSeen) : now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
