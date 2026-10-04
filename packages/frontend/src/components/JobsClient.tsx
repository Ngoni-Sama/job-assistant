"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { Application, JobListing, StoredCV } from "@/lib/types";
import { JobTile } from "@/components/JobTile";
import { ApplyModal } from "@/components/ApplyModal";
import { JobFilters, useJobFilters } from "@/components/JobFilters";

const PAGE = 48;

/**
 * The jobs list. The server passes the current jobs (`initialJobs`) so they're in
 * the page HTML; `initialQuery` comes from ?q= (the homepage search box).
 */
export function JobsClient({
  initialJobs,
  initialQuery = "",
  heading,
  intro,
  loadAll = true,
}: {
  initialJobs: JobListing[];
  initialQuery?: string;
  /** Fixed page heading (sector/town pages); default switches between "My Jobs" and "Latest jobs in Zimbabwe". */
  heading?: string;
  intro?: React.ReactNode;
  /** Fetch every job in the browser when none were passed in (off for sector/town pages). */
  loadAll?: boolean;
}) {
  const { status } = useSession();
  const authed = status === "authenticated";
  const [jobs, setJobs] = useState<JobListing[]>(initialJobs);
  const [cvs, setCvs] = useState<StoredCV[]>([]);
  const [activeCvId, setActiveCvId] = useState<string | undefined>();
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [mySector, setMySector] = useState("");
  const [forYou, setForYou] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(loadAll && initialJobs.length === 0);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [optimisingId, setOptimisingId] = useState<string | null>(null);
  const [active, setActive] = useState<Application | null>(null);
  const [error, setError] = useState("");
  // Cards shown so far ("Show more" adds a page) — keeps the first paint light.
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    if (loadAll && !initialJobs.length) {
      api
        .getJobs()
        .then((j) => setJobs(j.jobs))
        .finally(() => setLoading(false));
    }
    // Per-user data only when signed in (avoids 401 noise for guests).
    if (authed) {
      api.getApplied().then((a) => setApplied(new Set(a.applied))).catch(() => {});
      api.getCvs().then((r) => setCvs(r.cvs)).catch(() => {});
      api
        .getProfile()
        .then((p) => {
          setMySector(p.profile.sector || "");
          // Default to For You when we know the sector — but not on a sector/town page
          // or when they arrived with a search (it would hide what they asked for).
          if (p.profile.sector && loadAll && !initialQuery) setForYou(true);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const filters = useJobFilters(jobs);

  const results = useMemo(() => {
    let list = filters.filtered;
    if (forYou && mySector) list = list.filter((j) => j.sector === mySector);
    // Every word must match somewhere ("accountant harare" finds accountant jobs in Harare).
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return list.filter((j) => {
      const text = `${j.title} ${j.company} ${j.location} ${j.sector ?? ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [filters.filtered, forYou, mySector, query]);

  // A new search or filter starts again from the first page.
  useEffect(() => setShown(PAGE), [filters.filtered, forYou, mySector, query]);

  async function apply(job: JobListing, cvId?: string) {
    if (status !== "authenticated") return signIn("google");
    setPreparingId(job.id);
    setActiveCvId(cvId);
    setError("");
    try {
      const { application, autoSent } = await api.prepareApplication(job.id, cvId);
      if (autoSent) setApplied((prev) => new Set(prev).add(job.id));
      else setActive(application);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparingId(null);
    }
  }

  async function optimise(job: JobListing, cvId?: string) {
    if (status !== "authenticated") return signIn("google");
    setOptimisingId(job.id);
    setActiveCvId(cvId);
    setError("");
    try {
      const { application } = await api.optimiseApplication(job.id, cvId);
      setActive(application);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOptimisingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{heading ?? (authed ? "My Jobs" : "Latest jobs in Zimbabwe")}</h1>
          {intro && <div className="mt-1 max-w-3xl text-sm text-gray-600">{intro}</div>}
        </div>
        {mySector && loadAll && (
          <button
            onClick={() => setForYou((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ${
              forYou ? "bg-gradient-to-r from-brand-500 to-brand-800 text-white shadow-md" : "glass"
            }`}
          >
            <Sparkles className="h-4 w-4" /> For You · {mySector}
          </button>
        )}
      </div>
      <input
        type="search"
        aria-label="Search jobs"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title, company, or location…"
        className="min-h-11 w-full rounded-xl border px-4 text-base sm:text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {jobs.length > 0 && <JobFilters {...filters} />}
      {!loading && results.length > 0 && (
        <h2 className="text-sm font-semibold text-gray-500">
          {results.length} open {results.length === 1 ? "job" : "jobs"}
        </h2>
      )}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.slice(0, shown).map((job) => (
            <JobTile
              key={job.id}
              job={job}
              applied={applied.has(job.id)}
              preparing={preparingId === job.id}
              optimising={optimisingId === job.id}
              cvs={cvs}
              onApply={apply}
              onOptimise={optimise}
            />
          ))}
        </div>
      )}
      {!loading && results.length > shown && (
        <div className="text-center">
          <button
            onClick={() => setShown((n) => n + PAGE)}
            className="glass rounded-full px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-white"
          >
            Show more jobs ({results.length - shown} more)
          </button>
        </div>
      )}
      {!loading && results.length === 0 && (
        <div className="glass mx-auto max-w-md space-y-3 rounded-3xl p-8 text-center">
          <p className="text-lg font-bold">No jobs match that</p>
          <p className="text-sm text-gray-600">Try fewer words, another town, or clear the filters to see every open job.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {(query || filters.activeCount > 0 || forYou) && (
              <button
                onClick={() => {
                  setQuery("");
                  filters.clear();
                  setForYou(false);
                }}
                className="min-h-11 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white"
              >
                Clear search and filters
              </button>
            )}
            <a href="/smart-match" className="inline-flex min-h-11 items-center rounded-full border border-gray-200 bg-white px-5 text-sm font-medium text-gray-700">
              Swipe through jobs
            </a>
          </div>
        </div>
      )}

      {active && (
        <ApplyModal
          application={active}
          cvId={activeCvId}
          onClose={() => setActive(null)}
          onSent={(jobId) => setApplied((prev) => new Set(prev).add(jobId))}
        />
      )}
    </div>
  );
}
