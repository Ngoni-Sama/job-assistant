import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { JobDetailClient } from "@/components/JobDetailClient";
import { JsonLd } from "@/components/JsonLd";
import { fetchJob, type JobPageData } from "@/lib/server/jobs";
import {
  SITE_NAME,
  SITE_URL,
  cityOf,
  cityPath,
  companyName,
  jobPath,
  jobSlug,
  sectorPath,
  snippet,
  stripMarkdown,
} from "@/lib/seo";

type Props = { params: Promise<{ id: string; slug?: string[] }> };

const today = () => new Date().toISOString().slice(0, 10);
const isClosed = (expiry?: string) => !!expiry && expiry < today();

function plainDescription({ job, detail }: JobPageData): string {
  const s = detail?.sections ?? {};
  return [s.jobDescription || job.description, s.duties, s.qualifications].filter(Boolean).join("\n\n");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchJob(decodeURIComponent(id));
  if (!data) return { title: data === null ? "Job not found" : "Job", robots: { index: false, follow: true } };

  const { job } = data;
  const company = companyName(job.company);
  const city = cityOf(job.location) || job.location;
  const closed = isClosed(job.expiryDate);
  const title = `${job.title}${company ? ` at ${company}` : ""}${city ? ` — ${city}` : ""}${closed ? " (closed)" : ""}`;
  const lead = `${company || "An employer"} is hiring a ${job.title}${city ? ` in ${city}` : ""}${
    job.expiryDate ? `. ${closed ? "Closed" : "Apply by"} ${job.expiryDate}` : ""
  }.`;
  const description = snippet(`${lead} ${plainDescription(data)}`);
  const path = jobPath(job);

  return {
    title,
    description,
    alternates: { canonical: path },
    // Closed jobs stay reachable from old links but drop out of search results.
    robots: closed ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      locale: "en_ZW",
      url: path,
      title: `${title} · ${SITE_NAME}`,
      description,
      images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: `${job.title} — ${SITE_NAME}` }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image.png"] },
  };
}

const EMPLOYMENT_TYPES: [RegExp, string][] = [
  [/full/i, "FULL_TIME"],
  [/part/i, "PART_TIME"],
  [/contract|consult|fixed/i, "CONTRACTOR"],
  [/temp/i, "TEMPORARY"],
  [/intern|attach/i, "INTERN"],
  [/volunt/i, "VOLUNTEER"],
];

const escapeHtml = (s: string) =>
  stripMarkdown(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** schema.org JobPosting — what Google for Jobs reads. Only for jobs that are still open. */
function jobPosting(data: JobPageData) {
  const { job, detail } = data;
  const s = detail?.sections ?? {};
  const html = [
    ["", s.jobDescription || job.description],
    ["Duties and responsibilities", s.duties],
    ["Qualifications and experience", s.qualifications],
    ["How to apply", s.howToApply || detail?.applyText],
  ]
    .filter(([, body]) => body)
    .map(([h, body]) => `${h ? `<p><strong>${escapeHtml(h)}</strong></p>` : ""}<p>${escapeHtml(body!).replace(/\n+/g, "<br>")}</p>`)
    .join("");
  const company = companyName(job.company);
  const employmentType = job.jobType ? EMPLOYMENT_TYPES.find(([re]) => re.test(job.jobType!))?.[1] : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: html || escapeHtml(job.title),
    identifier: { "@type": "PropertyValue", name: company || SITE_NAME, value: job.id },
    datePosted: job.firstSeen ? job.firstSeen.slice(0, 10) : undefined,
    validThrough: job.expiryDate ? `${job.expiryDate}T23:59:59+02:00` : undefined,
    employmentType,
    hiringOrganization: {
      "@type": "Organization",
      name: company || "Confidential employer",
      ...(job.logo || detail?.logo ? { logo: job.logo || detail?.logo } : {}),
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: cityOf(job.location) || job.location || undefined,
        addressCountry: "ZW",
      },
    },
    industry: job.sector && job.sector !== "Other" ? job.sector : undefined,
    url: `${SITE_URL}${jobPath(job)}`,
  };
}

function breadcrumbs(job: JobPageData["job"]) {
  const items: { name: string; path: string }[] = [
    { name: "Home", path: "/" },
    { name: "Jobs", path: "/jobs" },
  ];
  if (job.sector && job.sector !== "Other") items.push({ name: job.sector, path: sectorPath(job.sector) });
  else if (cityOf(job.location)) items.push({ name: cityOf(job.location), path: cityPath(cityOf(job.location)) });
  items.push({ name: job.title, path: jobPath(job) });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path === "/" ? "" : it.path}`,
    })),
  };
}

export default async function JobPage({ params }: Props) {
  const { id: rawId, slug } = await params;
  const id = decodeURIComponent(rawId);
  const data = await fetchJob(id);
  if (data === null) notFound();

  // One URL per job: /jobs/<id> and outdated slugs redirect to /jobs/<id>/<slug>.
  if (data && (slug ?? []).join("/") !== jobSlug(data.job)) permanentRedirect(jobPath(data.job));

  return (
    <>
      {data && !isClosed(data.job.expiryDate) && <JsonLd data={jobPosting(data)} />}
      {data && <JsonLd data={breadcrumbs(data.job)} />}
      <JobDetailClient id={id} initial={data ?? undefined} />
    </>
  );
}
