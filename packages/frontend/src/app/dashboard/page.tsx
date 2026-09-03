"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Sparkles, Star, Zap } from "lucide-react";
import { api } from "@/lib/api";
import type { Application, JobListing, JobScore, Prefs, ScrapeStats, StoredCV } from "@/lib/types";
import { JobTile } from "@/components/JobTile";
import { ApplyModal } from "@/components/ApplyModal";
import { JobFilters, useJobFilters } from "@/components/JobFilters";

export default function DashboardPage() {
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
    (async () => {
      try {
        const [cvRes, jobsRes, appliedRes, prefsRes] = await Promise.all([
          api.getCV(),
          api.getJobs(),
          api.getApplied(),
          api.getPrefs(),
        ]);
        setCv(cvRes.cv);
        setJobs(jobsRes.jobs);
        setStats(jobsRes.stats);
        setApplied(new Set(appliedRes.applied));
        setPrefs(prefsRes.prefs);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  async function apply(job: JobListing) {
    if (!cv) {
      setError("Upload your CV first to generate an application.");
      return;
    }
    setPreparingId(job.id);
    setError("");
    try {
      const { application, autoSent } = await api.prepareApplication(job.id);
      if (autoSent) {
        // Auto-apply is on — it was sent (or queued) without confirmation.
        setApplied((prev) => new Set(prev).add(job.id));
        setToast(
          autoSent.sent
            ? `Auto-applied to ${job.title} ✅`
            : `Prepared ${job.title} — auto-send not configured, open to send.`,
        );
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
          <p className="text-sm text-gray-500">
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
                <a href="/upload" className="text-brand-600 underline">
                  upload one
                </a>{" "}
                to enable matching &amp; applications.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {prefs.categories.length > 0 && (
            <button
              onClick={() => setMyJobsOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
                myJobsOnly ? "border-brand-600 bg-brand-50 text-brand-700" : "hover:bg-gray-50"
              }`}
            >
              <Star className="h-4 w-4" /> My categories
            </button>
          )}
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={runMatch}
            disabled={!cv || matching || jobs.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Sparkles className={`h-4 w-4 ${matching ? "animate-pulse" : ""}`} />
            {matching ? "Matching…" : "Match to my CV"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {toast && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700">
          <Zap className="h-4 w-4" /> {toast}
        </div>
      )}

      {jobs.length > 0 && <JobFilters {...filters} />}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
          {jobs.length === 0 ? (
            <>
              No jobs cached yet. Click <strong>Refresh</strong> to scrape.
            </>
          ) : (
            <>No jobs match the current filters.</>
          )}
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
                onApply={apply}
              />
            ))}
          </div>
        </>
      )}

      {active && (
        <ApplyModal
          application={active}
          onClose={() => setActive(null)}
          onSent={(jobId) => {
            setApplied((prev) => new Set(prev).add(jobId));
          }}
        />
      )}
    </div>
  );
}
