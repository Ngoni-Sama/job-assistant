"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import {
  MapPin,
  Wallet,
  CalendarClock,
  Mail,
  Phone,
  ExternalLink,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Application, JobDetailFull, JobListing } from "@/lib/types";
import { CompanyLogo, isExpired, formatDate } from "@/components/CompanyLogo";
import { JobTile } from "@/components/JobTile";
import { ApplyModal } from "@/components/ApplyModal";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const { status } = useSession();
  const [job, setJob] = useState<JobListing | null>(null);
  const [detail, setDetail] = useState<JobDetailFull | null>(null);
  const [similar, setSimilar] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [active, setActive] = useState<Application | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params?.id) return;
    api
      .getJob(params.id)
      .then((r) => {
        setJob(r.job);
        setDetail(r.detail);
        setSimilar(r.similar);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [params?.id]);

  async function optimise() {
    if (!job) return;
    if (status !== "authenticated") return signIn("google");
    setPreparing(true);
    setError("");
    try {
      const { application } = await api.prepareApplication(job.id);
      setActive(application);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparing(false);
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
      <Link href="/jobs" className="flex items-center gap-1 text-sm text-gray-600 hover:text-brand-700">
        <ChevronLeft className="h-4 w-4" /> All jobs
      </Link>

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
                <span className="rounded-full bg-violet-100/70 px-2 py-0.5 text-xs text-violet-700">
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
          <button
            onClick={optimise}
            disabled={preparing}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-md disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> {preparing ? "Optimising…" : "Optimise CV & apply"}
          </button>
          <a
            href={job.applyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="glass flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium text-gray-700"
          >
            Source <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Sections */}
      <Section title="Job Description" body={sections.jobDescription || job.description} />
      <Section title="Duties and Responsibilities" body={sections.duties} />
      <Section title="Qualifications and Experience" body={sections.qualifications} />
      <Section title="How to Apply" body={sections.howToApply || detail?.applyText} />

      {/* Similar jobs */}
      {similar.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Similar jobs</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {similar.map((s) => (
              <JobTile key={s.id} job={s} onApply={() => optimise()} />
            ))}
          </div>
        </section>
      )}

      {active && (
        <ApplyModal application={active} onClose={() => setActive(null)} onSent={() => setActive(null)} />
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  return (
    <section className="glass rounded-2xl p-6">
      <h2 className="mb-2 font-bold">{title}</h2>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{body}</p>
    </section>
  );
}
