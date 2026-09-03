"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Application, JobListing } from "@/lib/types";
import { JobTile } from "@/components/JobTile";
import { ApplyModal } from "@/components/ApplyModal";
import { JobFilters, useJobFilters } from "@/components/JobFilters";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [active, setActive] = useState<Application | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.getJobs(), api.getApplied()])
      .then(([j, a]) => {
        setJobs(j.jobs);
        setApplied(new Set(a.applied));
      })
      .finally(() => setLoading(false));
  }, []);

  const filters = useJobFilters(jobs);

  const results = useMemo(
    () =>
      filters.filtered.filter((j) =>
        `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [filters.filtered, query],
  );

  async function apply(job: JobListing) {
    setPreparingId(job.id);
    setError("");
    try {
      const { application, autoSent } = await api.prepareApplication(job.id);
      if (autoSent) setApplied((prev) => new Set(prev).add(job.id));
      else setActive(application);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">All Jobs</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title, company, or location…"
        className="w-full rounded-md border px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
      />
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {jobs.length > 0 && <JobFilters {...filters} />}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((job) => (
            <JobTile
              key={job.id}
              job={job}
              applied={applied.has(job.id)}
              preparing={preparingId === job.id}
              onApply={apply}
            />
          ))}
        </div>
      )}
      {!loading && results.length === 0 && (
        <p className="text-gray-500">No jobs match your search or filters.</p>
      )}

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
