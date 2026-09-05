"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive } from "lucide-react";
import { api } from "@/lib/api";
import type { JobListing } from "@/lib/types";
import { JobTile } from "@/components/JobTile";
import { JobFilters, useJobFilters } from "@/components/JobFilters";

export default function ArchivePage() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getExpiredJobs()
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
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Archive className="h-6 w-6 text-brand-600" /> Archive
        </h1>
        <p className="text-sm text-gray-500">
          Closed &amp; past openings — kept for reference. Deadlines shown in red.
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the archive…"
        className="w-full rounded-md border px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
      />
      {jobs.length > 0 && <JobFilters {...filters} />}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : results.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-gray-500">
          {jobs.length === 0 ? "The archive is empty — closed jobs will appear here after a scrape." : "No archived jobs match."}
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">{results.length} archived jobs</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((job) => (
              <JobTile key={job.id} job={job} onApply={() => undefined} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
