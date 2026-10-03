import type { Metadata } from "next";
import Link from "next/link";
import { JobLanding } from "@/components/JobLanding";
import { fetchJobs } from "@/lib/server/jobs";
import { groupByCity, groupBySector, openJobs } from "@/lib/jobGroups";
import { cityOf, pageMeta, slugify } from "@/lib/seo";

type Props = { params: Promise<{ city: string }> };

/** The town's display name from the jobs themselves ("harare" → "Harare"). */
async function load(slug: string) {
  const jobs = openJobs(await fetchJobs());
  const mine = jobs.filter((j) => slugify(cityOf(j.location)) === slug);
  const name = mine.length ? cityOf(mine[0].location) : slug.replace(/-/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return { jobs, mine, name };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: slug } = await params;
  const { mine, name } = await load(slug);
  const meta = pageMeta({
    title: `Jobs in ${name}, Zimbabwe`,
    description: `${mine.length ? `${mine.length} open vacancies` : "Vacancies"} in ${name}, Zimbabwe — updated every few hours. Search by title or sector and apply with an AI-tailored CV.`,
    path: `/jobs/location/${slug}`,
  });
  // Towns with fewer than 2 open jobs are thin pages — reachable, but not indexed.
  return mine.length >= 2 ? meta : { ...meta, robots: { index: false, follow: true } };
}

export default async function CityPage({ params }: Props) {
  const { city: slug } = await params;
  const { jobs, mine, name } = await load(slug);
  return (
    <JobLanding
      heading={`Jobs in ${name}`}
      crumb={name}
      path={`/jobs/location/${slug}`}
      current={slug}
      jobs={mine}
      sectors={groupBySector(jobs)}
      cities={groupByCity(jobs)}
      intro={
        <>
          {mine.length} open {mine.length === 1 ? "vacancy" : "vacancies"} in {name}, refreshed every few hours. Swipe
          through the ones that fit you in{" "}
          <Link href="/smart-match" className="text-brand-700 underline">
            Swipe 2 Match
          </Link>
          .
        </>
      }
    />
  );
}
