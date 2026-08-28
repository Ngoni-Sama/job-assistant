"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { JobListing, JobScore, StoredCV } from "@/lib/types";
import { JobCard } from "@/components/JobCard";

export default function DashboardPage() {
  const [cv, setCv] = useState<StoredCV | null>(null);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [scores, setScores] = useState<Record<string, JobScore>>({});
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [cvRes, jobsRes] = await Promise.all([api.getCV(), api.getJobs()]);
        setCv(cvRes.cv);
        setJobs(jobsRes.jobs);
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
      const { jobs } = await api.scrape();
      setJobs(jobs);
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

  const sorted = [...jobs].sort(
    (a, b) => (scores[b.id]?.score ?? -1) - (scores[a.id]?.score ?? -1),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {cv ? (
              <>CV: <span className="font-medium">{cv.fileName}</span> · {jobs.length} jobs cached</>
            ) : (
              <>No CV yet — <a href="/upload" className="text-brand-600 underline">upload one</a> to enable matching.</>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh jobs
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

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
          No jobs cached yet. Click <strong>Refresh jobs</strong> to scrape.
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((job) => (
            <JobCard key={job.id} job={job} score={scores[job.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
