import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { JobListing } from "@/lib/types";
import { slimJob, type JobGroup } from "@/lib/jobGroups";
import { JobsClient } from "@/components/JobsClient";
import { BrowseJobs } from "@/components/BrowseJobs";
import { JsonLd } from "@/components/JsonLd";
import { ShareButtons } from "@/components/ShareButtons";
import { SITE_URL, jobPath } from "@/lib/seo";

/** Shared layout for the sector and town landing pages (server-rendered). */
export function JobLanding({
  heading,
  intro,
  crumb,
  path,
  jobs,
  sectors,
  cities,
  current,
}: {
  heading: string;
  intro: React.ReactNode;
  crumb: string;
  path: string;
  jobs: JobListing[];
  sectors: JobGroup[];
  cities: JobGroup[];
  current: string;
}) {
  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Jobs", item: `${SITE_URL}/jobs` },
        { "@type": "ListItem", position: 3, name: crumb, item: `${SITE_URL}${path}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: heading,
      numberOfItems: jobs.length,
      itemListElement: jobs.slice(0, 50).map((j, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}${jobPath(j)}`,
        name: j.title,
      })),
    },
  ];

  return (
    <div className="space-y-8">
      <JsonLd data={structured} />
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-600">
          <li>
            <Link href="/jobs" className="hover:text-brand-700">
              Jobs
            </Link>
          </li>
          <li className="flex items-center gap-1" aria-current="page">
            <ChevronRight className="h-3.5 w-3.5 text-gray-400" /> {crumb}
          </li>
        </ol>
      </nav>
      <JobsClient initialJobs={jobs.map(slimJob)} heading={heading} intro={intro} loadAll={false} />
      <div className="glass rounded-2xl p-4">
        <ShareButtons path={path} label="Share these jobs" text={`${heading} — ${jobs.length} open on VacancyPal`} />
      </div>
      {jobs.length === 0 && (
        <p className="glass rounded-2xl p-6 text-gray-600">
          No open jobs here right now — new jobs arrive every few hours.{" "}
          <Link href="/jobs" className="text-brand-700 underline">
            See all open jobs
          </Link>
          .
        </p>
      )}
      <BrowseJobs sectors={sectors} cities={cities} current={current} />
    </div>
  );
}
