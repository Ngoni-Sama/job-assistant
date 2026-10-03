import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobLanding } from "@/components/JobLanding";
import { fetchJobs } from "@/lib/server/jobs";
import { groupByCity, groupBySector, openJobs } from "@/lib/jobGroups";
import { SECTORS } from "@/lib/sectors";
import { pageMeta, slugify } from "@/lib/seo";

type Props = { params: Promise<{ sector: string }> };

const sectorFor = (slug: string) => SECTORS.find((s) => s !== "Other" && slugify(s) === slug);

export function generateStaticParams() {
  return SECTORS.filter((s) => s !== "Other").map((s) => ({ sector: slugify(s) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sector: slug } = await params;
  const sector = sectorFor(slug);
  if (!sector) return { title: "Jobs", robots: { index: false } };
  const count = openJobs(await fetchJobs()).filter((j) => j.sector === sector).length;
  const meta = pageMeta({
    title: `${sector} jobs in Zimbabwe`,
    description: `${count ? `${count} open ${sector} vacancies` : `${sector} vacancies`} in Harare, Bulawayo and across Zimbabwe. Updated every few hours — apply with an AI-tailored CV in minutes.`,
    path: `/jobs/sector/${slug}`,
  });
  // An empty sector page is thin content — keep it out of results until jobs return.
  return count ? meta : { ...meta, robots: { index: false, follow: true } };
}

export default async function SectorPage({ params }: Props) {
  const { sector: slug } = await params;
  const sector = sectorFor(slug);
  if (!sector) notFound();
  const jobs = openJobs(await fetchJobs());
  const mine = jobs.filter((j) => j.sector === sector);
  return (
    <JobLanding
      heading={`${sector} jobs in Zimbabwe`}
      crumb={sector}
      path={`/jobs/sector/${slug}`}
      current={slug}
      jobs={mine}
      sectors={groupBySector(jobs)}
      cities={groupByCity(jobs)}
      intro={
        <>
          {mine.length} open {sector} {mine.length === 1 ? "vacancy" : "vacancies"}, gathered from Zimbabwe’s main job
          boards and refreshed every few hours. Check your CV with our free{" "}
          <Link href="/cv-builder" className="text-brand-700 underline">
            ATS score
          </Link>{" "}
          before you apply.
        </>
      }
    />
  );
}
