"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { JobListing } from "@/lib/types";
import { JobCard } from "@/components/JobCard";
import { JobFilters, useJobFilters } from "@/components/JobFilters";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getJobs()
      .then((r) => setJobs(r.jobs))
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">All Jobs</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title, company, or location…"
        className="w-full rounded-md border px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
      />
      {jobs.length > 0 && <JobFilters {...filters} />}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          {results.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
          {results.length === 0 && (
            <p className="text-gray-500">No jobs match your search or filters.</p>
          )}
        </div>
      )}
    </div>
  );
}
