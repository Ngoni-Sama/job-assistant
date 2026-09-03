"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { RefreshCw, Sparkles, Star, Zap, LogIn, FileUp } from "lucide-react";
import { api } from "@/lib/api";
import type { Application, JobListing, JobScore, Prefs, ScrapeStats, StoredCV } from "@/lib/types";
import { JobTile } from "@/components/JobTile";
import { ApplyModal } from "@/components/ApplyModal";
import { JobFilters, useJobFilters } from "@/components/JobFilters";

export default function DashboardPage() {
  const { status } = useSession();
  const authed = status === "authenticated";

  const [cv, setCv] = useState<StoredCV | null>(null);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [stats, setStats] = useState<ScrapeStats | null>(null);
  const [scores, setScores] = useState<Record<string, JobScore>>({});
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [prefs, setPrefs] = useState<Prefs>({ autoApply: false, categories: [] });
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [myJobsOnly, setMyJobsOnly] = useState(false);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [active, setActive] = useState<Application | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const filters = useJobFilters(jobs);

  useEffect(() => {
    if (status === "loading") return;
    (async () => {
      setLoading(true);
      try {
        const jobsRes = await api.getJobs();
        setJobs(jobsRes.jobs);
        setStats(jobsRes.stats);
        if (jobsRes.jobs.length === 0) {
          const res = await api.scrape();
          setJobs(res.jobs);
          setStats(res.stats);
        }
        // Per-account data only when signed in — never show a shared CV.
        if (authed) {
          const [cvRes, appliedRes, prefsRes] = await Promise.all([
            api.getCV(),
            api.getApplied(),
            api.getPrefs(),
          ]);
          setCv(cvRes.cv);
          setApplied(new Set(appliedRes.applied));
          setPrefs(prefsRes.prefs);
        } else {
          setCv(null);
          setApplied(new Set());
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [status, authed]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const res = await api.scrape();
      setJobs(res.jobs);
      setStats(res.stats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runMatch() {
    setMatching(true);
    setError("");
    try {
      const { scores } = await api.matchAll();
      setScores(Object.fromEntries(scores.map((s) => [s.jobId, s])));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMatching(false);
    }
  }

  async function optimise(job: JobListing) {
    if (!authed) return signIn("google");
    if (!cv) {
      setError("Upload your CV first to generate a tailored application.");
      return;
    }
    setPreparingId(job.id);
    setError("");
    try {
      const { application, autoSent } = await api.prepareApplication(job.id);
      if (autoSent) {
        setApplied((prev) => new Set(prev).add(job.id));
        setToast(autoSent.sent ? `Auto-applied to ${job.title} ✅` : `Prepared ${job.title}.`);
      } else {
        setActive(application);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparingId(null);
    }
  }

  const visible = useMemo(() => {
    let list = filters.filtered;
    if (myJobsOnly && prefs.categories.length) {
      list = list.filter((j) => j.jobType && prefs.categories.includes(j.jobType));
    }
    return [...list].sort((a, b) => (scores[b.id]?.score ?? -1) - (scores[a.id]?.score ?? -1));
  }, [filters.filtered, myJobsOnly, prefs.categories, scores]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {authed ? (
            <p className="text-sm text-gray-600">
              {cv ? (
                <>
                  CV: <span className="font-medium">{cv.fileName}</span> · {jobs.length} current jobs
                  {prefs.autoApply && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                      Auto-apply ON
                    </span>
                  )}
                </>
              ) : (
                <>
                  No CV yet —{" "}
                  <a href="/upload" className="text-brand-700 underline">
                    upload one
                  </a>{" "}
                  to enable matching &amp; applications.
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              Browsing {jobs.length} jobs. Sign in to upload your CV and get AI-tailored applications.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {authed && prefs.categories.length > 0 && (
            <button
              onClick={() => setMyJobsOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm ${
                myJobsOnly ? "bg-brand-600 text-white" : "glass"
              }`}
            >
              <Star className="h-4 w-4" /> My categories
            </button>
          )}
          {authed ? (
            <button
              onClick={runMatch}
              disabled={matching || jobs.length === 0}
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 text-sm text-white shadow-md disabled:opacity-50"
            >
              <Sparkles className={`h-4 w-4 ${matching ? "animate-pulse" : ""}`} />
              {matching ? "Matching…" : "Match to my CV"}
            </button>
          ) : (
            <button
              onClick={() => signIn("google")}
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 text-sm text-white shadow-md"
            >
              <LogIn className="h-4 w-4" /> Sign in
            </button>
          )}
        </div>
      </div>

      {!authed && (
        <div className="glass flex items-center gap-3 rounded-2xl p-4 text-sm text-gray-700">
          <FileUp className="h-5 w-5 text-brand-600" />
          <span>
            Your CV and applications are private to your account. <strong>Sign in</strong> to upload a
            CV, get match scores, and generate tailored CVs per job.
          </span>
        </div>
      )}

      {error && <div className="rounded-2xl bg-red-50/80 p-3 text-sm text-red-700 backdrop-blur">{error}</div>}
      {toast && (
        <div className="flex items-center gap-2 rounded-2xl bg-green-50/80 p-3 text-sm text-green-700 backdrop-blur">
          <Zap className="h-4 w-4" /> {toast}
        </div>
      )}

      {jobs.length > 0 && <JobFilters {...filters} />}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-gray-500">
          {jobs.length === 0 ? "Scanning job boards…" : "No jobs match the current filters."}
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Showing {visible.length} of {jobs.length} jobs
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((job) => (
              <JobTile
                key={job.id}
                job={job}
                score={scores[job.id]}
                applied={applied.has(job.id)}
                preparing={preparingId === job.id}
                onApply={optimise}
              />
            ))}
          </div>
        </>
      )}

      {/* Floating refresh action */}
      <button onClick={refresh} className="fab bottom-6 right-6" title="Refresh jobs">
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
      </button>

      {active && (
        <ApplyModal
          application={active}
          onClose={() => setActive(null)}
          onSent={(jobId) => setApplied((prev) => new Set(prev).add(jobId))}
        />
      )}
    </div>
  );
}
