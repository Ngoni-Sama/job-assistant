import type { Metadata } from "next";
import { JobsClient } from "@/components/JobsClient";
import { BrowseJobs } from "@/components/BrowseJobs";
import { JsonLd } from "@/components/JsonLd";
import { fetchJobs } from "@/lib/server/jobs";
import { groupByCity, groupBySector, openJobs, slimJob } from "@/lib/jobGroups";
import { SITE_URL, jobPath, pageMeta } from "@/lib/seo";

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const jobs = openJobs(await fetchJobs());
  const meta = pageMeta({
    title: "Latest jobs in Zimbabwe",
    description: `${jobs.length ? `${jobs.length} open vacancies` : "Open vacancies"} in Harare, Bulawayo and across Zimbabwe — updated every few hours. Search by title, company or town and apply in minutes.`,
    path: "/jobs",
  });
  // Search results pages aren't indexed (the canonical /jobs page is).
  return q ? { ...meta, robots: { index: false, follow: true } } : meta;
}

export default async function JobsPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const all = await fetchJobs();
  const jobs = openJobs(all);
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Latest jobs in Zimbabwe",
    numberOfItems: jobs.length,
    itemListElement: jobs.slice(0, 50).map((j, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}${jobPath(j)}`,
      name: j.title,
    })),
  };
  return (
    <div className="space-y-10">
      {jobs.length > 0 && <JsonLd data={itemList} />}
      <JobsClient initialJobs={all.map(slimJob)} initialQuery={(Array.isArray(q) ? q[0] : q) ?? ""} />
      <BrowseJobs sectors={groupBySector(jobs)} cities={groupByCity(jobs)} />
    </div>
  );
}
