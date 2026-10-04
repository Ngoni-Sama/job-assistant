"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import {
  MapPin,
  Wallet,
  CalendarClock,
  Mail,
  Phone,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Application, JobDetailFull, JobListing, StoredCV } from "@/lib/types";
import { CompanyLogo, isExpired, formatDate } from "@/components/CompanyLogo";
import { JobTile } from "@/components/JobTile";
import { RadialApply } from "@/components/RadialApply";
import { ApplyModal } from "@/components/ApplyModal";
import { RichText } from "@/components/RichText";
import { useCosts } from "@/lib/useCosts";
import { cityOf, cityPath, companyName, jobPath, sectorPath } from "@/lib/seo";
import { ShareButtons } from "@/components/ShareButtons";

type Initial = { job: JobListing; detail: JobDetailFull | null; similar: JobListing[] };

/**
 * Job page UI. The server passes the job in `initial` so the title, details and
 * links are in the page HTML (search engines, fast first paint); without it
 * (API unreachable at render time) the browser loads it instead.
 */
export function JobDetailClient({ id, initial }: { id: string; initial?: Initial }) {
  const costs = useCosts();
  const { status } = useSession();
  const [job, setJob] = useState<JobListing | null>(initial?.job ?? null);
  const [detail, setDetail] = useState<JobDetailFull | null>(initial?.detail ?? null);
  const [similar, setSimilar] = useState<JobListing[]>(initial?.similar ?? []);
  const [cvs, setCvs] = useState<StoredCV[]>([]);
  const [activeCvId, setActiveCvId] = useState<string | undefined>();
  const [loading, setLoading] = useState(!initial);
  const [preparing, setPreparing] = useState(false);
  const [optimising, setOptimising] = useState(false);
  const [active, setActive] = useState<Application | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial || !id) return;
    api
      .getJob(id)
      .then((r) => {
        setJob(r.job);
        setDetail(r.detail);
        setSimilar(r.similar);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id, initial]);

  useEffect(() => {
    if (status === "authenticated") api.getCvs().then((r) => setCvs(r.cvs)).catch(() => {});
  }, [status]);

  // Free: open the apply screen with the original CV.
  async function apply(jobId: string, cvId?: string) {
    if (status !== "authenticated") return signIn("google");
    setPreparing(true);
    setActiveCvId(cvId);
    setError("");
    try {
      const { application } = await api.prepareApplication(jobId, cvId);
      setActive(application);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparing(false);
    }
  }

  // Paid: AI-tailor to this job (3 credits).
  async function optimise(jobId: string, cvId?: string) {
    if (status !== "authenticated") return signIn("google");
    setOptimising(true);
    setActiveCvId(cvId);
    setError("");
    try {
      const { application } = await api.optimiseApplication(jobId, cvId);
      setActive(application);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOptimising(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error || !job) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-gray-600">
        {error || "Job not found."}{" "}
        <Link href="/jobs" className="text-brand-700 underline">
          Back to jobs
        </Link>
      </div>
    );
  }

  const expired = isExpired(job.expiryDate);
  const email = detail?.applyEmail || job.applyEmail;
  const sections = detail?.sections ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-600">
          <li>
            <Link href="/jobs" className="inline-block py-2 hover:text-brand-700">
              Jobs
            </Link>
          </li>
          {job.sector && job.sector !== "Other" && (
            <li className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
              <Link href={sectorPath(job.sector)} className="inline-block py-2 hover:text-brand-700">
                {job.sector}
              </Link>
            </li>
          )}
          {cityOf(job.location) && (
            <li className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
              <Link href={cityPath(cityOf(job.location))} className="inline-block py-2 hover:text-brand-700">
                {cityOf(job.location)}
              </Link>
            </li>
          )}
        </ol>
      </nav>

      {/* Hero */}
      <div className="glass-strong rounded-3xl p-6">
        <div className="flex items-start gap-4">
          <CompanyLogo src={job.logo || detail?.logo} name={job.company} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold leading-tight">{job.title}</h1>
            <p className="text-gray-600">{job.company}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {job.location}
              </span>
              {job.sector && (
                <span className="rounded-full bg-accent-100/80 px-2 py-0.5 text-xs text-accent-800">
                  {job.sector}
                </span>
              )}
              {job.jobType && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                  {job.jobType}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Wallet className="h-4 w-4" /> {job.salary || "TBA"}
              </span>
            </div>
            {job.expiryDate && (
              <p className={`mt-2 flex items-center gap-1 text-sm font-medium ${expired ? "text-red-600" : "text-green-600"}`}>
                <CalendarClock className="h-4 w-4" /> {expired ? "Closed" : "Closes"} {formatDate(job.expiryDate)}
              </p>
            )}
          </div>
        </div>

        {/* Apply contact — gold */}
        {(email || detail?.applyPhone) && (
          <div className="mt-4 flex flex-wrap gap-4 rounded-2xl bg-amber-50/60 p-3 text-sm">
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-1.5 font-semibold text-amber-500">
                <Mail className="h-4 w-4" /> {email}
              </a>
            )}
            {detail?.applyPhone && (
              <span className="flex items-center gap-1.5 font-semibold text-amber-500">
                <Phone className="h-4 w-4" /> {detail.applyPhone}
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <RadialApply mode="apply" cvs={cvs} preparing={preparing} onApply={(cvId) => apply(job.id, cvId)} />
          <RadialApply mode="optimise" cost={costs.optimise} cvs={cvs} preparing={optimising} onApply={(cvId) => optimise(job.id, cvId)} />
          <a
            href={job.applyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="glass flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium text-gray-700"
          >
            Source <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-5 border-t border-white/60 pt-4">
          <ShareButtons
            path={jobPath(job)}
            label="Share this job"
            text={`${job.title}${companyName(job.company) ? ` at ${companyName(job.company)}` : ""}${
              cityOf(job.location) ? ` (${cityOf(job.location)})` : ""
            } — apply on VacancyPal`}
          />
        </div>
      </div>

      {/* Sections */}
      <Section title="Job Description" body={sections.jobDescription || job.description} />
      <Section title="Duties and Responsibilities" body={sections.duties} />
      <Section title="Qualifications and Experience" body={sections.qualifications} />
      <Section title="How to Apply" body={sections.howToApply || detail?.applyText} />
      <Section
        title={`About ${job.company && job.company !== "N/A" ? job.company : "the company"}`}
        body={sections.about}
      />

      {/* Similar jobs */}
      {similar.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Similar jobs</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {similar.map((s) => (
              <JobTile
                key={s.id}
                job={s}
                cvs={cvs}
                onApply={(j, cvId) => apply(j.id, cvId)}
                onOptimise={(j, cvId) => optimise(j.id, cvId)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Phones: Apply stays in thumb reach while reading (above the bottom menu). */}
      {!expired && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-gray-200 bg-white/95 px-4 py-2.5 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-md items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{job.title}</p>
            <RadialApply mode="apply" cvs={cvs} preparing={preparing} onApply={(cvId) => apply(job.id, cvId)} />
            <RadialApply mode="optimise" cost={costs.optimise} cvs={cvs} preparing={optimising} onApply={(cvId) => optimise(job.id, cvId)} />
          </div>
        </div>
      )}
      <div className="h-16 md:hidden" aria-hidden />

      {active && (
        <ApplyModal application={active} cvId={activeCvId} onClose={() => setActive(null)} onSent={() => setActive(null)} />
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  return (
    <section className="glass rounded-2xl p-6">
      <h2 className="mb-2 font-bold">{title}</h2>
      <RichText text={body} className="max-w-prose text-sm leading-relaxed text-gray-700 md:text-[15px]" />
    </section>
  );
}
